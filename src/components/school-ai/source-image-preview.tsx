"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { schoolAICopy } from "@/lib/school-ai/copy";
import type { Language } from "@/lib/locale/package";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Protected originals are fetched through the authorized route, and object URLs never survive this viewer. */
export function SourceImagePreview({ recordId, mimeType, language }: { recordId: string; mimeType: string; language: Language }) {
  const c = schoolAICopy(language);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    let active = true;
    const load = async () => {
      try {
        if (!IMAGE_TYPES.has(mimeType)) throw new Error("unsupported");
        const response = await fetch(`/api/school-ai/sources/${encodeURIComponent(recordId)}/file`, { cache: "no-store", signal: controller.signal });
        if (!response.ok || !IMAGE_TYPES.has(response.headers.get("content-type")?.split(";")[0] || "")) throw new Error("unavailable");
        const blob = await response.blob();
        if (!active) return;
        if (!blob.size || blob.size > 10 * 1024 * 1024) throw new Error("unavailable");
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      } catch { if (active) setFailed(true); }
    };
    void load();
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [recordId, mimeType]);
  return <figure className="min-w-0"><figcaption className="mb-2 text-sm font-semibold">{c.imagePreview}</figcaption>{failed ? <p className="rounded-2xl bg-muted p-4 text-sm text-ink-muted">{c.imagePreviewUnavailable}</p> : url ? <Image src={url} width={1000} height={1400} unoptimized alt={c.imagePreview} className="max-h-[40rem] w-full rounded-2xl border border-border-subtle object-contain object-top" onError={() => setFailed(true)} /> : <Skeleton className="h-80 w-full" />}</figure>;
}
