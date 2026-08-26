"use client";

import { CalendarCheck, CheckCircle2, Clock, X } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentListSkeleton, ParentEmptyState, ParentStat } from "@/components/parent/parent-components";
import { useParentData } from "../parent-data-context";

export const dynamic = "force-dynamic";

export default function ParentAttendancePage() {
  const { data, loading, error, refetch } = useParentData();

  // Without this an expired session leaves the page on a skeleton
  // forever, because `data` never arrives and `loading` is already false.
  if (error) return <ParentErrorState error={error} onRetry={refetch} />;
  if (loading || !data) return <ParentListSkeleton />;
  const { attendance, student } = data;

  const statusColors: Record<string, string> = {
    PRESENT: "bg-emerald-500",
    ABSENT: "bg-rose-500",
    LATE: "bg-amber-500",
    LEAVE: "bg-blue-500",
  };

  return (
    <ParentPage
      icon={CalendarCheck}
      eyebrow={<>{attendance.rate !== null ? `${attendance.rate}% overall · ${attendance.total} days recorded` : "No attendance data yet"}</>}
      title="Attendance"
      summary={<>{`${student.className} · ${student.fullName}`}</>}
    >
      <div className="space-y-3">
        {attendance.total === 0 ? (
          <ParentEmptyState icon={CalendarCheck} title="No attendance data" description="Attendance records will appear here once marked." />
        ) : (
          <>
            <div className="sk-rise grid grid-cols-2 md:grid-cols-4 gap-4" style={{ animationDelay: "40ms" }}>
              <ParentStat icon={Clock} label="Attendance Rate" value={attendance.rate !== null ? `${attendance.rate}%` : "N/A"} />
              <ParentStat icon={CheckCircle2} label="Present" value={attendance.present} tone="green" />
              <ParentStat icon={X} label="Absent / Leave" value={attendance.total - attendance.present} tone="rose" />
              <ParentStat icon={CalendarCheck} label="Total Days" value={attendance.total} tone="violet" />
            </div>

            <div className="sk-rise rounded-[28px] bg-white border border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "120ms" }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black tracking-tight text-[#1d1b20]">Recent Attendance</h3>
                <span className="text-[10px] font-semibold text-ink-subtle">Last {attendance.recent.length} school days</span>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {attendance.recent.map((a, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className={`w-6 h-6 rounded-lg ${statusColors[a.status] || "bg-gray-300"}`} title={`${a.date}: ${a.status}`} />
                    <span className="text-[7px] font-semibold text-ink-subtle">{new Date(a.date).getDate()}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-5">
                {Object.entries(statusColors).map(([status, color]) => (
                  <div key={status} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-sm ${color}`} />
                    <span className="text-[9px] font-semibold text-ink-subtle capitalize">{status.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </ParentPage>
  );
}

