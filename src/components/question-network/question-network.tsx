"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-454: share reviewed questions with rights and review history, review with declared expertise,
// adopt and accept corrections, withdraw. Answer keys stay behind teacher access.

type Review = { decision: string; conflict: boolean; conflictNote: string | null; issues: { code: string; detail: string }[]; reviewerSchool: string; mine: boolean };
type Stats = { shown: true; sampleSize: number; reports: number; suppressed: number; meanScore: number } | { shown: false; reports: number; suppressed: number; minimum: number };
type Item = {
  id: string; shareKey: string; version: number; status: string; audience: string; contributorSchoolId: string; contributedById: string; changeNote: string | null; withdrawReason: string | null; embargoUntil: string | null;
  source: { paperTitle: string; approvedAt: string }; rights: { basis: string; holder: string | null; licence: string | null; attribution: string | null };
  tags: { subject: string; grade: string; language: string }; content: { prompt: string; options: { id: string; text: string }[]; marks: number; outcomes: { title: string; source: string }[] };
  answerKey: { correctOptionId: string | null; modelAnswer: string }; adjudication: { reason: string } | null;
  reviews: Review[]; summary: { approvals: number; objections: number; conflicts: number }; stats: Stats;
};
type Adoption = { id: string; shareKey: string; status: string; item: Item | null };
type Overview = { userId: string; schoolId: string; isLeader: boolean; library: Item[]; reviewQueue: Item[]; contributions: Item[]; adoptions: Adoption[]; networks: { id: string; name: string; ownerSchoolId: string }[]; invites: { id: string; networkId: string }[]; shareable: { paperId: string; paperVersion: number; questionId: string; paperTitle: string; prompt: string }[] };

const STATUS: Record<string, string> = { AWAITING_AUTHORITY: "Waiting for a school leader's authority", IN_REVIEW: "In peer review", PUBLISHED: "Published", SUPERSEDED: "Superseded by a correction", WITHDRAWN: "Withdrawn" };
const ADOPTION: Record<string, string> = { ACTIVE: "In use", CORRECTION_AVAILABLE: "A corrected version is available", WITHDRAWN_UPSTREAM: "Withdrawn upstream · do not use in new assessments" };
const AUDIENCE: Record<string, string> = { SCHOOL: "School only", NETWORK: "Partner network", PUBLIC: "Public" };
const BASIS: Record<string, string> = { OWN_WORK: "Own work", SCHOOL_OWNED: "School-owned material", LICENSED: "Licensed source", OPEN_LICENCE: "Open licence" };
const DECISION: Record<string, string> = { APPROVE: "Approve", REQUEST_CHANGES: "Request changes", REJECT: "Reject" };
const ISSUE: Record<string, string> = { KEY_ERROR: "Answer key error", AMBIGUOUS: "Ambiguous wording", CURRICULUM_FIT: "Curriculum fit", LANGUAGE: "Language", BIAS: "Bias or sensitivity", RIGHTS: "Rights", OTHER: "Other" };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !json?.success) throw new Error(json?.error || "Request failed");
  return json.data;
}

