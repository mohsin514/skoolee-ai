"use client";
import { Laptop, LogOut, MonitorSmartphone, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatInstant, type LocalePackage } from "@/lib/locale/package";
import type { SecurityCopy } from "@/lib/auth/security-ui-copy";
import { securityCardClass } from "./TwoFactorCard";

export type SecuritySession = { id: string; userAgent: string | null; loginAt: string; expiresAt: string; current: boolean };

const MOBILE = /Mobi|Android|iPhone|iPad/i;

/** Active sessions from /api/auth/sessions; each can be ended. */
export function SessionsCard({ sessions, t, locale, busyId, onEnd }: {
  sessions: SecuritySession[];
  t: SecurityCopy;
  locale: LocalePackage;
  busyId: string;
  onEnd: (session: SecuritySession) => void;
}) {
  return (
    <section aria-labelledby="security-sessions-heading" className={securityCardClass}>
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-primary">
          <MonitorSmartphone aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 id="security-sessions-heading" className="text-base font-bold tracking-tight text-ink-strong">{t.sessionsTitle}</h4>
          <p className="mt-1 text-sm font-normal leading-relaxed text-ink-muted">{t.sessionsBody}</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="mt-5"><EmptyState size="sm" icon={MonitorSmartphone} title={t.empty} /></div>
      ) : (
        <ul className="mt-5 space-y-3">
          {sessions.map(session => {
            const Icon = session.userAgent && MOBILE.test(session.userAgent) ? Smartphone : Laptop;
            const busy = busyId === session.id;
            return (
              <li key={session.id} className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-subtle p-4 transition-colors hover:bg-surface-hover sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-xs">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 text-sm font-bold text-ink-strong [overflow-wrap:anywhere]"><bdi dir="ltr">{session.userAgent || t.unknown}</bdi></p>
                      {session.current && <Badge variant="secondary">{t.thisDevice}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-ink-subtle tabular-nums">{t.signed}: {formatInstant(session.loginAt, locale)}</p>
                    <p className="text-xs text-ink-subtle tabular-nums">{t.expires}: {formatInstant(session.expiresAt, locale)}</p>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={Boolean(busyId)} loading={busy} onClick={() => onEnd(session)} className="sm:shrink-0">
                  {!busy && <LogOut aria-hidden="true" className="rtl:-scale-x-100" />}{t.end}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
