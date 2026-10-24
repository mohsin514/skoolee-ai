"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunView } from "@/lib/ai-workflows/view";

/**
 * Client state for one AI Workflows run. The server owns every status; the client only polls
 * (1 s while the run is moving, never while it waits for a person) and sends commands carrying the
 * version, hashes and a per-click command id. A command id is reused while the same click is retried,
 * so a double submit replays instead of acting twice.
 */
const MOVING = new Set(["PLANNING", "RUNNING"]);

export class WorkflowRequestError extends Error {
  constructor(readonly code: string) { super(code); this.name = "WorkflowRequestError"; }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new WorkflowRequestError(typeof body?.code === "string" ? body.code : "INTERNAL");
  return body as T;
}

export function useWorkflowRun(initial: RunView | null) {
  const [run, setRun] = useState<RunView | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commandIds = useRef(new Map<string, string>());
  // Consecutive failed polls: drives the backoff (2 s, 4 s, 8 s, capped at 15 s) and "Reconnecting…".
  const [failures, setFailures] = useState(0);

  useEffect(() => { setRun(initial); setFailures(0); }, [initial]);

  const refresh = useCallback(async (id: string) => {
    const { run: next } = await request<{ run: RunView }>(`/api/ai-workflows/${id}`);
    setRun(next);
    return next;
  }, []);

  const poll = useCallback((id: string) => refresh(id).then(() => setFailures(0), () => setFailures(count => count + 1)), [refresh]);

  useEffect(() => {
    if (!run || !MOVING.has(run.status)) return;
    const delay = failures === 0 ? 1000 : Math.min(15_000, 1000 * 2 ** failures);
    // A hidden tab skips the tick; becoming visible again checks once (below).
    const timer = window.setTimeout(() => { if (!document.hidden) void poll(run.id); }, delay);
    return () => window.clearTimeout(timer);
  }, [run, failures, poll]);

  useEffect(() => {
    if (!run || !MOVING.has(run.status)) return;
    const id = run.id;
    const onVisible = () => { if (!document.hidden) void poll(id); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [run, poll]);

  /** One explicit read ("Check now", "Check for updates"); never sends a command. */
  const checkNow = useCallback(() => { if (run) void poll(run.id); }, [run, poll]);

  const send = useCallback(async (body: Record<string, unknown>, clickKey?: string) => {
    if (!run) return;
    setBusy(true); setError(null);
    try {
      let clientCommandId: string | undefined;
      if (clickKey) { clientCommandId = commandIds.current.get(clickKey) ?? crypto.randomUUID(); commandIds.current.set(clickKey, clientCommandId); }
      const { run: next } = await request<{ run: RunView }>(`/api/ai-workflows/${run.id}/commands`, { method: "POST", body: JSON.stringify({ ...body, jobVersion: run.version, ...(clientCommandId ? { clientCommandId } : {}) }) });
      if (clickKey) commandIds.current.delete(clickKey);
      setRun(next);
    } catch (thrown) {
      const code = thrown instanceof WorkflowRequestError ? thrown.code : "INTERNAL";
      setError(code);
      // A stale version means the server moved on: show the current state instead of the old card.
      if (code === "STALE_VERSION" || code === "SUPERSEDED") await refresh(run.id).catch(() => undefined);
    } finally { setBusy(false); }
  }, [run, refresh]);

  const connection: "live" | "retrying" = failures > 0 ? "retrying" : "live";
  return { run, setRun, busy, error, setError, refresh, send, connection, checkNow };
}

export async function startWorkflow(message: string, language: "en" | "ar" | "ur", idempotencyKey: string, campusId: string | null) {
  return request<{ run: RunView }>("/api/ai-workflows", { method: "POST", body: JSON.stringify({ message, language, idempotencyKey, ...(campusId ? { campusId } : {}) }) });
}
