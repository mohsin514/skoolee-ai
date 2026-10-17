"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import { PROCTOR_CONSENT_VERSION } from "@/lib/school-ai/exam-proctor";
import { examCameraCopy } from "./exam-camera-copy";
import { examReadinessCopy } from "./exam-readiness-copy";
import type { ExamIntegrityDisclosure } from "@/lib/school-ai/exam-integrity";
import { ExamIntegrityNotice } from "./exam-integrity-policy";

export type ExamInfo = { secureBrowser?: import("./secure-browser").SecureBrowserState; integrityPolicy?: ExamIntegrityDisclosure; version: number; title: string; startsAt: string; endsAt: string; baseDurationMinutes: number; extraMinutes: number; breakMinutes?: number; assistance?: { reader: boolean; scribe: boolean; largeText: boolean; cameraExempt?: boolean }; cameraRequired?: boolean; cameraRetentionDays?: number; durationMinutes: number; totalMarks: number; serverNow: string };
export type CameraStartEvidence = { cameraReady: true; consentVersion: string };
export function ExamPreflight({ id, exam, locale, busy, serverNow, onChecked, onStart, cameraStream = null, onCameraStream }: { cameraStream?: MediaStream | null; onCameraStream?: (stream: MediaStream | null) => void; id: string; exam: ExamInfo; locale: AssessmentLocale; busy: boolean; serverNow: number; onChecked: (exam: ExamInfo) => void; onStart: (version: number, camera?: CameraStartEvidence) => void }) {
  const t = examReadinessCopy(locale), camera = examCameraCopy(locale);
  const [cameraConsent, setCameraConsent] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const preview = useRef<HTMLVideoElement>(null);
  const cameraMounted = useRef(true);
  useEffect(() => { cameraMounted.current = true; return () => { cameraMounted.current = false; }; }, []);
  useEffect(() => {
    if (preview.current) { preview.current.srcObject = cameraStream; if (cameraStream) void preview.current.play().catch(() => {}); }
    const ended = () => { setCameraError(camera.failure); onCameraStream?.(null); };
    cameraStream?.getVideoTracks().forEach(track => track.addEventListener("ended", ended));
    return () => { cameraStream?.getVideoTracks().forEach(track => track.removeEventListener("ended", ended)); };
  }, [cameraStream, camera.failure, onCameraStream]);
  const cameraLive = !!cameraStream?.getVideoTracks().some(track => track.readyState === "live");
  const openCamera = async () => {
    if (!cameraConsent || cameraBusy) return;
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || !["video/webm;codecs=vp8", "video/webm", "video/mp4"].some(type => MediaRecorder.isTypeSupported(type))) { setCameraError(camera.unsupported); return; }
    setCameraBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 10, max: 15 } }, audio: false });
      if (!cameraMounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      onCameraStream?.(stream);
    } catch { if (cameraMounted.current) setCameraError(camera.failure); }
    finally { if (cameraMounted.current) setCameraBusy(false); }
  };
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<{ version: number; at: number; serverAt: number } | null>(null);
  const [storage, setStorage] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [practice, setPractice] = useState("");
  const available = serverNow >= new Date(exam.startsAt).getTime() && serverNow < new Date(exam.endsAt).getTime();
  const ready = !!checked && checked.version === exam.version && serverNow - checked.serverAt < 120000;
  const minutes = Math.max(0, Math.min(exam.durationMinutes, Math.floor((new Date(exam.endsAt).getTime() - serverNow) / 60000)));
  const check = async () => {
    setChecking(true); setChecked(null); setAcknowledged(false); setError("");
    // Never use a real answer for the storage probe or retain it after the check.
    const key = `school-ai-readiness-${crypto.randomUUID()}`;
    try { window.sessionStorage.setItem(key, "ready"); setStorage(window.sessionStorage.getItem(key) === "ready"); }
    catch { setStorage(false); }
    finally { try { window.sessionStorage.removeItem(key); } catch { /* Storage can be denied by browser policy. */ } }
    try {
      const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(t.connectionFailed);
      const payload = await response.json(); const current = payload.exam as ExamInfo;
      onChecked(current); setChecked({ version: current.version, at: performance.now(), serverAt: new Date(current.serverNow).getTime() });
    } catch { setError(t.connectionFailed); }
    finally { setChecking(false); }
  };
  return <section aria-labelledby="exam-readiness-title" className="sk-panel space-y-5 p-6">
    <h2 id="exam-readiness-title" className="text-xl font-bold">{t.heading}</h2>
    <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-ink-subtle">{t.base}</dt><dd className="font-semibold">{exam.baseDurationMinutes} {t.minutes}</dd></div><div><dt className="text-ink-subtle">{t.extra}</dt><dd className="font-semibold">{exam.extraMinutes} {t.minutes}</dd></div><div><dt className="text-ink-subtle">{t.summary}</dt><dd className="font-semibold">{exam.durationMinutes} {t.minutes}</dd></div></dl>
    <p className="text-sm">{t.close}: {new Date(exam.endsAt).toLocaleString(locale)}</p><p className="text-sm text-ink-subtle">{t.cap}</p>
    <p className="text-sm">{available ? `${t.availableTime}: ${minutes} ${t.minutes}` : t.unavailable}</p>
    <Button variant="outline" disabled={busy || checking} onClick={check}>{checking ? t.checking : t.check}</Button>
    <div aria-live="polite" className="space-y-2 text-sm"><p>{ready ? t.ready : t.pending}</p>{storage !== null && <p>{storage ? t.storageOk : t.storageWarning}</p>}{error && <p role="alert" className="text-status-error-text">{error}</p>}</div>
    <p className="text-xs text-ink-subtle">{t.storageNote}</p>
    <ExamIntegrityNotice policy={exam.integrityPolicy} locale={locale} />
    {exam.assistance?.cameraExempt && <p role="status" className="text-sm">{camera.exempt}</p>}
    {exam.cameraRequired && <section className="space-y-4 rounded-xl border border-border p-4" aria-label={camera.title}>
      <h3 className="font-bold">{camera.required}</h3><p className="text-sm text-ink-subtle">{camera.explanation}</p>
      <p className="text-sm font-semibold">{camera.retention}: {exam.cameraRetentionDays ?? 1} {camera.days}</p>
      <label className="flex items-start gap-3 text-sm"><Checkbox checked={cameraConsent} disabled={busy || cameraBusy} onChange={event => { setCameraConsent(event.target.checked); if (!event.target.checked) onCameraStream?.(null); }} /><span>{camera.consent}</span></label>
      <video ref={preview} muted playsInline aria-label={camera.title} className={cameraLive ? "aspect-video w-full max-w-sm rounded-xl bg-black object-contain" : "hidden"} />
      <p role="status" className="text-sm">{cameraLive ? camera.ready : camera.waiting}</p>
      {cameraError && <p role="alert" className="text-sm text-status-error-text">{cameraError}</p>}
      <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={!cameraConsent || cameraBusy || busy || cameraLive} onClick={openCamera}>{cameraBusy ? camera.checking : camera.preview}</Button>{cameraLive && <Button type="button" variant="ghost" disabled={busy} onClick={() => onCameraStream?.(null)}>{camera.stop}</Button>}</div>
      <p className="text-xs text-ink-subtle">{camera.privacy}</p>
    </section>}
    <FormField name="exam-practice" label={t.practice} hint={t.practiceHint}><Textarea value={practice} maxLength={1000} rows={3} onChange={(event) => setPractice(event.target.value)} /></FormField>
    <label className="flex items-start gap-3 text-sm"><Checkbox checked={acknowledged} disabled={!ready || busy} onChange={(event) => setAcknowledged(event.target.checked)} /><span>{t.acknowledge}</span></label>
    <p className="text-xs text-ink-subtle">{t.fresh}</p>
    <Button disabled={busy || checking || cameraBusy || !available || !ready || !acknowledged || !!exam.cameraRequired && (!cameraConsent || !cameraLive)} onClick={() => { if (checked && performance.now() - checked.at < 120000 && checked.version === exam.version) onStart(checked.version, exam.cameraRequired && cameraConsent && cameraLive ? { cameraReady: true, consentVersion: PROCTOR_CONSENT_VERSION } : undefined); else { setChecked(null); setAcknowledged(false); } }}>{t.start}</Button>
  </section>;
}
