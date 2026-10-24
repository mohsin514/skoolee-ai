"use client";
import { useState } from "react";
import { Pause, Play, RefreshCw, RotateCcw, Square } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { IconButton } from "@/components/ui/icon-button";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/tooltip";
import type { RunView } from "@/lib/ai-workflows/view";
import { cn } from "@/lib/utils";
import { UI, runStatusWords, t, type Lang } from "./run-copy";
import { fillNode, runText } from "./run-links";
import { Num, TimeAgo, useWorkflowFormat } from "./workflow-format";
import { DONE_STATES } from "./workflow-marks";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;
const STATUS_TONE: Record<string, BadgeVariant> = {
  PLANNING: "info", PLAN_REVIEW: "info", RUNNING: "info", WAITING_CONFIRM: "warning", NEEDS_INPUT: "warning", WAITING_HANDOFF: "info",
  PAUSED: "neutral", BLOCKED: "danger", FAILED: "danger", COMPLETED: "success", CANCELLED: "neutral", EXPIRED: "neutral",
};
const PAUSABLE = ["RUNNING", "WAITING_CONFIRM", "WAITING_HANDOFF", "NEEDS_INPUT"];
const RESUMABLE = ["PAUSED", "FAILED"];
const ENDED = ["COMPLETED", "CANCELLED", "EXPIRED"];
const WAITING_ON_OTHERS = ["WAITING_CONFIRM", "WAITING_HANDOFF"];

export type RunControl = "pause" | "resume" | "cancel";

/**
 * The Run Sheet header: "Your request", status, when it was asked, receipt-backed progress, credits,
 * and Pause / Continue / Stop. Stop asks a second time; the command bodies are the same as before.
 */
export function RunHeader({ run, language, busy, pendingKey, chrome, headingLevel, headingId, requestText, connection, resumeElsewhere, onControl, onCheckNow }: {
  run: RunView; language: Lang; busy: boolean; pendingKey: string | null; chrome: "full" | "compact"; headingLevel: 2 | 3 | 4; headingId: string;
  requestText?: string; connection: "live" | "retrying"; resumeElsewhere: boolean;
  onControl: (control: RunControl) => void; onCheckNow?: () => void;
}) {
  const format = useWorkflowFormat();
  const [stopping, setStopping] = useState(false);
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const total = run.steps.length;
  const done = run.steps.filter(step => DONE_STATES.has(step.state)).length;
  const planningEmpty = (run.status === "PLANNING" || run.status === "PLAN_REVIEW") && total === 0;
  const canPause = PAUSABLE.includes(run.status);
  const canResume = RESUMABLE.includes(run.status) && !resumeElsewhere;
  const canStop = !ENDED.includes(run.status) && !planningEmpty;
  const statusWords = runStatusWords(run.status, language);

  const control = (kind: RunControl, icon: React.ReactNode, label: string, onClick: () => void) => (
    <Button type="button" variant="ghost" size="sm" aria-label={label}
      data-ai-pause={kind === "pause" ? "" : undefined} data-ai-resume={kind === "resume" ? "" : undefined} data-ai-cancel={kind === "cancel" ? "" : undefined} disabled={busy} loading={busy && pendingKey === kind} onClick={onClick}>
      {busy && pendingKey === kind ? null : icon}
      <span className="hidden sm:inline" aria-hidden="true">{label}</span>
    </Button>
  );

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-56 space-y-1.5">
          <Heading id={headingId} tabIndex={-1} data-ai-run-heading className={cn("rounded-md text-lg font-semibold text-ink-strong outline-offset-4", chrome === "compact" && "sr-only")}>
            {runText("yourRequest", language)}
          </Heading>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            {statusWords ? <Badge size="sm" variant={STATUS_TONE[run.status] ?? "neutral"} dot className="sk-enter-scale" key={run.status}>{statusWords}</Badge> : null}
            <span className="inline-flex items-center gap-1">{runText("asked", language)} <TimeAgo iso={run.createdAt} /></span>
            {run.credits.used > 0 ? (
              <span className="inline-flex items-center gap-1 text-2xs">
                {fillNode(runText("creditsUsed", language), <Num value={run.credits.used} />)}
                <InfoTip content={runText("creditsHelp", language)} />
              </span>
            ) : null}
            {connection === "retrying" ? (
              <span className="inline-flex items-center gap-1">
                <Badge size="sm" variant="neutral">{t(UI, "reconnecting", language)}</Badge>
                {onCheckNow ? <IconButton label={t(UI, "checkNow", language)} onClick={onCheckNow}><RefreshCw aria-hidden="true" /></IconButton> : null}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {connection === "live" && WAITING_ON_OTHERS.includes(run.status) && onCheckNow ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCheckNow}><RefreshCw aria-hidden="true" /><span>{runText("checkForUpdates", language)}</span></Button>
          ) : null}
          {canPause ? control("pause", <Pause aria-hidden="true" />, t(UI, "pause", language), () => onControl("pause")) : null}
          {canResume ? control("resume", run.status === "FAILED" ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" className="rtl:-scale-x-100" />, run.status === "FAILED" ? runText("tryAgain", language) : t(UI, "resume", language), () => onControl("resume")) : null}
          {canStop ? control("cancel", <Square aria-hidden="true" />, t(UI, "cancel", language), () => setStopping(true)) : null}
        </div>
      </div>
      {chrome === "full" && requestText ? (
        <p dir="auto" className="line-clamp-3 whitespace-pre-line rounded-xl bg-surface-subtle px-3 py-2 text-sm text-ink [overflow-wrap:anywhere]">{requestText}</p>
      ) : null}
      {total > 0 ? (
        <Progress size="sm" showValue tone={done === total ? "success" : "brand"} value={done} max={total}
          aria-labelledby={headingId} valueText={t(UI, "counts", language, format.count(done), format.count(total))} />
      ) : null}
      <ConfirmAction
        open={stopping} tone="danger" title={runText("stopTitle", language)} description={runText("stopBody", language)}
        confirmLabel={t(UI, "cancel", language)} cancelLabel={runText("keepGoing", language)} busy={busy && pendingKey === "cancel"}
        onConfirm={() => { setStopping(false); onControl("cancel"); }} onCancel={() => setStopping(false)}
      />
    </header>
  );
}
