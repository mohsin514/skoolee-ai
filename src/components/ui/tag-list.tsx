"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Free tags with optional suggestions. Enter or comma adds; each tag has its own remove button. */
export function TagList({ value, onChange, max, placeholder, suggestions = [], validate, label, className }: { value: string[]; onChange: (value: string[]) => void; max: number; placeholder?: string; suggestions?: string[]; validate?: (tag: string) => boolean; label: string; className?: string }) {
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const add = (raw: string) => {
    const tag = raw.trim().replace(/,$/, "");
    if (!tag || value.includes(tag) || value.length >= max) return setDraft("");
    if (validate && !validate(tag)) return setInvalid(true);
    onChange([...value, tag]); setDraft(""); setInvalid(false);
  };
  const open = suggestions.filter(item => !value.includes(item));
  return (
    <div className={cn("space-y-2", className)}>
      <div className={cn("flex min-h-12 flex-wrap items-center gap-2 rounded-xl border bg-card p-2", invalid ? "border-destructive" : "border-border")}>
        {value.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-surface-selected px-2 py-1 text-sm" dir="auto">
            {tag}
            <button type="button" className="rounded p-0.5 hover:bg-surface-hover" aria-label={`${label}: ${tag} ×`} onClick={() => onChange(value.filter(item => item !== tag))}><X className="size-3.5" aria-hidden /></button>
          </span>
        ))}
        {value.length < max && (
          <input
            dir="auto" aria-label={label} aria-invalid={invalid || undefined} placeholder={value.length ? "" : placeholder} value={draft}
            className="min-w-32 flex-1 bg-transparent px-1 text-base outline-none"
            onChange={event => { setDraft(event.target.value); setInvalid(false); if (event.target.value.endsWith(",")) add(event.target.value); }}
            onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(draft); } else if (event.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1)); }}
            onBlur={() => draft && add(draft)}
          />
        )}
      </div>
      {open.length > 0 && value.length < max && (
        <div className="flex flex-wrap gap-2">{open.slice(0, 8).map(item => <button key={item} type="button" className="rounded-lg border border-dashed border-border px-2 py-1 text-sm hover:bg-surface-hover" onClick={() => add(item)}>+ {item}</button>)}</div>
      )}
    </div>
  );
}
