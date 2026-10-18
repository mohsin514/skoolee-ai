"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-453: capacity and staffing scenarios against a dated baseline. Assumptions sit beside results,
// bottlenecks are explained and linked, costs are estimates, and nothing live is changed.

type Link = { kind: string; id?: string; label: string };
type Finding = { severity: "HARD" | "WARNING" | "UNMODELED"; code: string; message: string; needed?: number; available?: number; unit?: string; links: Link[] };
type Range = { low: number; high: number } | null;
type Result = { provisional: boolean; missing: { code: string; detail: string }[]; sections: { grade: string; students: number; existing: number; needed: number; added: number }[]; metrics: { students: number; sections: number; sectionsAdded: number; roomsAdded: number; teachersAdded: number; periodsPerWeek: number }; findings: Finding[]; sensitivity: { intakeChange: number; sections: number; hardConflicts: number }[]; costs: { currency: string | null; teachers: Range; rooms: Range; unknown: string[] } };
type Baseline = { id: string; version: number; takenAt: string; missing: { code: string; detail: string }[]; data: { teachingDays: number; periodsPerDay: number; grades: { grade: string }[]; subjects: { grade: string; subject: string }[]; teachers: { userId: string; name: string; contracted: number | null }[] } };
type Scenario = { id: string; name: string; baselineId: string; version: number; assumptions: Record<string, unknown>; result: Result; copiedFromId: string | null };
type Handoff = { id: string; scenarioId: string; ownerId: string; status: string; note: string; items: { kind: string; detail: string; estimate?: string }[]; proposedById: string; decisionNote: string | null };
type Overview = { userId: string; baselines: Baseline[]; latestIsCurrent: boolean; scenarios: Scenario[]; handoffs: Handoff[]; leaders: { id: string; fullName: string }[] };

const SEVERITY: { key: Finding["severity"]; label: string }[] = [{ key: "HARD", label: "Hard conflicts" }, { key: "WARNING", label: "Policy warnings" }, { key: "UNMODELED", label: "Not modeled" }];
const ROOM_TYPES: Record<string, string> = { CLASSROOM: "Classroom", LAB: "Lab", HALL: "Hall", LIBRARY: "Library", AUDITORIUM: "Auditorium" };
const HANDOFF: Record<string, string> = { PROPOSED: "Waiting for review", APPROVED: "Approved plan", REJECTED: "Not approved" };
const UNMODELED_TEXT = ["Transport routes and travel time between buildings or campuses", "Local occupancy, safety and licensing rules", "Teacher qualifications beyond the subjects they teach today", "Part-day timing, shifts and break supervision"];

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !json?.success) throw new Error(json?.error || "Request failed");
  return json.data;
}

const blank = { name: "", classCap: "30", grade: "", intake: "0", subject: "", periods: "", roomType: "LAB", addType: "", addCount: "1", addSeats: "30", teacherId: "", teacherPeriods: "", newSubject: "", newPeriods: "", currency: "SAR", tLow: "", tHigh: "", rLow: "", rHigh: "" };

