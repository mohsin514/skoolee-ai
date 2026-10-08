import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cardSurface } from "./card";
import { Skeleton } from "./skeleton";

export function TaskHeader({ scope, title, description, action }: { scope: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <header className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap">
    <div className="min-w-0 flex-1"><p className="mb-2 text-sm font-medium text-ink-muted">{scope}</p><h1 className="break-words text-[length:var(--text-heading)] font-extrabold sm:text-3xl tracking-tight text-foreground">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>}</div>
    {action && <div className="flex flex-wrap gap-2">{action}</div>}
  </header>;
}
export function TaskFeedback({ kind, title, children, action }: { kind: 'empty' | 'error' | 'permission' | 'success'; title: string; children?: ReactNode; action?: ReactNode }) {
  return <section role={kind === 'error' ? 'alert' : 'status'} className={cn(cardSurface, 'p-6', kind === 'error' && 'border-destructive', kind === 'success' && 'border-success')}>
    <h2 className="font-semibold text-foreground">{title}</h2>{children && <div className="mt-2 text-sm leading-relaxed text-ink-muted">{children}</div>}{action && <div className="mt-4">{action}</div>}
  </section>;
}
export function TaskLoading({ label }: { label: string }) {
  return <section role="status" aria-busy="true" className={`${cardSurface} space-y-4 p-6`}><span className="sr-only">{label}</span><Skeleton className="h-6 w-1/3" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</section>;
}
export function TaskStatus({ children, attention = false }: { children: ReactNode; attention?: boolean }) {
  return <span className={cn('inline-flex rounded-full border border-border/50 bg-muted px-3 py-1.5 text-xs font-semibold text-ink', attention && 'border-status-warning-border bg-status-warning-surface text-status-warning-text')}>{children}</span>;
}
