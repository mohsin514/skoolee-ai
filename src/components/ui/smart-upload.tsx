"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { Camera, CheckCircle2, FileUp, Smartphone, Trash2, UploadCloud } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { dropTypesFor, fileMatchesAccept } from "@/lib/drop/client";

/**
 * SKAI-1848: the one file well for the product. Drag and drop, paste, browse, take a photo (phones), or
 * "Use my phone": a QR hands this exact upload to the phone and the pages appear here as they arrive.
 * Every route ends in `onFiles(File[])`, so the page's own upload flow and permission checks stay unchanged.
 */
export interface SmartUploadProps {
  /** Same syntax as the file input `accept` attribute, e.g. "image/*,application/pdf". */
  accept: string;
  onFiles(files: File[]): void;
  /** What the phone shows, e.g. "Marks sheet — Grade 5 Maths". */
  label: string;
  multiple?: boolean;
  maxFiles?: number;
  maxBytes?: number;
  hint?: string;
  disabled?: boolean;
  /** Hide "Use my phone" (for example on the public admission form, which has no signed-in user). */
  phone?: boolean;
  className?: string;
}

export function SmartUpload({ accept, onFiles, label, multiple = false, maxFiles = 10, maxBytes = 10 * 1024 * 1024, hint, disabled, phone = true, className }: SmartUploadProps) {
  const ui = useUiText();
  const browse = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false), [error, setError] = useState(""), [phoneOpen, setPhoneOpen] = useState(false), [touch, setTouch] = useState(false);
  const limit = multiple ? maxFiles : 1;
  const takesImages = /image\//.test(accept) || /\.(jpe?g|png|webp)/.test(accept);
  useEffect(() => { setTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false); }, []);

  const deliver = (list: File[] | FileList | null | undefined) => {
    const files = Array.from(list ?? []);
    if (!files.length || disabled) return;
    const refused = files.find(file => !fileMatchesAccept(file, accept)), large = files.find(file => file.size > maxBytes);
    if (refused) return setError(ui("{0} is not a file type this upload accepts.", [refused.name]));
    if (large) return setError(ui("{0} is larger than {1} MB.", [large.name, Math.round(maxBytes / 1048576)]));
    if (files.length > limit) return setError(limit === 1 ? ui("Choose one file.") : ui("Choose up to {0} files.", [limit]));
    setError(""); onFiles(files);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setOver(false); deliver(event.dataTransfer.files); };
  const paste = (event: ClipboardEvent<HTMLDivElement>) => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); deliver(files); } };

  return (
    <div className={cn("space-y-2", className)}>
      <div
        role="group" aria-label={label} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
        onDragOver={event => { event.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop} onPaste={paste}
        className={cn("flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface-subtle px-4 py-6 text-center transition-colors",
          over && "border-primary bg-brand-50", disabled && "opacity-60")}
      >
        <UploadCloud aria-hidden="true" className="size-8 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">{touch ? ui("Take a photo or choose a file") : ui("Drop, paste or choose a file")}</p>
          <p className="text-xs text-ink-muted">{hint ?? ui("Up to {0} MB each.", [Math.round(maxBytes / 1048576)])}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {touch && takesImages && <Button type="button" disabled={disabled} onClick={() => camera.current?.click()}><Camera aria-hidden="true" />{ui("Take photo")}</Button>}
          <Button type="button" variant="outline" disabled={disabled} onClick={() => browse.current?.click()}><FileUp aria-hidden="true" />{ui("Choose file")}</Button>
          {phone && !touch && dropTypesFor(accept).length > 0 && <Button type="button" variant="secondary" disabled={disabled} onClick={() => setPhoneOpen(true)}><Smartphone aria-hidden="true" />{ui("Use my phone")}</Button>}
        </div>
        <input ref={browse} type="file" className="hidden" tabIndex={-1} accept={accept} multiple={multiple} onChange={event => { deliver(event.target.files); event.target.value = ""; }} />
        <input ref={camera} type="file" className="hidden" tabIndex={-1} accept="image/*" capture="environment" onChange={event => { deliver(event.target.files); event.target.value = ""; }} />
      </div>
      {error && <p role="alert" className="text-sm text-status-error-text">{error}</p>}
      {phoneOpen && <PhoneDrop label={label} accept={accept} limit={limit} onClose={() => setPhoneOpen(false)} onFiles={files => { setPhoneOpen(false); deliver(files); }} />}
    </div>
  );
}

type Item = { id: string; fileName: string; contentType: string; sizeBytes: number; file?: File; preview?: string };
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof json.error === "string" ? json.error : "REQUEST_FAILED");
  return json.data as T;
}

