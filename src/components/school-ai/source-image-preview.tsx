"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { schoolAICopy } from "@/lib/school-ai/copy";
import type { Language } from "@/lib/locale/package";
import type { DocumentRegion } from "@/lib/school-ai/intake";
import { Button } from "@/components/ui/button";
import { documentReviewCopy } from "./document-review-copy";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Protected originals are fetched through the authorized route, and object URLs never survive this viewer. */
export function SourceImagePreview({ recordId, mimeType, language, regions=[] ,onRegionSelect}: { recordId: string; mimeType: string; language: Language; regions?:DocumentRegion[];onRegionSelect?:(id:string)=>void }) {
  const c = schoolAICopy(language);
  const t=documentReviewCopy(language),[dimensions,setDimensions]=useState({width:1000,height:1400});
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
  return <figure className="min-w-0"><figcaption className="mb-2 text-sm font-semibold">{c.imagePreview}</figcaption>{failed ? <p className="rounded-2xl bg-muted p-4 text-sm text-ink-muted">{c.imagePreviewUnavailable}</p> : url ? <div className="relative" style={{maxWidth:`min(100%, ${40*dimensions.width/dimensions.height}rem)`}}><Image src={url} width={dimensions.width} height={dimensions.height} unoptimized alt={c.imagePreview} className="h-auto w-full rounded-2xl border border-border-subtle" onLoad={event=>setDimensions({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})} onError={() => setFailed(true)} />{regions.map((region,index)=>region.box&&<Button key={region.id} type="button" variant="ghost" aria-label={`${t.region} ${index+1} · ${t[region.kind]}`} className="absolute min-h-0 min-w-0 rounded-none border-2 border-primary bg-primary/10 p-0" style={{left:`${region.box.x*100}%`,top:`${region.box.y*100}%`,width:`${region.box.width*100}%`,height:`${region.box.height*100}%`}} onClick={()=>onRegionSelect?.(region.id)}><span className="absolute start-0 top-0 bg-primary px-1 text-xs text-primary-foreground">{index+1}</span></Button>)}</div> : <Skeleton className="h-80 w-full" />}</figure>;
}
