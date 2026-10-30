"use client";

/**
 * SKAI-1102 read-only pilot go/no-go board. One card per pilot school: each criterion with its existing
 * metric, the threshold from `go-no-go-config.ts` and a red/amber/green state, plus the overall verdict.
 * Nothing here writes; decisions are recorded in Pilot readiness and Pilot evidence.
 */

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleSlash, Gauge, PauseCircle } from "lucide-react";
import { DeskFilterStatus, DeskPill, DeskStats, StatTile, urgencyFirst, type DeskTone } from "@/components/ui/desk";
import { PAGE_CARD_BODY } from "@/components/role-dashboard/RoleShellSkeleton";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { PageCard } from "@/components/ui/page-card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocale } from "@/components/locale/LocaleProvider";
import type { GoNoGoRow } from "@/lib/pilots/go-no-go-service";
import type { Rag } from "@/lib/pilots/go-no-go-config";
import type { Verdict } from "@/lib/pilots/go-no-go";

const COPY = {
  en: { title: "Pilot go/no-go", description: "Each pilot school against the agreed go/no-go criteria. Unknown or withheld metrics show amber and can never pass a pilot.", criterion: "Criterion", metric: "Metric", value: "Value", threshold: "Threshold", state: "State", verdict: "Verdict", empty: "No pilot is linked to a school yet.", emptyHint: "Link a pilot to a school in Pilot evidence to see it here.", loadFailed: "The go/no-go board could not be loaded.", synthetic: "Synthetic", unknown: "Unknown", GREEN: "Green", AMBER: "Amber", RED: "Red", GO: "Go", HOLD: "Hold", NO_GO: "No-go",
    READINESS_GATE: "Readiness gate", DECISION: "Signed decision", COMMERCIAL_STAGE: "Commercial stage", TEACHER_USAGE: "Teachers generating papers", PAPER_ACCEPTANCE: "Papers accepted", TASK_TIME_CHANGE: "Task time change" },
  ur: { title: "پائلٹ گو/نو گو", description: "ہر پائلٹ اسکول طے شدہ گو/نو گو معیار کے مقابلے میں۔ نامعلوم یا روکے گئے پیمانے امبر دکھتے ہیں اور کبھی پائلٹ پاس نہیں کرتے۔", criterion: "معیار", metric: "پیمانہ", value: "قدر", threshold: "حد", state: "حالت", verdict: "فیصلہ", empty: "ابھی کوئی پائلٹ کسی اسکول سے منسلک نہیں۔", emptyHint: "یہاں دیکھنے کے لیے پائلٹ شواہد میں پائلٹ کو اسکول سے منسلک کریں۔", loadFailed: "گو/نو گو بورڈ لوڈ نہیں ہو سکا۔", synthetic: "مصنوعی", unknown: "نامعلوم", GREEN: "سبز", AMBER: "امبر", RED: "سرخ", GO: "گو", HOLD: "روکیں", NO_GO: "نو گو",
    READINESS_GATE: "تیاری کا گیٹ", DECISION: "دستخط شدہ فیصلہ", COMMERCIAL_STAGE: "تجارتی مرحلہ", TEACHER_USAGE: "پرچے بنانے والے اساتذہ", PAPER_ACCEPTANCE: "منظور شدہ پرچے", TASK_TIME_CHANGE: "کام کے وقت میں تبدیلی" },
  ar: { title: "قرار المضي في التجربة", description: "كل مدرسة تجريبية مقابل معايير المضي أو التوقف المتفق عليها. تظهر المقاييس المجهولة أو المحجوبة بالكهرماني ولا تُنجح التجربة أبدًا.", criterion: "المعيار", metric: "المقياس", value: "القيمة", threshold: "الحد", state: "الحالة", verdict: "الحكم", empty: "لا توجد تجربة مرتبطة بمدرسة بعد.", emptyHint: "اربط تجربة بمدرسة في أدلة التجربة لتظهر هنا.", loadFailed: "تعذر تحميل لوحة قرار التجربة.", synthetic: "اصطناعية", unknown: "غير معروف", GREEN: "أخضر", AMBER: "كهرماني", RED: "أحمر", GO: "مضي", HOLD: "تعليق", NO_GO: "توقف",
    READINESS_GATE: "بوابة الجاهزية", DECISION: "القرار الموقّع", COMMERCIAL_STAGE: "المرحلة التجارية", TEACHER_USAGE: "معلمون ينشئون أوراقًا", PAPER_ACCEPTANCE: "الأوراق المقبولة", TASK_TIME_CHANGE: "تغير وقت المهمة" },
} as const;

