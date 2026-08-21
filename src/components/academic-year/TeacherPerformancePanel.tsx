"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Award, BarChart3, BookOpen, GraduationCap, Loader2, Search,
  TrendingDown, TrendingUp, UserCheck, Users,
} from "lucide-react";
import { EmptyState } from "@/components/role-dashboard";
import { userMessage } from "@/lib/errors";
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"avgPercentage" | "passRate" | "teacherAttendanceRate" | "marksCompletionRate">("avgPercentage");
  const [year, setYear] = useState(() => new Date().getFullYear());

  const qs = campusId ? `&campusId=${campusId}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/teachers/performance?academicYear=${year}${qs}`);
      const json = await res.json().catch(() => null);
      // fetch resolves on a 4xx/5xx, so the old `if (json.success)` quietly did
      // nothing and the panel rendered zeros — a broken endpoint was
      // indistinguishable from a campus with no teachers.
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
      setTeachers(json.data || []);
    } catch (error) {
      setTeachers([]);
      setLoadError(userMessage(error, "Could not load teacher performance."));
    } finally {
      setLoading(false);
    }
  }, [year, qs]);

  useEffect(() => { load(); }, [load]);

  const sorted = [...teachers]
    .filter((t) => !search || t.fullName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b[sortBy] ?? -1) - (a[sortBy] ?? -1));

  const avgAll = teachers.length > 0
    ? Math.round(teachers.reduce((s, t) => s + (t.avgPercentage || 0), 0) / teachers.filter((t) => t.avgPercentage !== null).length * 10) / 10
    : 0;

  const rateColor = (val: number | null) => {
    if (val === null) return "text-ink-subtle";
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
      {/* Header matches the academics overview so the staff section of the
          admin reads as the same product. */}
      <div className="sk-rise rounded-[28px] border border-[#cfc2d6]/25 bg-gradient-to-br from-[#faf7fc] via-white to-[#f3eeff] p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.18)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#6a1fb0] text-white shadow-lg shadow-[#8127cf]/20">
              <Award className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">Staff · {year}</p>
              <h2 className="text-xl font-black tracking-tight text-[#1f1a23]">Teacher Performance</h2>
              <p className="mt-0.5 text-xs font-semibold text-ink-muted">
                How each teacher&apos;s classes are doing, and whether their marks and attendance are up to date.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-[#8127cf] shadow-sm">
            {loadError ? "Unavailable" : `${teachers.length} teacher${teachers.length === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {/* Summary Cards — same 24px card and 3xl figure as the academics stats. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* When the request failed we have no numbers, so the tiles show a dash.
            Rendering 0 would assert something untrue about the campus. */}
        {[
          { label: "Teachers", value: loadError ? "—" : teachers.length, icon: Users, color: "text-[#8127cf] bg-[#f3eeff]" },
          { label: "Avg Score", value: loadError ? "—" : avgAll ? `${avgAll}%` : "—", icon: BarChart3, color: rateColor(avgAll) + " " + rateBg(avgAll) },
          { label: "Total Students", value: loadError ? "—" : teachers.reduce((s, t) => s + t.totalStudents, 0), icon: GraduationCap, color: "text-[#8127cf] bg-[#f3eeff]" },
          { label: "Report Cards", value: loadError ? "—" : teachers.reduce((s, t) => s + t.reportCardsGenerated, 0), icon: BookOpen, color: "text-[#8127cf] bg-[#f3eeff]" },
        ].map((card, i) => (
          <div key={card.label} className="sk-rise rounded-[24px] bg-white border border-[#cfc2d6]/25 p-5 shadow-sm" style={{ animationDelay: `${i * 60}ms` }}>
            <div className={`h-10 w-10 rounded-2xl flex items-center justify-center ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-3xl font-black tracking-tight text-[#1f1a23]">{card.value}</p>
            <p className="mt-1 text-xs font-semibold text-ink-muted">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teachers..."
            className="h-10 w-full rounded-xl border border-[#cfc2d6]/20 bg-white pl-9 pr-3 text-sm font-semibold outline-none placeholder:text-ink-subtle focus:border-[#8127cf]/30 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)] transition-all" />
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
      ) : loadError ? (
        // A failed request is not an empty campus. Say so, and offer a retry,
        // rather than showing zeros that read as "there are no teachers".
        <div className="rounded-2xl border border-rose-200/60 bg-rose-50/50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-rose-500" />
          <p className="text-sm font-black text-[#1f1a23]">Couldn&apos;t load teacher performance</p>
          <p className="mt-1 text-xs font-semibold text-ink-muted">{loadError}</p>
          <button
            type="button"
            onClick={load}
            className="mt-4 rounded-xl bg-[#1f1a23] px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white transition-all hover:bg-[#332b38] active:scale-95"
          >
            Try again
          </button>
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
                  "bg-[#f3f4f9] text-ink-subtle"
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
                    <span className="text-[10px] font-semibold text-ink-subtle">{teacher.subjectsCount} subjects</span>
                    <span className="text-ink-subtle">|</span>
                    <span className="text-[10px] font-semibold text-ink-subtle">{teacher.classesCount} classes</span>
                    <span className="text-ink-subtle">|</span>
                    <span className="text-[10px] font-semibold text-ink-subtle">{teacher.totalStudents} students</span>
                    {teacher.ledClasses.length > 0 && (
                      <>
                        <span className="text-ink-subtle">|</span>
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
                  <p className="text-[8px] font-semibold uppercase tracking-wider text-ink-subtle mt-0.5">Avg Score</p>
                </div>

                <div className={`rounded-xl px-3 py-2 ${rateBg(teacher.passRate)}`}>
                  <p className={`text-sm font-bold ${rateColor(teacher.passRate)}`}>
                    {teacher.passRate !== null ? `${teacher.passRate}%` : "—"}
                  </p>
                  <p className="text-[8px] font-semibold uppercase tracking-wider text-ink-subtle mt-0.5">Pass Rate</p>
                </div>

                <div className={`rounded-xl px-3 py-2 ${rateBg(teacher.teacherAttendanceRate)}`}>
                  <div className="flex items-center gap-1">
                    <UserCheck className={`h-3.5 w-3.5 ${rateColor(teacher.teacherAttendanceRate)}`} />
                    <p className={`text-sm font-bold ${rateColor(teacher.teacherAttendanceRate)}`}>
                      {teacher.teacherAttendanceRate !== null ? `${teacher.teacherAttendanceRate}%` : "—"}
                    </p>
                  </div>
                  <p className="text-[8px] font-semibold uppercase tracking-wider text-ink-subtle mt-0.5">Own Attendance</p>
                </div>

                <div className={`rounded-xl px-3 py-2 ${rateBg(teacher.marksCompletionRate)}`}>
                  <p className={`text-sm font-bold ${rateColor(teacher.marksCompletionRate)}`}>
                    {teacher.marksCompletionRate !== null ? `${teacher.marksCompletionRate}%` : "—"}
                  </p>
                  <p className="text-[8px] font-semibold uppercase tracking-wider text-ink-subtle mt-0.5">Marks Entry</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
