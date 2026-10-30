"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { listJobs, readJob } from "@/lib/jobs/service";

export type JobDetail = Awaited<ReturnType<typeof readJob>>;
export type JobSummary = Awaited<ReturnType<typeof listJobs>>[number];
type Data = { detail: JobDetail | null; jobs: JobSummary[] };
type Failure = "unavailable" | "denied" | "missing";
type Snapshot = Data & { key: string; checkedAt: string | null; error: Failure | null; loading: boolean };

/** One scoped request at a time. Old navigation/poll responses never replace a newer snapshot. */
export function useJobActivity(id: string, paused: boolean) {
  const key = id || "list";
  const [snapshot, setSnapshot] = useState<Snapshot>({ key, detail: null, jobs: [], checkedAt: null, error: null, loading: true });
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  const invalidate = useCallback(() => { sequence.current++; active.current?.abort(); }, []);
  const forget = useCallback((error: Failure = "denied") => {
    invalidate();
    setSnapshot({ key, detail: null, jobs: [], checkedAt: null, error, loading: false });
  }, [invalidate, key]);
  const refresh = useCallback(async (): Promise<Data | null> => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const request = ++sequence.current;
    const current = () => request === sequence.current;
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    setSnapshot(previous => previous.key === key ? { ...previous, loading: true } : { key, detail: null, jobs: [], checkedAt: null, error: null, loading: true });
    try {
      const response = await fetch(id ? `/api/jobs/${encodeURIComponent(id)}` : "/api/jobs", { cache: "no-store", signal: controller.signal });
      if (!current()) return null;
      if ([401, 403, 404].includes(response.status)) {
        setSnapshot({ key, detail: null, jobs: [], checkedAt: null, error: response.status === 404 ? "missing" : "denied", loading: false });
        return null;
      }
      if (!response.ok) throw new Error("JOB_STATUS_UNAVAILABLE");
      const payload = await response.json();
      if (!current()) return null;
      const data = id ? { detail: payload as JobDetail, jobs: [] } : { detail: null, jobs: payload.jobs as JobSummary[] };
      if ((id && (data.detail?.id !== id || !Array.isArray(data.detail?.items) || typeof data.detail?.counts?.total !== "number")) || !Array.isArray(data.jobs)) throw new Error("INVALID_JOB_STATUS");
      setSnapshot({ ...data, key, checkedAt: new Date().toISOString(), error: null, loading: false });
      return data;
    } catch {
      if (current()) setSnapshot(previous => previous.key === key ? { ...previous, error: "unavailable", loading: false } : { key, detail: null, jobs: [], checkedAt: null, error: "unavailable", loading: false });
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }, [id, key]);
  useEffect(() => {
    let ended = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!pausedRef.current && document.visibilityState !== "hidden") await refresh();
      if (!ended) timer = setTimeout(poll, 5000);
    };
    void poll();
    const resume = () => { if (!pausedRef.current && document.visibilityState !== "hidden") void refresh(); };
    const offline = () => { invalidate(); setSnapshot(previous => ({ ...previous, error: "unavailable", loading: false })); };
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      ended = true; clearTimeout(timer); invalidate();
      window.removeEventListener("online", resume); window.removeEventListener("offline", offline);
      window.removeEventListener("pageshow", resume); document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh, invalidate]);
  // Render fencing is immediate; effects do not get a frame to expose the previous job.
  const visible = snapshot.key === key ? snapshot : { key, detail: null, jobs: [], checkedAt: null, error: null, loading: true };
  return { ...visible, refresh, invalidate, forget };
}
