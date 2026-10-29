"use client";

/**
 * SKAI-1108 founder console: the market expansion triggers from the SKAI-1006 decision log. Read-only; thresholds
 * live in `src/lib/expansion/trigger-config.ts` and a market reopens only when its trigger is met.
 */

import { useCallback, useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageCard } from "@/components/ui/page-card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { useLocale } from "@/components/locale/LocaleProvider";
import type { TriggerStatus } from "@/lib/expansion/triggers";

const COPY = {
  en: { title: "Expansion triggers", description: "Markets stay deferred until their trigger is met. Missing values count as not met.", asOf: "Values as of", market: "Market", metric: "Metric", threshold: "Threshold", value: "Current value", state: "State", met: "Met", notMet: "Not met", unknown: "Not recorded", yes: "Yes", no: "No", allOf: "All conditions", anyOf: "Any condition", loadFailed: "Expansion triggers could not be loaded." },
  ur: { title: "توسیعی محرکات", description: "مارکیٹیں اس وقت تک مؤخر رہتی ہیں جب تک ان کا محرک پورا نہ ہو۔ غیر درج قدر پوری نہیں سمجھی جاتی۔", asOf: "اقدار بتاریخ", market: "مارکیٹ", metric: "پیمانہ", threshold: "حد", value: "موجودہ قدر", state: "حالت", met: "پورا", notMet: "پورا نہیں", unknown: "درج نہیں", yes: "ہاں", no: "نہیں", allOf: "تمام شرائط", anyOf: "کوئی ایک شرط", loadFailed: "توسیعی محرکات لوڈ نہیں ہو سکے۔" },
  ar: { title: "محفزات التوسع", description: "تبقى الأسواق مؤجلة حتى يتحقق محفزها. القيم غير المسجلة تعد غير متحققة.", asOf: "القيم بتاريخ", market: "السوق", metric: "المقياس", threshold: "الحد", value: "القيمة الحالية", state: "الحالة", met: "متحقق", notMet: "غير متحقق", unknown: "غير مسجلة", yes: "نعم", no: "لا", allOf: "كل الشروط", anyOf: "أي شرط", loadFailed: "تعذر تحميل محفزات التوسع." },
} as const;

export default function ExpansionTriggersPage() {
  const { language } = useLocale();
  const t = COPY[language] ?? COPY.en;
  const [data, setData] = useState<{ asOf: string; triggers: TriggerStatus[] } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const res = await fetch("/api/owner/expansion-triggers", { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (!json?.success) { setFailed(true); return; }
    setData(json.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const show = (v: number | boolean | true | null) => v === null ? t.unknown : v === true ? t.yes : v === false ? t.no : String(v);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader icon={Flag} title={t.title} description={data ? `${t.description} ${t.asOf} ${data.asOf}.` : t.description} />
      {failed ? <ErrorState title={t.loadFailed} onRetry={load} /> : (data?.triggers ?? []).map((trigger) => (
        <PageCard key={trigger.market}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold" dir="ltr">{trigger.market}</h2>
            <div className="flex items-center gap-2">
              <Badge size="sm" variant="neutral">{trigger.anyOf ? t.anyOf : t.allOf}</Badge>
              <Badge size="sm" variant={trigger.met ? "success" : "warning"}>{trigger.met ? t.met : t.notMet}</Badge>
            </div>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>{t.metric}</TableHead><TableHead>{t.threshold}</TableHead><TableHead>{t.value}</TableHead><TableHead>{t.state}</TableHead></TableRow></TableHeader>
            <TableBody>
              {trigger.conditions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell><span dir="ltr">{c.metric}</span><div className="text-xs text-ink-muted"><bdi dir="ltr">{c.source}</bdi></div></TableCell>
                  <TableCell>{c.threshold === true ? t.yes : <bdi dir="ltr">≥ {c.threshold}</bdi>}</TableCell>
                  <TableCell>{show(c.value)}</TableCell>
                  <TableCell><Badge size="sm" variant={c.met ? "success" : "neutral"}>{c.met ? t.met : t.notMet}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PageCard>
      ))}
    </div>
  );
}
