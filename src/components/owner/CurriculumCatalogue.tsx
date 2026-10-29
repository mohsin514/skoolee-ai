"use client";

import { useCallback, useEffect, useState } from "react";
import { BookCheck } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  return <div className="min-w-0 space-y-6 overflow-y-auto p-4" data-curriculum-catalogue>
    <PageHeader icon={BookCheck} title="Curriculum catalogue" description={t.catalogueIntro} />
    {error && <Alert tone="danger" title={error} actions={<Button variant="outline" onClick={() => void load()}>{t.retry}</Button>} />}
    {rows && <ul className="space-y-4">{rows.map(row => <li key={row.id} className="sk-panel space-y-3 p-4" data-catalogue-pack={row.packId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="font-semibold text-ink-strong"><bdi dir="ltr">{row.packId}</bdi> · {fill(t.version, [row.version])}</p>
          <p className="text-sm text-ink-muted">{t.board}: {row.board} · {row.subject} · {t.grade}: <bdi dir="auto">{row.schoolGrade}</bdi> · {t.examYear}: {row.examYear} · {t.language}: {row.language.toUpperCase()}</p>
          <p className="text-xs text-ink-subtle"><bdi dir="ltr">sha256 {row.contentSha256}</bdi></p></div>
        <Badge variant={row.unverified.length ? "warning" : "success"}>{row.unverified.length ? fill(t.unverified, [row.unverified.length]) : t.verified}</Badge>
      </div>
      <p className="text-sm text-ink-muted">{t.usage}: {Object.keys(row.activations).length ? Object.entries(row.activations).map(([status, count]) => `${t[`status${status}` as "statusDRAFT"] ?? status} ${count}`).join(" · ") : t.usageNone}</p>
      {row.unverified.length > 0 && <ul className="list-disc space-y-1 ps-5 text-sm" data-catalogue-unverified>{row.unverified.map(item => <li key={item.field}><span className="font-medium"><bdi dir="ltr">{item.field}</bdi></span>: <bdi dir="auto">{item.evidenceRequest}</bdi></li>)}</ul>}
    </li>)}</ul>}
  </div>;
}
