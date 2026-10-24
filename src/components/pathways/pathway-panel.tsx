"use client";

import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-455: one panel, three audiences. Students own goals and choose who sees them; guardians read
// what was shared; designated counsellors hold appointments, restricted notes, alumni and mentoring.

type Action = { id: string; title: string; owner: string; dueOn: string; status: string };
type Goal = { id: string; studentId: string; title: string; detail: string | null; audience: string[]; status: string; nextReviewOn: string | null; actions: Action[] };
type Opportunity = { id: string; title: string; provider: string; kind: string; sourceUrl: string; eligibility: string; deadline: string | null; lastVerifiedAt: string; state: string };
type Appointment = { id: string; startsAt: string; minutes: number; publicLabel: string; status: string; studentId: string; studentName?: string };
type Alumnus = { id: string; displayName: string; pathway: string; contactEmail?: string; visibility?: string; mentoring?: boolean; consentWithdrawnAt?: string | null; reviewOverdue?: boolean };
type Request = { id: string; reference: string; alumniId: string; purpose: string; status: string; reviewNote: string | null; studentName?: string; minor?: boolean };
type StudentView = { mode: "STUDENT"; studentId: string; plan: Goal[]; appointments: Appointment[]; alumni: Alumnus[]; requests: Request[]; counsellors: { id: string; fullName: string }[]; opportunities: Opportunity[] };
type GuardianView = { mode: "GUARDIAN"; children: { studentId: string; name: string; plan: Goal[] }[] };
type StaffView = { mode: "STAFF" | "COUNSELLOR"; designated: boolean; isLeader: boolean; designations: { id: string; userId: string; name: string }[]; staff: { id: string; fullName: string }[]; opportunities: Opportunity[]; plans?: { studentId: string; name: string; goals: Goal[] }[]; appointments?: Appointment[]; alumni?: Alumnus[]; requests?: Request[] };
type View = StudentView | GuardianView | StaffView;

const OWNER: Record<string, string> = { STUDENT: "Student", COUNSELLOR: "Counsellor", GUARDIAN: "Guardian" };
const STATE: Record<string, string> = { CURRENT: "Checked recently", NEEDS_VERIFICATION: "Needs re-checking", DEADLINE_PASSED: "Deadline passed", WITHDRAWN: "Withdrawn" };
const KIND: Record<string, string> = { UNIVERSITY: "University", SCHOLARSHIP: "Scholarship", INTERNSHIP: "Internship", COURSE: "Course", OTHER: "Other" };
const APPT: Record<string, string> = { REQUESTED: "Requested", CONFIRMED: "Confirmed", HELD: "Held", CANCELLED: "Cancelled" };
const REQUEST: Record<string, string> = { REQUESTED: "Waiting for school review", CLARIFY: "School asked for more detail", APPROVED: "School-arranged introduction approved", DECLINED: "Not approved", CANCELLED: "Cancelled" };
const AUDIENCE: Record<string, string> = { "": "Only you", COUNSELLOR: "You and your counsellor", GUARDIAN: "You and your guardian", "COUNSELLOR,GUARDIAN": "You, your counsellor and your guardian" };

const AUDIENCE_KEYS = ["COUNSELLOR", "GUARDIAN"] as const;
const SHARE_FLAG = { COUNSELLOR: "share-c", GUARDIAN: "share-g" } as const;

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !json?.success) throw new Error(json?.error || "Request failed");
  return json.data;
}

/**
 * `hideWhenEmpty` (family Results, M94): render nothing — no heading, no loading row — unless the
 * learner shared at least one goal with the guardian.
 */
