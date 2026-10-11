import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Numbered progress for multi-step MFA flows; the current step carries aria-current="step". */
export function MfaStepper({ labels, current, progressLabel, completedLabel, className }: {
  labels: string[];
  current: number;
  progressLabel: string;
  completedLabel: string;
  className?: string;
}) {
  return (
    <ol aria-label={progressLabel} style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }} className={cn("mb-7 grid gap-2 print:hidden", className)}>
      {labels.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} aria-current={active ? "step" : undefined} className="flex min-w-0 flex-col items-center gap-2 text-center">
            <span className="flex w-full items-center">
              <span aria-hidden="true" className={cn("h-0.5 flex-1 rounded-full", index === 0 ? "bg-transparent" : index <= current ? "bg-[#8127cf]" : "bg-[#e7dcef]")} />
              <span aria-hidden="true" className={cn(
                "mx-1 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-black motion-safe:transition-colors motion-safe:duration-300",
                done ? "bg-[#8127cf] text-white" : active ? "bg-white text-[#8127cf] ring-2 ring-[#8127cf] shadow-[0_6px_16px_-6px_rgba(129,39,207,0.55)]" : "bg-[#f3ecfa] text-ink-subtle",
              )}>
                {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
              </span>
              <span aria-hidden="true" className={cn("h-0.5 flex-1 rounded-full", index === labels.length - 1 ? "bg-transparent" : index < current ? "bg-[#8127cf]" : "bg-[#e7dcef]")} />
            </span>
            <span className={cn("text-[11px] font-bold leading-tight [overflow-wrap:anywhere]", active ? "text-[#1f1a23]" : "text-ink-muted")}>
              {label}{done && <span className="sr-only"> ({completedLabel})</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
