"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The institution's crest (logo) well: one dashed card that is the file
 * picker's label, so a click anywhere chooses a file and an image can be
 * dropped onto it (same upload path). A round 72px well shows the preview;
 * Remove sits under the card, outside the label (a control inside the label
 * would also open the picker). The native file input is visually hidden;
 * the card shows the shared focus ring while it has keyboard focus.
 */
export type CrestUploadProps = {
  preview?: ReactNode;    // the page's <Image unoptimized> or null
  uploading: boolean;
  hasLogo: boolean;
  onFile(file?: File): void;
  onRemove(): void;
  labels: { title: string; optional: string; hint: string; choose: string; uploading: string; remove: string; drop: string };
};

export function CrestUpload({ preview, uploading, hasLogo, onFile, onRemove, labels }: CrestUploadProps) {
  const [drag, setDrag] = useState(false);
  const over = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!uploading) setDrag(true);
  };
  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDrag(false);
    if (!uploading) onFile(event.dataTransfer.files?.[0]);
  };
  return (
    <div className="sk-crest-frame">
      <label
        className="sk-crest"
        data-drag={drag ? "" : undefined}
        aria-busy={uploading || undefined}
        onDragEnter={over}
        onDragOver={over}
        onDragLeave={(event) => {
          // Moving across the card's own children is not leaving it.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrag(false);
        }}
        onDrop={drop}
      >
        <span data-part="well">
          {preview ?? <ImageIcon aria-hidden="true" className="size-6 text-brand-400" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink-strong">
            {labels.title} <span className="font-normal text-ink-subtle">({labels.optional})</span>
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-subtle">{labels.hint}</span>
          <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none", uploading && "opacity-70")}>
              {uploading ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Upload aria-hidden="true" />}
              {uploading ? labels.uploading : labels.choose}
            </span>
            <span className="text-xs text-ink-subtle">{labels.drop}</span>
          </span>
        </span>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            onFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {hasLogo ? (
        <Button variant="outline" size="sm" type="button" onClick={onRemove} disabled={uploading}>{labels.remove}</Button>
      ) : null}
    </div>
  );
}
