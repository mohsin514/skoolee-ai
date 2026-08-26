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
import { ParentErrorState, ParentOverviewSkeleton, ParentEmptyState } from "@/components/parent/parent-components";
import { useParentData } from "./parent-data-context";
import { formatPKR } from "@/components/fees/fee-utils";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";

export const dynamic = "force-dynamic";

export default function ParentOverviewPage() {
  const { data, loading, error, refetch, token } = useParentData();

  if (loading && !data) return <ParentOverviewSkeleton />;
  if (error) return <ParentErrorState error={error} onRetry={refetch} />;
  if (!data) return null;
//test
  const { student, campus } = data;
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const profileImage = student.profileImageUrl;
  const latestPct = data.reportCards?.[0]?.percentage;
  const feeOutstanding = data.fees?.reduce((sum, f) => sum + (f.balance || 0), 0) || 0;

  const stats = [
    { icon: FileText, label: "Report Cards", value: data.reportCards.length },
    { icon: Award, label: "Latest Score", value: latestPct !== undefined ? `${Math.round(latestPct)}%` : "N/A" },
    { icon: CalendarCheck, label: "Attendance", value: data.attendance.rate !== null ? `${data.attendance.rate}%` : "N/A" },
  ];

  return (
    <ParentPage
      avatar={<AvatarImage src={profileImage} className="h-full w-full object-cover" />}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((s, i) => {
            const Icon = s.icon;
            const tones = [
              "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white",
              "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
              "bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white",
            ];
            return (
              <div key={s.label} className="sk-rise group relative rounded-[28px] bg-white border border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-1 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: `${(i + 1) * 80}ms` }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider mb-2 transition-colors group-hover:text-ink-muted">{s.label}</p>
                    <p className="text-3xl font-bold text-[#1d1b20] leading-none transition-colors group-hover:text-[#8127cf]">{s.value}</p>
                  </div>
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-300 ${tones[i]} shadow-md group-hover:shadow-xl group-hover:scale-110`}>
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-2xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf]">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black tracking-tight text-[#1d1b20]">Latest Report Card</h3>
            </div>
            {data.reportCards[0] ? (
              <div className="rounded-2xl bg-[#fbf0fe]/30 p-5 border border-[#cfc2d6]/8 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{data.reportCards[0].term} {data.reportCards[0].academicYear}</p>
                    <p className="mt-0.5 text-sm font-bold text-[#1d1b20]">{data.reportCards[0].examTitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-[#8127cf]">{Math.round(data.reportCards[0].percentage)}%</p>
                    <p className="text-[10px] font-semibold text-ink-subtle">Grade {data.reportCards[0].grade || "N/A"}</p>
                  </div>
                </div>
                {data.reportCards[0].remarksEn && (
                  <p className="text-xs font-semibold leading-relaxed text-ink-muted line-clamp-2">{data.reportCards[0].remarksEn}</p>
                )}
              </div>
            ) : (
              <p className="text-xs font-semibold text-ink-subtle italic">No report cards published yet.</p>
            )}
            <Link
              href={`/parent/results${q}`}
              className="mt-5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#6a1fb0]"
            >
              View all results <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <GraduationCap className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-black tracking-tight text-[#1d1b20]">Quick Access</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <QuickLink
                href={`/parent/results${q}`}
                icon={FileText}
                label="Exams marked"
                value={String(data.marksByExam.length)}
                sub="View results"
              />
              <QuickLink
                href={`/parent/attendance${q}`}
                icon={CalendarCheck}
                label="Days recorded"
                value={String(data.attendance.total)}
                sub={data.attendance.rate !== null ? `${data.attendance.rate}% attendance` : "No rate yet"}
                tone="emerald"
              />
              <QuickLink
                href={`/parent/timetable${q}`}
                icon={Clock}
                label="This week"
                value="Timetable"
                sub="Weekly class schedule"
              />
              <QuickLink
                href={`/parent/fees${q}`}
                icon={CreditCard}
                label={feeOutstanding ? "Outstanding" : "Fees"}
                value={feeOutstanding ? formatPKR(feeOutstanding) : "Cleared"}
                sub={feeOutstanding ? "Tap to pay" : "Nothing due"}
                tone={feeOutstanding ? "rose" : "emerald"}
              />
            </div>
          </div>
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
    violet: "bg-[#fbf0fe] text-[#8127cf]",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  } as const;
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-[18px] border border-[#cfc2d6]/20 bg-white p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:shadow-[0_2px_6px_rgba(31,26,35,0.06),0_16px_32px_-18px_rgba(129,39,207,0.45)]"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-black leading-none tabular-nums text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">
          {value}
        </span>
        <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wider text-ink-muted">
          {label}
        </span>
        {sub ? (
          <span className="block truncate text-[10px] font-semibold text-ink-subtle">{sub}</span>
        ) : null}
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#cfc2d6] transition-all group-hover:translate-x-0.5 group-hover:text-[#8127cf]" />
    </Link>
  );
}
