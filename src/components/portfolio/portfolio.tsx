"use client";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FolderOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

// SKO-427: the learning portfolio. A learner collects a piece of work with its returned feedback, optionally
// a later revision, and writes what they changed. Teachers approve the exact reflection and decide family
// visibility; sharing is an explicit collection for one named guardian with an end date. No rankings.

type Ui = ReturnType<typeof useUiText>;
type Crit = { id: string; title: string; maxPoints: number; points: number | null; comment?: string };
type Source = { id: string; title: string; version: number; assignmentVersion: number; rubricVersion: number; receiptCode: string; submittedAt: string; late: boolean; text: string; file: { name: string; href: string | null } | null; feedback: { comment: string; totalPoints: number | null; returnedAt: string; criteria: Crit[] } | null } | null;
type Comparison = { comparable: true; rows: (Crit & { before: number | null; after: number | null })[] } | { comparable: false; warning: string; earlier: Crit[]; later: Crit[] } | null;
type Entry = { id: string; version: number; title: string; goal: { code?: string; title?: string; outcomeId?: string }; status: string; createdAt: string; reflection: string | null; reflectionVersion: number | null; approvedVersion: number | null; approvedReflection?: string | null; teacherComment: string | null; familyVisible?: boolean; staffNote?: string | null; earlier: Source; later?: Source; missing: boolean; comparison: Comparison };
type Data = { student: { id: string; name: string }; role: "LEARNER" | "TEACHER"; entries: Entry[]; shares: { id: string; title: string; guardian: string; entryIds: string[]; expiresAt: string; revokedAt: string | null; active: boolean }[]; guardians: { id: string; name: string }[] };
type Attempt = { id: string; assignmentId: string; title: string; version: number; submittedAt: string; hasFeedback: boolean; goals: { id: string; code?: string; title: string }[] };

