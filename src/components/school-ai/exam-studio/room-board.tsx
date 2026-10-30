"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const requestId = useRef(0);
  const pendingExtension = useRef<{ signature: string; key: string } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [minutes, setMinutes] = useState("10");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(examId)}/board`, { cache: "no-store" }).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;
    if (current !== requestId.current) return;
    if (!payload) { failures.current += 1; setLink(failures.current > 2 ? "error" : "reconnecting"); return; }
    failures.current = 0; setLink("ok"); setBoard(payload);
  }, [examId]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => { window.clearInterval(timer); requestId.current += 1; };
  }, [load]);

  const act = async (path: "extend" | "close") => {
    if (!board) return;
    const attemptIds = board.rows.filter(row => chosen.has(row.studentId) && row.attemptId).map(row => row.attemptId!);
    if (!attemptIds.length) { setNotice({ tone: "danger", text: t.boardNoneSelected }); return; }
    setBusy(true); setNotice(null);
    // A lost response may mean the server already applied the extension. Keep the same key
    // when retrying the same request so the candidate never receives the time twice.
    const signature = JSON.stringify({ examId, attemptIds: [...attemptIds].sort(), minutes: Number(minutes), reason: reason.trim() });
    if (path === "extend" && pendingExtension.current?.signature !== signature) pendingExtension.current = { signature, key: crypto.randomUUID() };
    const body = path === "extend" ? { attemptIds, minutes: Number(minutes), reason: reason.trim(), idempotencyKey: pendingExtension.current!.key } : { attemptIds, reason: reason.trim() };
    const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(examId)}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok || !Array.isArray(payload.outcomes)) { setNotice({ tone: "danger", text: typeof payload.error === "string" ? payload.error : t.boardActionFailed }); return; }
    if (path === "extend") pendingExtension.current = null;
    const done = (payload.outcomes as Array<{ outcome: string }>).filter(row => path === "extend" ? ["EXTENDED", "ALREADY_APPLIED"].includes(row.outcome) : row.outcome === "CLOSED").length;
    setNotice({ tone: "success", text: fillStudioCopy(path === "extend" ? t.boardExtended : t.boardClosed, [number(done)]) });
    setChosen(new Set()); void load();
  };

  if (!board) return link === "ok" ? null : <Alert tone="warning" compact>{link === "error" ? t.boardError : t.boardReconnecting}</Alert>;
  const writing = board.rows.filter(row => ["SAVED", "UNSAVED", "PAUSED"].includes(row.state));
  return <section className="sk-panel min-w-0 space-y-4 p-4 sm:p-5" aria-labelledby={`board-${examId}`} data-room-board data-link={link}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h3 id={`board-${examId}`} className="flex items-center gap-2 text-base font-bold text-ink-strong"><Users aria-hidden="true" className="size-4 text-primary" />{t.boardTitle}</h3>
      <p className="flex items-center gap-1.5 text-xs tabular-nums text-ink-muted"><Clock3 aria-hidden="true" className="size-3" />{fillStudioCopy(t.boardFresh, [time(board.serverTime)])}</p>
    </header>
    {link !== "ok" ? <Alert tone="warning" compact live="polite">{link === "error" ? t.boardError : t.boardReconnecting}</Alert> : null}
    {notice ? <Alert tone={notice.tone} compact live="polite">{notice.text}</Alert> : null}
    <ul className="flex flex-wrap gap-1.5" aria-label={t.boardTitle}>{Object.entries(board.counts).filter(([, count]) => count > 0).map(([state, count]) => <li key={state}><Badge variant={TONE[state] ?? "neutral"} dot>{words[`state${state}`]} · {number(count)}</Badge></li>)}</ul>
    <Table className="min-w-[40rem]" containerClassName="max-h-96 max-w-full custom-scrollbar">
      <caption className="sr-only">{t.boardTitle}</caption>
      <TableHeader className="sticky top-0 z-20">
        <TableRow>
          <TableHead className="sticky start-0 z-10 w-44 min-w-44 max-w-44 bg-surface-subtle sm:w-56 sm:min-w-56 sm:max-w-64">{t.boardCandidate}</TableHead>
          <TableHead className="min-w-40">{t.boardStatus}</TableHead>
          <TableHead className="min-w-32"><span className="block text-end">{t.boardLastSaved}</span></TableHead>
          <TableHead className="min-w-32"><span className="block text-end">{t.boardObservationColumn}</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{board.rows.length ? board.rows.map(row => <TableRow key={row.studentId} className="group" data-board-row={row.state} data-state={chosen.has(row.studentId) ? "selected" : undefined}>
        <TableCell className={`sticky start-0 z-10 w-44 min-w-44 max-w-44 py-3 sm:w-56 sm:min-w-56 sm:max-w-64 group-hover:bg-surface-hover group-focus-within:bg-surface-hover ${chosen.has(row.studentId) ? "bg-surface-selected" : "bg-white"}`}>
          <label className="flex min-h-11 items-center gap-3">
            <Checkbox checked={chosen.has(row.studentId)} disabled={!row.attemptId || !["SAVED", "UNSAVED", "PAUSED"].includes(row.state)} onChange={event => { const next = new Set(chosen); if (event.currentTarget.checked) next.add(row.studentId); else next.delete(row.studentId); setChosen(next); }} aria-label={row.name} />
            <span className="min-w-0"><bdi className="block max-w-full break-words font-semibold text-ink-strong">{row.name}</bdi>{row.rollNo ? <bdi className="mt-1 block text-xs tabular-nums text-ink-muted">{row.rollNo}</bdi> : null}</span>
          </label>
        </TableCell>
        <TableCell className="py-3"><Badge variant={TONE[row.state] ?? "neutral"} dot>{words[`state${row.state}`]}</Badge></TableCell>
        <TableCell className="whitespace-nowrap py-3 text-end text-sm tabular-nums text-ink-muted">{row.lastSavedAt ? <bdi>{time(row.lastSavedAt)}</bdi> : "—"}</TableCell>
        <TableCell className="py-3 text-end text-sm tabular-nums text-ink-muted">{row.observations ? fillStudioCopy(t.boardObservations, [number(row.observations)]) : "—"}</TableCell>
      </TableRow>) : <TableRow><TableCell colSpan={4} className="py-8 text-center text-ink-muted">{t.boardEmpty}</TableCell></TableRow>}</TableBody>
    </Table>
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-3 sm:p-4">
      <Button type="button" size="sm" variant="ghost" onClick={() => setChosen(new Set(writing.map(row => row.studentId)))}>{t.boardSelectAll}</Button>
      <label className="grid gap-2 text-sm font-semibold">{t.boardExtendMinutes}<Select value={minutes} onChange={event => setMinutes(event.target.value)} aria-label={t.boardExtendMinutes}>{[5, 10, 15, 20, 30, 45, 60].filter(value => value <= board.extendLimit).map(value => <option key={value} value={value}>{number(value)}</option>)}</Select></label>
      <label className="grid w-full min-w-0 gap-2 text-sm font-semibold sm:w-auto sm:min-w-48 sm:flex-1">{t.boardReason}<Input value={reason} maxLength={300} onChange={event => setReason(event.currentTarget.value)} /></label>
      <Button type="button" size="sm" disabled={busy || reason.trim().length < 3} onClick={() => void act("extend")} data-board-extend>{t.boardExtend}</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy || reason.trim().length < 3} onClick={() => void act("close")} data-board-close>{t.boardClose}</Button>
    </div>
    <p className="text-xs text-ink-subtle">{fillStudioCopy(t.boardExtendLimit, [number(board.extendLimit)])}</p>
  </section>;
}
