"use client";

import { CalendarCheck, CheckCircle2, Clock, X } from "lucide-react";
import { ParentListSkeleton, ParentEmptyState } from "@/components/parent/parent-components";
import { useParentData } from "../parent-data-context";

export const dynamic = "force-dynamic";

export default function ParentAttendancePage() {
  const { data, loading } = useParentData();

  if (loading || !data) return <ParentListSkeleton />;
  const { attendance, student } = data;

  const statusColors: Record<string, string> = {
    PRESENT: "bg-emerald-500",
    ABSENT: "bg-rose-500",
    LATE: "bg-amber-500",
    LEAVE: "bg-blue-500",
  };

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <CalendarCheck className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              {attendance.rate !== null ? `${attendance.rate}% overall · ${attendance.total} days recorded` : "No attendance data yet"}
            </span>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Attendance</h2>
          <p className="mt-1 text-sm font-semibold text-[#4d4354]/60">
            {student.className} · {student.fullName}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-6">
        {attendance.total === 0 ? (
          <ParentEmptyState icon={CalendarCheck} title="No attendance data" description="Attendance records will appear here once marked." />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MiniStat icon={Clock} label="Attendance Rate" value={attendance.rate !== null ? `${attendance.rate}%` : "N/A"} />
              <MiniStat icon={CheckCircle2} label="Present" value={attendance.present} tone="green" />
              <MiniStat icon={X} label="Absent / Leave" value={attendance.total - attendance.present} tone="rose" />
              <MiniStat icon={CalendarCheck} label="Total Days" value={attendance.total} tone="purple" />
            </div>

            <div className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight">Recent Attendance</h3>
                <span className="text-[10px] font-semibold text-[#4d4354]/40">Last {attendance.recent.length} school days</span>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {attendance.recent.map((a, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className={`w-6 h-6 rounded-lg ${statusColors[a.status] || "bg-gray-300"}`} title={`${a.date}: ${a.status}`} />
                    <span className="text-[7px] font-semibold text-[#4d4354]/30">{new Date(a.date).getDate()}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-5">
                {Object.entries(statusColors).map(([status, color]) => (
                  <div key={status} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-sm ${color}`} />
                    <span className="text-[9px] font-semibold text-[#4d4354]/40 capitalize">{status.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function MiniStat({ icon: Icon, label, value, tone = "dark" }: { icon: any; label: string; value: string | number; tone?: string }) {
  const tones: Record<string, string> = {
    dark: "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white",
    green: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
    rose: "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white",
    purple: "bg-[#fbf0fe] text-[#8127cf] group-hover:bg-[#8127cf] group-hover:text-white",
  };
  return (
    <div className="group relative rounded-[28px] bg-white border border-[#cfc2d6]/10 p-5 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-wider transition-colors group-hover:text-[#4d4354]/60">{label}</p>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg ${tones[tone] || tones.dark}`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
      </div>
      <p className="text-2xl font-bold text-[#1d1b20] leading-none transition-colors group-hover:text-[#8127cf]">{value}</p>
    </div>
  );
}
