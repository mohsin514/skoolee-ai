"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { deskRow } from "@/components/ui/desk";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useUiText } from "@/components/locale/LocaleProvider";

// SKO-426: teacher view of an approved practice set — independent and assisted results apart, wording
// from evidence, the next revisit and why, a flag when a learner needs a person rather than more practice.

type Row = { studentId: string; fullName: string; rollNo: string; sessions: number; open: boolean; progress: string; needsSupport: boolean;
  latest: { independentCorrect: number; independentTotal: number; assistedCorrect: number; assistedTotal: number } | null;
  revisit: { id: string; dueOn: string; reason: string; source: string } | null };

const PROGRESS_LABEL: Record<string, string> = { JUST_STARTED: "Not practised yet", BUILDING: "Building", SECURE_FOR_NOW: "Secure for now" };
const SOURCE_LABEL: Record<string, string> = { RULE: "practice rule", TEACHER: "teacher" };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok) throw new Error(json?.error || "Request failed");
  return json.result;
}

export function PracticeProgressPanel({ practice }: { practice: { id: string; title: string }[] }) {
  const ui = useUiText();
  const [selected, setSelected] = useState(practice[0]?.id ?? "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    if (!selected) return;
    try { setRows((await call(`/api/school-ai/practice-sessions?practiceRecordId=${encodeURIComponent(selected)}`)).learners); setError(null); } catch (e) { setError(ui((e as Error).message)); }
  }, [selected, ui]);
  useEffect(() => { void load(); }, [load]);
  if (!practice.length) return null;
  const revisit = async (studentId: string, action: "SET" | "CANCEL") => {
    try { await call("/api/school-ai/practice-sessions", { method: "POST", body: JSON.stringify({ action: "teacher-revisit", data: { practiceRecordId: selected, studentId, action, dueOn: action === "SET" ? dates[studentId] : undefined, reason: reasons[studentId] ?? "" } }) }); await load(); }
    catch (e) { setError(ui((e as Error).message)); }
  };
  return (
    <section aria-labelledby="practice-progress" className="sk-panel space-y-3 p-4">
      <h3 id="practice-progress" className="font-semibold">{ui("Practice progress")}</h3>
      <p className="text-sm text-ink-subtle">{ui("Results without hints and with hints are shown apart. Practice never changes exam grades.")}</p>
      {practice.length > 1 ? <div className="flex flex-wrap gap-2">{practice.map((p) => <Button key={p.id} size="sm" variant={p.id === selected ? "default" : "outline"} onClick={() => setSelected(p.id)}><bdi dir="auto">{p.title}</bdi></Button>)}</div> : null}
      {error ? <p role="alert" className="text-sm text-status-error-text">{error}</p> : null}
      {rows?.length === 0 ? <p className="text-sm text-ink-subtle">{ui("No learners in this class yet.")}</p> : null}
      <ul className="space-y-2">
        {rows?.map((row) => (
          <li key={row.studentId} data-tone={row.needsSupport ? "warning" : undefined} className={`${deskRow} space-y-2 text-sm`}>
            <p className="font-semibold"><bdi>{row.fullName}</bdi> · <bdi dir="ltr">{row.rollNo}</bdi> · {ui(PROGRESS_LABEL[row.progress] ?? row.progress)}</p>
            <p>{row.latest ? ui("Latest: without hints {0}/{1}, with hints {2}/{3} · {4} sessions", [row.latest.independentCorrect, row.latest.independentTotal, row.latest.assistedCorrect, row.latest.assistedTotal, row.sessions]) : ui("No completed sessions yet.")}{row.open ? ` · ${ui("A session is open")}` : ""}</p>
            {row.needsSupport ? <p className="font-semibold text-status-warning-text">{ui("Two sessions in a row with fewer than half correct without hints: talk with this learner rather than adding more practice.")}</p> : null}
            <p className="text-ink-subtle">{row.revisit ? ui("Next revisit {0} (set by {1})", [row.revisit.dueOn, ui(SOURCE_LABEL[row.revisit.source] ?? row.revisit.source)]) : ui("No revisit scheduled.")}</p>
            <div className="flex flex-wrap items-end gap-2">
              <FormField name={`rv-date-${row.studentId}`} label={ui("Revisit date")} className="w-40"><Input type="date" value={dates[row.studentId] ?? ""} onChange={(e) => setDates((d) => ({ ...d, [row.studentId]: e.target.value }))} /></FormField>
              <FormField name={`rv-reason-${row.studentId}`} label={ui("Reason")} className="min-w-[12rem] flex-1"><Input value={reasons[row.studentId] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [row.studentId]: e.target.value }))} /></FormField>
              <Button size="sm" variant="outline" disabled={!dates[row.studentId]} onClick={() => revisit(row.studentId, "SET")}>{ui("Set revisit")}</Button>
              {row.revisit ? <Button size="sm" variant="ghost" onClick={() => revisit(row.studentId, "CANCEL")}>{ui("Cancel revisit")}</Button> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
