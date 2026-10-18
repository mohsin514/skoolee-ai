"use client";

import Link from "next/link";
import { AvatarImage } from "@/components/ui/avatar-image";
import {
  ArrowRight,
  Award,
  CalendarCheck,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutGrid,
} from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { PathwayPanel } from "@/components/pathways/pathway-panel";
import { FamilyCanteen } from "@/components/campus-packages/campus-packages";
import { FamilyTransferConsent } from "@/components/learning/learning-transfer";
import { ParentErrorState, ParentOverviewSkeleton, ParentEmptyState, ParentStat } from "@/components/parent/parent-components";
import { useParentData } from "./parent-data-context";
import { useLocaleFormat } from "@/components/locale/LocaleProvider";
import { LearnerInsights, learnerSeriesFromParent } from "@/components/insights";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";
import { FamilyInbox } from "@/components/parent/family-inbox";
import { PolicyAssistant } from "@/components/policies/policy-assistant";
import { GuardianDigest } from "@/components/family/family-digest";

export const dynamic = "force-dynamic";

export default function ParentOverviewPage() {
  const { money } = useLocaleFormat();
  const { data, loading, error, refetch, token, selectedStudentId } = useParentData();

  if (loading && !data) return <ParentOverviewSkeleton />;
  if (error) return <ParentErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const { student, campus } = data;
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const profileImage = student.profileImageUrl;
  const latestPct = data.reportCards?.[0]?.percentage;
  const feeOutstanding = data.fees?.some((fee) => fee.balance > 0);
  const balances = new Map<string, number>();
  for (const fee of data.fees) balances.set(fee.currency, (balances.get(fee.currency) ?? 0) + fee.balance);

  const stats = [
    ...(data.access.learningRecords ? [
      { icon: FileText, label: "Report Cards", value: data.reportCards.length, sub: "Published to date", tone: "violet" as const },
      { icon: Award, label: "Latest Score", value: latestPct !== undefined ? `${Math.round(latestPct)}%` : "N/A", sub: data.reportCards[0]?.examTitle || "No result yet", tone: "green" as const },
    ] : []),
    ...(data.access.attendance ? [{ icon: CalendarCheck, label: "Attendance", value: data.attendance.rate !== null ? `${data.attendance.rate}%` : "N/A", sub: `${data.attendance.total} days recorded`, tone: "amber" as const }] : []),
  ];

  return (
    <ParentPage
      avatar={<AvatarImage src={profileImage} name={student.fullName} initialsClassName="text-lg" className="h-full w-full object-cover" />}
      icon={LayoutGrid}
      eyebrow={<>{student.rollNo}</>}
      title={student.fullName}
      summary={
        <>
          {student.className} · {campus.name}
          {campus.city ? ` · ${campus.city}` : ""}
        </>
      }
    >
      <div className="space-y-3">
        {/* SKO-419: requests across every child come first; the panels below are the selected child's. */}
        <FamilyInbox />
        <PathwayPanel />
        <FamilyCanteen />
        <FamilyTransferConsent />
        <PolicyAssistant />
        {/* SKO-423: the selected child's reviewed weekly update. */}
        {selectedStudentId ? <GuardianDigest key={selectedStudentId} studentId={selectedStudentId} /> : null}
        <div className="sk-rise grid grid-cols-1 gap-3 md:grid-cols-3" style={{ animationDelay: "40ms" }}>
          {stats.map((s) => (
            <ParentStat key={s.label} icon={s.icon} label={s.label} value={s.value} sub={s.sub} tone={s.tone} />
          ))}
        </div>

        {/* The child's record in chart form, before the day-to-day panels. */}
        {data.access.learningRecords ? <LearnerInsights
          series={learnerSeriesFromParent(data)}
          possessive={student.fullName.split(" ")[0] || "your child"}
        /> : null}

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {data.access.learningRecords ? <div className="sk-panel min-w-0 p-3 sm:p-4">
            <div className="mb-3 flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                <FileText className="h-4 w-4" />
              </span>
              <h3 className="text-base font-bold text-ink-strong">Latest Report Card</h3>
            </div>
            {data.reportCards[0] ? (
              <div className="min-w-0 space-y-3 rounded-2xl border border-border-subtle bg-surface-subtle p-3 sm:p-4">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 basis-[min(100%,12rem)]">
                    <p className="sk-eyebrow [overflow-wrap:anywhere]">{data.reportCards[0].term} {data.reportCards[0].academicYear}</p>
                    <p className="mt-0.5 [overflow-wrap:anywhere] text-sm font-bold text-ink-strong">{data.reportCards[0].examTitle}</p>
                  </div>
                  <div className="min-w-0 max-w-full text-start">
                    <p className="[overflow-wrap:anywhere] text-2xl font-bold tabular-nums text-primary">{Math.round(data.reportCards[0].percentage)}%</p>
                    <p className="[overflow-wrap:anywhere] text-xs font-medium text-ink-subtle">Grade {data.reportCards[0].grade || "N/A"}</p>
                  </div>
                </div>
                {data.reportCards[0].remarksEn && (
                  <p className="line-clamp-2 text-sm leading-relaxed text-ink-muted" dir="auto">{data.reportCards[0].remarksEn}</p>
                )}
              </div>
            ) : (
              <ParentEmptyState
                icon={FileText}
                title="No report cards yet"
                description="Results appear here once the school publishes them."
              />
            )}
            {data.reportCards[0] ? (
              <Link
                href={`/parent/results${q}`}
                className="sk-nudge-trigger mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg text-sm font-semibold text-primary transition-colors hover:text-brand-700"
              >
                View all results <ChevronRight aria-hidden="true" className="sk-nudge h-4 w-4 rtl:rotate-180" />
              </Link>
            ) : null}
          </div> : null}

          {data.access.learningRecords || data.access.attendance || data.access.finances ? <div className="sk-panel min-w-0 p-3 sm:p-4">
            <div className="mb-3 flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <GraduationCap className="h-4 w-4" />
              </span>
              <h3 className="text-base font-bold text-ink-strong">Quick Access</h3>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {data.access.learningRecords ? <QuickLink
                href={`/parent/results${q}`}
                icon={FileText}
                label="Exams marked"
                value={String(data.marksByExam.length)}
                sub="View results"
              /> : null}
              {data.access.attendance ? <QuickLink
                href={`/parent/attendance${q}`}
                icon={CalendarCheck}
                label="Days recorded"
                value={String(data.attendance.total)}
                sub={data.attendance.rate !== null ? `${data.attendance.rate}% attendance` : "No rate yet"}
                tone="emerald"
              /> : null}
              {data.access.learningRecords ? <QuickLink
                href={`/parent/timetable${q}`}
                icon={Clock}
                label="This week"
                value="Timetable"
                sub="Weekly class schedule"
              /> : null}
              {data.access.finances ? <QuickLink
                href={`/parent/fees${q}`}
                icon={CreditCard}
                label={feeOutstanding ? "Outstanding" : "Fees"}
                value={feeOutstanding ? [...balances].filter(([, amount]) => amount > 0).map(([currency, amount]) => money(amount, currency)).join(" · ") : "Cleared"}
                sub={feeOutstanding ? "Tap to pay" : "Nothing due"}
                tone={feeOutstanding ? "rose" : "emerald"}
              /> : null}
            </div>
          </div> : null}
        </div>

        <AcademicCalendar readOnly role="PARENT" />
      </div>
    </ParentPage>
  );
}

