"use client";

import { useUiText } from "@/components/locale/LocaleProvider";
import { useEffect, useState } from "react";
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
    bg: "bg-status-success-surface border-status-success-border/50",
    text: "text-status-success-text",
    dot: "bg-status-success-text",
    label: "Active",
  },
  PAUSED: {
    icon: Pause,
    bg: "bg-status-warning-surface border-status-warning-border/50",
    text: "text-status-warning-text",
    dot: "bg-status-warning-text",
    label: "Paused",
  },
  DRAFT: {
    icon: Clock,
    bg: "bg-status-info-surface border-status-info-border/50",
    text: "text-status-info-text",
    dot: "bg-status-info-text",
    label: "Draft",
  },
  ENDED: {
    icon: XCircle,
    bg: "bg-surface-subtle border-border-subtle",
    text: "text-ink-muted",
    dot: "bg-ink-subtle",
    label: "Ended",
  },
};

export function CycleBadge() {
  const tr = useUiText();
  const [cycle, setCycle] = useState<CycleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  // A context chip that failed to load says nothing rather than "No active academic year" (which would be false) or a toast
  // on every page (R4); the screens that need the cycle show their own inline error.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/academic-cycle");
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!cancelled) {
          setFailed(false);
          if (json.active) {
            setCycle(json.active);
          } else if (json.data?.length > 0) {
            const latest = json.data[0];
            setCycle(latest);
          }
        }
      } catch {
        if (!cancelled) setFailed(true);
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
  }, []);

  if (loading) return <SkeletonBar className="h-7 w-32 rounded-xl" />;
  if (failed) return null;

  if (!cycle) {
    return (
      <Badge variant="danger" dot>
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        {tr("No active academic year")}
      </Badge>
    );
  }

  const config = statusConfig[cycle.status] || statusConfig.DRAFT;
  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-1.5 transition-all", config.bg)}>
      <span className={cn("flex h-2 w-2 rounded-full", config.dot, cycle.status === "ACTIVE" && "animate-pulse")} />
      <Icon className={cn("h-3.5 w-3.5", config.text)} />
      <span className={cn("text-2xs font-semibold", config.text)}>
        <bdi>{cycle.label}</bdi> &middot; {tr(config.label)}
      </span>
    </div>
  );
}
