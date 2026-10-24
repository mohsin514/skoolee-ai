"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Language } from "@/lib/locale/package";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";

/**
 * SKO-502: the room board. Polls every 5 seconds while the page is visible, stamps the server's time, and
 * keeps the last good board on screen while reconnecting. Bounded extension and close act on the chosen
 * candidates with a reason; each returns a per-attempt outcome.
 */
type Row = { studentId: string; name: string; rollNo: string | null; state: string; attemptId: string | null; lastSavedAt: string | null; deadlineAt: string | null; observations: number };
type Board = { serverTime: string; counts: Record<string, number>; rows: Row[]; extendLimit: number };
const POLL_MS = 5000;
const TONE: Record<string, "neutral" | "success" | "warning" | "info" | "danger"> = { NOT_STARTED: "neutral", SAVED: "success", UNSAVED: "warning", PAUSED: "info", SUBMITTED: "neutral", EXPIRED: "danger" };

export function RoomBoard({ language, examId }: { language: Language; examId: string }) {
  const t = studioHomeCopy(language);
  const words = t as Record<string, string>;
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const time = (value: string) => new Intl.DateTimeFormat(language, { timeStyle: "medium" }).format(new Date(value));
  const [board, setBoard] = useState<Board | null>(null);
  const [link, setLink] = useState<"ok" | "reconnecting" | "error">("ok");
  const failures = useRef(0);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [minutes, setMinutes] = useState("10");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(examId)}/board`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { failures.current += 1; setLink(failures.current > 2 ? "error" : "reconnecting"); return; }
    failures.current = 0; setLink("ok"); setBoard(await response.json());
  }, [examId]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const act = async (path: "extend" | "close") => {
    if (!board) return;
    const attemptIds = board.rows.filter(row => chosen.has(row.studentId) && row.attemptId).map(row => row.attemptId!);
    if (!attemptIds.length) { setNotice({ tone: "danger", text: t.boardNoneSelected }); return; }
    setBusy(true); setNotice(null);
    const body = path === "extend" ? { attemptIds, minutes: Number(minutes), reason: reason.trim(), idempotencyKey: (crypto.randomUUID?.() ?? String(Date.now())).replace(/[^a-zA-Z0-9-]/g, "") } : { attemptIds, reason: reason.trim() };
    const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(examId)}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok) { setNotice({ tone: "danger", text: typeof payload.error === "string" ? payload.error : t.boardError }); return; }
    const done = (payload.outcomes as Array<{ outcome: string }>).filter(row => row.outcome === (path === "extend" ? "EXTENDED" : "CLOSED")).length;
    setNotice({ tone: "success", text: fillStudioCopy(path === "extend" ? t.boardExtended : t.boardClosed, [number(done)]) });
    setChosen(new Set()); void load();
  };

  if (!board) return link === "ok" ? null : <Alert tone="warning" compact>{link === "error" ? t.boardError : t.boardReconnecting}</Alert>;
  const writing = board.rows.filter(row => ["SAVED", "UNSAVED", "PAUSED"].includes(row.state));
  return <section className="sk-panel space-y-3 p-4 sm:p-5" aria-labelledby={`board-${examId}`} data-room-board data-link={link}>
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id={`board-${examId}`} className="flex items-center gap-2 text-base font-bold"><Users aria-hidden="true" className="size-4 text-primary" />{t.boardTitle}</h3>
      <p className="flex items-center gap-1 text-xs text-ink-subtle"><Clock3 aria-hidden="true" className="size-3" />{fillStudioCopy(t.boardFresh, [time(board.serverTime)])}</p>
    </header>
    {link !== "ok" ? <Alert tone="warning" compact live="polite">{link === "error" ? t.boardError : t.boardReconnecting}</Alert> : null}
    {notice ? <Alert tone={notice.tone} compact live="polite">{notice.text}</Alert> : null}
    <ul className="flex flex-wrap gap-1.5" aria-label={t.boardTitle}>{Object.entries(board.counts).filter(([, count]) => count > 0).map(([state, count]) => <li key={state}><Badge variant={TONE[state] ?? "neutral"}>{words[`state${state}`]} · {number(count)}</Badge></li>)}</ul>
    <div className="max-h-96 overflow-y-auto rounded-lg border border-border-subtle">
      <table className="w-full text-sm">
        <tbody>{board.rows.map(row => <tr key={row.studentId} className="border-t border-border-subtle first:border-t-0" data-board-row={row.state}>
          <td className="px-2 py-1.5"><label className="flex items-center gap-2"><Checkbox checked={chosen.has(row.studentId)} disabled={!row.attemptId || !["SAVED", "UNSAVED", "PAUSED"].includes(row.state)} onChange={event => { const next = new Set(chosen); if (event.currentTarget.checked) next.add(row.studentId); else next.delete(row.studentId); setChosen(next); }} aria-label={row.name} /><bdi>{row.rollNo ? `${row.rollNo} · ` : ""}{row.name}</bdi></label></td>
          <td className="px-2"><Badge variant={TONE[row.state] ?? "neutral"} size="sm">{words[`state${row.state}`]}</Badge></td>
          <td className="px-2 text-xs text-ink-subtle">{row.lastSavedAt ? time(row.lastSavedAt) : "—"}</td>
          <td className="px-2 text-xs text-ink-subtle">{row.observations ? fillStudioCopy(t.boardObservations, [number(row.observations)]) : null}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-end gap-2">
      <Button type="button" size="sm" variant="ghost" onClick={() => setChosen(new Set(writing.map(row => row.studentId)))}>{t.boardSelectAll}</Button>
      <label className="grid gap-1 text-xs font-semibold">{t.boardExtendMinutes}<Select value={minutes} onChange={event => setMinutes(event.target.value)} aria-label={t.boardExtendMinutes}>{[5, 10, 15, 20, 30, 45, 60].filter(value => value <= board.extendLimit).map(value => <option key={value} value={value}>{number(value)}</option>)}</Select></label>
      <label className="grid min-w-48 flex-1 gap-1 text-xs font-semibold">{t.boardReason}<Input value={reason} maxLength={300} onChange={event => setReason(event.currentTarget.value)} /></label>
      <Button type="button" size="sm" disabled={busy || reason.trim().length < 3} onClick={() => void act("extend")} data-board-extend>{t.boardExtend}</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy || reason.trim().length < 3} onClick={() => void act("close")} data-board-close>{t.boardClose}</Button>
    </div>
    <p className="text-xs text-ink-subtle">{fillStudioCopy(t.boardExtendLimit, [number(board.extendLimit)])}</p>
  </section>;
}
