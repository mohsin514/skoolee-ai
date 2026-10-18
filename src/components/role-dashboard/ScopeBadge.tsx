"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";

/**
 * SKO-479: the school and campus the session is acting in, shown next to the academic cycle on every
 * width, so staff can confirm scope before taking attendance or creating an assessment. The names
 * come from the server session, never from a class or a cached guess.
 */
export function ScopeBadge() {
  const t = useUiText();
  const [scope, setScope] = useState<{ school: string; campus: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/session", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (live && j?.user?.schoolName) setScope({ school: j.user.schoolName, campus: j.user.campusName ?? null });
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  if (!scope) return null;
  const label = scope.campus ? `${scope.school} · ${scope.campus}` : scope.school;
  return (
    <div data-testid="scope-badge" title={label} aria-label={t("Working in {0}", [label])} className="flex min-w-0 max-w-full items-center gap-1.5 rounded-2xl border border-border bg-white px-[8px] py-[6px] text-[11px] font-semibold leading-tight text-ink sm:max-w-[20rem] sm:rounded-full">
      <Building2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
      <span className="min-w-0 [overflow-wrap:anywhere] sm:truncate"><bdi>{scope.school}</bdi>{scope.campus ? <> · <bdi>{scope.campus}</bdi></> : null}</span>
    </div>
  );
}
