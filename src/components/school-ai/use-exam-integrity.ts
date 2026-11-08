"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExamIntegrityDisclosure, IntegrityEventKind } from "@/lib/school-ai/exam-integrity";

type IntegrityReason = "PERMISSION_DENIED" | "DEVICE_UNAVAILABLE" | "TRACK_ENDED" | "NETWORK" | "UPLOAD_REJECTED" | "UNKNOWN";

/** Advisory telemetry only: delivery failure must never interfere with an answer. */
export function useExamIntegrity({ id, attemptId, active, policy, clockNow = Date.now }: { id: string; attemptId?: string; active: boolean; policy?: ExamIntegrityDisclosure; clockNow?: () => number }) {
  const collecting = active && policy?.enabled === true;
  const [monitoringAvailable, setMonitoringAvailable] = useState(true);
  const lifecycle = useRef({ disposed: true, sent: 0, last: new Map<string, number>(), requests: new Set<AbortController>(), timers: new Set<ReturnType<typeof setTimeout>>() });
  const report = useCallback((kind: IntegrityEventKind, reason?: IntegrityReason) => {
    const state = lifecycle.current;
    if (!collecting || !attemptId || state.disposed || state.sent >= 600) return;
    const elapsed = performance.now();
    const previous = state.last.get(kind);
    if (previous !== undefined && elapsed - previous < 1500) return;
    state.last.set(kind, elapsed);
    state.sent += 1;
    // Retrying uses exactly the same event ID/body so an uncertain response cannot duplicate it.
    const body = JSON.stringify({ attemptId, clientEventId: crypto.randomUUID(), kind, observedAt: new Date(clockNow()).toISOString(), details: reason ? { reason } : {} });
    const send = async (retried: boolean) => {
      if (state.disposed) return;
      const controller = new AbortController();
      state.requests.add(controller);
      const timeout = setTimeout(() => controller.abort(), 8000);
      state.timers.add(timeout);
      try {
        const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(id)}/integrity`, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal, keepalive: true });
        if (state.disposed) return;
        setMonitoringAvailable(response.ok);
        if (response.status >= 500 && !retried) retry();
      } catch {
        if (!state.disposed) { setMonitoringAvailable(false); if (!retried) retry(); }
      } finally { clearTimeout(timeout); state.timers.delete(timeout); state.requests.delete(controller); }
    };
    const retry = () => {
      const timer = setTimeout(() => { state.timers.delete(timer); void send(true); }, 2000);
      state.timers.add(timer);
    };
    void send(false);
  }, [collecting, attemptId, id, clockNow]);

  useEffect(() => {
    const state = { disposed: !collecting || !attemptId, sent: 0, last: new Map<string, number>(), requests: new Set<AbortController>(), timers: new Set<ReturnType<typeof setTimeout>>() };
    lifecycle.current = state;
    if (state.disposed) return;
    const visibility = () => report(document.hidden ? "PAGE_HIDDEN" : "PAGE_VISIBLE");
    const blur = () => report("WINDOW_BLURRED");
    const focus = () => report("WINDOW_FOCUSED");
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    return () => {
      state.disposed = true;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      state.requests.forEach(controller => controller.abort());
      state.requests.clear();
      state.timers.forEach(clearTimeout);
      state.timers.clear();
    };
  }, [collecting, attemptId, report]);
  return { report, monitoringAvailable: !collecting || monitoringAvailable };
}
