"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, FileUp, Loader2, RotateCcw, ScanLine, Sparkles, XCircle } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Button } from "@/components/ui/button";
import { TaskFeedback, TaskLoading } from "@/components/ui/task-patterns";
import { scanQuality } from "@/lib/school-ai/scan";
import { scanToJpeg } from "@/lib/drop/client";

// SKAI-1848: the phone side of Skoolee Drop. Opened from the QR on a computer; no sign-in. It can only add files to
// that one handoff, so it never shows anything stored in the school.
type Info = { label: string; accept: string[]; maxFiles: number; received: number; expiresAt: string };
type Sent = { key: string; name: string; preview?: string; status: "sending" | "sent" | "failed"; file: Blob };
type Shot = { blob: Blob; preview: string; warning: boolean };

export function DropPhone() {
  const ui = useUiText();
  const ticket = useRef(""), video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), picker = useRef<HTMLInputElement>(null), counter = useRef(0);
  const [info, setInfo] = useState<Info | null>(null), [failed, setFailed] = useState(false), [done, setDone] = useState(false);
  const [scanning, setScanning] = useState(false), [enhance, setEnhance] = useState(true), [shot, setShot] = useState<Shot | null>(null);
  const [sent, setSent] = useState<Sent[]>([]), [error, setError] = useState("");

  useEffect(() => {
    ticket.current = window.location.hash.slice(1);
    // The link is a capability: keep it in memory only, not in the address bar, history or a screenshot.
    window.history.replaceState(null, "", window.location.pathname);
    void fetch("/api/drop/phone", { method: "POST", headers: { "x-drop-ticket": ticket.current }, cache: "no-store" })
      .then(async response => { const json = await response.json(); if (!response.ok) throw new Error(); setInfo(json.data); })
      .catch(() => setFailed(true));
    return () => stopCamera();
  }, []);  

  const stopCamera = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; setScanning(false); };
  const startCamera = async () => {
    setError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } } });
      stream.current = media; setScanning(true);
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = media; void video.current.play(); } });
    } catch { setError(ui("The camera is unavailable. Allow camera access, or choose photos instead.")); }
  };

  const capture = async () => {
    const v = video.current;
    if (!v || v.readyState < 2) return;
    const canvas = document.createElement("canvas"), scale = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight));
    canvas.width = Math.max(3, Math.round(v.videoWidth * scale)); canvas.height = Math.max(3, Math.round(v.videoHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const quality = scanQuality(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    const blob = await scanToJpeg(v, v.videoWidth, v.videoHeight, enhance);
    setShot({ blob, preview: URL.createObjectURL(blob), warning: quality.blurRisk || quality.lowContrast });
  };

  const send = async (file: Blob, name: string, preview?: string) => {
    const key = String(++counter.current);
    setSent(current => [...current, { key, name, preview, status: "sending", file }]);
    const ok = await upload(file, name);
    setSent(current => current.map(row => row.key === key ? { ...row, status: ok ? "sent" : "failed" } : row));
  };
  const upload = async (file: Blob, name: string) => {
    try {
      const response = await fetch("/api/drop/phone", { method: "PUT", headers: { "x-drop-ticket": ticket.current, "Content-Type": file.type, "x-file-name": encodeURIComponent(name) }, body: file });
      if (!response.ok) { const json = await response.json().catch(() => ({})); setError(typeof json.error === "string" ? ui(json.error) : ui("The file was not sent. Try again.")); }
      return response.ok;
    } catch { setError(ui("The file was not sent. Check your connection and try again.")); return false; }
  };
  const retry = async (row: Sent) => {
    setSent(current => current.map(item => item.key === row.key ? { ...item, status: "sending" } : item));
    const ok = await upload(row.file, row.name);
    setSent(current => current.map(item => item.key === row.key ? { ...item, status: ok ? "sent" : "failed" } : item));
  };
  const keep = async () => { if (!shot) return; const page = sent.length + 1; setShot(null); await send(shot.blob, ui("Page {0}", [page]) + ".jpg", shot.preview); };
  const pick = (files: FileList | null) => { for (const file of Array.from(files ?? [])) void send(file, file.name, file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined); };

  if (failed) return <Shell><TaskFeedback kind="error" title={ui("This phone link has expired")}>{ui("Show a new code on your computer and scan it again.")}</TaskFeedback></Shell>;
  if (!info) return <Shell><TaskLoading label={ui("Connecting to your computer…")} /></Shell>;
  if (done) return <Shell><TaskFeedback kind="success" title={ui("Sent to your computer")}>{ui("{0} files are waiting on your computer. You can close this page.", [sent.filter(row => row.status === "sent").length])}</TaskFeedback></Shell>;

  const canScan = info.accept.includes("image/jpeg"), room = info.maxFiles - info.received - sent.filter(row => row.status !== "failed").length;
  return (
    <Shell>
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{ui("Send to your computer")}</p>
        <h1 className="text-xl font-bold text-ink">{info.label}</h1>
        <p className="text-sm text-ink-muted">{ui("{0} more files can be sent.", [Math.max(0, room)])}</p>
      </header>

      {shot ? (
        <section className="space-y-3">
          <img src={shot.preview} alt={ui("Captured page")} className="w-full rounded-2xl border border-border" />
          {shot.warning && <p role="alert" className="flex items-start gap-2 rounded-xl bg-status-warning-surface p-3 text-sm text-status-warning-text"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{ui("This page may be blurry or too dark. Hold the phone steady over the page in good light.")}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => { URL.revokeObjectURL(shot.preview); setShot(null); }}><RotateCcw aria-hidden="true" />{ui("Retake")}</Button>
            <Button type="button" disabled={room < 1} onClick={() => void keep()}><CheckCircle2 aria-hidden="true" />{ui("Send page")}</Button>
          </div>
        </section>
      ) : scanning ? (
        <section className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={video} muted playsInline aria-label={ui("Camera preview")} className="aspect-[3/4] w-full object-cover" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/70" />
          </div>
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <Button type="button" variant={enhance ? "secondary" : "outline"} aria-pressed={enhance} onClick={() => setEnhance(value => !value)}><Sparkles aria-hidden="true" />{ui("Document")}</Button>
            <Button type="button" size="lg" disabled={room < 1} onClick={() => void capture()}><Camera aria-hidden="true" />{ui("Capture")}</Button>
            <Button type="button" variant="ghost" onClick={stopCamera}>{ui("Stop")}</Button>
          </div>
        </section>
      ) : (
        <section className="grid gap-2">
          {canScan && <Button type="button" size="lg" disabled={room < 1} onClick={() => void startCamera()}><ScanLine aria-hidden="true" />{ui("Scan pages")}</Button>}
          <Button type="button" size="lg" variant="outline" disabled={room < 1} onClick={() => picker.current?.click()}><FileUp aria-hidden="true" />{ui("Choose photos or files")}</Button>
          <input ref={picker} type="file" className="hidden" tabIndex={-1} multiple accept={info.accept.join(",")} onChange={event => { pick(event.target.files); event.target.value = ""; }} />
        </section>
      )}

      {error && <p role="alert" className="text-sm text-status-error-text">{error}</p>}

      {sent.length > 0 && (
        <section className="space-y-2" aria-live="polite">
          <h2 className="text-sm font-semibold text-ink">{ui("Sent")}</h2>
          <ul className="grid grid-cols-3 gap-2">
            {sent.map(row => (
              <li key={row.key} className="relative overflow-hidden rounded-xl border border-border bg-surface-subtle">
                {row.preview ? <img src={row.preview} alt={row.name} className="aspect-[3/4] w-full object-cover" /> : <div className="grid aspect-[3/4] place-items-center p-2 text-xs text-ink-muted">{row.name}</div>}
                <span className="absolute end-1 top-1 grid size-7 place-items-center rounded-full bg-white">
                  {row.status === "sending" ? <Loader2 aria-label={ui("Sending")} className="size-4 animate-spin text-primary" /> : row.status === "sent" ? <CheckCircle2 aria-label={ui("Sent")} className="size-4 text-status-success-text" /> : <XCircle aria-label={ui("Not sent")} className="size-4 text-status-error-text" />}
                </span>
                {row.status === "failed" && <Button type="button" size="sm" variant="outline" className="absolute inset-x-1 bottom-1" onClick={() => void retry(row)}>{ui("Retry")}</Button>}
              </li>
            ))}
          </ul>
          <Button type="button" className="w-full" disabled={sent.some(row => row.status === "sending")} onClick={() => { stopCamera(); setDone(true); }}>{ui("Done")}</Button>
        </section>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-dvh w-full max-w-md space-y-5 bg-white px-4 py-6">{children}</main>;
}
