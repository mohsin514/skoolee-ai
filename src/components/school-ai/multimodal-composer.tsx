"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, Loader2, Mic, Paperclip, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Language } from "@/lib/locale/package";
import { schoolAICopy } from "@/lib/school-ai/copy";
import styles from "./school-ai.module.css";

export interface MultimodalComposerProps {
  language: Language;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void | Promise<void>;
  onUpload?: (file: File, origin: "upload" | "camera") => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  voiceAvailable?: boolean;
  submitLabel?: string;
  placeholder?: string;
  label?: string;
  onActivityChange?: (active: boolean) => void;
}

/** Voice becomes editable text. Uploads are separate reviewable source records, never implicit commands. */
const SUPPORTED_UPLOAD = /\.(pdf|jpe?g|png|webp|txt|csv)$/i;
export function MultimodalComposer({ language, value, onChange, onSubmit, onUpload, disabled, busy, voiceAvailable, submitLabel, placeholder, label, onActivityChange }: MultimodalComposerProps) {
  const c = schoolAICopy(language);
  const id = useId();
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ value, onChange });
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => { latest.current = { value, onChange }; }, [value, onChange]);
  useEffect(() => { onActivityChange?.(recording || starting || transcribing); }, [recording, starting, transcribing, onActivityChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    setRecording(false);
  };
  const start = async () => {
    setFeedback(""); setFailed(false);
    if (!voiceAvailable) { setFeedback(c.serviceUnavailable); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setFailed(true); setFeedback(c.microphoneError); return; }
    setStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = capture;
      const chunks: Blob[] = [];
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onerror = () => { media.getTracks().forEach(track => track.stop()); if (mounted.current) { setRecording(false); setFailed(true); setFeedback(c.microphoneError); } };
      capture.onstop = async () => {
        media.getTracks().forEach(track => track.stop());
        if (timer.current) clearTimeout(timer.current);
        if (!mounted.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: capture.mimeType || "audio/webm" });
        if (!blob.size) { setFailed(true); setFeedback(c.microphoneError); return; }
        setTranscribing(true);
        request.current = new AbortController();
        try {
          const form = new FormData();
          form.append("file", blob, capture.mimeType.includes("mp4") ? "voice.m4a" : "voice.webm");
          form.append("language", language);
          form.append("idempotencyKey", crypto.randomUUID());
          const response = await fetch("/api/school-ai/transcribe", { method: "POST", body: form, signal: request.current.signal });
          const result = await response.json();
          if (!response.ok || typeof result.text !== "string") throw new Error(response.status === 503 ? "unavailable" : "failed");
          if (!mounted.current) return;
          const combined = `${latest.current.value}${latest.current.value.trim() ? "\n" : ""}${result.text}`;
          latest.current.onChange(combined.slice(0, 4000));
          setFeedback(combined.length > 4000 ? c.transcriptTruncated : c.transcriptReady);
        } catch (error) {
          if (!mounted.current) return;
          setFailed(true); setFeedback(error instanceof Error && error.message === "unavailable" ? c.serviceUnavailable : c.failed);
        } finally { if (mounted.current) setTranscribing(false); }
      };
      capture.start(1000);
      setRecording(true);
      timer.current = setTimeout(() => {
        if (capture.state !== "inactive") capture.stop();
        media.getTracks().forEach(track => track.stop());
      }, 120_000);
    } catch { if (mounted.current) { setFailed(true); setFeedback(c.microphoneError); } }
    finally { if (mounted.current) setStarting(false); }
  };
  const attachFile = (file: File | undefined, origin: "upload" | "camera") => {
    if (!file || !onUpload) return;
    setFeedback(""); setFailed(false);
    if (!file.size || file.size > 10 * 1024 * 1024) { setFailed(true); setFeedback(c.uploadInvalid); return; }
    // SKO-460: say why a file was refused, in the reader's language, before and after the server checks it.
    if (!SUPPORTED_UPLOAD.test(file.name) && !/^(application\/pdf|image\/(jpeg|png|webp)|text\/(plain|csv))$/.test(file.type)) { setFailed(true); setFeedback(c.uploadType); return; }
    void Promise.resolve(onUpload(file, origin)).catch((error: unknown) => {
      if (!mounted.current) return;
      const reason = error instanceof Error ? error.message : "";
      setFailed(true);
      setFeedback(/Use a PDF/.test(reason) ? c.uploadType : /between 1 byte and 10 MB/.test(reason) ? c.uploadInvalid : /does not match its format/.test(reason) ? c.uploadMismatch : c.failed);
    });
  };
  const occupied = Boolean(disabled || busy || starting || transcribing);
  return <div className={styles.composer}>
    <label className="sr-only" htmlFor={id}>{label || c.textLabel}</label>
    <Textarea id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={4000} placeholder={placeholder || c.messagePlaceholder} disabled={occupied || recording} rows={3}
      onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && value.trim() && !occupied && !recording && onSubmit) { event.preventDefault(); void onSubmit(); } }} />
    <div className={styles.composerToolbar}>
      <div className="flex flex-wrap gap-1">
        {onUpload && <><Button type="button" variant="ghost" size="icon" title={c.attach} aria-label={c.attach} disabled={occupied || recording} onClick={() => uploadRef.current?.click()}><Paperclip aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon" title={c.scanHint} aria-label={c.scan} disabled={occupied || recording} onClick={() => cameraRef.current?.click()}><Camera aria-hidden="true" /></Button>
          <Input ref={uploadRef} type="file" className="hidden" tabIndex={-1} aria-label={c.attach} accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv,.csv" onChange={event => { attachFile(event.target.files?.[0], "upload"); event.target.value = ""; }} />
          <Input ref={cameraRef} type="file" className="hidden" tabIndex={-1} aria-label={c.scan} accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => { attachFile(event.target.files?.[0], "camera"); event.target.value = ""; }} /></>}
        <Button type="button" variant={recording ? "destructive" : "ghost"} size="icon" aria-label={recording ? c.stopRecording : c.record} title={voiceAvailable ? c.record : c.serviceUnavailable} disabled={occupied && !recording} aria-pressed={recording} onClick={recording ? stop : () => void start()}>{starting || transcribing ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : recording ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}</Button>
      </div>
      {onSubmit && <Button type="button" disabled={occupied || recording || !value.trim()} onClick={() => void onSubmit()}>{busy ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}{busy ? c.working : submitLabel || c.send}</Button>}
    </div>
    {(recording || transcribing || feedback) && <p className={`mt-2 text-sm ${failed ? "text-destructive" : "text-ink-muted"}`} role={failed ? "alert" : "status"}>{recording ? c.recording : transcribing ? c.transcribing : feedback}</p>}
  </div>;
}