const RAG_TONE: Record<Rag, BadgeProps["variant"]> = { GREEN: "success", AMBER: "warning", RED: "danger" };
const VERDICT_TONE: Record<Verdict, DeskTone> = { GO: "success", HOLD: "warning", NO_GO: "danger" };
const VERDICT_ICON = { GO: CircleCheck, HOLD: PauseCircle, NO_GO: CircleSlash } as const;
/** A pilot that is stopped or on hold needs a decision before one that is going. */
const VERDICT_RANK: Record<Verdict, number> = { NO_GO: 0, HOLD: 1, GO: 2 };

export function PilotGoNoGoBoard() {
  const { language } = useLocale();
  const t = COPY[language as keyof typeof COPY] ?? COPY.en;
  const [rows, setRows] = useState<GoNoGoRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const res = await fetch("/api/owner/pilot-go-no-go", { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (!json?.success) { setFailed(true); return; }
    setRows(json.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    // The scrolling body of the owner shell's one page card, like every other owner view.
    <div className={cn("custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto", PAGE_CARD_BODY)}>
      <PageHeader icon={Gauge} title={t.title} description={t.description} />
      {rows?.length ? <>
        <DeskStats>
          {(["NO_GO", "HOLD", "GO"] as const).map((key, index) => {
            const count = rows.filter((row) => row.result.verdict === key).length;
            return <StatTile key={key} index={index} icon={VERDICT_ICON[key]} tone={count ? VERDICT_TONE[key] : "neutral"} label={t[key]} value={count} selected={verdict === key} onSelect={() => setVerdict(verdict === key ? null : key)} />;
          })}
        </DeskStats>
        <DeskFilterStatus shown={verdict ? rows.filter((row) => row.result.verdict === verdict).length : rows.length} total={rows.length} onClear={() => setVerdict(null)} />
      </> : null}
      {failed ? <ErrorState title={t.loadFailed} onRetry={load} />
        : !rows ? <SkeletonList rows={3} label={t.title} />
        : !rows.length ? <PageCard><EmptyState icon={Gauge} title={t.empty} description={t.emptyHint} /></PageCard>
        : urgencyFirst(rows.filter((row) => !verdict || row.result.verdict === verdict), (row) => VERDICT_RANK[row.result.verdict]).map((row) => (
          <PageCard key={row.pilotId} data-verdict={row.result.verdict}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink"><bdi>{row.schoolName}</bdi></h2>
                <p className="text-sm text-ink-muted"><bdi>{row.pilotName}</bdi> · <bdi dir="ltr">{row.status}</bdi>{row.synthetic ? <> · {t.synthetic}</> : null}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-ink-muted">{t.verdict}</span>
                <DeskPill tone={VERDICT_TONE[row.result.verdict]}>{t[row.result.verdict]}</DeskPill>
              </div>
            </div>
            {row.result.reasons.length ? <ul className="mb-4 list-disc ps-5 text-sm text-ink-muted" dir="ltr">{row.result.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
            <Table>
              <TableHeader><TableRow><TableHead>{t.criterion}</TableHead><TableHead>{t.value}</TableHead><TableHead>{t.threshold}</TableHead><TableHead>{t.state}</TableHead></TableRow></TableHeader>
              <TableBody>
                {row.result.criteria.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell><div className="font-semibold">{t[c.key]}</div><div className="text-xs text-ink-muted" dir="ltr">{c.source} · {c.metric}</div></TableCell>
                    <TableCell><bdi dir="ltr">{c.value ?? t.unknown}</bdi>{c.note ? <div className="max-w-xs text-xs text-ink-muted" dir="ltr">{c.note}</div> : null}</TableCell>
                    <TableCell><span className="text-sm" dir="ltr">{c.threshold}</span></TableCell>
                    <TableCell><Badge size="sm" dot variant={RAG_TONE[c.state]}>{t[c.state]}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PageCard>
        ))}
    </div>
  );
}