/**
 * With the section strip above carrying the same five destinations, four tiles
 * labelled "Results / Attendance / Timetable / Fees" would be navigation said
 * twice. The figure is what this panel actually adds, so the figure leads and
 * the destination follows.
 */
function QuickLink({
  href,
  icon: Icon,
  label,
  value,
  sub,
  tone = "violet",
}: {
  href: string;
  icon: any;
  label: string;
  value: string;
  sub?: string;
  tone?: "violet" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    violet: "bg-brand-50 text-primary",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  } as const;
  return (
    <Link
      href={href}
      className="group sk-hover-lift sk-nudge-trigger sk-press sk-panel flex min-h-14 min-w-0 items-center gap-2.5 p-3"
    >
      <span aria-hidden="true" className={`sk-icon-tile flex size-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block [overflow-wrap:anywhere] text-base font-bold leading-none tabular-nums text-ink-strong transition-colors group-hover:text-primary">
          {value}
        </span>
        <span className="mt-1 block [overflow-wrap:anywhere] text-2xs font-semibold uppercase tracking-wider text-ink-muted">
          {label}
        </span>
        {sub ? (
          <span className="block [overflow-wrap:anywhere] text-xs text-ink-subtle">{sub}</span>
        ) : null}
      </span>
      <ArrowRight aria-hidden="true" className="sk-nudge h-3.5 w-3.5 shrink-0 text-ink-faint transition-colors group-hover:text-primary rtl:rotate-180" />
    </Link>
  );
}
