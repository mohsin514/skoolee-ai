import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Inbox, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardSurface } from "./card";
import { Skeleton } from "./skeleton";

export function TaskHeader({ scope, title, description, action }: { scope: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <header className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap">
    <div className="min-w-0 flex-1">
      <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-primary"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_3px_rgb(129_39_207/0.15)]" />{scope}</p>
      <h1 className="break-words text-[length:var(--text-heading)] font-bold tracking-tight text-ink-strong sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>}
    </div>
    {action && <div className="flex flex-wrap gap-2">{action}</div>}
  </header>;
}

const FEEDBACK = {
  empty: { icon: Inbox, chip: "bg-brand-50 text-primary ring-brand-200/70", edge: "" },
  error: { icon: AlertTriangle, chip: "bg-status-error-surface text-red-700 ring-status-error-border", edge: "border-status-error-border" },
  permission: { icon: Lock, chip: "bg-status-warning-surface text-amber-700 ring-status-warning-border", edge: "border-status-warning-border" },
  success: { icon: CheckCircle2, chip: "bg-status-success-surface text-emerald-700 ring-status-success-border", edge: "border-status-success-border" },
} as const;

export function TaskFeedback({ kind, title, children, action }: { kind: 'empty' | 'error' | 'permission' | 'success'; title: string; children?: ReactNode; action?: ReactNode }) {
  const tone = FEEDBACK[kind];
  const Icon = tone.icon;
  return <section role={kind === 'error' ? 'alert' : 'status'} className={cn(cardSurface, 'flex items-start gap-4 p-5 sm:p-6', tone.edge)}>
    <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-2xl ring-1", tone.chip)}><Icon className="size-5" strokeWidth={2} /></span>
    <div className="min-w-0 flex-1 pt-0.5">
      <h2 className="font-semibold leading-snug text-ink-strong">{title}</h2>
      {children && <div className="mt-1.5 text-sm leading-relaxed text-ink-muted">{children}</div>}
      {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
    </div>
  </section>;
}
export function TaskLoading({ label }: { label: string }) {
  return <section role="status" aria-busy="true" className={`${cardSurface} space-y-4 p-6`}><span className="sr-only">{label}</span><Skeleton className="h-6 w-1/3" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</section>;
}
export function TaskStatus({ children, attention = false }: { children: ReactNode; attention?: boolean }) {
  return <span className={cn('inline-flex items-center rounded-full border border-border-subtle bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-ink', attention && 'border-status-warning-border bg-status-warning-surface text-status-warning-text')}>{children}</span>;
}
