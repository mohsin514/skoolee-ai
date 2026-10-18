"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ClipboardCheck, Copy, Loader2, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BrandButton } from "./BrandButton";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";


export interface AIFeatureOption {
  feature: string;
  label: string;
  inputLabel?: string;
  placeholder?: string;
  field?: "text" | "question" | "topic";
}

interface AiActionPanelProps {
  title: string;
  options: AIFeatureOption[];
  campusId?: string | null;
  studentId?: string | null;
  className?: string;
  compact?: boolean;
  onComplete?: () => void | Promise<void>;
}

export function AiActionPanel({
  title,
  options,
  campusId,
  studentId,
  className,
  compact,
  onComplete,
}: AiActionPanelProps) {
  const [feature, setFeature] = useState(options[0]?.feature || "");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = useMemo(
    () => options.find((option) => option.feature === feature) || options[0],
    [feature, options]
  );

  const runAI = async () => {
    if (!selected) return;
    setBusy(true);
    setOutput("");

    try {
      const payload: Record<string, unknown> = {
        feature: selected.feature,
        campusId: campusId || undefined,
        studentId: studentId || undefined,
      };
      const field = selected.field || "text";
      if (value.trim()) payload[field] = value.trim();

      const res = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");

      setOutput(data.data?.output || "");
      toast.success("AI draft saved");
      await onComplete?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI request failed");
    } finally {
      setBusy(false);
    }
  };

  /* The panel drafts a lesson plan or a set of remarks and then showed it in a
     scrolling box with no way to get it out — the whole point is to paste it
     somewhere. Clipboard access can be refused (insecure origin, a locked-down
     browser), so the failure is reported rather than silently doing nothing. */
  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Your browser blocked clipboard access — select the text and copy it manually.");
    }
  };

  if (options.length === 0) return null;

  return (
    <div className={cn("group min-w-0", className)}>
      <div className="mb-[12px] flex min-w-0 items-center gap-[10px]">
        <div className="relative shrink-0">
          <div className="absolute -inset-2 bg-primary/18 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative h-[36px] w-[36px] rounded-2xl bg-brand-50 text-primary flex items-center justify-center sk-float">
            <Sparkles className="w-[20px] h-[20px]" />
          </div>
        </div>
        <h3 className="min-w-0 text-sm font-bold text-ink-strong tracking-wider [overflow-wrap:anywhere]">{title}</h3>
      </div>

      <div className="space-y-3">
        {/* The visible caption sits outside this control, so screen-reader
            users would otherwise hear only "combo box". */}
        <Select
          value={feature}
          aria-label="AI action"
          onChange={(event) => setFeature(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.feature} value={option.feature}>
              {option.label}
            </option>
          ))}
        </Select>

        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          /* Same problem the Select above had: the only description of this
             field is its placeholder, which assistive tech does not announce
             as a label. */
          aria-label={`Context for ${selected?.label || "this AI action"}`}
          placeholder={selected?.placeholder || selected?.inputLabel || "Optional context"}
          rows={compact ? 3 : 4}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !busy) {
              event.preventDefault();
              runAI();
            }
          }}

        />

        <BrandButton className="w-full h-12" onClick={runAI} disabled={busy}
          title="Run this AI action (⌘↵ from the context box)"
          icon={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}>
          {busy ? "Drafting" : "Run AI"}
        </BrandButton>

        {output ? (
          <div className="sk-fade-in rounded-2xl border border-status-success-border bg-status-success-surface p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-status-success-text">
                <Check className="sk-check-pop w-4 h-4" />
                <p className="text-2xs font-semibold uppercase tracking-wider">Draft saved</p>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip content="Copy this draft to the clipboard">
                <Button variant="secondary" size="sm"
                  type="button"
                  onClick={copyOutput}
                  className="inline-flex justify-start items-center gap-1"
                >
                  {copied ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                </Tooltip>
                <Tooltip content="Draft this again with the same context">
                <Button variant="secondary" size="sm"
                  type="button"
                  onClick={runAI}
                  disabled={busy}
                  className="inline-flex justify-start items-center gap-1"
                >
                  <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
                  Redo
                </Button>
                </Tooltip>
              </div>
            </div>
            {/* A long lesson plan scrolls inside this box; without the cue the
                text simply appeared to stop mid-sentence. */}
            <p className="custom-scrollbar max-h-40 overflow-y-auto whitespace-pre-line text-sm font-normal leading-relaxed text-ink">
              {output}
            </p>
            <p className="mt-2 text-2xs font-semibold text-status-success-text/80">
              {output.split(/\s+/).filter(Boolean).length} words · scroll for the rest · always read an AI draft before you use it
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AIReviewQueue({
  items,
  onComplete,
}: {
  items?: Array<{ id: string; title: string; feature: string; status: string }>;
  onComplete?: () => void | Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const visibleItems = items || [];

  const review = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/ai/review/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed");
      toast.success(action === "approve" ? "AI draft approved" : "AI draft rejected");
      await onComplete?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed");
    } finally {
      setBusyId(null);
    }
  };

  if (visibleItems.length === 0) {
    return (
      <p className="text-xs font-semibold text-ink-subtle italic">
        No AI drafts are waiting for review.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {visibleItems.slice(0, 5).map((item, index) => (
        <div key={item.id} className="sk-panel sk-rise p-4" style={{ animationDelay: `${index * 60}ms` }}>
          <p className="text-2xs font-semibold text-primary uppercase tracking-wider mb-1">
            {item.feature.replaceAll("_", " ")}
          </p>
          <p className="text-xs font-bold text-ink-strong leading-snug mb-3">{item.title}</p>
          <div className="flex gap-2">
            <BrandButton
              variant="soft"
              className="h-9 flex-1 text-2xs"
              onClick={() => review(item.id, "approve")}
              disabled={busyId === item.id}
              icon={busyId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            >
              Approve
            </BrandButton>
            <BrandButton
              variant="danger"
              className="h-9 flex-1 text-2xs"
              onClick={() => review(item.id, "reject")}
              disabled={busyId === item.id}
              icon={<X className="w-3.5 h-3.5" />}
            >
              Reject
            </BrandButton>
          </div>
        </div>
      ))}
    </div>
  );
}
