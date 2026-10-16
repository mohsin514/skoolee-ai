"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Monitor, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import { PROCTOR_CLIP_BYTES, PROCTOR_CLIP_SECONDS, PROCTOR_CONSENT_VERSION, type ProctorKind, type ProctorView } from "@/lib/school-ai/exam-proctor";
import { examCameraCopy } from "./exam-camera-copy";
import type { IntegrityEventKind } from "@/lib/school-ai/exam-integrity";
import { examProctorCopy } from "./exam-proctor-copy";
import { ProctorSessionList } from "./exam-proctor-sessions";

export type CaptureIntegrityReporter = (kind: IntegrityEventKind, reason?: "PERMISSION_DENIED" | "DEVICE_UNAVAILABLE" | "TRACK_ENDED" | "NETWORK" | "UPLOAD_REJECTED" | "UNKNOWN") => void;
export function ExamProctorCapture({ id, attemptId, active, deadlineAt, locale, initialCameraStream, cameraRequired = false, onIntegrityEvent, clockNow = Date.now }: { id: string; attemptId: string; active: boolean; deadlineAt: string; locale: AssessmentLocale; initialCameraStream?: MediaStream | null; cameraRequired?: boolean; onIntegrityEvent?: CaptureIntegrityReporter; clockNow?: () => number }) {
  const t = examProctorCopy(locale), cameraCopy = examCameraCopy(locale), [data, setData] = useState<ProctorView | null>(null), [error, setError] = useState(""), [stopped, setStopped] = useState<string[]>([]);
  const api = `/api/school-ai/exams/${encodeURIComponent(id)}/proctor`;
  const load = useCallback(async () => { try { const response = await fetch(api, { cache: "no-store", signal: AbortSignal.timeout(15000) }), payload = await response.json(); if (!response.ok) throw new Error(t.unavailable); setData(payload); setError(""); } catch { setError(t.unavailable); } }, [api, t.unavailable]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!active || !data?.sessions.some(session => session.status === "ACTIVE")) return; const poll = setInterval(() => void load(), 5000); return () => clearInterval(poll); }, [active, data?.sessions, load]);
  useEffect(() => { if (!active || !data && error || data && (!data.storageAvailable || !data.policy.enabled || !data.policy.camera)) initialCameraStream?.getTracks().forEach(track => track.stop()); }, [active, data, error, initialCameraStream]);
  const revoked = [...stopped, ...(data?.sessions.filter(session => session.status !== "ACTIVE").map(session => session.id) ?? [])];
  if (!data) return error ? <div role="status" className="sk-panel space-y-3 p-4 text-sm"><p>{cameraRequired ? cameraCopy.recovery : error}</p><Button type="button" variant="outline" onClick={load}>{cameraCopy.retry}</Button></div> : <Skeleton className="h-20 w-full" />;
  if (!data.policy.enabled && !data.sessions.length) return null;
  return <section className="sk-panel space-y-3 p-4 sm:p-5" aria-label={cameraRequired ? cameraCopy.activeTitle : t.title} dir={locale === "en" ? "ltr" : "rtl"}>
    <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{cameraRequired ? cameraCopy.activeTitle : t.title}</h2>{cameraRequired && <span className="text-xs font-semibold text-ink-subtle">{cameraCopy.requiredLabel}</span>}</header>
    {error && <p role="status" className="text-sm text-status-warning-text">{cameraRequired ? cameraCopy.recovery : error}</p>}
    {active && data.storageAvailable && <div className={`grid gap-3 ${data.policy.camera && data.policy.screen ? "sm:grid-cols-2" : ""}`}>
      {data.policy.camera && <CaptureStream kind="CAMERA" clockNow={clockNow} preconsentedStream={initialCameraStream} required={cameraRequired} onIntegrityEvent={onIntegrityEvent} api={api} attemptId={attemptId} active={active} deadlineAt={deadlineAt} locale={locale} onChanged={load} revoked={revoked} />}
      {data.policy.screen && <CaptureStream kind="SCREEN" clockNow={clockNow} onIntegrityEvent={onIntegrityEvent} api={api} attemptId={attemptId} active={active} deadlineAt={deadlineAt} locale={locale} onChanged={load} revoked={revoked} />}
    </div>}
    {!data.storageAvailable && <p role="status">{cameraRequired ? cameraCopy.recovery : t.unavailable}</p>}
    <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm font-semibold">{cameraCopy.details}</summary><div className="mt-3 space-y-3"><p className="text-sm text-ink-subtle">{cameraRequired ? cameraCopy.activeDescription : t.description}</p><p className="text-xs text-ink-subtle">{t.limits}</p><p className="text-sm font-semibold">{t.retention}: {data.policy.retentionDays} {t.days}</p><ProctorSessionList api={api} sessions={data.sessions} locale={locale} staff={false} onChanged={load} onBeforeChange={sessionId => setStopped(previous => [...previous, sessionId])} /></div></details>
  </section>;
}

