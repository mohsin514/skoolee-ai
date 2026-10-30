"use client";
import * as React from "react";
import {
  AlertTriangle, Check, Circle, Eye, FileText, FlaskConical, HelpCircle, Loader2, Minus, PenLine,
  RefreshCw, Send, Stamp, Unplug, UserRoundCheck, Zap, type LucideIcon,
} from "lucide-react";
import type { StepUiState } from "@/lib/ai-workflows/view";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CLASS_C_LONG_ANY, CLASS_WORDS, type Lang } from "./run-copy";
import { useWorkflowFormat } from "./workflow-format";

/** A, B, C from the registry; X = not connected yet, kept as a task. */
export type StepClass = "A" | "B" | "C" | "X";
type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/**
 * The one step-class vocabulary: icon, Badge tone and glyph tile for A/B/C/X.
 * Before execution no tone is success green; green is reserved for receipts.
 */
export const CLASS_MARK: Record<StepClass, { icon: LucideIcon; badge: "secondary" | "warning" | "info" | "neutral"; tile: string }> = {
  A: { icon: Zap, badge: "secondary", tile: "bg-brand-50 text-primary" },
  B: { icon: Stamp, badge: "warning", tile: "bg-status-warning-surface text-status-warning-text" },
  C: { icon: Send, badge: "info", tile: "bg-status-info-surface text-status-info-text" },
  X: { icon: Unplug, badge: "neutral", tile: "bg-surface-subtle text-ink-subtle border border-dashed border-border-subtle" },
};

/** The 20px glyph tile for a class, decorative (pair it with words). */
export function ClassGlyph({ cls, className }: { cls: StepClass; className?: string }) {
  const { icon: Icon, tile } = CLASS_MARK[cls];
  return (
    <span aria-hidden="true" className={cn("inline-grid size-5 shrink-0 place-items-center rounded-lg", tile, className)}>
      <Icon className="size-3" />
    </span>
  );
}

/**
 * A class chip: icon + short or long words. Class C long names who decides
 * ("Goes to Principal or Accountant"). The help sentence shows in the shared
 * Tooltip; pass `tooltip={false}` where the help is already written out.
 */
export function ClassMark({ cls, size = "short", roles, language, tooltip = true, className }: {
  cls: StepClass; size?: "short" | "long"; roles?: string[]; language: Lang; tooltip?: boolean; className?: string;
}) {
  const format = useWorkflowFormat();
  const { icon: Icon, badge } = CLASS_MARK[cls];
  const words = CLASS_WORDS[cls];
  let label = words[size][language];
  if (cls === "C" && size === "long") {
    const list = format.roles(roles ?? []);
    label = list ? label.replace("{0}", list) : CLASS_C_LONG_ANY[language];
  }
  const chip = (
    <Badge
      size="sm"
      variant={badge}
      data-ai-class={cls}
      tabIndex={tooltip ? 0 : undefined}
      className={cn("shrink-0 whitespace-nowrap", cls === "X" && "border-dashed", className)}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
  return tooltip ? <Tooltip content={words.help[language]}>{chip}</Tooltip> : chip;
}

type NodeTone = "planned" | "working" | "attention" | "done" | "info" | "danger" | "muted";

/** Glyph, node tone and Badge tone for every step state. */
export const STATE_MARK: Record<StepUiState, { icon: LucideIcon; tone: NodeTone; badge: BadgeVariant }> = {
  planned: { icon: Circle, tone: "planned", badge: "neutral" },
  running: { icon: Loader2, tone: "working", badge: "info" },
  awaiting_confirm: { icon: PenLine, tone: "attention", badge: "warning" },
  needs_input: { icon: HelpCircle, tone: "attention", badge: "warning" },
  stale: { icon: RefreshCw, tone: "attention", badge: "warning" },
  saved: { icon: Check, tone: "done", badge: "success" },
  approved_elsewhere: { icon: Check, tone: "done", badge: "success" },
  looked_up: { icon: Eye, tone: "info", badge: "info" },
  draft: { icon: FileText, tone: "info", badge: "info" },
  handed_off: { icon: UserRoundCheck, tone: "info", badge: "info" },
  failed: { icon: AlertTriangle, tone: "danger", badge: "danger" },
  uncertain: { icon: AlertTriangle, tone: "danger", badge: "danger" },
  skipped: { icon: Minus, tone: "muted", badge: "neutral" },
  cancelled: { icon: Minus, tone: "muted", badge: "neutral" },
  practice: { icon: FlaskConical, tone: "muted", badge: "neutral" },
};

/** Which lane a step sits in (Build lanes, run summaries). */
export const STATE_LANE: Record<StepUiState, "saved" | "waiting" | "withOwner" | "notRun" | "pending"> = {
  saved: "saved", approved_elsewhere: "saved", draft: "saved", looked_up: "saved",
  awaiting_confirm: "waiting", needs_input: "waiting", stale: "waiting",
  handed_off: "withOwner",
  failed: "notRun", uncertain: "notRun", skipped: "notRun", cancelled: "notRun", practice: "notRun",
  planned: "pending", running: "pending",
};

/** Receipt-backed states only; progress and "saved" counts use this set. */
export const DONE_STATES: ReadonlySet<StepUiState> = new Set<StepUiState>(["saved", "looked_up", "draft", "approved_elsewhere"]);

/**
 * The round state node on `.sk-ai-rail`. Decorative: the state words sit next
 * to it. `pop` plays sk-check-pop; pass it only for a transition seen in this
 * session (useSeenTransition). Running adds an sk-ping ring and a spinning
 * glyph, both removed under prefers-reduced-motion.
 */
export function StateNode({ state, pop = false, size = "md", className }: { state: StepUiState; pop?: boolean; size?: "md" | "sm"; className?: string }) {
  const { icon: Icon, tone } = STATE_MARK[state];
  const running = state === "running";
  return (
    <span
      aria-hidden="true"
      className={cn("sk-ai-node", pop && "sk-check-pop", className)}
      data-tone={tone}
      data-size={size}
    >
      {running ? <span data-part="ping" className="sk-ping" /> : null}
      <Icon className={cn(running && "motion-safe:animate-spin")} />
    </span>
  );
}
