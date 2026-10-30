"use client";

import { useCallback, useEffect, useState } from "react";
import { BookCheck, PackageCheck, PackageSearch } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { DeskPill, DeskRowIcon, deskRow } from "@/components/ui/desk";
import { PAGE_CARD_BODY } from "@/components/role-dashboard/RoleShellSkeleton";
import { cn } from "@/lib/utils";
import { curriculumPacksCopy, fill } from "@/components/curriculum/curriculum-packs-copy";

type Row = { id: string; packId: string; version: number; board: string; subject: string; schoolGrade: string; examYear: string; language: string; status: string; contentSha256: string; unverified: { field: string; evidenceRequest: string }[]; activations: Record<string, number> };

/** SKAI-1008: the platform catalogue for the founder/operator — every version, its hash and its unverified items. */
export function CurriculumCatalogue() {
  const t = curriculumPacksCopy(useLocale().language);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/owner/curriculum-packs", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.data)) setRows(payload.data); else setError(typeof payload.error === "string" ? payload.error : t.loadError);
    } catch { setError(t.loadError); }
  }, [t.loadError]);
  useEffect(() => { void load(); }, [load]);
  // The scrolling body of the owner shell's one page card, like every other owner view.
  return <div className={cn("custom-scrollbar min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto", PAGE_CARD_BODY)} data-curriculum-catalogue>
    <PageHeader icon={BookCheck} title="Curriculum catalogue" description={t.catalogueIntro} />
    {error ? <div className="sk-panel"><ErrorState title={error} onRetry={() => load()} retryLabel={t.retry} /></div> : !rows ? <SkeletonList rows={3} label={t.catalogueTitle} /> : null}
    {rows && <ul className="space-y-3">{rows.map(row => <li key={row.id} data-tone={row.unverified.length ? "warning" : "success"} className={cn(deskRow, "space-y-3")} data-catalogue-pack={row.packId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <DeskRowIcon icon={row.unverified.length ? PackageSearch : PackageCheck} />
        <div className="min-w-0 flex-1"><p className="font-semibold text-ink-strong"><bdi dir="ltr">{row.packId}</bdi> · {fill(t.version, [row.version])}</p>
          <p className="text-sm text-ink-muted">{t.board}: {row.board} · {row.subject} · {t.grade}: <bdi dir="auto">{row.schoolGrade}</bdi> · {t.examYear}: {row.examYear} · {t.language}: {row.language.toUpperCase()}</p>
          <p className="break-all text-xs text-ink-subtle"><bdi dir="ltr">sha256 {row.contentSha256}</bdi></p></div>
        <DeskPill tone={row.unverified.length ? "warning" : "success"}>{row.unverified.length ? fill(t.unverified, [row.unverified.length]) : t.verified}</DeskPill>
      </div>
      <p className="text-sm text-ink-muted">{t.usage}: {Object.keys(row.activations).length ? Object.entries(row.activations).map(([status, count]) => `${t[`status${status}` as "statusDRAFT"] ?? status} ${count}`).join(" · ") : t.usageNone}</p>
      {row.unverified.length > 0 && <ul className="list-disc space-y-1 ps-5 text-sm" data-catalogue-unverified>{row.unverified.map(item => <li key={item.field}><span className="font-medium"><bdi dir="ltr">{item.field}</bdi></span>: <bdi dir="auto">{item.evidenceRequest}</bdi></li>)}</ul>}
    </li>)}</ul>}
  </div>;
}
