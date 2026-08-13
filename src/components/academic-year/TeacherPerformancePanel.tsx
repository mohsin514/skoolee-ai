"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award, BarChart3, BookOpen, GraduationCap, Loader2, Search,
  TrendingDown, TrendingUp, UserCheck, Users,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/role-dashboard";
import { AvatarImage } from "@/components/ui/avatar-image";

interface TeacherPerf {
  teacherId: string;
  fullName: string;
  email: string;
  profileImageUrl: string | null;
  subjectsCount: number;
  classesCount: number;
  ledClasses: { id: string; name: string; section: string | null }[];
  totalStudents: number;
  avgPercentage: number | null;
  passRate: number | null;
  attendanceCompletionRate: number | null;
  marksCompletionRate: number | null;
  reportCardsGenerated: number;
  teacherAttendanceRate: number | null;
  teacherPresentDays?: number;
  teacherTotalDays?: number;
}

export function TeacherPerformancePanel({ campusId }: { campusId?: string }) {
  const [teachers, setTeachers] = useState<TeacherPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"avgPercentage" | "passRate" | "teacherAttendanceRate" | "marksCompletionRate">("avgPercentage");
  const [year, setYear] = useState(() => new Date().getFullYear());

  const qs = campusId ? `&campusId=${campusId}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teachers/performance?academicYear=${year}${qs}`);
      const json = await res.json();
      if (json.success) setTeachers(json.data || []);
    } catch { toast.error("Failed to load teacher performance"); }
    finally { setLoading(false); }
  }, [year, qs]);

  useEffect(() => { load(); }, [load]);

  const sorted = [...teachers]
    .filter((t) => !search || t.fullName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b[sortBy] ?? -1) - (a[sortBy] ?? -1));

  const avgAll = teachers.length > 0
    ? Math.round(teachers.reduce((s, t) => s + (t.avgPercentage || 0), 0) / teachers.filter((t) => t.avgPercentage !== null).length * 10) / 10
    : 0;

  const rateColor = (val: number | null) => {
    if (val === null) return "text-[#4d4354]/30";
    if (val >= 80) return "text-emerald-600";
    if (val >= 60) return "text-amber-600";
    return "text-rose-600";
  };

  const rateBg = (val: number | null) => {
    if (val === null) return "bg-[#f3f4f9]";
    if (val >= 80) return "bg-emerald-50";
    if (val >= 60) return "bg-amber-50";
    return "bg-rose-50";
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Teachers", value: teachers.length, icon: Users, color: "text-[#8127cf] bg-[#fbf0fe]" },
          { label: "Avg Score", value: avgAll ? `${avgAll}%` : "—", icon: BarChart3, color: rateColor(avgAll) + " " + rateBg(avgAll) },
          { label: "Total Students", value: teachers.reduce((s, t) => s + t.totalStudents, 0), icon: GraduationCap, color: "text-[#8127cf] bg-[#fbf0fe]" },
          { label: "Report Cards", value: teachers.reduce((s, t) => s + t.reportCardsGenerated, 0), icon: BookOpen, color: "text-[#8127cf] bg-[#fbf0fe]" },
        ].map((card, i) => (
          <div key={card.label} className="sk-rise rounded-2xl bg-white border border-[#cfc2d6]/25 p-4 shadow-sm" style={{ animationDelay: `${i * 60}ms` }}>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-2 ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <p className="text-xl font-bold text-[#1d1b20]">{card.value}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/40">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#4d4354]/30" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teachers..."
            className="h-10 w-full rounded-xl border border-[#cfc2d6]/20 bg-white pl-9 pr-3 text-sm font-semibold outline-none placeholder:text-[#4d4354]/30 focus:border-[#8127cf]/30 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)] transition-all" />
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold outline-none cursor-pointer focus:border-[#8127cf]/30 transition-colors">
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold outline-none cursor-pointer focus:border-[#8127cf]/30 transition-colors">
            <option value="avgPercentage">Sort: Avg Score</option>
            <option value="passRate">Sort: Pass Rate</option>
            <option value="teacherAttendanceRate">Sort: Own Attendance</option>
            <option value="marksCompletionRate">Sort: Marks Entry</option>
          </select>
        </div>
      </div>

      {/* Teacher List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-5 animate-skeleton-in" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-start gap-4">
                <div className="h-8 w-8 rounded-xl bg-[#e8e0ec]/50 skeleton-shimmer" />
                <div className="h-11 w-11 rounded-xl bg-[#e8e0ec]/50 skeleton-shimmer" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                  <div className="h-3 w-48 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="rounded-xl bg-[#f3f4f9] p-2">
                    <div className="h-4 w-10 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer mb-1" />
                    <div className="h-2 w-14 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={Award} title="No Performance Data" description="No teacher performance data available for this year." />
      ) : (
        <div className="space-y-3">
          {sorted.map((teacher, rank) => (
            <div key={teacher.teacherId} className="sk-rise rounded-2xl bg-white border border-[#cfc2d6]/25 p-5 hover:shadow-md hover:border-[#8127cf]/25 transition-all duration-200" style={{ animationDelay: `${rank * 60}ms` }}>
              <div className="flex items-start gap-4">
                {/* Rank */}
                <div className={`h-8 w-8 shrink-0 rounded-xl flex items-center justify-center text-xs font-bold ${
                  rank === 0 ? "bg-amber-50 text-amber-600" :
                  rank === 1 ? "bg-slate-100 text-slate-500" :
                  rank === 2 ? "bg-orange-50 text-orange-500" :
                  "bg-[#f3f4f9] text-[#4d4354]/30"
                }`}>
                  {rank + 1}
                </div>

                {/* Avatar */}
                <div className="h-11 w-11 shrink-0 rounded-xl bg-[#fbf0fe] overflow-hidden">
                  <AvatarImage src={teacher.profileImageUrl} name={teacher.fullName} alt="" className="h-full w-full object-cover" initialsClassName="text-xs" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[#1d1b20] truncate tracking-tight">{teacher.fullName}</p>
                    {rank === 0 && teacher.avgPercentage !== null && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Top Performer</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] font-semibold text-[#4d4354]/40">{teacher.subjectsCount} subjects</span>
                    <span className="text-[#4d4354]/15">|</span>
                    <span className="text-[10px] font-semibold text-[#4d4354]/40">{teacher.classesCount} classes</span>
                    <span className="text-[#4d4354]/15">|</span>
                    <span className="text-[10px] font-semibold text-[#4d4354]/40">{teacher.totalStudents} students</span>
                    {teacher.ledClasses.length > 0 && (
                      <>
                        <span className="text-[#4d4354]/15">|</span>
                        <span className="text-[10px] font-semibold text-[#8127cf]">
                          CT: {teacher.ledClasses.map((c) => `${c.name}${c.section ? `-${c.section}` : ""}`).join(", ")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                <div className={`rounded-xl px-3 py-2 ${rateBg(teacher.avgPercentage)}`}>
                  <div className="flex items-center gap-1">
                    {teacher.avgPercentage !== null && teacher.avgPercentage >= 70
                      ? <TrendingUp className={`h-3.5 w-3.5 ${rateColor(teacher.avgPercentage)}`} />
                      : <TrendingDown className={`h-3.5 w-3.5 ${rateColor(teacher.avgPercentage)}`} />
                    }
                    <p className={`text-sm font-bold ${rateColor(teacher.avgPercentage)}`}>
                      {teacher.avgPercentage !== null ? `${teacher.avgPercentage}%` : "—"}
                    </p>
                  </div>
                  <p className="text-[8px] font-semibold uppercase tracking-wider text-[#4d4354]/35 mt-0.5">Avg Score</p>
                </div>

                <div className={`rounded-xl px-3 py-2 ${rateBg(teacher.passRate)}`}>
                  <p className={`text-sm font-bold ${rateColor(teacher.passRate)}`}>
                    {teacher.passRate !== null ? `${teacher.passRate}%` : "—"}
                  </p>
                  <p className="text-[8px] font-semibold uppercase tracking-wider text-[#4d4354]/35 mt-0.5">Pass Rate</p>
                </div>

                <div className={`rounded-xl px-3 py-2 ${rateBg(teacher.teacherAttendanceRate)}`}>
                  <div className="flex items-center gap-1">
                    <UserCheck className={`h-3.5 w-3.5 ${rateColor(teacher.teacherAttendanceRate)}`} />
                    <p className={`text-sm font-bold ${rateColor(teacher.teacherAttendanceRate)}`}>
                      {teacher.teacherAttendanceRate !== null ? `${teacher.teacherAttendanceRate}%` : "—"}
                    </p>
                  </div>
                  <p className="text-[8px] font-semibold uppercase tracking-wider text-[#4d4354]/35 mt-0.5">Own Attendance</p>
                </div>

                <div className={`rounded-xl px-3 py-2 ${rateBg(teacher.marksCompletionRate)}`}>
                  <p className={`text-sm font-bold ${rateColor(teacher.marksCompletionRate)}`}>
                    {teacher.marksCompletionRate !== null ? `${teacher.marksCompletionRate}%` : "—"}
                  </p>
                  <p className="text-[8px] font-semibold uppercase tracking-wider text-[#4d4354]/35 mt-0.5">Marks Entry</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
