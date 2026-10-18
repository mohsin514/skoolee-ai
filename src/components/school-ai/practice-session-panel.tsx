"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { useUiText } from "@/components/locale/LocaleProvider";

// SKO-426: a learner's short practice — one question at a time, hints one by one, the worked example
// only after answering, pause and resume, and an explained next revisit. Practice never changes grades.

type Item = { key: string; prompt: string; type: string; options: { id: string; text: string }[]; hints: { text: string; generic: boolean }[]; hintsAvailable: number; answer: string | null; correct: boolean | null; assisted: boolean; workedExample: string | null };
type Session = { id: string; title: string; status: string; expectedMinutes: number; items: Item[]; summary: { independentCorrect: number; independentTotal: number; assistedCorrect: number; assistedTotal: number; answered: number } | null; next?: { dueOn: string; reason: string } | null };
type SetRow = { practiceRecordId: string; title: string; open: string | null; sessions: number; progress: string; revisit: { id: string; dueOn: string; originalDueOn: string; reason: string; source: string } | null };

const PROGRESS_LABEL: Record<string, string> = { JUST_STARTED: "Not practised yet", BUILDING: "Building — keep practising", SECURE_FOR_NOW: "Secure for now — a later check will confirm it" };
const SOURCE_LABEL: Record<string, string> = { RULE: "Set by the practice rule", TEACHER: "Set by your teacher" };

/** The rule reason from the server, as a catalog key (the long-gap wording does not repeat the day count). */
const STRONG = "Most answers were correct without hints, so the next check is a little later.";
const SHORT = "Some answers needed hints or were not correct yet, so a short revisit comes in 2 days.";
const revisitReason = (reason: string) => (reason.startsWith(STRONG.slice(0, 4)) ? STRONG : SHORT);

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok) throw new Error(json?.error || "Request failed");
  return json.result;
}