/** The computer side of a phone handoff: shows the QR, then each page the phone sends, live. */
function PhoneDrop({ label, accept, limit, onClose, onFiles }: { label: string; accept: string; limit: number; onClose(): void; onFiles(files: File[]): void }) {
  const ui = useUiText();
  const [session, setSession] = useState<{ id: string; qr: string; expiresAt: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]), [error, setError] = useState(""), [expired, setExpired] = useState(false);
  const sessionId = useRef<string | null>(null), loaded = useRef(new Map<string, Item>());

  useEffect(() => {
    let alive = true;
    void call<{ session: { id: string; expiresAt: string }; qr: string }>("/api/drop/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, accept: dropTypesFor(accept), maxFiles: limit }) })
      .then(data => { if (!alive) return void close(data.session.id); sessionId.current = data.session.id; setSession({ id: data.session.id, qr: data.qr, expiresAt: data.session.expiresAt }); })
      .catch(() => alive && setError(ui("The phone code could not be created. Try again.")));
    return () => { alive = false; if (sessionId.current) void close(sessionId.current); loaded.current.forEach(item => item.preview && URL.revokeObjectURL(item.preview)); };
  }, []);  

  useEffect(() => {
    if (!session) return;
    let alive = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await call<{ status: string; items: Item[] }>(`/api/drop/sessions/${session.id}`);
        for (const item of data.items) if (!loaded.current.has(item.id)) {
          const blob = await fetch(`/api/drop/sessions/${session.id}/items/${item.id}`, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("FETCH"); return r.blob(); });
          const file = new File([blob], item.fileName, { type: item.contentType });
          loaded.current.set(item.id, { ...item, file, preview: item.contentType.startsWith("image/") ? URL.createObjectURL(file) : undefined });
        }
        if (!alive) return;
        setItems(data.items.map(item => loaded.current.get(item.id)!).filter(Boolean));
        if (data.status !== "OPEN") return setExpired(true);
      } catch { /* A missed poll is retried. */ }
      if (alive) timer = setTimeout(() => void poll(), 1500);
    };
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [session]);

  const discard = async (item: Item) => {
    if (!session) return;
    await fetch(`/api/drop/sessions/${session.id}/items/${item.id}`, { method: "DELETE" }).catch(() => undefined);
    if (item.preview) URL.revokeObjectURL(item.preview);
    loaded.current.delete(item.id); setItems(current => current.filter(row => row.id !== item.id));
  };
  const ready = items.filter(item => item.file);
  // A single-file upload needs no extra click: the first page from the phone is the answer.
  useEffect(() => { if (limit === 1 && ready.length === 1) onFiles([ready[0].file!]); }, [limit, ready.length]);  
  return (
    <Modal title={ui("Use my phone")} subtitle={label} icon={Smartphone} onClose={onClose}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{ui("Cancel")}</Button><Button type="button" disabled={!ready.length} onClick={() => onFiles(ready.map(item => item.file!))}><CheckCircle2 aria-hidden="true" />{ui("Use {0} files", [ready.length])}</Button></div>}>
      <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="mx-auto w-56 space-y-2 text-center">
          {/* The QR is generated on the server from a link that only adds files to this one handoff. */}
          {session && !expired ? <img src={session.qr} width={224} height={224} alt={ui("Phone upload code")} className="rounded-xl border border-border bg-white" /> : <div className="grid size-56 place-items-center rounded-xl border border-dashed border-border text-sm text-ink-muted">{expired ? ui("This code has expired.") : ui("Preparing…")}</div>}
          {session && !expired && <p className="text-xs text-ink-muted">{ui("Valid until {0}", [new Date(session.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })])}</p>}
        </div>
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 ps-5 text-sm text-ink">
            <li>{ui("Open the camera on your phone and point it at the code.")}</li>
            <li>{ui("Scan pages or pick files on the phone. No sign-in is needed.")}</li>
            <li>{ui("They appear here. Check them, then choose Use files.")}</li>
          </ol>
          {error && <p role="alert" className="text-sm text-status-error-text">{error}</p>}
          <ul aria-live="polite" className="grid grid-cols-3 gap-2">
            {items.map(item => (
              <li key={item.id} className="relative overflow-hidden rounded-xl border border-border bg-surface-subtle">
                {item.preview ? <img src={item.preview} alt={item.fileName} className="aspect-[3/4] w-full object-cover" /> : <div className="grid aspect-[3/4] place-items-center p-2 text-xs text-ink-muted">{item.fileName}</div>}
                <Button type="button" size="icon" variant="outline" className="absolute end-1 top-1 size-8 min-w-8" aria-label={ui("Remove {0}", [item.fileName])} onClick={() => void discard(item)}><Trash2 aria-hidden="true" /></Button>
              </li>
            ))}
          </ul>
          {!items.length && session && !expired && <p className="text-sm text-ink-muted">{ui("Waiting for your phone…")}</p>}
        </div>
      </div>
    </Modal>
  );
}

function close(id: string) { return fetch(`/api/drop/sessions/${id}`, { method: "DELETE", keepalive: true }).catch(() => undefined); }
