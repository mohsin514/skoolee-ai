"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Monitor, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import { PROCTOR_CLIP_BYTES, PROCTOR_CLIP_SECONDS, PROCTOR_CONSENT_VERSION, type ProctorKind, type ProctorView } from "@/lib/school-ai/exam-proctor";
import { examProctorCopy } from "./exam-proctor-copy";
import { ProctorSessionList } from "./exam-proctor-sessions";

export function ExamProctorCapture({ id, attemptId, active, deadlineAt, locale }: { id: string; attemptId: string; active: boolean; deadlineAt: string; locale: AssessmentLocale }) {
  const t = examProctorCopy(locale), [data, setData] = useState<ProctorView | null>(null), [error, setError] = useState(""), [stopped, setStopped] = useState<string[]>([]);
  const api = `/api/school-ai/exams/${encodeURIComponent(id)}/proctor`;
  const load = useCallback(async () => { try { const response = await fetch(api, { cache: "no-store" }), payload = await response.json(); if (!response.ok) throw new Error(t.unavailable); setData(payload); } catch { setError(t.unavailable); } }, [api, t.unavailable]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!active || !data?.sessions.some(session => session.status === "ACTIVE")) return; const poll = setInterval(() => void load(), 5000); return () => clearInterval(poll); }, [active, data?.sessions, load]);
  const revoked = [...stopped, ...(data?.sessions.filter(session => session.status !== "ACTIVE").map(session => session.id) ?? [])];
  if (error) return <p role="status" className="sk-panel p-4 text-sm text-ink-subtle">{error}</p>;
  if (!data) return <Skeleton className="h-20 w-full" />;
  if (!data.policy.enabled && !data.sessions.length) return null;
  return <section className="sk-panel space-y-4 p-4 sm:p-5" aria-label={t.title} dir={locale === "en" ? "ltr" : "rtl"}><h2 className="text-lg font-bold">{t.title}</h2><p className="text-sm text-ink-subtle">{t.description}</p><p className="text-sm text-ink-subtle">{t.limits}</p><p className="text-sm font-semibold">{t.retention}: {data.policy.retentionDays} {t.days}</p>{active && data.storageAvailable && <div className="grid gap-4 sm:grid-cols-2">{data.policy.camera && <CaptureStream kind="CAMERA" api={api} attemptId={attemptId} active={active} deadlineAt={deadlineAt} locale={locale} onChanged={load} revoked={revoked} />}{data.policy.screen && <CaptureStream kind="SCREEN" api={api} attemptId={attemptId} active={active} deadlineAt={deadlineAt} locale={locale} onChanged={load} revoked={revoked} />}</div>}{!data.storageAvailable && <p role="status">{t.unavailable}</p>}<ProctorSessionList api={api} sessions={data.sessions} locale={locale} staff={false} onChanged={load} onBeforeChange={sessionId => setStopped(previous => [...previous, sessionId])} /></section>;
}