async function call(url: string, method = "GET", body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
  return json.data;
}
const key = () => `pf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const statusLabel = (ui: Ui, s: string) => ({ DRAFT: ui("Draft"), PROPOSED: ui("Sent for review"), APPROVED: ui("Reviewed"), CHANGES_REQUESTED: ui("Revision requested") } as Record<string, string>)[s] ?? s;
const goalText = (ui: Ui, g: Entry["goal"]) => g?.title ? `${g.code ? `${g.code} ` : ""}${g.title}` : ui("Not linked to a learning goal");

function SourceCard({ label, source, ui }: { label: string; source: Source | undefined; ui: Ui }) {
  const { date } = useLocaleFormat();
  if (source === undefined) return null;
  if (!source) return <div className="rounded-lg border border-dashed p-2 text-xs text-ink-muted">{label}: {ui("A source file is unavailable; the entry is kept. Contact the teacher.")}</div>;
  return <div className="rounded-lg border border-edge/40 p-2 text-sm" data-pf-source={source.id}>
    <p className="sk-eyebrow">{label}</p>
    <p className="font-bold"><span dir="auto">{source.title}</span> · {ui("Version {0}", [String(source.version)])}</p>
    <p className="text-xs text-ink-muted">{ui("Submitted {0}", [date(source.submittedAt)])} · {ui("Receipt {0}", [source.receiptCode])} · {ui("Rubric version {0}", [String(source.rubricVersion)])}</p>
    {source.text ? <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm" dir="auto">{source.text}</p> : null}
    {source.file ? <p className="text-xs">{ui("Attached file")}: <bdi>{source.file.name}</bdi></p> : null}
    {source.feedback ? <div className="mt-1 rounded bg-surface-sunken p-2 text-xs"><p className="font-bold">{ui("Returned feedback")}</p><p dir="auto">{source.feedback.comment}</p></div> : null}
  </div>;
}

function Compare({ c, ui }: { c: Comparison; ui: Ui }) {
  if (!c) return null;
  if (!c.comparable) return <div data-pf-compare="incomparable"><Alert tone="warning" compact live="off">{ui("The rubric changed between these pieces of work, so criteria are not compared directly.")}</Alert></div>;
  return <table className="w-full text-xs" data-pf-compare="comparable"><thead><tr><th className="text-start">{ui("Criterion")}</th><th>{ui("Earlier")}</th><th>{ui("Later")}</th></tr></thead>
    <tbody>{c.rows.map(r => <tr key={r.id}><td dir="auto">{r.title}</td><td className="text-center"><bdi>{r.before ?? "—"}/{r.maxPoints}</bdi></td><td className="text-center"><bdi>{r.after ?? "—"}/{r.maxPoints}</bdi></td></tr>)}</tbody></table>;
}

/**
 * `addRequest`: a page that puts "Add evidence" in its PageHeader (learner Portfolio & goals, §4.4b) bumps this
 * number to open the add dialog; `hideAdd` then drops the duplicate in-panel button.
 */
export function Portfolio({ studentId, addRequest, hideAdd = false }: { studentId?: string; addRequest?: number; hideAdd?: boolean }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false), [attempts, setAttempts] = useState<Attempt[]>([]), [draft, setDraft] = useState({ earlierVersionId: "", laterVersionId: "", outcomeId: "", reflection: "" }), [entryKey, setEntryKey] = useState(key);
  const [editing, setEditing] = useState<Entry | null>(null), [reflection, setReflection] = useState("");
  const [reviewing, setReviewing] = useState<Entry | null>(null), [comment, setComment] = useState(""), [note, setNote] = useState(""), [familyVisible, setFamilyVisible] = useState(false);
  const [sharing, setSharing] = useState(false), [share, setShare] = useState({ guardianUserId: "", days: "30", title: "", entryIds: [] as string[] });
  const [confirmRemove, setConfirmRemove] = useState<Entry | null>(null), [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const q = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
  const load = useCallback(async () => { setError(""); try { setData(await call(`/api/portfolio${q}`)); } catch (e) { setError(ui(e instanceof Error ? e.message : "The portfolio could not be loaded.")); } }, [q, ui]);
  useEffect(() => { void load(); }, [load]);
  const run = async (work: () => Promise<unknown>, done: string) => { setBusy(true); try { await work(); toast.success(ui(done)); await load(); return true; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); await load(); return false; } finally { setBusy(false); } };
  const openAdd = async () => { setAdding(true); try { setAttempts((await call(`/api/portfolio?view=evidence${q ? `&${q.slice(1)}` : ""}`)).attempts); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "Could not load evidence to add.")); } };
  const openAddRef = useRef(openAdd);
  useEffect(() => { openAddRef.current = openAdd; });
  useEffect(() => { if (addRequest) void openAddRef.current(); }, [addRequest]);

  if (error) return <section data-portfolio><ErrorState description={error} onRetry={() => void load()} retryLabel={ui("Try again")} /></section>;
  if (!data) return <section className="sk-panel p-5" data-portfolio aria-busy="true"><SkeletonList rows={3} label={ui("Loading the portfolio…")} /></section>;
  const learner = data.role === "LEARNER";
  const earlier = attempts.find(a => a.id === draft.earlierVersionId);
  const laterChoices = attempts.filter(a => earlier && a.id !== earlier.id && +new Date(a.submittedAt) > +new Date(earlier.submittedAt));
  // An entry under re-review still shares its last approved version.
  const shareable = data.entries.filter(e => e.approvedVersion !== null && e.familyVisible);

  return <section className="sk-panel space-y-4 p-4 sm:p-5" data-portfolio data-pf-role={data.role}>
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-base font-bold">{learner ? ui("My learning portfolio") : ui("Learning portfolio of {0}", [data.student.name])}</h3><p className="text-xs text-ink-muted">{ui("Evidence of how understanding changed: work, feedback, a later revision and a reflection. No class rankings.")}</p></div>
      <div className="flex flex-wrap gap-2">{hideAdd ? null : <Button size="sm" onClick={() => void openAdd()} data-pf-add>{ui("Add evidence")}</Button>}<a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/portfolio/export${q}`} target="_blank" rel="noreferrer" data-pf-export>{ui("Export reviewed entries")}</a>{!learner ? <Button size="sm" variant="outline" disabled={!shareable.length} onClick={() => { setSharing(true); setShare({ guardianUserId: data.guardians[0]?.id ?? "", days: "30", title: "", entryIds: shareable.map(e => e.id) }); }} data-pf-share>{ui("Share with a guardian")}</Button> : null}</div></header>

    {!data.entries.length ? <div data-pf-empty><EmptyState size="sm" icon={FolderOpen} title={ui("Choose one piece of work that shows something you learned.")} /></div> : <ol className="space-y-3" data-pf-timeline>{data.entries.map(e => <li key={e.id} className={cn("rounded-2xl border p-3", e.status === "PROPOSED" ? "border-status-warning-border" : "border-edge/40")} data-pf-entry={e.id} data-pf-status={e.status}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold text-brand-700" dir="auto">{goalText(ui, e.goal)}</p><p className="text-sm font-bold" dir="auto">{e.title}</p><p className="text-xs text-ink-muted">{statusLabel(ui, e.status)}{e.familyVisible ? <> · {ui("Visible to authorized guardians")}</> : null}{e.approvedVersion ? <> · {ui("Reviewed reflection version {0}", [String(e.approvedVersion)])}</> : null} · <bdi>{date(e.createdAt)}</bdi></p></div>
        <div className="flex flex-wrap gap-2">{learner ? <Button size="sm" variant="outline" onClick={() => { setEditing(e); setReflection(e.reflection ?? ""); }} data-pf-reflect>{ui("Add reflection")}</Button> : <Button size="sm" variant={e.status === "PROPOSED" ? "default" : "outline"} onClick={() => { setReviewing(e); setComment(e.teacherComment ?? ""); setNote(e.staffNote ?? ""); setFamilyVisible(Boolean(e.familyVisible)); }} data-pf-review>{ui("Review")}</Button>}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmRemove(e)} data-pf-remove>{ui("Remove")}</Button></div></div>
      <div className="mt-2 grid gap-2 md:grid-cols-2"><SourceCard label={ui("Earlier work")} source={e.earlier} ui={ui} /><SourceCard label={ui("Later work")} source={e.later} ui={ui} /></div>
      <div className="mt-2"><Compare c={e.comparison} ui={ui} /></div>
      {e.reflection ? <p className="mt-2 text-sm"><span className="font-bold">{ui("Reflection")}:</span> <span dir="auto">{e.reflection}</span></p> : null}
      {e.teacherComment ? <p className="mt-1 text-sm"><span className="font-bold">{ui("Teacher comment")}:</span> <span dir="auto">{e.teacherComment}</span></p> : null}
      {!learner && e.staffNote ? <p className="mt-1 rounded bg-surface-subtle p-2 text-xs"><span className="font-bold">{ui("Staff note — never shown to learners or families")}:</span> <span dir="auto">{e.staffNote}</span></p> : null}
    </li>)}</ol>}

    {!learner && data.shares.length ? <div className="space-y-1" data-pf-shares><p className="sk-eyebrow">{ui("Shared collections")}</p>{data.shares.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm" data-pf-share-row={s.id} data-pf-share-active={s.active ? "true" : "false"}>
      <span><span dir="auto">{s.title}</span> · <bdi>{s.guardian}</bdi> · {ui("{0} entries", [String(s.entryIds.length)])} · {s.revokedAt ? ui("Withdrawn") : s.active ? ui("Until {0}", [date(s.expiresAt)]) : ui("Expired")}</span>
      {s.active ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmRevoke(s.id)} data-pf-revoke>{ui("Withdraw")}</Button> : null}
    </div>)}</div> : null}

    <ConfirmAction
      open={Boolean(confirmRemove)}
      tone="danger"
      title={ui("Remove this entry from the portfolio?")}
      description={ui("The entry and its reflection leave the portfolio and any shared collection. The original assignment is unchanged.")}
      confirmLabel={ui("Remove entry")}
      cancelLabel={ui("Keep entry")}
      busy={busy}
      onCancel={() => setConfirmRemove(null)}
      onConfirm={() => { const entry = confirmRemove; setConfirmRemove(null); if (entry) void run(() => call("/api/portfolio", "POST", { action: "remove", entryId: entry.id }), "Removed from the portfolio. The original assignment is unchanged."); }}
    />
    <ConfirmAction
      open={Boolean(confirmRevoke)}
      tone="danger"
      title={ui("Withdraw this shared collection?")}
      description={ui("The guardian can no longer open it and old links stop working. Share again to give access back.")}
      confirmLabel={ui("Withdraw share")}
      cancelLabel={ui("Keep sharing")}
      busy={busy}
      onCancel={() => setConfirmRevoke(null)}
      onConfirm={() => { const shareId = confirmRevoke; setConfirmRevoke(null); if (shareId) void run(() => call("/api/portfolio", "POST", { action: "revoke", shareId }), "Share withdrawn. Old links no longer open."); }}
    />
    {adding ? <Modal size="sm" title={ui("Add evidence")} eyebrow={data.student.name} onClose={() => setAdding(false)}>
      <div className="space-y-3" data-pf-add-dialog>
        <FormField name="pf-earlier" label={ui("Work with returned feedback")}><Select value={draft.earlierVersionId} onChange={e => setDraft({ ...draft, earlierVersionId: e.target.value, laterVersionId: "", outcomeId: "" })}><option value="">{ui("Choose work")}</option>{attempts.filter(a => a.hasFeedback).map(a => <option key={a.id} value={a.id}>{a.title} · v{a.version}</option>)}</Select></FormField>
        {earlier?.goals.length ? <FormField name="pf-goal" label={ui("Learning goal")}><Select value={draft.outcomeId} onChange={e => setDraft({ ...draft, outcomeId: e.target.value })}><option value="">{ui("Choose a goal")}</option>{earlier.goals.map(g => <option key={g.id} value={g.id}>{g.code ? `${g.code} ` : ""}{g.title}</option>)}</Select></FormField> : earlier ? <p className="text-xs text-ink-muted">{ui("This work is not linked to a learning goal.")}</p> : null}
        {earlier ? <FormField name="pf-later" label={ui("A later revision (optional)")}><Select value={draft.laterVersionId} onChange={e => setDraft({ ...draft, laterVersionId: e.target.value })}><option value="">—</option>{laterChoices.map(a => <option key={a.id} value={a.id}>{a.title} · v{a.version}</option>)}</Select></FormField> : null}
        <FormField name="pf-reflection" label={ui("What did you change after the feedback?")}><Textarea rows={3} value={draft.reflection} onChange={e => setDraft({ ...draft, reflection: e.target.value })} maxLength={3000} /></FormField>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAdding(false)}>{ui("Back")}</Button><Button disabled={busy || !draft.earlierVersionId || Boolean(earlier?.goals.length && !draft.outcomeId)} onClick={() => void run(() => call("/api/portfolio", "POST", { action: "entry", studentId: data.student.id, ...draft, laterVersionId: draft.laterVersionId || undefined, outcomeId: draft.outcomeId || undefined, idempotencyKey: entryKey }), "Added to the portfolio.").then(ok => { if (ok) { setAdding(false); setDraft({ earlierVersionId: "", laterVersionId: "", outcomeId: "", reflection: "" }); setEntryKey(key()); } })} data-pf-add-save>{ui("Add to portfolio")}</Button></div>
      </div>
    </Modal> : null}

    {editing ? <Modal size="sm" title={ui("Reflection")} eyebrow={editing.title} onClose={() => setEditing(null)}>
      <div className="space-y-3" data-pf-reflect-dialog>
        {editing.teacherComment && editing.status === "CHANGES_REQUESTED" ? <Alert tone="warning" compact live="off"><span dir="auto">{editing.teacherComment}</span></Alert> : null}
        <FormField name="pf-text" label={ui("What did you change after the feedback?")} hint={ui("Your teacher's feedback and your submitted work stay exactly as they were.")}><Textarea rows={4} value={reflection} onChange={e => setReflection(e.target.value)} maxLength={3000} /></FormField>
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => void run(() => call("/api/portfolio", "POST", { action: "reflect", entryId: editing.id, knownVersion: editing.version, reflection }), "Reflection saved.").then(ok => ok && setEditing(null))} data-pf-reflect-save>{ui("Save")}</Button><Button disabled={busy || !reflection.trim()} onClick={() => void run(() => call("/api/portfolio", "POST", { action: "reflect", entryId: editing.id, knownVersion: editing.version, reflection, propose: true }), "Sent to your teacher for review.").then(ok => ok && setEditing(null))} data-pf-propose>{ui("Send for review")}</Button></div>
      </div>
    </Modal> : null}

    {reviewing ? <Modal size="lg" title={ui("Review portfolio entry")} eyebrow={reviewing.title} subtitle={goalText(ui, reviewing.goal)} onClose={() => setReviewing(null)}>
      <div className="space-y-3" data-pf-review-dialog>
        <p className="text-sm"><span className="font-bold">{ui("Reflection")}:</span> <span dir="auto">{reviewing.reflection || ui("No reflection yet.")}</span></p>
        <FormField name="pf-comment" label={ui("Comment for the learner (and family, if shared)")}><Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} /></FormField>
        <FormField name="pf-note" label={ui("Staff note — never shown to learners or families")}><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></FormField>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={familyVisible} onChange={e => setFamilyVisible(e.target.checked)} data-pf-family /> {ui("Approve for family sharing")}</label>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy || !comment.trim()} onClick={() => void run(() => call("/api/portfolio", "POST", { action: "review", entryId: reviewing.id, knownVersion: reviewing.version, decision: "changes", teacherComment: comment, staffNote: note }), "Revision requested.").then(ok => ok && setReviewing(null))} data-pf-changes>{ui("Request a revision")}</Button><Button disabled={busy || !reviewing.reflection} onClick={() => void run(() => call("/api/portfolio", "POST", { action: "review", entryId: reviewing.id, knownVersion: reviewing.version, decision: "approve", teacherComment: comment, staffNote: note, familyVisible }), familyVisible ? "Reviewed. Approved for family sharing." : "Reviewed.").then(ok => ok && setReviewing(null))} data-pf-approve>{ui("Approve this reflection")}</Button></div>
      </div>
    </Modal> : null}

    {sharing ? <Modal size="sm" title={ui("Share with a guardian")} eyebrow={data.student.name} onClose={() => setSharing(false)}>
      <div className="space-y-3" data-pf-share-dialog>
        <FormField name="pf-guardian" label={ui("Guardian")}><Select value={share.guardianUserId} onChange={e => setShare({ ...share, guardianUserId: e.target.value })}>{data.guardians.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></FormField>
        <FormField name="pf-title" label={ui("Collection name")}><Input value={share.title} onChange={e => setShare({ ...share, title: e.target.value })} maxLength={120} /></FormField>
        <fieldset className="space-y-1 text-sm"><legend className="text-xs font-bold">{ui("Entries approved for families")}</legend>{shareable.map(e => <label key={e.id} className="flex items-center gap-2"><Checkbox checked={share.entryIds.includes(e.id)} onChange={x => setShare({ ...share, entryIds: x.target.checked ? [...share.entryIds, e.id] : share.entryIds.filter(i => i !== e.id) })} /> <span dir="auto">{e.title}</span></label>)}</fieldset>
        <FormField name="pf-days" label={ui("Visible for (days)")}><Input type="number" min={1} max={180} value={share.days} onChange={e => setShare({ ...share, days: e.target.value })} /></FormField>
        <p className="text-xs text-ink-muted">{ui("Only approved entries are shared. Private notes stay with staff.")}</p>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setSharing(false)}>{ui("Back")}</Button><Button disabled={busy || !share.guardianUserId || !share.entryIds.length} onClick={() => void run(() => call("/api/portfolio", "POST", { action: "share", studentId: data.student.id, ...share, days: Number(share.days) }), "Shared with authorized guardians. Private notes stay with staff.").then(ok => ok && setSharing(false))} data-pf-share-save>{ui("Share collection")}</Button></div>
      </div>
    </Modal> : null}
  </section>;
}

