"use client";

import { useMemo } from "react";
import { Award, BookOpen, MapPin, TrendingUp, UserRound } from "lucide-react";
import { Panel, PanelHeading, StatCard, StudentEmptyState } from "@/components/student/student-ui";
import { cn } from "@/lib/utils";
import { StudentPage } from "@/components/student/student-page";
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
    <StudentPage
      tone="classes"
      icon={BookOpen}
      eyebrow={<>{`${user.subjects.length} subjects enrolled`}</>}
      title="Coursework & Performance"
      summary="Your subjects, teachers, and academic progress."
    >
      <div className="space-y-3">
        {/* Moved here when the duplicate "Schedule" page was retired — this is
            the natural home for class and enrolment details. */}
        <div className="sk-rise grid grid-cols-1 md:grid-cols-3 gap-4" style={{ animationDelay: "20ms" }}>
          <div className="md:col-span-2 rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf]">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Current Class</p>
                <p className="text-base font-black text-[#1d1b20]">{user.className}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/30 p-3">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Class Teacher</p>
                <p className="mt-1.5 text-sm font-bold text-[#1d1b20]">{user.classTeacher?.fullName || "Not assigned"}</p>
                {user.classTeacher?.email && (
                  <p className="mt-0.5 text-[10px] font-semibold text-ink-subtle">{user.classTeacher.email}</p>
                )}
              </div>
              <div className="rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/30 p-3">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Enrolled Subjects</p>
                <p className="mt-1.5 text-sm font-bold text-[#1d1b20]">{user.subjects.length} subjects</p>
                <p className="mt-0.5 text-[10px] font-semibold text-ink-subtle line-clamp-2">
                  {user.subjects?.length ? user.subjects.map((s: any) => s.name).join(", ") : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <UserRound className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Roll Number</p>
                <p className="text-base font-black text-[#1d1b20]">{user.rollNo || "N/A"}</p>
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

        <div className="sk-rise grid grid-cols-2 gap-3 md:grid-cols-4" style={{ animationDelay: "40ms" }}>
          <StatCard icon={BookOpen} label="Subjects" value={user.subjects.length} sub="Enrolled" />
          <StatCard
            icon={Award}
            label="Average"
            value={`${averages.overall}%`}
            sub={user.marks.length ? `From ${user.marks.length} scores` : "No data"}
            tone="green"
            ring={user.marks.length ? averages.overall : undefined}
          />
          <StatCard icon={TrendingUp} label="Best score" value={`${averages.best}%`} sub={averages.best >= 80 ? "Excellent" : averages.best >= 60 ? "Good" : "Needs work"} tone="purple" />
          <StatCard icon={BookOpen} label="Exams" value={new Set(user.marks.map((m: any) => m.exam?.id)).size} sub="Attempted" tone="rose" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="sk-rise xl:col-span-2 space-y-3" style={{ animationDelay: "80ms" }}>
            <Panel>
              <PanelHeading
                icon={BookOpen}
                title="Subjects & Teachers"
                sub={`${user.subjects.length} enrolled`}
              />
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
                <StudentEmptyState
                  icon={BookOpen}
                  title="No subjects yet"
                  description="Subjects appear here once the office adds them to your section."
                />
              )}
            </Panel>

            <Panel>
              <PanelHeading
                icon={TrendingUp}
                title="Academic Performance"
                sub="Your five most recent scores"
                tone="green"
              />
              {user.marks.length > 0 ? (
                <div className="space-y-4">
                  {user.marks.slice(0, 5).map((mark: any) => (
                    <PerfBar
                      key={mark.id}
                      label={mark.subject?.name || "Subject"}
                      exam={mark.exam?.title}
                      score={Math.round((mark.marksObtained / (mark.subject?.totalMarks || 100)) * 100)}
                    />
                  ))}
                </div>
              ) : (
                <StudentEmptyState
                  icon={TrendingUp}
                  title="No marks yet"
                  description="Your scores appear here once teachers publish marks for this cycle."
                />
              )}
            </Panel>
          </div>

          <div className="xl:col-span-3">
            <div className="sk-rise overflow-hidden rounded-[22px] border border-[#cfc2d6]/20 bg-white shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)]" style={{ animationDelay: "200ms" }}>
              <div className="flex items-center justify-between gap-3 border-b border-[#cfc2d6]/10 px-4 py-3">
                <h3 className="text-sm font-black tracking-tight text-[#1d1b20]">All Marks</h3>
                {user.marks.length > 0 && (
                  <span className="text-[10px] font-semibold text-ink-subtle">
                    {user.marks.length} entr{user.marks.length === 1 ? "y" : "ies"}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto"><table className="w-full text-left min-w-[480px]">
                <thead>
                  <tr className="bg-[#fbf0fe]/30 text-[9px] font-semibold text-ink-subtle uppercase tracking-wider border-b border-[#cfc2d6]/10">
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-3 py-3 text-center">Score</th>
                    <th className="px-3 py-3 text-center">%</th>
                    <th className="px-4 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#cfc2d6]/10">
                  {user.marks.length > 0 ? (
                    user.marks.map((mark: any) => {
                      const pct = Math.round((mark.marksObtained / (mark.subject?.totalMarks || 100)) * 100);
                      return (
                        <tr key={mark.id} className="group transition-all duration-200 hover:bg-[#fbf0fe]/40 hover:shadow-sm cursor-default">
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{mark.subject?.name}</p>
                            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">
                              {mark.exam?.title || "Exam"}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="text-sm font-bold text-[#1d1b20]">{mark.marksObtained}</span>
                            <span className="text-[10px] text-ink-subtle"> / {mark.subject?.totalMarks || 100}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={cn(
                              "inline-flex text-xs font-bold px-2.5 py-1 rounded-lg",
                              pct >= 80 ? "bg-emerald-50 text-emerald-600" :
                              pct >= 60 ? "bg-amber-50 text-amber-600" :
                              "bg-rose-50 text-rose-600"
                            )}>
                              {pct}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={cn(
                              "rounded-lg px-3 py-1 text-[9px] font-semibold uppercase tracking-wider",
                              mark.exam?.status === "PUBLISHED" || mark.exam?.status === "COMPLETED"
                                ? "bg-emerald-50 text-emerald-600"
                                : mark.exam?.status === "DRAFT"
                                  ? "bg-amber-50 text-amber-600"
                                  : "bg-[#fbf0fe] text-[#8127cf]",
                            )}>
                              {mark.exam?.status || "Entered"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center">
                        <BookOpen className="mx-auto mb-3 h-8 w-8 text-[#8127cf]/40" />
                        <p className="text-sm font-black tracking-tight text-[#1d1b20]">No marks recorded yet</p>
                        <p className="mt-1 text-xs font-semibold text-ink-muted">
                          Marks appear here as teachers publish each exam.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table></div>
            </div>
          </div>
        </div>
      </div>
    </StudentPage>
  );
}


function SubjectCard({ name, teacher, totalMarks, score }: { name: string; teacher: string; totalMarks: number; score: number | null }) {
  return (
    <div className="group relative rounded-2xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#8127cf]/20 hover:shadow-xl hover:bg-white">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{name}</p>
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

function PerfBar({ label, exam, score }: { label: string; exam?: string; score: number }) {
  // Colour by the score, not by the row's position in the list: the old
  // index % 3 cycle could paint a 95% rose and a 40% indigo.
  const bar = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-rose-500";
  const text = score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-rose-600";

  return (
    <div className="group transition-all duration-200 hover:-translate-y-0.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-xs font-semibold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">
          {label}
          {exam ? <span className="ml-1.5 font-medium text-ink-subtle">{exam}</span> : null}
        </span>
        <span className={`shrink-0 text-[10px] font-black tabular-nums ${text}`}>{score}%</span>
      </div>
      <div className="h-3 w-full bg-[#f3f4f9] rounded-full overflow-hidden p-0.5 border border-[#cfc2d6]/10 transition-all group-hover:shadow-md">
        <div
          className={`h-full ${bar} rounded-full transition-all duration-700`}
          style={{ width: `${Math.max(0, Math.min(score, 100))}%` }}
        />
      </div>
    </div>
  );
}

