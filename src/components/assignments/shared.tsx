"use client";
import type { ReactNode } from "react";

// SKO-409 helpers shared by the teacher workspace and the learner/family pages.
export type Criterion = { id: string; title: string; description: string; maxPoints: number };
export type Score = { criterionId: string; points: number | null; comment: string };
export type Receipt = {
  id: string; version: number; receiptCode: string; mode: "ONLINE" | "PAPER"; submittedAt: string; receivedAt: string; late: boolean; effectiveDueAt: string;
  assignmentVersion: number; rubricVersion: number; text: string; artifactSha256: string;
  file: { name: string | null; contentType: string | null; sizeBytes: number | null; sha256: string | null } | null;
};
export type Feedback = { criteria: Score[]; comment: string; totalPoints: number | null; returnedAt: string | null; rubricVersion?: number } | null;

export async function call(path: string, body?: unknown) {
  const response = await fetch(path, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(typeof data.error === "string" ? data.error : "Request failed"), { status: response.status });
  return data;
}

/** Instants in the school timezone the work was released in, with the zone named. */
export function formatAt(value: string | Date | null | undefined, language: string, timezone?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", ...(timezone ? { timeZone: timezone } : {}) }).format(new Date(value));
}
/** Copy with {placeholders}: values are isolated so receipt codes and times never reorder or break in RTL. */
export function fill(template: string, values: Record<string, string>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return name && name in values ? <bdi key={index} className="whitespace-nowrap">{values[name]}</bdi> : part;
  });
}
export const shortSha = (sha: string | null | undefined) => sha ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : "";
export const fileHref = (assignmentId: string, versionId: string) => `/api/assignments/${assignmentId}/submissions/${versionId}/file`;

const TONES = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700", violet: "border-violet-200 bg-violet-50 text-violet-800", green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-900", red: "border-rose-200 bg-rose-50 text-rose-800",
} as const;
export function Pill({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}
export const stateTone = (state: string): keyof typeof TONES => state === "RETURNED" ? "green" : state === "SUBMITTED" ? "violet" : state === "REOPENED" || state === "DRAFT" ? "amber" : "neutral";

export function Banner({ status }: { status: { tone: "ok" | "error"; text: string } | null }) {
  if (!status?.text) return null;
  return <p role={status.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm ${status.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{status.text}</p>;
}

/** Criterion table for a rubric and, when given, returned or draft scores. */
export function RubricTable({ criteria, scores, labels }: { criteria: Criterion[]; scores?: Score[]; labels: { criterion: string; points: string; comment: string; total: string; outOf: string } }) {
  const total = criteria.reduce((sum, c) => sum + c.maxPoints, 0);
  const got = scores?.reduce((sum, s) => sum + (s.points ?? 0), 0);
  return <div className="overflow-x-auto"><table className="w-full min-w-0 text-start text-sm">
    <thead><tr className="border-b text-xs text-slate-500"><th scope="col" className="py-1 pe-2 text-start font-semibold">{labels.criterion}</th><th scope="col" className="py-1 pe-2 text-start font-semibold">{labels.points}</th>{scores && <th scope="col" className="py-1 text-start font-semibold">{labels.comment}</th>}</tr></thead>
    <tbody>{criteria.map(c => { const score = scores?.find(s => s.criterionId === c.id); return <tr key={c.id} className="border-b align-top last:border-0">
      <td className="py-1.5 pe-2"><span className="font-semibold" dir="auto">{c.title}</span>{c.description && <span className="block text-xs text-slate-500" dir="auto">{c.description}</span>}</td>
      <td className="whitespace-nowrap py-1.5 pe-2 tabular-nums"><span dir="ltr">{score ? `${score.points ?? "—"} / ${c.maxPoints}` : c.maxPoints}</span></td>
      {scores && <td className="py-1.5 text-slate-700" dir="auto">{score?.comment}</td>}
    </tr>; })}</tbody>
    <tfoot><tr><th scope="row" className="pt-1.5 text-start text-xs font-semibold">{labels.total}</th><td className="pt-1.5 font-semibold tabular-nums"><span dir="ltr">{got !== undefined ? `${got} / ${total}` : total}</span></td>{scores && <td />}</tr></tfoot>
  </table></div>;
}
