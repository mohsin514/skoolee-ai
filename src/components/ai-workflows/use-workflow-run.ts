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

  useEffect(() => { setRun(initial); }, [initial]);

  const refresh = useCallback(async (id: string) => {
    const { run: next } = await request<{ run: RunView }>(`/api/ai-workflows/${id}`);
    setRun(next);
    return next;
  }, []);

  useEffect(() => {
    if (!run || !MOVING.has(run.status)) return;
    const timer = window.setTimeout(() => { void refresh(run.id).catch(() => undefined); }, 1000);
    return () => window.clearTimeout(timer);
  }, [run, refresh]);

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

  return { run, setRun, busy, error, setError, refresh, send };
}

export async function startWorkflow(message: string, language: "en" | "ar" | "ur", idempotencyKey: string, campusId: string | null) {
  return request<{ run: RunView }>("/api/ai-workflows", { method: "POST", body: JSON.stringify({ message, language, idempotencyKey, ...(campusId ? { campusId } : {}) }) });
}