export function QuestionNetwork() {
  const ui = useUiText();
  const { date, number } = useLocaleFormat();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState({ source: "", audience: "NETWORK", networkId: "", basis: "SCHOOL_OWNED", holder: "", licence: "", permits: "NETWORK", confirmed: false, embargoUntil: "" });
  const [review, setReview] = useState<Record<string, { subject: string; language: string; conflict: boolean; conflictNote: string; decision: string; code: string; detail: string }>>({});
  const [text, setText] = useState<Record<string, string>>({});
  const load = useCallback(async () => { try { setData(await call("/api/question-network")); setError(null); } catch (e) { setError(ui((e as Error).message)); } }, [ui]);
  useEffect(() => { void load(); }, [load]);
  const post = async (body: object, success: string) => {
    if (busy) return null;
    setBusy(true);
    try { const r = await call("/api/question-network", { method: "POST", body: JSON.stringify(body) }); setNotice(ui(success)); setError(null); await load(); return r; }
    catch (e) { setError(ui((e as Error).message)); setNotice(null); return null; }
    finally { setBusy(false); }
  };
  if (!data) return <section className="sk-panel p-4"><p role="status" className="text-sm text-ink-subtle">{error ?? ui("Loading permitted question versions and provenance…")}</p></section>;

  const val = (key: string) => text[key] ?? "";
  const setVal = (key: string) => (e: { target: { value: string } }) => setText((m) => ({ ...m, [key]: e.target.value }));
  const r = (item: Item) => review[item.id] ?? { subject: item.tags.subject, language: item.tags.language, conflict: false, conflictNote: "", decision: "APPROVE", code: "AMBIGUOUS", detail: "" };
  const setR = (item: Item, patch: Partial<ReturnType<typeof r>>) => setReview((m) => ({ ...m, [item.id]: { ...r(item), ...patch } }));

  const card = (item: Item, children?: ReactNode) => (
    <article key={item.id} className="space-y-2 rounded-xl border border-border p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold"><span dir="ltr">{item.shareKey} v{item.version}</span> · <bdi>{item.tags.subject}</bdi> · <bdi>{item.tags.grade}</bdi> · <span dir="ltr">{item.tags.language}</span></h4>
        <span className="text-xs font-semibold">{ui(STATUS[item.status] ?? item.status)} · {ui(AUDIENCE[item.audience] ?? item.audience)}</span>
      </div>
      <p dir="auto" className="whitespace-pre-wrap">{item.content.prompt}</p>
      {item.content.options.length ? <ul className="list-inside list-disc" dir="auto">{item.content.options.map((o) => <li key={o.id}>{o.text}</li>)}</ul> : null}
      <p className="text-xs text-ink-subtle">{ui("Source")}: <bdi>{item.source.paperTitle}</bdi> · {ui("approved {0}", [date(item.source.approvedAt)])} · {item.content.outcomes.map((o) => `${o.title} (${o.source})`).join("; ")}</p>
      <p className="text-xs text-ink-subtle">{ui("Rights")}: {ui(BASIS[item.rights.basis] ?? item.rights.basis)}{item.rights.holder ? <> · <bdi>{item.rights.holder}</bdi></> : null}{item.rights.licence ? <> · <bdi>{item.rights.licence}</bdi></> : null}{item.rights.attribution ? <> · <bdi>{item.rights.attribution}</bdi></> : null}</p>
      <p className="text-xs">{ui("Reviews: {0} approvals · {1} objections · {2} conflicts declared", [item.summary.approvals, item.summary.objections, item.summary.conflicts])}{item.adjudication ? <> · {ui("Adjudicated")}: <bdi>{item.adjudication.reason}</bdi></> : null}</p>
      {item.reviews.some((v) => v.issues.length || v.conflict) ? <ul className="text-xs text-ink-subtle">{item.reviews.map((v, i) => <li key={i}>{ui(DECISION[v.decision] ?? v.decision)} · {ui(v.reviewerSchool)}{v.conflict ? ` · ${ui("Conflict declared")}: ${v.conflictNote ?? ""}` : ""}{v.issues.map((x) => ` · ${ui(ISSUE[x.code] ?? x.code)}: ${x.detail}`).join("")}</li>)}</ul> : null}
      {item.changeNote ? <p className="text-xs">{ui("Correction")}: <bdi>{item.changeNote}</bdi></p> : null}
      {item.withdrawReason ? <p className="text-xs text-status-error-text">{ui("Withdrawn")}: <bdi>{item.withdrawReason}</bdi></p> : null}
      <p className="text-xs text-ink-subtle">{item.stats.shown ? ui("Observed facility {0} from {1} responses in {2} reports; not a calibrated difficulty.", [number(item.stats.meanScore), number(item.stats.sampleSize), item.stats.reports]) : ui("Not enough responses to show results (minimum {0}).", [item.stats.minimum])}</p>
      <details><summary className="cursor-pointer text-xs font-semibold">{ui("Show answer key (teaching staff only)")}</summary><p dir="auto" className="text-xs">{item.answerKey.correctOptionId ? `${ui("Correct option")}: ${item.content.options.find((o) => o.id === item.answerKey.correctOptionId)?.text ?? item.answerKey.correctOptionId} · ` : ""}{item.answerKey.modelAnswer}</p></details>
      {children}
    </article>
  );

  return (
    <section aria-labelledby="question-network" className="sk-panel space-y-4 p-4">
      <div>
        <h2 id="question-network" className="text-lg font-bold">{ui("Question review network")}</h2>
        <p className="text-sm text-ink-subtle">{ui("Reviewed questions with their rights and review history. Popularity is never a quality score, and no learner response data is shared.")}</p>
      </div>
      <div aria-live="polite">
        {error ? <p role="alert" className="text-sm font-semibold text-status-error-text">{error}</p> : null}
        {notice ? <p role="status" className="text-sm font-semibold text-status-success-text">{notice}</p> : null}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">{ui("Library")}</h3>
        {data.library.length ? data.library.map((item) => {
          const adopted = data.adoptions.find((a) => a.shareKey === item.shareKey);
          return card(item, (
            <div className="space-y-2">
              {!adopted ? <Button type="button" size="sm" disabled={busy} onClick={() => void post({ action: "adopt", id: item.id }, "Question adopted. Your copy stays on this version until you accept a correction.")}>{ui("Adopt for my school")}</Button> : <p className="text-xs font-semibold">{ui(ADOPTION[adopted.status] ?? adopted.status)}</p>}
              <details><summary className="cursor-pointer text-xs font-semibold">{ui("Propose a correction")}</summary>
                <form className="mt-2 grid gap-2 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void post({ action: "correct", id: item.id, data: { changeNote: val(`note-${item.id}`), ...(val(`answer-${item.id}`) ? { modelAnswer: val(`answer-${item.id}`) } : {}) } }, "Correction proposed. It is reviewed as a new version."); }}>
                  <FormField name={`cn-${item.id}`} label={ui("What is wrong and why")}><Input value={val(`note-${item.id}`)} onChange={setVal(`note-${item.id}`)} /></FormField>
                  <FormField name={`ca-${item.id}`} label={ui("Corrected model answer")}><Input dir="auto" value={val(`answer-${item.id}`)} onChange={setVal(`answer-${item.id}`)} /></FormField>
                  <Button type="submit" size="sm" variant="secondary" disabled={busy}>{ui("Submit correction")}</Button>
                </form>
              </details>
            </div>
          ));
        }) : <p className="text-sm text-ink-subtle">{ui("No reviewed questions match these filters. Broaden the search or submit an item.")}</p>}
      </div>

      {data.reviewQueue.length ? (
        <div className="space-y-2">
          <h3 className="font-semibold">{ui("Waiting for your review")}</h3>
          {data.reviewQueue.map((item) => card(item, item.reviews.some((v) => v.mine) ? <p className="text-xs font-semibold">{ui("You reviewed this version.")}</p> : (
            <form className="grid gap-2 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const v = r(item); void post({ action: "review", id: item.id, data: { expertise: { subject: v.subject, language: v.language }, conflict: v.conflict, ...(v.conflict ? { conflictNote: v.conflictNote } : {}), decision: v.decision, issues: v.decision === "APPROVE" ? [] : [{ code: v.code, detail: v.detail }] } }, "Review recorded."); }}>
              <FormField name={`rs-${item.id}`} label={ui("Your subject expertise")}><Input value={r(item).subject} onChange={(e) => setR(item, { subject: e.target.value })} /></FormField>
              <FormField name={`rl-${item.id}`} label={ui("Your language")}><Input dir="ltr" value={r(item).language} onChange={(e) => setR(item, { language: e.target.value })} /></FormField>
              <FormField name={`rd-${item.id}`} label={ui("Decision")}><Select value={r(item).decision} onChange={(e) => setR(item, { decision: e.target.value })}>{Object.entries(DECISION).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
              {r(item).decision !== "APPROVE" ? <>
                <FormField name={`ri-${item.id}`} label={ui("Issue")}><Select value={r(item).code} onChange={(e) => setR(item, { code: e.target.value })}>{Object.entries(ISSUE).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
                <FormField name={`rx-${item.id}`} label={ui("Issue detail")} className="md:col-span-2"><Input value={r(item).detail} onChange={(e) => setR(item, { detail: e.target.value })} /></FormField>
              </> : null}
              <label className="flex min-h-11 items-center gap-2"><Checkbox checked={r(item).conflict} onChange={(e) => setR(item, { conflict: e.target.checked })} /> {ui("I have a conflict of interest")}</label>
              {r(item).conflict ? <FormField name={`rc-${item.id}`} label={ui("Describe the conflict")} className="md:col-span-2"><Input value={r(item).conflictNote} onChange={(e) => setR(item, { conflictNote: e.target.value })} /></FormField> : null}
              <Button type="submit" size="sm" disabled={busy}>{ui("Submit review")}</Button>
            </form>
          )))}
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="font-semibold">{ui("Shared by my school")}</h3>
        {data.contributions.map((item) => card(item, (
          <div className="flex flex-wrap items-end gap-2">
            {item.status === "AWAITING_AUTHORITY" && data.isLeader ? <Button type="button" size="sm" disabled={busy} onClick={() => void post({ action: "authorize", id: item.id }, "Sharing authorized. Peer review can start.")}>{ui("Authorize sharing")}</Button> : null}
            {item.status === "IN_REVIEW" ? <>
              {item.summary.objections ? <FormField name={`adj-${item.id}`} label={ui("Adjudication reason (reviewers disagree)")} className="min-w-64 flex-1"><Input value={val(`adj-${item.id}`)} onChange={setVal(`adj-${item.id}`)} /></FormField> : null}
              <Button type="button" size="sm" disabled={busy} onClick={() => void post({ action: "publish", id: item.id, data: val(`adj-${item.id}`) ? { adjudication: val(`adj-${item.id}`) } : {} }, "Version published; adopters received a correction notice if it replaces an earlier one.")}>{ui("Publish version")}</Button>
            </> : null}
            {["IN_REVIEW", "PUBLISHED", "AWAITING_AUTHORITY"].includes(item.status) ? <>
              <FormField name={`wd-${item.id}`} label={ui("Reason for withdrawal")} className="min-w-56 flex-1"><Input value={val(`wd-${item.id}`)} onChange={setVal(`wd-${item.id}`)} /></FormField>
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "withdraw", id: item.id, data: { reason: val(`wd-${item.id}`) } }, "Question withdrawn. Future reuse is blocked; delivered assessments are unchanged.")}>{ui("Withdraw")}</Button>
            </> : null}
          </div>
        )))}
        <form className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const [paperId, paperVersion, questionId] = share.source.split("|"); void post({ action: "submit", data: { source: { paperId, paperVersion: Number(paperVersion), questionId }, audience: share.audience, ...(share.audience === "NETWORK" ? { networkId: share.networkId } : {}), rights: { basis: share.basis, permits: share.permits, confirmed: share.confirmed || undefined, ...(share.holder ? { holder: share.holder } : {}), ...(share.licence ? { licence: share.licence } : {}) }, ...(share.embargoUntil ? { embargoUntil: share.embargoUntil } : {}) } }, "Question submitted for review. It stays a draft until reviewed and published."); }}>
          <h4 className="font-semibold md:col-span-3">{ui("Share a reviewed question")}</h4>
          <FormField name="sh-source" label={ui("Approved question")} className="md:col-span-3"><Select value={share.source} onChange={(e) => setShare((s) => ({ ...s, source: e.target.value }))}><option value="">{ui("Choose a question")}</option>{data.shareable.map((q) => <option key={`${q.paperId}|${q.paperVersion}|${q.questionId}`} value={`${q.paperId}|${q.paperVersion}|${q.questionId}`}>{q.paperTitle} · {q.prompt}</option>)}</Select></FormField>
          <FormField name="sh-audience" label={ui("Audience")}><Select value={share.audience} onChange={(e) => setShare((s) => ({ ...s, audience: e.target.value }))}>{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
          {share.audience === "NETWORK" ? <FormField name="sh-network" label={ui("Network")}><Select value={share.networkId} onChange={(e) => setShare((s) => ({ ...s, networkId: e.target.value }))}><option value="">{ui("Choose a network")}</option>{data.networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</Select></FormField> : null}
          <FormField name="sh-basis" label={ui("Rights basis")}><Select value={share.basis} onChange={(e) => setShare((s) => ({ ...s, basis: e.target.value }))}>{Object.entries(BASIS).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
          <FormField name="sh-permits" label={ui("The rights permit sharing with")}><Select value={share.permits} onChange={(e) => setShare((s) => ({ ...s, permits: e.target.value }))}>{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
          <FormField name="sh-holder" label={ui("Rights holder")}><Input value={share.holder} onChange={(e) => setShare((s) => ({ ...s, holder: e.target.value }))} /></FormField>
          <FormField name="sh-licence" label={ui("Licence terms")}><Input value={share.licence} onChange={(e) => setShare((s) => ({ ...s, licence: e.target.value }))} /></FormField>
          <FormField name="sh-embargo" label={ui("Hidden from other schools until (optional)")}><Input type="date" dir="ltr" value={share.embargoUntil} onChange={(e) => setShare((s) => ({ ...s, embargoUntil: e.target.value }))} /></FormField>
          <label className="flex min-h-11 items-center gap-2 md:col-span-2"><Checkbox checked={share.confirmed} onChange={(e) => setShare((s) => ({ ...s, confirmed: e.target.checked }))} /> {ui("I confirm my school may share this question with the chosen audience")}</label>
          <Button type="submit" disabled={busy}>{ui("Submit for review")}</Button>
        </form>
      </div>

      {data.adoptions.length ? (
        <div className="space-y-2 text-sm">
          <h3 className="font-semibold">{ui("Adopted by my school")}</h3>
          {data.adoptions.map((a) => (
            <div key={a.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
              <span><span dir="ltr">{a.shareKey}{a.item ? ` v${a.item.version}` : ""}</span> · {ui(ADOPTION[a.status] ?? a.status)}</span>
              {a.status === "CORRECTION_AVAILABLE" ? <Button type="button" size="sm" disabled={busy} onClick={() => void post({ action: "accept-correction", id: a.id }, "Corrected version accepted for future use.")}>{ui("Accept corrected version")}</Button> : null}
              {a.item && a.status !== "WITHDRAWN_UPSTREAM" ? <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void post({ action: "report", id: a.item!.id, data: { sampleSize: Number(val(`n-${a.id}`)), meanScore: Number(val(`m-${a.id}`)) / 100, context: val(`c-${a.id}`) } }, "Use evidence recorded."); }}>
                <FormField name={`n-${a.id}`} label={ui("Learners who answered")} className="w-32"><Input inputMode="numeric" dir="ltr" value={val(`n-${a.id}`)} onChange={setVal(`n-${a.id}`)} /></FormField>
                <FormField name={`m-${a.id}`} label={ui("Average score %")} className="w-32"><Input inputMode="numeric" dir="ltr" value={val(`m-${a.id}`)} onChange={setVal(`m-${a.id}`)} /></FormField>
                <FormField name={`c-${a.id}`} label={ui("Context (grade, term)")} className="w-48"><Input value={val(`c-${a.id}`)} onChange={setVal(`c-${a.id}`)} /></FormField>
                <Button type="submit" size="sm" variant="secondary" disabled={busy}>{ui("Report use")}</Button>
              </form> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 text-sm">
        <h3 className="font-semibold">{ui("Networks")}</h3>
        <ul>{data.networks.map((n) => (
          <li key={n.id} className="flex flex-wrap items-end gap-2">
            <bdi>{n.name}</bdi>
            {data.isLeader && n.ownerSchoolId === data.schoolId ? <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void post({ action: "invite", id: n.id, data: { schoolSlug: val(`inv-${n.id}`) } }, "School invited."); }}>
              <FormField name={`inv-${n.id}`} label={ui("Invite a school by its identifier")}><Input dir="ltr" value={val(`inv-${n.id}`)} onChange={setVal(`inv-${n.id}`)} /></FormField>
              <Button type="submit" size="sm" variant="secondary" disabled={busy}>{ui("Invite")}</Button>
            </form> : null}
          </li>
        ))}</ul>
        {data.isLeader ? data.invites.map((i) => <Button key={i.id} type="button" size="sm" disabled={busy} onClick={() => void post({ action: "accept-invite", id: i.id }, "Invitation accepted.")}>{ui("Accept network invitation")}</Button>) : null}
        {data.isLeader ? <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void post({ action: "network", data: { name: val("network-name") } }, "Network created."); }}>
          <FormField name="network-name" label={ui("New network name")}><Input value={val("network-name")} onChange={setVal("network-name")} /></FormField>
          <Button type="submit" size="sm" variant="secondary" disabled={busy}>{ui("Create network")}</Button>
        </form> : null}
      </div>
    </section>
  );
}
