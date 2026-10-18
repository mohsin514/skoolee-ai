"use client";

import { useUiText } from "@/components/locale/LocaleProvider";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Activity, AlertTriangle, CheckCircle2, Clock, Pause, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SkeletonBar } from "@/components/ui/skeleton";
import { ACADEMIC_CYCLE_CHANGED } from "@/lib/cycleEvents";

type CycleStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED" | null;

interface CycleInfo {
  id: string;
  label: string;
  academicYear: number;
  status: string;
}

const statusConfig: Record<string, { icon: typeof Activity; bg: string; text: string; dot: string; label: string }> = {
  ACTIVE: {
    icon: CheckCircle2,
    bg: "bg-emerald-50 border-emerald-200/50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Active",
  },
  PAUSED: {
    icon: Pause,
    bg: "bg-amber-50 border-amber-200/50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    label: "Paused",
  },
  DRAFT: {
    icon: Clock,
    bg: "bg-blue-50 border-blue-200/50",
    text: "text-blue-700",
    dot: "bg-blue-500",
    label: "Draft",
  },
  ENDED: {
    icon: XCircle,
    bg: "bg-gray-50 border-gray-200/50",
    text: "text-gray-600",
    dot: "bg-gray-400",
    label: "Ended",
  },
};

export function CycleBadge() {
  const tr = useUiText();
  const [cycle, setCycle] = useState<CycleInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/academic-cycle");
        const json = await res.json();
        if (!cancelled) {
          if (json.active) {
            setCycle(json.active);
          } else if (json.data?.length > 0) {
            const latest = json.data[0];
            setCycle(latest);
          }
        }
      } catch {
        toast.error(tr("Failed to load cycle"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    window.addEventListener(ACADEMIC_CYCLE_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(ACADEMIC_CYCLE_CHANGED, load);
    };
  }, [tr]);

  if (loading) return <SkeletonBar className="h-7 w-32 rounded-xl" />;

  if (!cycle) {
    return (
      <Badge variant="danger" dot>
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        {tr("No Cycle")}
      </Badge>
    );
  }

  const config = statusConfig[cycle.status] || statusConfig.DRAFT;
  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-1.5 transition-all", config.bg)}>
      <span className={cn("flex h-2 w-2 rounded-full", config.dot, cycle.status === "ACTIVE" && "animate-pulse")} />
      <Icon className={cn("h-3.5 w-3.5", config.text)} />
      <span className={cn("text-2xs font-semibold uppercase tracking-wide", config.text)}>
        {cycle.label} &middot; {tr(config.label)}
      </span>
    </div>
  );
}
