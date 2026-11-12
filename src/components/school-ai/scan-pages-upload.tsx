"use client";

import { useState } from "react";
import { FileText, X } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Button } from "@/components/ui/button";
import { SmartUpload } from "@/components/ui/smart-upload";
import { TaskLoading } from "@/components/ui/task-patterns";
import { MAX_SCAN_PAGES } from "@/lib/school-ai/scan";

/**
 * SKAI-1849: document intake (exam papers, syllabi) through SmartUpload. Several photographed pages — from this
 * device or a phone — are joined into one PDF by the existing /api/school-ai/scan route, so a ten-page paper
 * becomes one source and one extraction instead of ten.
 */
export function ScanPagesUpload({ documentKind, subjectId, classId, accept, label, value, onChange, disabled }: {
  documentKind: "paper" | "syllabus"; subjectId?: string | null; classId?: string | null; accept: string; label: string;
  value: File | null; onChange(file: File | null): void; disabled?: boolean;
}) {
  const ui = useUiText();
  const [joining, setJoining] = useState(false), [error, setError] = useState("");
  const take = async (files: File[]) => {
    setError("");
    if (files.length === 1) return onChange(files[0]);
    if (files.some(file => !["image/jpeg", "image/png"].includes(file.type))) return setError(ui("Choose one PDF, or several JPEG or PNG page photos."));
    setJoining(true);
    try {
      const form = new FormData();
      form.set("documentKind", documentKind);
      if (subjectId && classId) { form.set("subjectId", subjectId); form.set("classId", classId); }
      for (const file of files) form.append("pages", file);
      const response = await fetch("/api/school-ai/scan", { method: "POST", body: form, cache: "no-store" });
      if (!response.ok) { const json = await response.json().catch(() => ({})); throw new Error(typeof json.error === "string" ? json.error : ""); }
      onChange(new File([await response.blob()], `scanned-${documentKind}-${files.length}-pages.pdf`, { type: "application/pdf" }));
    } catch (reason) { setError(reason instanceof Error && reason.message ? reason.message : ui("The pages could not be joined. Try again.")); }
    finally { setJoining(false); }
  };
  if (joining) return <TaskLoading label={ui("Joining pages into one PDF…")} />;
  if (value) return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-subtle p-3">
      <FileText aria-hidden="true" className="size-5 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold"><bdi>{value.name}</bdi></p>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}><X aria-hidden="true" />{ui("Change")}</Button>
    </div>
  );
  return <>
    <SmartUpload accept={accept} label={label} multiple maxFiles={MAX_SCAN_PAGES} disabled={disabled} onFiles={files => void take(files)}
      hint={ui("One PDF, or up to {0} page photos joined into one PDF.", [MAX_SCAN_PAGES])} />
    {error && <p role="alert" className="text-sm text-status-error-text">{error}</p>}
  </>;
}