export function PracticeSessionPanel() {
  const ui = useUiText();
  const [sets, setSets] = useState<SetRow[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try { setSets((await call("/api/school-ai/practice-sessions")).sets); } catch (e) { setError(ui((e as Error).message)); }
  }, [ui]);
  useEffect(() => { void load(); }, [load]);
  const act = async (action: string, data: unknown = {}, sessionId = session?.id) => {
    try {
      const result = await call("/api/school-ai/practice-sessions", { method: "POST", body: JSON.stringify({ action, sessionId, data }) });
      setError(null); return result;
    } catch (e) { setError(ui((e as Error).message)); return null; }
  };
  if (!sets) return error ? <p role="alert" className="text-sm text-status-error-text">{error}</p> : null;
  if (!sets.length && !session) return <p className="text-sm text-ink-subtle">{ui("No practice is assigned. Open your approved resources or ask your teacher.")}</p>;

  if (session) {
    const item = session.items[index];
    if (session.status === "COMPLETED" && session.summary) return (
      <section className="space-y-2 rounded-xl border border-border p-4 text-sm" aria-labelledby="practice-done">
        <h4 id="practice-done" className="font-semibold">{ui("Session saved")}</h4>
        <p>{ui("Without hints: {0} of {1} correct. With hints: {2} of {3} correct.", [session.summary.independentCorrect, session.summary.independentTotal, session.summary.assistedCorrect, session.summary.assistedTotal])}</p>
        {session.next ? <p>{ui("Next short revisit: {0}.", [session.next.dueOn])} <span className="text-ink-subtle">{ui(revisitReason(session.next.reason))}</span></p> : <p>{ui("Your teacher will choose what comes next.")}</p>}
        <p className="text-ink-subtle">{ui("Practice does not change your exam grade.")}</p>
        <Button size="sm" variant="outline" onClick={() => { setSession(null); setIndex(0); void load(); }}>{ui("Back to practice")}</Button>
      </section>
    );
    return (
      <section className="space-y-3 rounded-xl border border-border p-4 text-sm" aria-labelledby="practice-q">
        <p className="text-xs text-ink-subtle">{ui("About {0} minutes · Practice does not change your exam grade.", [session.expectedMinutes])}</p>
        <h4 id="practice-q" className="font-semibold">{ui("Question {0} of {1}", [index + 1, session.items.length])}</h4>
        <p dir="auto" className="whitespace-pre-wrap">{item.prompt}</p>
        {item.answer == null ? (
          <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); const next = await act("answer", { itemKey: item.key, answer }); if (next) { setSession(next); setAnswer(""); } }}>
            {item.options.length ? (
              <fieldset className="space-y-1"><legend className="sr-only">{ui("Your answer")}</legend>
                {item.options.map((o) => <label key={o.id} className="flex min-h-11 items-center gap-2"><input type="radio" name={`answer-${item.key}`} value={o.id} checked={answer === o.id} onChange={() => setAnswer(o.id)} /><bdi dir="auto">{o.text}</bdi></label>)}
              </fieldset>
            ) : <FormField name={`answer-${item.key}`} label={ui("Your answer")}><Input value={answer} onChange={(e) => setAnswer(e.target.value)} /></FormField>}
            {item.hints.length ? <ol className="list-decimal space-y-1 rounded-lg bg-surface-muted p-3 ps-8" aria-label={ui("Hints")}>{item.hints.map((h, i) => <li key={i} dir="auto">{h.generic ? ui(h.text) : h.text}</li>)}</ol> : <p className="text-ink-subtle">{ui("Try one step first. A hint is here if you need it.")}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!answer.trim()}>{ui("Check my answer")}</Button>
              <Button type="button" size="sm" variant="outline" disabled={item.hintsAvailable <= 0} onClick={async () => { const next = await act("hint", { itemKey: item.key }); if (next) setSession(next); }}>{ui("Show a hint")}</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-2" role="status">
            <p className="font-semibold">{item.correct == null ? ui("Answer saved. Compare it with the worked example.") : ui(item.correct ? "Correct." : "Not quite yet — read the worked example.")}</p>
            {item.assisted ? <p className="text-ink-subtle">{ui("You used a hint on this question. Try a similar one next time.")}</p> : null}
            {item.workedExample ? <div className="rounded-lg bg-surface-muted p-3"><p className="text-xs font-semibold">{ui("Worked example")}</p><p dir="auto" className="whitespace-pre-wrap">{item.workedExample}</p></div> : null}
          </div>
        )}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>{ui("Previous")}</Button>
          <Button size="sm" variant="ghost" disabled={index >= session.items.length - 1} onClick={() => { setIndex((i) => i + 1); setAnswer(""); }}>{ui("Next question")}</Button>
          <Button size="sm" variant="outline" onClick={async () => { if (await act("pause")) { setSession(null); setIndex(0); void load(); } }}>{ui("Pause and return later")}</Button>
          <Button size="sm" onClick={async () => { const done = await act("finish"); if (done) setSession(done); }}>{ui("Finish session")}</Button>
        </div>
        {error ? <p role="alert" className="text-status-error-text">{error}</p> : null}
      </section>
    );
  }

  return (
    <div className="space-y-2">
      {error ? <p role="alert" className="text-sm text-status-error-text">{error}</p> : null}
      {sets.map((set) => (
        <div key={set.practiceRecordId} className="space-y-2 rounded-xl border border-border p-3 text-sm">
          <p className="font-semibold"><bdi dir="auto">{set.title}</bdi></p>
          <p className="text-ink-subtle">{ui(PROGRESS_LABEL[set.progress] ?? set.progress)} · {ui("{0} sessions", [set.sessions])}</p>
          {set.revisit ? (
            <div className="space-y-1">
              <p>{ui("Next revisit: {0}", [set.revisit.dueOn])} · <span className="text-ink-subtle">{ui(SOURCE_LABEL[set.revisit.source] ?? set.revisit.source)}</span></p>
              <div className="flex flex-wrap items-end gap-2">
                <FormField name={`move-${set.revisit.id}`} label={ui("Move by up to 3 days")}><Select value={moveTo[set.revisit.id] ?? ""} onChange={(e) => setMoveTo((m) => ({ ...m, [set.revisit!.id]: e.target.value }))}>
                  <option value="">{ui("Keep this date")}</option>
                  {[-3, -2, -1, 1, 2, 3].map((d) => { const v = new Date(new Date(`${set.revisit!.originalDueOn}T00:00:00Z`).getTime() + d * 86_400_000).toISOString().slice(0, 10); return <option key={d} value={v}>{v}</option>; })}
                </Select></FormField>
                <Button size="sm" variant="outline" disabled={!moveTo[set.revisit.id]} onClick={async () => { if (await act("reschedule", { revisitId: set.revisit!.id, dueOn: moveTo[set.revisit!.id] })) void load(); }}>{ui("Move revisit")}</Button>
              </div>
            </div>
          ) : null}
          <Button size="sm" onClick={async () => { const s = await act("start", { practiceRecordId: set.practiceRecordId }, undefined); if (s) { setSession(s); setIndex(Math.max(0, s.items.findIndex((i: Item) => i.answer == null))); } }}>{ui(set.open ? "Resume practice" : "Start practice")}</Button>
        </div>
      ))}
    </div>
  );
}
