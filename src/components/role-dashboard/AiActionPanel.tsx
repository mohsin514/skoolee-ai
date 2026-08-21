"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BrandButton } from "./BrandButton";

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

  if (options.length === 0) return null;

  return (
    <div className={cn("group", className)}>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <div className="absolute -inset-2 bg-[#8127cf]/18 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative h-9 w-9 rounded-2xl bg-[#fbf0fe] text-[#8127cf] flex items-center justify-center sk-float">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
        <h3 className="text-sm font-black text-[#1f1a23] tracking-wider">{title}</h3>
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
          placeholder={selected?.placeholder || selected?.inputLabel || "Optional context"}
          rows={compact ? 3 : 4}
          className="rounded-2xl border-[#cfc2d6]/30 bg-white/80"
        />

        <BrandButton className="w-full h-12" onClick={runAI} disabled={busy} icon={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}>
          {busy ? "Drafting" : "Run AI"}
        </BrandButton>

        {output ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="flex items-center gap-2 text-emerald-700 mb-2">
              <Check className="sk-check-pop w-4 h-4" />
              <p className="text-[9px] font-black uppercase tracking-wider">Draft saved</p>
            </div>
            <p className="text-xs font-semibold leading-relaxed text-[#1f1a23] whitespace-pre-line max-h-40 overflow-y-auto custom-scrollbar">
              {output}
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
        <div key={item.id} className="sk-rise rounded-2xl border border-[#cfc2d6]/25 bg-white p-4 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.08),0_10px_28px_-12px_rgba(129,39,207,0.16)]" style={{ animationDelay: `${index * 60}ms` }}>
          <p className="text-[9px] font-black text-[#8127cf] uppercase tracking-wider mb-1">
            {item.feature.replaceAll("_", " ")}
          </p>
          <p className="text-xs font-black text-[#1f1a23] leading-snug mb-3">{item.title}</p>
          <div className="flex gap-2">
            <BrandButton
              variant="soft"
              className="h-9 flex-1 text-[11px]"
              onClick={() => review(item.id, "approve")}
              disabled={busyId === item.id}
              icon={busyId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            >
              Approve
            </BrandButton>
            <BrandButton
              variant="danger"
              className="h-9 flex-1 text-[11px]"
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