export function ScenarioPlanner() {
  const ui = useUiText();
  const { number, dateTime } = useLocaleFormat();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blank);
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [handoff, setHandoff] = useState({ ownerId: "", note: "" });
  const load = useCallback(async () => { try { setData(await call("/api/planning")); setError(null); } catch (e) { setError(ui((e as Error).message)); } }, [ui]);
  useEffect(() => { void load(); }, [load]);
  const post = async (body: object, success: string) => {
    if (busy) return null;
    setBusy(true);
    try { const r = await call("/api/planning", { method: "POST", body: JSON.stringify(body) }); setNotice(ui(success)); setError(null); await load(); return r; }
    catch (e) { setError(ui((e as Error).message)); setNotice(null); return null; }
    finally { setBusy(false); }
  };
  if (!data) return <section className="sk-panel p-4"><p role="status" className="text-sm text-ink-subtle">{error ?? ui("Evaluating room, workload and schedule constraints…")}</p></section>;

  const baseline = data.baselines[0] ?? null;
  const set = (key: keyof typeof blank) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const n = (v: string) => Number(v);
  const range = (low: string, high: string) => (low !== "" && high !== "" ? { low: n(low), high: n(high) } : null);
  const assumptions = () => ({
    classCap: n(form.classCap),
    intake: form.grade && n(form.intake) ? [{ grade: form.grade, students: n(form.intake) }] : [],
    subjectNeeds: form.subject && form.periods !== "" ? [{ grade: form.grade || null, subject: form.subject, periodsPerSection: n(form.periods), roomType: form.roomType }] : [],
    addRooms: form.addType ? [{ type: form.addType, count: n(form.addCount), seats: n(form.addSeats) }] : [],
    teacherChanges: [...(form.teacherId && form.teacherPeriods !== "" ? [{ userId: form.teacherId, periodsPerWeek: n(form.teacherPeriods) }] : []), ...(form.newSubject && form.newPeriods !== "" ? [{ subject: form.newSubject, periodsPerWeek: n(form.newPeriods) }] : [])],
    costs: { currency: form.currency || null, teacherAnnual: range(form.tLow, form.tHigh), roomAnnual: range(form.rLow, form.rHigh) },
  });
  const money = (r: Range, currency: string | null) => (r ? `${r.low === r.high ? number(r.low) : `${number(r.low)}–${number(r.high)}`}${currency ? ` ${currency}` : ""}` : ui("Unknown"));
  const current = data.scenarios.find((s) => s.id === selected) ?? null;
  const compared = compare.map((id) => data.scenarios.find((s) => s.id === id)).filter((s): s is Scenario => !!s);
  const baselineOf = (id: string) => data.baselines.find((b) => b.id === id);
  const subjects = baseline ? [...new Set(baseline.data.subjects.map((s) => s.subject))] : [];
  const note = (s: Scenario) => [`${s.name}`, ui("Scenario only · live records unchanged"), `${ui("Baseline")} v${baselineOf(s.baselineId)?.version ?? "?"}`, ...SEVERITY.flatMap((g) => [`${ui(g.label)}:`, ...s.result.findings.filter((f) => f.severity === g.key).map((f) => `- ${f.message}`)]), `${ui("Teacher cost (estimate)")}: ${money(s.result.costs.teachers, s.result.costs.currency)}`, `${ui("Room cost (estimate)")}: ${money(s.result.costs.rooms, s.result.costs.currency)}`].join("\n");

  return (
    <section aria-labelledby="scenario-planner" className="sk-panel space-y-4 p-4">
      <div>
        <h2 id="scenario-planner" className="text-lg font-bold">{ui("Capacity and staffing scenarios")}</h2>
        <p className="text-sm font-semibold text-ink-subtle">{ui("Scenario only · live records unchanged")}</p>
      </div>
      <div aria-live="polite">
        {error ? <p role="alert" className="text-sm font-semibold text-status-error-text">{error}</p> : null}
        {notice ? <Alert tone="success" compact>{notice}</Alert> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm">
        {baseline ? <span>{ui("Baseline {0} · taken {1}", [baseline.version, dateTime(baseline.takenAt)])} · {ui("{0} teaching days × {1} periods", [baseline.data.teachingDays, baseline.data.periodsPerDay])}</span> : <span>{ui("Create a scenario from a dated school baseline.")}</span>}
        {baseline && !data.latestIsCurrent ? <span role="alert" className="font-semibold text-status-error-text">{ui("Live records changed since this baseline. Take a new baseline to plan on current data.")}</span> : null}
        <Button type="button" variant={baseline && data.latestIsCurrent ? "secondary" : "default"} disabled={busy} onClick={() => void post({ action: "baseline", data: {} }, "Baseline taken.")}>{baseline ? ui("Take new baseline") : ui("Take baseline")}</Button>
        {baseline?.missing.length ? <ul className="w-full text-xs text-status-error-text" aria-label={ui("Missing inputs")}>{baseline.missing.map((m, i) => <li key={i}><bdi>{m.detail}</bdi></li>)}</ul> : null}
      </div>

      {baseline ? (
        <form className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-4" onSubmit={async (e) => { e.preventDefault(); const r = await post({ action: "save", data: { baselineId: baseline.id, name: form.name, assumptions: assumptions() } }, "Scenario evaluated."); if (r) { setSelected(r.id); setForm(blank); } }}>
          <h3 className="font-semibold md:col-span-4">{ui("New scenario")}</h3>
          <FormField name="sc-name" label={ui("Scenario name")}><Input value={form.name} onChange={set("name")} /></FormField>
          <FormField name="sc-cap" label={ui("Class cap (students)")}><Input inputMode="numeric" dir="ltr" value={form.classCap} onChange={set("classCap")} /></FormField>
          <FormField name="sc-grade" label={ui("Grade")}><Select value={form.grade} onChange={set("grade")}><option value="">{ui("All grades")}</option>{baseline.data.grades.map((g) => <option key={g.grade} value={g.grade}>{g.grade}</option>)}</Select></FormField>
          <FormField name="sc-intake" label={ui("Intake change (students)")}><Input inputMode="numeric" dir="ltr" value={form.intake} onChange={set("intake")} /></FormField>
          <FormField name="sc-subject" label={ui("Subject")}><Select value={form.subject} onChange={set("subject")}><option value="">{ui("No subject change")}</option>{subjects.map((s) => <option key={s} value={s}>{s}</option>)}</Select></FormField>
          <FormField name="sc-periods" label={ui("Periods per section per week")}><Input inputMode="numeric" dir="ltr" value={form.periods} onChange={set("periods")} /></FormField>
          <FormField name="sc-roomtype" label={ui("Room type needed")}><Select value={form.roomType} onChange={set("roomType")}>{Object.entries(ROOM_TYPES).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
          <FormField name="sc-addtype" label={ui("Add rooms")}><Select value={form.addType} onChange={set("addType")}><option value="">{ui("No new rooms")}</option>{Object.entries(ROOM_TYPES).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
          <FormField name="sc-addcount" label={ui("Rooms to add")}><Input inputMode="numeric" dir="ltr" value={form.addCount} onChange={set("addCount")} /></FormField>
          <FormField name="sc-addseats" label={ui("Seats per new room")}><Input inputMode="numeric" dir="ltr" value={form.addSeats} onChange={set("addSeats")} /></FormField>
          <FormField name="sc-teacher" label={ui("Change a teacher's availability")}><Select value={form.teacherId} onChange={set("teacherId")}><option value="">{ui("No change")}</option>{baseline.data.teachers.map((t) => <option key={t.userId} value={t.userId}>{t.name}</option>)}</Select></FormField>
          <FormField name="sc-tperiods" label={ui("Available periods per week")}><Input inputMode="numeric" dir="ltr" value={form.teacherPeriods} onChange={set("teacherPeriods")} /></FormField>
          <FormField name="sc-newsubject" label={ui("Add a teacher for")}><Select value={form.newSubject} onChange={set("newSubject")}><option value="">{ui("No new teacher")}</option>{subjects.map((s) => <option key={s} value={s}>{s}</option>)}</Select></FormField>
          <FormField name="sc-newperiods" label={ui("New teacher periods per week")}><Input inputMode="numeric" dir="ltr" value={form.newPeriods} onChange={set("newPeriods")} /></FormField>
          <FormField name="sc-tlow" label={ui("Teacher cost per year, low (estimate)")}><Input inputMode="numeric" dir="ltr" value={form.tLow} onChange={set("tLow")} /></FormField>
          <FormField name="sc-thigh" label={ui("Teacher cost per year, high (estimate)")}><Input inputMode="numeric" dir="ltr" value={form.tHigh} onChange={set("tHigh")} /></FormField>
          <FormField name="sc-rlow" label={ui("Room cost per year, low (estimate)")}><Input inputMode="numeric" dir="ltr" value={form.rLow} onChange={set("rLow")} /></FormField>
          <FormField name="sc-rhigh" label={ui("Room cost per year, high (estimate)")}><Input inputMode="numeric" dir="ltr" value={form.rHigh} onChange={set("rHigh")} /></FormField>
          <FormField name="sc-ccy" label={ui("Currency")}><Input dir="ltr" value={form.currency} onChange={set("currency")} /></FormField>
          <div className="flex items-end"><Button type="submit" disabled={busy}>{ui("Run constraint check")}</Button></div>
        </form>
      ) : null}

      {data.scenarios.length ? (
        <div className="space-y-2">
          <h3 className="font-semibold">{ui("Scenarios")}</h3>
          <ul className="space-y-1 text-sm">{data.scenarios.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <Checkbox id={`cmp-${s.id}`} checked={compare.includes(s.id)} onChange={(e) => setCompare((c) => (e.target.checked ? [...c, s.id].slice(-3) : c.filter((x) => x !== s.id)))} aria-label={ui("Compare {0}", [s.name])} />
              <Button variant="ghost" type="button" className="text-start underline" onClick={() => setSelected(s.id)}><bdi>{s.name}</bdi></Button>
              <span className="text-xs text-ink-subtle">{ui("Baseline {0}", [baselineOf(s.baselineId)?.version ?? "?"])} · {ui("{0} hard conflicts", [s.result.findings.filter((f) => f.severity === "HARD").length])}{s.result.provisional ? ` · ${ui("Provisional")}` : ""}</span>
            </li>
          ))}</ul>
        </div>
      ) : null}

      {compared.length > 1 ? (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <caption className="text-start font-semibold">{ui("Comparison")}</caption>
          <thead><tr><th scope="col" className="text-start">{ui("Measure")}</th>{compared.map((s) => <th key={s.id} scope="col" className="text-start"><bdi>{s.name}</bdi></th>)}</tr></thead>
          <tbody>
            {([["Students", (s: Scenario) => number(s.result.metrics.students)], ["Sections", (s: Scenario) => number(s.result.metrics.sections)], ["Sections added", (s: Scenario) => number(s.result.metrics.sectionsAdded)], ["Rooms added", (s: Scenario) => number(s.result.metrics.roomsAdded)], ["Teachers added", (s: Scenario) => number(s.result.metrics.teachersAdded)], ["Hard conflicts", (s: Scenario) => number(s.result.findings.filter((f) => f.severity === "HARD").length)], ["Policy warnings", (s: Scenario) => number(s.result.findings.filter((f) => f.severity === "WARNING").length)], ["Teacher cost (estimate)", (s: Scenario) => money(s.result.costs.teachers, s.result.costs.currency)], ["Room cost (estimate)", (s: Scenario) => money(s.result.costs.rooms, s.result.costs.currency)]] as const).map(([label, value]) => (
              <tr key={label} className="border-t border-border"><th scope="row" className="text-start font-normal">{ui(label)}</th>{compared.map((s) => <td key={s.id} dir="ltr" className="text-start">{value(s)}</td>)}</tr>
            ))}
          </tbody>
        </table></div>
      ) : null}

      {current ? (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <h3 className="font-semibold"><bdi>{current.name}</bdi> · {ui("Baseline {0}", [baselineOf(current.baselineId)?.version ?? "?"])}</h3>
          {current.result.provisional ? <div role="alert" className="text-sm text-status-error-text"><strong>{ui("Results are provisional.")}</strong><ul>{current.result.missing.map((m, i) => <li key={i}><bdi>{m.detail}</bdi></li>)}</ul></div> : null}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="text-sm">
              <h4 className="font-semibold">{ui("Assumptions")}</h4>
              <pre dir="ltr" className="whitespace-pre-wrap break-words rounded bg-surface-muted p-2 text-xs">{JSON.stringify(current.assumptions, null, 1)}</pre>
              <h4 className="mt-2 font-semibold">{ui("Sensitivity")}</h4>
              <ul className="text-xs">{current.result.sensitivity.map((s) => <li key={s.intakeChange}>{ui("Intake {0}%: {1} sections, {2} hard conflicts", [s.intakeChange > 0 ? `+${s.intakeChange}` : s.intakeChange, s.sections, s.hardConflicts])}</li>)}</ul>
            </div>
            <div className="space-y-2 text-sm md:col-span-2">
              {SEVERITY.map((g) => {
                const list = current.result.findings.filter((f) => f.severity === g.key);
                return list.length ? (
                  <div key={g.key}>
                    <h4 className="font-semibold">{ui(g.label)}</h4>
                    <ul className="space-y-1">{list.map((f, i) => (
                      <li key={i}>
                        {g.key === "UNMODELED" && UNMODELED_TEXT.includes(f.message) ? ui(f.message) : <bdi>{f.message}</bdi>}
                        {f.links.length ? <span className="block text-xs text-ink-subtle">{ui("Caused by")}: {f.links.map((l, j) => <span key={j}>{j ? ", " : ""}<bdi>{l.label}</bdi></span>)}</span> : null}
                      </li>
                    ))}</ul>
                  </div>
                ) : null;
              })}
              <p className="text-xs text-ink-subtle">{ui("Teacher cost (estimate)")}: <span dir="ltr">{money(current.result.costs.teachers, current.result.costs.currency)}</span> · {ui("Room cost (estimate)")}: <span dir="ltr">{money(current.result.costs.rooms, current.result.costs.currency)}</span> · {ui("Estimates only; not verified amounts.")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void post({ action: "duplicate", id: current.id }, "Scenario duplicated.")}>{ui("Duplicate scenario")}</Button>
            {baseline && current.baselineId !== baseline.id ? <Button type="button" variant="secondary" disabled={busy} onClick={() => void post({ action: "refresh", id: current.id }, "Scenario copied onto the newest baseline; the original is kept.")}>{ui("Refresh onto newest baseline")}</Button> : null}
            <a className="self-center text-sm underline" download={`${current.name}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(note(current))}`}>{ui("Export planning note")}</a>
          </div>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void post({ action: "handoff", id: current.id, data: handoff }, "Planning handoff proposed for review."); }}>
            <FormField name="ho-owner" label={ui("Plan owner")}><Select value={handoff.ownerId} onChange={(e) => setHandoff((h) => ({ ...h, ownerId: e.target.value }))}><option value="">{ui("Choose an owner")}</option>{data.leaders.map((l) => <option key={l.id} value={l.id}>{l.fullName}</option>)}</Select></FormField>
            <FormField name="ho-note" label={ui("What should happen next")} className="min-w-64 flex-1"><Input value={handoff.note} onChange={(e) => setHandoff((h) => ({ ...h, note: e.target.value }))} /></FormField>
            <Button type="submit" disabled={busy}>{ui("Propose planning handoff")}</Button>
          </form>
        </div>
      ) : null}

      {data.handoffs.length ? (
        <div className="space-y-2 text-sm">
          <h3 className="font-semibold">{ui("Planning handoffs")}</h3>
          {data.handoffs.map((h) => (
            <div key={h.id} className="rounded-lg border border-border p-2">
              <p><bdi>{data.scenarios.find((s) => s.id === h.scenarioId)?.name}</bdi> · {ui(HANDOFF[h.status] ?? h.status)} · {ui("Owner")}: <bdi>{data.leaders.find((l) => l.id === h.ownerId)?.fullName ?? "—"}</bdi></p>
              <ul className="text-xs text-ink-subtle">{h.items.map((i, k) => <li key={k}><bdi>{i.detail}</bdi>{i.estimate ? ` · ${i.estimate}` : ""}</li>)}</ul>
              {h.status === "PROPOSED" && h.proposedById !== data.userId ? (
                <div className="mt-1 flex gap-2">
                  <Button type="button" size="sm" disabled={busy} onClick={() => void post({ action: "decide", id: h.id, data: { decision: "APPROVE" } }, "Plan approved. Nothing live was changed.")}>{ui("Approve plan")}</Button>
                  <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "decide", id: h.id, data: { decision: "REJECT" } }, "Plan not approved.")}>{ui("Do not approve")}</Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
