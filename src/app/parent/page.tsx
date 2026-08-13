"use client";

import Link from "next/link";
import { AvatarImage } from "@/components/ui/avatar-image";
import {
  Award, CalendarCheck, ChevronRight, Clock, CreditCard, FileText, GraduationCap,
} from "lucide-react";
import { ParentErrorState, ParentOverviewSkeleton, ParentEmptyState } from "@/components/parent/parent-components";
import { useParentData } from "./parent-data-context";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";

export const dynamic = "force-dynamic";

export default function ParentOverviewPage() {
  const { data, loading, error, refetch, token } = useParentData();

  if (loading && !data) return <ParentOverviewSkeleton />;
  if (error) return <ParentErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

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
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="sk-rise relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[#8127cf]/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative p-7 px-9">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="flex gap-6 items-start group">
              <div className="h-24 w-24 rounded-[32px] bg-gradient-to-br from-[#fbf0fe] to-white border-4 border-[#cfc2d6]/20 shadow-xl overflow-hidden shrink-0 transition-all duration-500 group-hover:scale-[1.03] group-hover:border-[#8127cf]/30 group-hover:shadow-2xl">
                <AvatarImage src={profileImage} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
              </div>
              <div className="pt-2">
                <h2 className="text-4xl font-bold tracking-tight text-[#1d1b20] leading-none mb-2 transition-colors group-hover:text-[#8127cf]">{student.fullName}</h2>
                <p className="text-sm font-semibold text-[#4d4354]/60 uppercase tracking-wider">
                  {student.rollNo} - {student.className}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/40">
                  {campus.name}{campus.city ? ` - ${campus.city}` : ""}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((s, i) => {
            const Icon = s.icon;
            const tones = [
              "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white",
              "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
              "bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white",
            ];
            return (
              <div key={s.label} className="sk-rise group relative rounded-[28px] bg-white border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-1 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: `${(i + 1) * 80}ms` }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase tracking-wider mb-2 transition-colors group-hover:text-[#4d4354]/60">{s.label}</p>
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
          <div className="rounded-[28px] bg-white border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-2xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf]">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight">Latest Report Card</h3>
            </div>
            {data.reportCards[0] ? (
              <div className="rounded-2xl bg-[#fbf0fe]/30 p-5 border border-[#cfc2d6]/8 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#4d4354]/40">{data.reportCards[0].term} {data.reportCards[0].academicYear}</p>
                    <p className="mt-0.5 text-sm font-bold text-[#1d1b20]">{data.reportCards[0].examTitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-[#8127cf]">{Math.round(data.reportCards[0].percentage)}%</p>
                    <p className="text-[10px] font-semibold text-[#4d4354]/40">Grade {data.reportCards[0].grade || "N/A"}</p>
                  </div>
                </div>
                {data.reportCards[0].remarksEn && (
                  <p className="text-xs font-semibold leading-relaxed text-[#4d4354]/60 line-clamp-2">{data.reportCards[0].remarksEn}</p>
                )}
              </div>
            ) : (
              <p className="text-xs font-semibold text-[#4d4354]/40 italic">No report cards published yet.</p>
            )}
            <Link
              href={`/parent/results${q}`}
              className="mt-5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#6a1fb0]"
            >
              View all results <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="rounded-[28px] bg-white border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <GraduationCap className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight">Quick Access</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <QuickLink href={`/parent/results${q}`} icon={FileText} label="Results" sub={`${data.marksByExam.length} exams`} />
              <QuickLink href={`/parent/attendance${q}`} icon={CalendarCheck} label="Attendance" sub={`${data.attendance.total} days recorded`} />
              <QuickLink href={`/parent/timetable${q}`} icon={Clock} label="Timetable" sub="Weekly class schedule" />
              <QuickLink href={`/parent/fees${q}`} icon={CreditCard} label="Fees" sub={feeOutstanding ? `Rs ${feeOutstanding.toLocaleString()} outstanding` : "All cleared"} />
            </div>
          </div>
        </div>

        <AcademicCalendar readOnly role="PARENT" />
      </div>
    </section>
  );
}

function QuickLink({ href, icon: Icon, label, sub }: { href: string; icon: any; label: string; sub: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl bg-[#fbf0fe]/30 p-4 border border-[#cfc2d6]/8 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-lg hover:border-[#8127cf]/20"
    >
      <div className="h-9 w-9 rounded-xl bg-white flex items-center justify-center text-[#8127cf] shadow-sm transition-all group-hover:bg-[#8127cf] group-hover:text-white">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-[#1d1b20]">{label}</p>
        <p className="text-[9px] font-semibold text-[#4d4354]/40 truncate">{sub}</p>
      </div>
    </Link>
  );
}