function CaptureStream({ kind, api, attemptId, active, deadlineAt, locale, onChanged, revoked, preconsentedStream, required = false, onIntegrityEvent, clockNow }: { kind: ProctorKind; api: string; attemptId: string; active: boolean; deadlineAt: string; locale: AssessmentLocale; onChanged: () => Promise<void>; revoked: string[]; preconsentedStream?: MediaStream | null; required?: boolean; onIntegrityEvent?: CaptureIntegrityReporter; clockNow: () => number }) {
  const t = examProctorCopy(locale), cameraCopy = examCameraCopy(locale), [consent, setConsent] = useState(Boolean(preconsentedStream)), [busy, setBusy] = useState(false), [recording, setRecording] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(0);
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), recorder = useRef<MediaRecorder | null>(null), session = useRef<string | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), live = useRef(false), mounted = useRef(true), starting = useRef(false), sequence = useRef(0), uploads = useRef<AbortController | null>(null);
  const label = kind === "CAMERA" ? t.camera : t.screen;
  const consumed = useRef<MediaStream | null>(null);
  const report = useRef(onIntegrityEvent);
  useEffect(() => { report.current = onIntegrityEvent; }, [onIntegrityEvent]);
  const stop = useCallback(() => {
    const wasLive = live.current; live.current = false; if (wasLive && kind === "CAMERA") report.current?.("CAMERA_ENDED", "TRACK_ENDED"); if (timer.current) clearTimeout(timer.current); timer.current = null;
    const current = recorder.current; recorder.current = null; if (current?.state !== "inactive") { try { current?.stop(); } catch { /* already stopped */ } }
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null;
    uploads.current?.abort(); uploads.current = null;
    const previous = session.current; session.current = null;
    if (previous) void fetch(api, { method: "PATCH", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end", sessionId: previous }) }).then(() => { if (mounted.current) void onChanged(); }).catch(() => { if (mounted.current) setError(t.failure); });
    if (mounted.current) { setRecording(false); setConsent(false); }
  }, [api, onChanged, t.failure, kind]);
  useEffect(() => { mounted.current = true; window.addEventListener("pagehide", stop); return () => { mounted.current = false; window.removeEventListener("pagehide", stop); stop(); }; }, [stop]);
  useEffect(() => { if (!active) stop(); const remaining = new Date(deadlineAt).getTime() - clockNow(); const deadline = setTimeout(stop, Math.max(0, Math.min(remaining, 2147483647))); return () => clearTimeout(deadline); }, [active, deadlineAt, stop, clockNow]);
  useEffect(() => { if (session.current && revoked.includes(session.current)) stop(); }, [revoked, stop]);
  const start = async (prepared?: MediaStream) => {
    if ((!consent && !prepared) || starting.current || live.current || !active) return;
    setError("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices || (kind === "SCREEN" ? !navigator.mediaDevices.getDisplayMedia : !navigator.mediaDevices.getUserMedia)) { setError(t.captureUnsupported); if (kind === "CAMERA") report.current?.("CAMERA_UNAVAILABLE", "DEVICE_UNAVAILABLE"); return; }
    const mimeType = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find(type => MediaRecorder.isTypeSupported(type)); if (!mimeType) { setError(t.captureUnsupported); if (kind === "CAMERA") report.current?.("CAMERA_UNAVAILABLE", "DEVICE_UNAVAILABLE"); return; }
    starting.current = true; setBusy(true);
    try {
      // Display permission must be requested directly from this click, before any network await.
      const capture = prepared ?? (kind === "SCREEN" ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false }) : await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 10, max: 15 } }, audio: false }));
      if (!mounted.current || !active || clockNow() >= new Date(deadlineAt).getTime()) { capture.getTracks().forEach(track => track.stop()); return; }
      capture.getAudioTracks().forEach(track => { track.stop(); capture.removeTrack(track); }); stream.current = capture;
      const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId, kind, clientKey: crypto.randomUUID(), consentVersion: PROCTOR_CONSENT_VERSION, consent: true }), signal: AbortSignal.timeout(15000) }), payload = await response.json();
      if (!response.ok) throw new Error(t.failure);
      session.current = payload.id;
      if (!mounted.current || !active || capture.getVideoTracks().every(track => track.readyState === "ended")) { stop(); return; }
      live.current = true; if (kind === "CAMERA") report.current?.("CAMERA_STARTED"); sequence.current = 0; setSaved(0); setRecording(true);
      if (video.current) { video.current.srcObject = capture; void video.current.play().catch(() => {}); }
      capture.getTracks().forEach(track => track.addEventListener("ended", stop, { once: true }));
      const segment = () => {
        if (!live.current || !stream.current || !session.current) return;
        try {
          const parts: BlobPart[] = [], part = new MediaRecorder(stream.current, { mimeType, videoBitsPerSecond: 180000 }); recorder.current = part;
          part.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
          part.onerror = () => { setError(t.failure); stop(); };
          part.onstop = async () => {
            if (!live.current || !session.current) return;
            try {
              const blob = new Blob(parts, { type: mimeType }); if (!blob.size || blob.size > PROCTOR_CLIP_BYTES) throw new Error(t.failure);
              const controller = new AbortController(); uploads.current = controller;
              const uploaded = await fetch(`${api}/sessions/${encodeURIComponent(session.current)}/clips?sequence=${sequence.current}`, { method: "POST", headers: { "Content-Type": mimeType }, body: blob, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
              if (!uploaded.ok) { report.current?.("CAPTURE_UPLOAD_FAILED", "UPLOAD_REJECTED"); throw new Error("upload-rejected"); }
              sequence.current++; if (mounted.current) setSaved(sequence.current); uploads.current = null; segment();
            } catch (cause) { if (live.current && mounted.current) { setError(t.failure); if (!(cause instanceof Error && cause.message === "upload-rejected")) report.current?.("CAPTURE_UPLOAD_FAILED", "NETWORK"); } stop(); }
          };
          part.start(); timer.current = setTimeout(() => { if (part.state === "recording") part.stop(); }, PROCTOR_CLIP_SECONDS * 1000);
        } catch { setError(t.failure); stop(); }
      };
      segment(); void onChanged();
    } catch (cause) { if (kind === "CAMERA") report.current?.("CAMERA_UNAVAILABLE", cause instanceof DOMException && cause.name === "NotAllowedError" ? "PERMISSION_DENIED" : "DEVICE_UNAVAILABLE"); stop(); if (mounted.current) setError(t.failure); }
    finally { starting.current = false; if (mounted.current) setBusy(false); }
  };
  useEffect(() => {
    if (!preconsentedStream || consumed.current === preconsentedStream || !preconsentedStream.getVideoTracks().some(track => track.readyState === "live")) return;
    // Defer one task so a development Strict Mode setup/cleanup cannot consume and stop the stream.
    const begin = window.setTimeout(() => { consumed.current = preconsentedStream; void start(preconsentedStream); }, 0);
    return () => window.clearTimeout(begin);
  }, [preconsentedStream]);
  return <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
    <div className="flex flex-wrap items-center gap-3"><video ref={video} muted playsInline aria-label={label} className={recording ? "aspect-video w-24 shrink-0 rounded-lg bg-black object-contain" : "hidden"} /><div className="min-w-0 flex-1 space-y-1"><h3 className="flex items-center gap-2 text-sm font-semibold">{kind === "CAMERA" ? <Camera aria-hidden="true" size={16} /> : <Monitor aria-hidden="true" size={16} />}{label}</h3><p role="status" className="flex flex-wrap items-center gap-1.5 text-xs">{recording && <span aria-hidden="true" className="size-2 rounded-full bg-status-success-text" />}{recording ? t.recording : t.idle}{recording && ` · ${t.saved}: ${saved}`}</p></div>{recording && <Button type="button" variant="outline" size="sm" onClick={stop}><Square size={12} aria-hidden="true" />{t.stop} · {label}</Button>}</div>
    {required && !recording && <p role="status" className="text-sm text-status-warning-text">{cameraCopy.recovery}</p>}
    {error && <p role="alert" className="text-sm text-status-error-text">{error}</p>}
    {!recording && <><label className="flex items-start gap-3 text-sm"><Checkbox checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>{t.consent}</span></label><Button type="button" variant="outline" disabled={!consent || busy || !active} onClick={() => void start()}>{busy ? t.waiting : `${t.start} · ${label}`}</Button></>}
  </div>;
}