export function PathwayPanel({ hideWhenEmpty = false }: { hideWhenEmpty?: boolean } = {}) {
  const ui = useUiText();
  const { date, dateTime } = useLocaleFormat();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, { body: string; createdAt: string }[]>>({});
  const load = useCallback(async () => { try { setView(await call("/api/pathways")); setError(null); } catch (e) { setError(ui((e as Error).message)); } }, [ui]);
  useEffect(() => { void load(); }, [load]);
  const post = async (body: object, success: string) => {
    if (busy) return null;
    setBusy(true);
    try { const r = await call("/api/pathways", { method: "POST", body: JSON.stringify(body) }); setNotice(ui(success)); setError(null); await load(); return r; }
    catch (e) { setError(ui((e as Error).message)); setNotice(null); return null; }
    finally { setBusy(false); }
  };
  const f = (key: string) => form[key] ?? "";
  const setF = (key: string) => (e: { target: { value: string } }) => setForm((m) => ({ ...m, [key]: e.target.value }));
  const flag = (key: string) => !!flags[key];
  const setFlag = (key: string) => (e: { target: { checked: boolean } }) => setFlags((m) => ({ ...m, [key]: e.target.checked }));
  const chosen = () => AUDIENCE_KEYS.filter((k) => flags[SHARE_FLAG[k]]);
  if (hideWhenEmpty && (!view || (view.mode === "GUARDIAN" && !view.children.some((child) => child.plan.length > 0)))) return null;
  if (!view) return error ? <ErrorState description={error} onRetry={() => void load()} retryLabel={ui("Try again")} /> : <section className="sk-panel p-4" aria-busy="true"><SkeletonList rows={3} label={ui("Loading permitted goals and verified opportunities…")} /></section>;

  const actionList = (goal: Goal, canComplete: boolean) => (
    <ul className="space-y-1 text-sm">{goal.actions.map((a) => (
      <li key={a.id} className="flex flex-wrap items-center gap-2">
        <span className={a.status === "DONE" ? "line-through" : ""}><bdi>{a.title}</bdi></span>
        <span className="text-xs text-ink-subtle">· {ui("Owner")}: {ui(OWNER[a.owner] ?? a.owner)} · {ui("Due {0}", [date(a.dueOn)])} · {a.status === "DONE" ? ui("Done") : ui("Open")}</span>
        {canComplete && a.status !== "DONE" ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "complete", id: a.id }, "Action marked done.")}>{ui("Mark done")}</Button> : null}
      </li>
    ))}</ul>
  );
  const opportunityRow = (o: Opportunity) => (
    <div key={o.id} className="rounded-lg border border-border p-2 text-sm">
      <p className="font-semibold"><bdi>{o.title}</bdi> · <bdi>{o.provider}</bdi> · {ui(KIND[o.kind] ?? o.kind)}</p>
      <p className="text-xs"><bdi>{o.eligibility}</bdi>{o.deadline ? <> · {ui("Deadline {0}", [date(o.deadline)])}</> : null}</p>
      <p className="text-xs text-ink-subtle">{ui("Source")}: <a className="underline" href={o.sourceUrl} target="_blank" rel="noopener noreferrer" dir="ltr">{o.sourceUrl}</a> · {ui("Checked {0}", [date(o.lastVerifiedAt)])} · <strong>{ui(STATE[o.state] ?? o.state)}</strong></p>
    </div>
  );
  const exportLink = (studentId: string) => (
    <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={async () => { try { const r = await call(`/api/pathways?view=export&studentId=${encodeURIComponent(studentId)}`); const a = document.createElement("a"); a.href = `data:text/plain;charset=utf-8,${encodeURIComponent(r.text)}`; a.download = "pathway-plan.txt"; a.click(); } catch (e) { setError(ui((e as Error).message)); } }}>{ui("Export plan")}</Button>
  );

  return (
    <section aria-labelledby="pathways" className="sk-panel space-y-4 p-4">
      <div>
        <h2 id="pathways" className="text-lg font-bold">{ui("Careers and pathways")}</h2>
        <p className="text-sm text-ink-subtle">{ui("Suggestions are options, not predictions. Private counselling notes are never part of a plan or an export.")}</p>
      </div>
      <div className="space-y-2">
        {error ? <Alert tone="danger" compact>{error}</Alert> : null}
        {notice ? <Alert tone="success" compact>{notice}</Alert> : null}
      </div>

      {view.mode === "STUDENT" ? (
        <>
          <form className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); const audience = chosen(); const r = await post({ action: "goal", data: { title: f("goal"), audience, ...(f("review") ? { nextReviewOn: f("review") } : {}) } }, "Goal saved and shared with the selected audience."); if (r) setForm((m) => ({ ...m, goal: "" })); }}>
            <h3 className="font-semibold md:col-span-3">{view.plan.length ? ui("Add a goal") : ui("Start with one goal you would like to explore.")}</h3>
            <FormField name="pw-goal" label={ui("Goal")}><Input dir="auto" value={f("goal")} onChange={setF("goal")} /></FormField>
            <FormField name="pw-review" label={ui("Next review")}><Input type="date" dir="ltr" value={f("review")} onChange={setF("review")} /></FormField>
            <fieldset className="text-sm"><legend className="font-semibold">{ui("Who can see this goal?")}</legend>
              <label className="flex min-h-11 items-center gap-2"><Checkbox checked={flag("share-c")} onChange={setFlag("share-c")} /> {ui("My counsellor")}</label>
              <label className="flex min-h-11 items-center gap-2"><Checkbox checked={flag("share-g")} onChange={setFlag("share-g")} /> {ui("My guardian")}</label>
              <p className="text-xs text-ink-subtle">{ui(AUDIENCE[chosen().join(",")])}</p>
            </fieldset>
            <Button type="submit" disabled={busy}>{ui("Save goal")}</Button>
          </form>
          {view.plan.map((g) => (
            <div key={g.id} className="space-y-2 rounded-xl border border-border p-3">
              <h3 className="font-semibold"><bdi>{g.title}</bdi></h3>
              <p className="text-xs text-ink-subtle">{ui("Who can see this goal?")} {ui(AUDIENCE[g.audience.join(",")] ?? "")}{g.nextReviewOn ? <> · {ui("Next review {0}", [date(g.nextReviewOn)])}</> : null}</p>
              {actionList(g, true)}
              <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await post({ action: "action", data: { goalId: g.id, title: f(`a-${g.id}`), owner: f(`o-${g.id}`) || "STUDENT", dueOn: f(`d-${g.id}`), ...(f(`op-${g.id}`) ? { opportunityId: f(`op-${g.id}`) } : {}) } }, "Next action saved."); if (r) setForm((m) => ({ ...m, [`a-${g.id}`]: "" })); }}>
                <FormField name={`a-${g.id}`} label={ui("Next action")} className="min-w-56 flex-1"><Input dir="auto" value={f(`a-${g.id}`)} onChange={setF(`a-${g.id}`)} /></FormField>
                <FormField name={`o-${g.id}`} label={ui("Owner")}><Select value={f(`o-${g.id}`) || "STUDENT"} onChange={setF(`o-${g.id}`)}>{Object.entries(OWNER).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
                <FormField name={`d-${g.id}`} label={ui("Deadline")}><Input type="date" dir="ltr" value={f(`d-${g.id}`)} onChange={setF(`d-${g.id}`)} /></FormField>
                <FormField name={`op-${g.id}`} label={ui("Linked opportunity")}><Select value={f(`op-${g.id}`)} onChange={setF(`op-${g.id}`)}><option value="">{ui("None")}</option>{view.opportunities.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</Select></FormField>
                <Button type="submit" size="sm" disabled={busy}>{ui("Add next action")}</Button>
              </form>
            </div>
          ))}
          {view.plan.length ? exportLink(view.studentId) : null}
          <div className="space-y-2"><h3 className="font-semibold">{ui("Opportunities")}</h3>{view.opportunities.length ? <ul className="space-y-2">{view.opportunities.map((o) => <li key={o.id}>{opportunityRow(o)}</li>)}</ul> : <p className="text-sm text-ink-subtle">{ui("No verified opportunities yet.")}</p>}</div>
          <form className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3" onSubmit={(e) => { e.preventDefault(); void post({ action: "appointment", data: { counsellorId: f("c"), startsAt: f("when") ? new Date(f("when")).toISOString() : "", minutes: 30 } }, "Meeting requested."); }}>
            <h3 className="w-full font-semibold">{ui("Book a meeting")}</h3>
            <FormField name="pw-c" label={ui("Counsellor")}><Select value={f("c")} onChange={setF("c")}><option value="">{ui("Choose a counsellor")}</option>{view.counsellors.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</Select></FormField>
            <FormField name="pw-when" label={ui("Date and time")}><Input type="datetime-local" dir="ltr" value={f("when")} onChange={setF("when")} /></FormField>
            <Button type="submit" size="sm" disabled={busy}>{ui("Request meeting")}</Button>
            {view.appointments.length ? <ul className="w-full text-sm">{view.appointments.map((a) => <li key={a.id}>{ui(a.publicLabel)} · {dateTime(a.startsAt)} · {ui(APPT[a.status] ?? a.status)}</li>)}</ul> : null}
          </form>
          <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
            <h3 className="font-semibold">{ui("Alumni who offered to help")}</h3>
            <p className="text-xs text-ink-subtle">{ui("The school arranges any introduction. No personal contact details are shared.")}</p>
            {view.alumni.map((a) => (
              <form key={a.id} className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void post({ action: "mentoring", data: { alumniId: a.id, purpose: f(`p-${a.id}`) } }, "Request sent to the school for review."); }}>
                <span className="min-w-48"><bdi>{a.displayName}</bdi> · <bdi>{a.pathway}</bdi></span>
                <FormField name={`p-${a.id}`} label={ui("What would you like to learn?")} className="min-w-56 flex-1"><Input dir="auto" value={f(`p-${a.id}`)} onChange={setF(`p-${a.id}`)} /></FormField>
                <Button type="submit" size="sm" variant="secondary" disabled={busy}>{ui("Ask for a school-arranged introduction")}</Button>
              </form>
            ))}
            {view.requests.length ? <ul>{view.requests.map((r) => <li key={r.id}><span dir="ltr">{r.reference}</span> · {ui(REQUEST[r.status] ?? r.status)}{r.reviewNote ? <> · <bdi>{r.reviewNote}</bdi></> : null}</li>)}</ul> : null}
          </div>
        </>
      ) : null}

      {view.mode === "GUARDIAN" ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-subtle">{ui("Only goals your child chose to share with you appear here.")}</p>
          {view.children.map((c) => (
            <div key={c.studentId} className="space-y-2 rounded-xl border border-border p-3">
              <h3 className="font-semibold"><bdi>{c.name}</bdi></h3>
              {c.plan.length ? c.plan.map((g) => <div key={g.id}><p className="text-sm font-semibold"><bdi>{g.title}</bdi></p>{actionList(g, false)}</div>) : <p className="text-sm text-ink-subtle">{ui("Nothing has been shared with you yet.")}</p>}
              {c.plan.length ? exportLink(c.studentId) : null}
            </div>
          ))}
        </div>
      ) : null}

      {view.mode === "STAFF" || view.mode === "COUNSELLOR" ? (
        <>
          {view.isLeader ? (
            <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
              <h3 className="font-semibold">{ui("Designated counsellors")}</h3>
              <ul>{view.designations.map((d) => <li key={d.id} className="flex items-center gap-2"><bdi>{d.name}</bdi><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "revoke", id: d.id }, "Designation removed.")}>{ui("Remove")}</Button></li>)}</ul>
              <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void post({ action: "designate", data: { userId: f("designate") } }, "Counsellor designated."); }}>
                <FormField name="pw-designate" label={ui("Designate a counsellor")}><Select value={f("designate")} onChange={setF("designate")}><option value="">{ui("Choose a staff member")}</option>{view.staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></FormField>
                <Button type="submit" size="sm" disabled={busy}>{ui("Designate")}</Button>
              </form>
            </div>
          ) : null}
          {!view.designated ? <p className="text-sm text-ink-subtle">{ui("These counselling notes are restricted to designated staff.")}</p> : null}
          <div className="space-y-2"><h3 className="font-semibold">{ui("Opportunities")}</h3>
            <ul className="space-y-2">{view.opportunities.map((o) => <li key={o.id} className="list-none">{opportunityRow(o)}{o.state !== "WITHDRAWN" ? <div className="mt-1 flex gap-2"><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "verify", id: o.id, data: { outcome: "CONFIRMED" } }, "Opportunity re-checked.")}>{ui("Mark as checked today")}</Button><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "verify", id: o.id, data: { outcome: "WITHDRAWN" } }, "Opportunity withdrawn.")}>{ui("Withdraw")}</Button></div> : null}</li>)}</ul>
            <form className="grid gap-2 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void post({ action: "opportunity", data: { title: f("ot"), provider: f("op"), kind: f("ok") || "OTHER", sourceUrl: f("ou"), eligibility: f("oe"), ...(f("od") ? { deadline: f("od") } : {}) } }, "Opportunity added with today's check."); }}>
              <FormField name="pw-ot" label={ui("Opportunity")}><Input value={f("ot")} onChange={setF("ot")} /></FormField>
              <FormField name="pw-op" label={ui("Provider")}><Input value={f("op")} onChange={setF("op")} /></FormField>
              <FormField name="pw-ok" label={ui("Type")}><Select value={f("ok") || "OTHER"} onChange={setF("ok")}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
              <FormField name="pw-ou" label={ui("Source link")}><Input dir="ltr" value={f("ou")} onChange={setF("ou")} /></FormField>
              <FormField name="pw-oe" label={ui("Eligibility")}><Input value={f("oe")} onChange={setF("oe")} /></FormField>
              <FormField name="pw-od" label={ui("Deadline")}><Input type="date" dir="ltr" value={f("od")} onChange={setF("od")} /></FormField>
              <Button type="submit" size="sm" disabled={busy}>{ui("Add opportunity")}</Button>
            </form>
          </div>
          {view.mode === "COUNSELLOR" ? (
            <>
              <div className="space-y-2"><h3 className="font-semibold">{ui("Plans shared with you")}</h3>
                {view.plans?.map((p) => (
                  <div key={p.studentId} className="space-y-2 rounded-xl border border-border p-3">
                    <h4 className="font-semibold"><bdi>{p.name}</bdi></h4>
                    {p.goals.map((g) => <div key={g.id}><p className="text-sm font-semibold"><bdi>{g.title}</bdi></p>{actionList(g, true)}</div>)}
                    <div className="space-y-2 rounded-lg bg-surface-muted p-2 text-sm">
                      <p className="text-xs font-semibold">{ui("Confidential counselling notes · restricted to designated counsellors · every view is logged")}</p>
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={async () => { try { setNotes((m) => ({ ...m, [p.studentId]: [] })); const rows = await call(`/api/pathways?view=notes&studentId=${encodeURIComponent(p.studentId)}`); setNotes((m) => ({ ...m, [p.studentId]: rows })); } catch (e) { setError(ui((e as Error).message)); } }}>{ui("Open notes")}</Button>
                      {notes[p.studentId] ? <ul>{notes[p.studentId].map((n, i) => <li key={i} dir="auto">{dateTime(n.createdAt)} · {n.body}</li>)}</ul> : null}
                      <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await post({ action: "note", data: { studentId: p.studentId, body: f(`n-${p.studentId}`) } }, "Confidential note saved.")) setForm((m) => ({ ...m, [`n-${p.studentId}`]: "" })); setNotes((m) => { const next = { ...m }; delete next[p.studentId]; return next; }); }}>
                        <FormField name={`n-${p.studentId}`} label={ui("New confidential note")} className="min-w-64 flex-1"><Input dir="auto" value={f(`n-${p.studentId}`)} onChange={setF(`n-${p.studentId}`)} /></FormField>
                        <Button type="submit" size="sm" disabled={busy}>{ui("Save note")}</Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
              {view.appointments?.length ? <div className="space-y-1 text-sm"><h3 className="font-semibold">{ui("My appointments")}</h3>{view.appointments.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2"><bdi>{a.studentName}</bdi> · {dateTime(a.startsAt)} · {ui(APPT[a.status] ?? a.status)}
                  {a.status === "REQUESTED" ? <Button type="button" size="sm" disabled={busy} onClick={() => void post({ action: "appointment-status", id: a.id, data: { status: "CONFIRMED" } }, "Appointment confirmed.")}>{ui("Confirm")}</Button> : null}
                  {a.status === "CONFIRMED" ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "appointment-status", id: a.id, data: { status: "HELD" } }, "Appointment marked as held.")}>{ui("Mark held")}</Button> : null}
                </div>
              ))}</div> : null}
              <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
                <h3 className="font-semibold">{ui("Alumni")}</h3>
                <ul>{view.alumni?.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-end gap-2">
                    <span><bdi>{a.displayName}</bdi> · <bdi>{a.pathway}</bdi> · <span dir="ltr">{a.contactEmail}</span> · {a.consentWithdrawnAt ? ui("Consent withdrawn") : a.reviewOverdue ? ui("Yearly review overdue · hidden from students") : ui("Consent current")}</span>
                    {!a.consentWithdrawnAt ? <>
                      <FormField name={`ar-${a.id}`} label={ui("Review note")} className="w-56"><Input value={f(`ar-${a.id}`)} onChange={setF(`ar-${a.id}`)} /></FormField>
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "alumni-review", id: a.id, data: { decision: "CONFIRMED", note: f(`ar-${a.id}`) } }, "Consent confirmed for another year.")}>{ui("Confirm consent")}</Button>
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "alumni-review", id: a.id, data: { decision: "WITHDRAWN", note: f(`ar-${a.id}`) } }, "Consent withdrawn; open requests were cancelled.")}>{ui("Withdraw consent")}</Button>
                    </> : null}
                  </li>
                ))}</ul>
                <form className="grid gap-2 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void post({ action: "alumni", data: { displayName: f("an"), pathway: f("ap"), contactEmail: f("ae"), dateOfBirth: f("ad"), visibility: flag("as") ? "STUDENTS" : "STAFF_ONLY", mentoring: flag("am"), consentEvidence: f("ac") } }, "Alumni consent recorded."); }}>
                  <FormField name="pw-an" label={ui("Name shown")}><Input value={f("an")} onChange={setF("an")} /></FormField>
                  <FormField name="pw-ap" label={ui("Pathway")}><Input value={f("ap")} onChange={setF("ap")} /></FormField>
                  <FormField name="pw-ae" label={ui("Contact email (staff only)")}><Input dir="ltr" value={f("ae")} onChange={setF("ae")} /></FormField>
                  <FormField name="pw-ad" label={ui("Date of birth")}><Input type="date" dir="ltr" value={f("ad")} onChange={setF("ad")} /></FormField>
                  <FormField name="pw-ac" label={ui("Consent evidence")}><Input value={f("ac")} onChange={setF("ac")} /></FormField>
                  <div className="text-sm"><label className="flex min-h-11 items-center gap-2"><Checkbox checked={flag("as")} onChange={setFlag("as")} /> {ui("Visible to students")}</label><label className="flex min-h-11 items-center gap-2"><Checkbox checked={flag("am")} onChange={setFlag("am")} /> {ui("Offers mentoring")}</label></div>
                  <Button type="submit" size="sm" disabled={busy}>{ui("Record consent")}</Button>
                </form>
              </div>
              <div className="space-y-2 text-sm"><h3 className="font-semibold">{ui("Mentoring requests")}</h3>
                {view.requests?.map((r) => (
                  <div key={r.id} className="space-y-1 rounded-lg border border-border p-2">
                    <p><span dir="ltr">{r.reference}</span> · <bdi>{r.studentName}</bdi>{r.minor ? ` · ${ui("Minor or age not recorded")}` : ""} · {ui(REQUEST[r.status] ?? r.status)}</p>
                    <p dir="auto" className="text-xs">{r.purpose}</p>
                    {["REQUESTED", "CLARIFY"].includes(r.status) ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <FormField name={`rn-${r.id}`} label={ui("Decision note")} className="min-w-56 flex-1"><Input value={f(`rn-${r.id}`)} onChange={setF(`rn-${r.id}`)} /></FormField>
                        <label className="flex min-h-11 items-center gap-2"><Checkbox checked={flag(`sg-${r.id}`)} onChange={setFlag(`sg-${r.id}`)} /> {ui("School safeguarding check done")}</label>
                        {r.minor ? <label className="flex min-h-11 items-center gap-2"><Checkbox checked={flag(`gc-${r.id}`)} onChange={setFlag(`gc-${r.id}`)} /> {ui("Guardian consent recorded")}</label> : null}
                        <Button type="button" size="sm" disabled={busy} onClick={() => void post({ action: "decide-mentoring", id: r.id, data: { decision: "APPROVE", note: f(`rn-${r.id}`), safeguardingChecked: flag(`sg-${r.id}`), guardianConsent: flag(`gc-${r.id}`) } }, "Supervised introduction approved.")}>{ui("Approve supervised introduction")}</Button>
                        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "decide-mentoring", id: r.id, data: { decision: "CLARIFY", note: f(`rn-${r.id}`) } }, "Clarification requested.")}>{ui("Request clarification")}</Button>
                        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "decide-mentoring", id: r.id, data: { decision: "DECLINE", note: f(`rn-${r.id}`) } }, "Request declined.")}>{ui("Decline")}</Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
