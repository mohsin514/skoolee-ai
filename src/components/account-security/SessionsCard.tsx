"use client";
import { Laptop, Loader2, LogOut, MonitorSmartphone, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#f3ecfa] text-[#8127cf]">
          <MonitorSmartphone aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 id="security-sessions-heading" className="text-base font-black tracking-tight text-[#1f1a23]">{t.sessionsTitle}</h4>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-ink-muted">{t.sessionsBody}</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-[#d8cfe5] bg-[#fcfaff] p-4 text-sm font-semibold text-ink-muted">{t.empty}</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {sessions.map(session => {
            const Icon = session.userAgent && MOBILE.test(session.userAgent) ? Smartphone : Laptop;
            const busy = busyId === session.id;
            return (
              <li key={session.id} className="flex flex-col gap-4 rounded-2xl border border-[#ece3f3] bg-[#fcfaff] p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#8127cf] shadow-[0_2px_6px_-2px_rgba(55,27,77,0.2)]">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 text-sm font-bold text-[#1f1a23] [overflow-wrap:anywhere]"><bdi dir="ltr">{session.userAgent || t.unknown}</bdi></p>
                      {session.current && <Badge variant="secondary">{t.thisDevice}</Badge>}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-ink-muted">{t.signed}: {formatInstant(session.loginAt, locale)}</p>
                    <p className="text-xs font-semibold text-ink-muted">{t.expires}: {formatInstant(session.expiresAt, locale)}</p>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={Boolean(busyId)} aria-busy={busy} onClick={() => onEnd(session)} className="sm:shrink-0">
                  {busy ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <LogOut aria-hidden="true" className="rtl:-scale-x-100" />}{t.end}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