function CaptureStream({ kind, api, attemptId, active, deadlineAt, locale, onChanged, revoked }: { kind: ProctorKind; api: string; attemptId: string; active: boolean; deadlineAt: string; locale: AssessmentLocale; onChanged: () => Promise<void>; revoked: string[] }) {
  const t = examProctorCopy(locale), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [recording, setRecording] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(0);
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), recorder = useRef<MediaRecorder | null>(null), session = useRef<string | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), live = useRef(false), mounted = useRef(true), starting = useRef(false), sequence = useRef(0), uploads = useRef<AbortController | null>(null);
  const label = kind === "CAMERA" ? t.camera : t.screen;
  const stop = useCallback(() => {
    live.current = false; if (timer.current) clearTimeout(timer.current); timer.current = null;
    const current = recorder.current; recorder.current = null; if (current?.state !== "inactive") { try { current?.stop(); } catch { /* already stopped */ } }
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null;
    uploads.current?.abort(); uploads.current = null;
    const previous = session.current; session.current = null;
    if (previous) void fetch(api, { method: "PATCH", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end", sessionId: previous }) }).then(() => { if (mounted.current) void onChanged(); }).catch(() => { if (mounted.current) setError(t.failure); });
    if (mounted.current) { setRecording(false); setConsent(false); }
  }, [api, onChanged, t.failure]);
  useEffect(() => { mounted.current = true; window.addEventListener("pagehide", stop); return () => { mounted.current = false; window.removeEventListener("pagehide", stop); stop(); }; }, [stop]);
  useEffect(() => { if (!active) stop(); const remaining = new Date(deadlineAt).getTime() - Date.now(); const deadline = setTimeout(stop, Math.max(0, Math.min(remaining, 2147483647))); return () => clearTimeout(deadline); }, [active, deadlineAt, stop]);
  useEffect(() => { if (session.current && revoked.includes(session.current)) stop(); }, [revoked, stop]);
  const start = async () => {
    if (!consent || starting.current || live.current || !active) return;
    setError("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices || (kind === "SCREEN" ? !navigator.mediaDevices.getDisplayMedia : !navigator.mediaDevices.getUserMedia)) { setError(t.captureUnsupported); return; }
    const mimeType = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find(type => MediaRecorder.isTypeSupported(type)); if (!mimeType) { setError(t.captureUnsupported); return; }
    starting.current = true; setBusy(true);
    try {
      // Display permission must be requested directly from this click, before any network await.
      const capture = kind === "SCREEN" ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false }) : await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 10, max: 15 } }, audio: false });
      if (!mounted.current || !active || Date.now() >= new Date(deadlineAt).getTime()) { capture.getTracks().forEach(track => track.stop()); return; }
      capture.getAudioTracks().forEach(track => { track.stop(); capture.removeTrack(track); }); stream.current = capture;
      const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId, kind, clientKey: crypto.randomUUID(), consentVersion: PROCTOR_CONSENT_VERSION, consent: true }), signal: AbortSignal.timeout(15000) }), payload = await response.json();
      if (!response.ok) throw new Error(t.failure);
      session.current = payload.id;
      if (!mounted.current || !active || capture.getVideoTracks().every(track => track.readyState === "ended")) { stop(); return; }
      live.current = true; sequence.current = 0; setSaved(0); setRecording(true);
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
              if (!uploaded.ok) throw new Error(t.failure);
              sequence.current++; if (mounted.current) setSaved(sequence.current); uploads.current = null; segment();
            } catch { if (live.current && mounted.current) setError(t.failure); stop(); }
          };
          part.start(); timer.current = setTimeout(() => { if (part.state === "recording") part.stop(); }, PROCTOR_CLIP_SECONDS * 1000);
        } catch { setError(t.failure); stop(); }
      };
      segment(); void onChanged();
    } catch { stop(); if (mounted.current) setError(t.failure); }
    finally { starting.current = false; if (mounted.current) setBusy(false); }
  };
  return <div className="space-y-3 rounded-xl border border-border bg-surface p-4"><h3 className="flex items-center gap-2 font-semibold">{kind === "CAMERA" ? <Camera aria-hidden="true" size={18} /> : <Monitor aria-hidden="true" size={18} />}{label}</h3><video ref={video} muted playsInline aria-label={label} className={recording ? "aspect-video w-full rounded-lg bg-black object-contain" : "hidden"} /><p role="status" className="text-sm">{recording ? t.recording : t.idle}{recording && ` · ${t.saved}: ${saved}`}</p>{error && <p role="alert" className="text-sm text-status-error-text">{error}</p>}{!recording && <label className="flex items-start gap-3 text-sm"><Checkbox checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>{t.consent}</span></label>}{recording ? <Button type="button" variant="destructive" onClick={stop}><Square size={14} aria-hidden="true" />{t.stop} · {label}</Button> : <Button type="button" variant="outline" disabled={!consent || busy || !active} onClick={start}>{busy ? t.waiting : `${t.start} · ${label}`}</Button>}</div>;
}