/** Teacher view: choose a learner from your classes, then open their portfolio. */
export function TeacherPortfolio() {
  const ui = useUiText();
  const [learners, setLearners] = useState<{ id: string; name: string; className: string; toReview: number }[] | null>(null), [selected, setSelected] = useState("");
  useEffect(() => { void call("/api/portfolio?view=learners").then(rows => { setLearners(rows); setSelected(s => s || rows.find((r: { toReview: number }) => r.toReview)?.id || rows[0]?.id || ""); }).catch(() => setLearners([])); }, []);
  if (!learners) return <SkeletonList rows={3} label={ui("Loading the portfolio…")} />;
  if (!learners.length) return <p className="rounded-xl border border-dashed p-4 text-sm text-ink-muted">{ui("No learners in your classes yet.")}</p>;
  return <div className="space-y-3"><FormField name="pf-learner" label={ui("Learner")}><Select value={selected} onChange={e => setSelected(e.target.value)} data-pf-learner>{learners.map(l => <option key={l.id} value={l.id}>{l.name} · {l.className}{l.toReview ? ` · ${ui("{0} to review", [String(l.toReview)])}` : ""}</option>)}</Select></FormField>{selected ? <Portfolio key={selected} studentId={selected} /> : null}</div>;
}

/** Family view: collections shared with this guardian — only while the share and permission last. */
export function FamilyPortfolio({ studentId }: { studentId: string | null }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [shares, setShares] = useState<{ id: string; title: string; expiresAt: string }[] | null>(null), [open, setOpen] = useState<{ id: string; title: string; student: string; entries: Entry[]; withdrawn: number } | null>(null), [error, setError] = useState("");
  useEffect(() => { void call(`/api/portfolio?view=shares${studentId ? `&studentId=${encodeURIComponent(studentId)}` : ""}`).then(setShares).catch(() => setShares([])); }, [studentId]);
  const view = async (id: string) => { setError(""); try { setOpen(await call(`/api/portfolio?share=${encodeURIComponent(id)}`)); } catch (e) { setError(ui(e instanceof Error ? e.message : "This collection is not shared with your account.")); } };
  if (!shares?.length) return null;
  return <section className="sk-panel space-y-3 p-4 sm:p-5" data-family-portfolio>
    <h3 className="text-base font-bold">{ui("Learning progress shared by the school")}</h3>
    <ul className="space-y-2">{shares.map(s => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm" data-fp-share={s.id}><span><span dir="auto">{s.title}</span> · {ui("Until {0}", [date(s.expiresAt)])}</span><span className="flex gap-2"><Button size="sm" onClick={() => void view(s.id)} data-fp-open>{ui("Open")}</Button><a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/portfolio/export?share=${encodeURIComponent(s.id)}`} target="_blank" rel="noreferrer">{ui("Export")}</a></span></li>)}</ul>
    {error ? <Alert tone="danger" compact>{error}</Alert> : null}
    {open ? <div className="space-y-3" data-fp-collection>
      <p className="text-sm font-bold"><span dir="auto">{open.title}</span> · <bdi>{open.student}</bdi></p>
      {open.withdrawn ? <p className="text-xs text-ink-muted">{ui("{0} entries are no longer shared.", [String(open.withdrawn)])}</p> : null}
      {open.entries.map(e => <article key={e.id} className="rounded-2xl border border-edge/40 p-3" data-fp-entry={e.id}>
        <p className="text-xs font-bold text-brand-700" dir="auto">{goalText(ui, e.goal)}</p><p className="text-sm font-bold" dir="auto">{e.title}</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2"><SourceCard label={ui("Earlier work")} source={e.earlier} ui={ui} /><SourceCard label={ui("Later work")} source={e.later} ui={ui} /></div>
        <div className="mt-2"><Compare c={e.comparison} ui={ui} /></div>
        {e.reflection ? <p className="mt-2 text-sm"><span className="font-bold">{ui("Reflection")}:</span> <span dir="auto">{e.reflection}</span></p> : null}
        {e.teacherComment ? <p className="mt-1 text-sm"><span className="font-bold">{ui("Teacher comment")}:</span> <span dir="auto">{e.teacherComment}</span></p> : null}
      </article>)}
    </div> : null}
  </section>;
}
