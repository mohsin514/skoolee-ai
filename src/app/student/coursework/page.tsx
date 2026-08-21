"use client";

import { useMemo } from "react";
import { Award, BookOpen, ChevronRight, MapPin, TrendingUp, UserRound } from "lucide-react";
import { CourseworkSkeleton, StudentErrorState } from "@/components/student/student-components";
import { useStudentData } from "../student-data-context";

export default function CourseworkPage() {
  const { data, loading, error, refetch } = useStudentData();

  const averages = useMemo(() => {
    if (!data?.user?.marks) return { overall: 0, best: 0, worst: 0 };
    const scores = data.user.marks.map((m: any) => Math.round((m.marksObtained / (m.subject?.totalMarks || 100)) * 100));
    return {
      overall: scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0,
      best: scores.length ? Math.max(...scores) : 0,
      worst: scores.length ? Math.min(...scores) : 0,
    };
  }, [data]);

  if (loading && !data) return <CourseworkSkeleton />;
  if (error) return <StudentErrorState error={error} onRetry={refetch} />;
  if (!data || !data.user) return null;
  const user = data.user;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <BookOpen className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">{user.subjects.length} subjects enrolled</span>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Coursework & Performance</h2>
          <p className="mt-1 text-sm font-semibold text-ink-muted">Your subjects, teachers, and academic progress.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        {/* Moved here when the duplicate "Schedule" page was retired — this is
            the natural home for class and enrolment details. */}
        <div className="sk-rise grid grid-cols-1 md:grid-cols-3 gap-4" style={{ animationDelay: "20ms" }}>
          <div className="md:col-span-2 rounded-[28px] bg-white border border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Current Class</p>
                <p className="text-lg font-bold text-[#1d1b20]">{user.className}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-[#fbf0fe]/30 p-4 border border-[#cfc2d6]/8">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Class Teacher</p>
                <p className="mt-1.5 text-sm font-bold text-[#1d1b20]">{user.classTeacher?.fullName || "Not assigned"}</p>
                {user.classTeacher?.email && (
                  <p className="mt-0.5 text-[10px] font-semibold text-ink-subtle">{user.classTeacher.email}</p>
                )}
              </div>
              <div className="rounded-2xl bg-[#fbf0fe]/30 p-4 border border-[#cfc2d6]/8">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Enrolled Subjects</p>
                <p className="mt-1.5 text-sm font-bold text-[#1d1b20]">{user.subjects.length} subjects</p>
                <p className="mt-0.5 text-[10px] font-semibold text-ink-subtle line-clamp-2">
                  {user.subjects?.length ? user.subjects.map((s: any) => s.name).join(", ") : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] bg-white border border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <UserRound className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Roll Number</p>
                <p className="text-lg font-bold text-[#1d1b20]">{user.rollNo || "N/A"}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-semibold text-ink-muted">Name</span>
                <span className="font-bold text-[#1d1b20] truncate">{user.fullName}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-semibold text-ink-muted">Campus</span>
                <span className="font-bold text-[#1d1b20] truncate">{user.campusName}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="sk-rise grid grid-cols-2 md:grid-cols-4 gap-4" style={{ animationDelay: "40ms" }}>
          <SummaryCard icon={BookOpen} label="Subjects" value={user.subjects.length} sub="Enrolled" />
          <SummaryCard icon={Award} label="Average" value={`${averages.overall}%`} sub={user.marks.length ? `From ${user.marks.length} scores` : "No data"} tone="green" />
          <SummaryCard icon={TrendingUp} label="Best Score" value={`${averages.best}%`} sub={averages.best >= 80 ? "Excellent" : averages.best >= 60 ? "Good" : "Needs work"} tone="purple" />
          <SummaryCard icon={BookOpen} label="Exams" value={new Set(user.marks.map((m: any) => m.exam?.id)).size} sub="Attempted" tone="rose" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
          <div className="sk-rise xl:col-span-2 space-y-6" style={{ animationDelay: "80ms" }}>
            <div>
              <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight mb-4">Subjects & Teachers</h3>
              {user.subjects.length ? (
                <div className="space-y-3">
                  {user.subjects.map((subject: any) => {
                    const mark = user.marks.find((m: any) => m.subject?.id === subject.id);
                    const score = mark ? Math.round((mark.marksObtained / (mark.subject?.totalMarks || 100)) * 100) : null;
                    return (
                      <SubjectCard
                        key={subject.id}
                        name={subject.name}
                        teacher={subject.teacher?.fullName || user.classTeacher?.fullName || "Teacher pending"}
                        totalMarks={subject.totalMarks || 100}
                        score={score}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs font-semibold text-ink-subtle italic">Subjects will appear after admin adds them to this section.</p>
              )}
            </div>

            <div>
              <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight mb-4">Academic Performance</h3>
              {user.marks.length > 0 ? (
                <div className="space-y-4">
                  {user.marks.slice(0, 5).map((mark: any, index: number) => (
                    <PerfBar
                      key={mark.id}
                      label={mark.subject?.name || "Subject"}
                      score={Math.round((mark.marksObtained / (mark.subject?.totalMarks || 100)) * 100)}
                      color={index % 3 === 0 ? "indigo" : index % 3 === 1 ? "rose" : "amber"}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs font-semibold text-ink-subtle italic">No marks recorded in current cycle.</p>
              )}
            </div>
          </div>

          <div className="xl:col-span-3">
            <div className="sk-rise bg-white border border-[#cfc2d6]/25 rounded-[32px] overflow-hidden shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: "200ms" }}>
              <div className="sticky top-0 bg-white z-10 border-b border-[#cfc2d6]/10">
                <div className="px-6 py-4 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#1d1b20] tracking-tight">All Marks</h3>
                  {user.marks.length > 0 && (
                    <span className="text-[10px] font-semibold text-ink-subtle">{user.marks.length} entries</span>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-left min-w-[480px]">
                <thead>
                  <tr className="bg-[#fbf0fe]/30 text-[9px] font-semibold text-ink-subtle uppercase tracking-wider border-b border-[#cfc2d6]/10">
                    <th className="px-6 py-3.5">Subject</th>
                    <th className="px-3 py-3.5 text-center">Score</th>
                    <th className="px-3 py-3.5 text-center">%</th>
                    <th className="px-6 py-3.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#cfc2d6]/10">
                  {user.marks.length > 0 ? (
                    user.marks.map((mark: any) => {
                      const pct = Math.round((mark.marksObtained / (mark.subject?.totalMarks || 100)) * 100);
                      return (
                        <tr key={mark.id} className="group transition-all duration-200 hover:bg-[#fbf0fe]/40 hover:shadow-sm cursor-default">
                          <td className="px-6 py-3.5">
                            <p className="text-sm font-semibold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{mark.subject?.name}</p>
                            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">
                              {mark.exam?.title || "Exam"}
                            </p>
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            <span className="text-sm font-bold text-[#1d1b20]">{mark.marksObtained}</span>
                            <span className="text-[10px] text-ink-subtle"> / {mark.subject?.totalMarks || 100}</span>
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            <span className={cn(
                              "inline-flex text-xs font-bold px-2.5 py-1 rounded-lg",
                              pct >= 80 ? "bg-emerald-50 text-emerald-600" :
                              pct >= 60 ? "bg-amber-50 text-amber-600" :
                              "bg-rose-50 text-rose-600"
                            )}>
                              {pct}%
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-semibold uppercase tracking-wider transition-all group-hover:bg-emerald-100 group-hover:shadow-sm">
                              {mark.exam?.status || "Entered"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center">
                        <BookOpen className="w-8 h-8 text-ink-subtle mx-auto mb-3" />
                        <p className="text-sm font-semibold text-ink-subtle">No marks recorded yet.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, tone = "dark" }: { icon: any; label: string; value: string | number; sub: string; tone?: string }) {
  const toneMap: Record<string, string> = {
    dark: "from-[#1d1b20] to-[#2d2833] text-white group-hover:shadow-black/20",
    green: "from-emerald-600 to-emerald-500 text-white group-hover:shadow-emerald-500/20",
    purple: "from-[#8127cf] to-[#9c48ea] text-white group-hover:shadow-[#8127cf]/20",
    rose: "from-rose-600 to-rose-500 text-white group-hover:shadow-rose-500/20",
  };

  return (
    <div className="group relative rounded-[28px] bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25">
      <div className="relative flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold text-ink-subtle uppercase tracking-wider transition-colors group-hover:text-ink-muted">{label}</p>
        <div className="relative">
          <div className="absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[#8127cf]/18" />
          <div className="relative h-9 w-9 rounded-xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf] transition-all duration-300 group-hover:bg-[#8127cf] group-hover:text-white group-hover:shadow-lg group-hover:scale-110">
            <Icon className="w-[18px] h-[18px]" />
          </div>
        </div>
      </div>
      <p className="text-2xl font-bold text-[#1d1b20] leading-none transition-colors group-hover:text-[#8127cf]">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-ink-subtle">{sub}</p>
    </div>
  );
}

function SubjectCard({ name, teacher, totalMarks, score }: { name: string; teacher: string; totalMarks: number; score: number | null }) {
  return (
    <div className="group relative rounded-2xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#8127cf]/20 hover:shadow-xl hover:bg-white">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{name}</p>
            <ChevronRight className="h-3.5 w-3.5 text-ink-subtle transition-all group-hover:text-[#8127cf] group-hover:translate-x-0.5" />
          </div>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">{teacher}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {score !== null && (
            <span className={cn(
              "text-sm font-bold",
              score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-rose-600"
            )}>
              {score}%
            </span>
          )}
          <span className="rounded-full bg-white border border-[#cfc2d6]/10 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#8127cf] transition-all group-hover:bg-[#8127cf] group-hover:text-white group-hover:border-transparent group-hover:shadow-md">
            {totalMarks} marks
          </span>
        </div>
      </div>
    </div>
  );
}

function PerfBar({ label, score, color }: { label: string; score: number; color: "indigo" | "rose" | "amber" }) {
  const colorMap = { indigo: "bg-indigo-500", rose: "bg-rose-500", amber: "bg-amber-500" };

  return (
    <div className="group transition-all duration-200 hover:-translate-y-0.5">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-semibold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{label}</span>
        <span className="text-[10px] font-bold text-ink-subtle transition-colors group-hover:text-ink-muted">{score}%</span>
      </div>
      <div className="h-3 w-full bg-[#f3f4f9] rounded-full overflow-hidden p-0.5 border border-[#cfc2d6]/10 transition-all group-hover:shadow-md">
        <div
          className={`h-full ${colorMap[color]} rounded-full transition-all duration-700`}
          style={{ width: `${Math.max(0, Math.min(score, 100))}%` }}
        />
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
