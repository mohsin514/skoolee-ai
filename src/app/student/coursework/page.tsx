"use client";

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useMemo } from "react";
import { Award, BookOpen, MapPin, TrendingUp, UserRound } from "lucide-react";
import { Panel, PanelHeading, StatCard } from "@/components/student/student-ui";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { StudentPage } from "@/components/student/student-page";
import { CourseworkSkeleton, StudentErrorState } from "@/components/student/student-components";
import { useStudentData } from "../student-data-context";

type ScoreTone = "success" | "warning" | "danger";
/** One threshold for every score on this page: 80+ strong, 60+ steady, below 60 needs attention. */
const scoreTone = (score: number): ScoreTone => (score >= 80 ? "success" : score >= 60 ? "warning" : "danger");

/** Exam workflow states in words a student reads; any other state shows as stored. */
const EXAM_STATUS: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  PUBLISHED: { label: "Published", variant: "success" },
  COMPLETED: { label: "Completed", variant: "success" },
  DRAFT: { label: "Draft", variant: "warning" },
};

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
        <div className="sk-rise grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4" style={{ animationDelay: "20ms" }}>
          <div className="sk-panel min-w-0 p-4 md:col-span-2">
            <div className="mb-3 flex min-w-0 items-center gap-2.5">
              <div aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                <MapPin className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="sk-eyebrow">Current Class</p>
                <p className="truncate text-base font-bold text-ink-strong">{user.className}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-border-subtle bg-surface-subtle p-3">
                <p className="sk-eyebrow">Class Teacher</p>
                <p className="mt-1.5 truncate text-sm font-semibold text-ink-strong">{user.classTeacher?.fullName || "Not assigned"}</p>
                {user.classTeacher?.email && (
                  <p dir="ltr" className="mt-0.5 truncate text-start text-xs text-ink-subtle">{user.classTeacher.email}</p>
                )}
              </div>
              <div className="min-w-0 rounded-2xl border border-border-subtle bg-surface-subtle p-3">
                <p className="sk-eyebrow">Enrolled Subjects</p>
                <p className="mt-1.5 text-sm font-semibold tabular-nums text-ink-strong">{user.subjects.length} {user.subjects.length === 1 ? "subject" : "subjects"}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                  {user.subjects?.length ? user.subjects.map((s: any) => s.name).join(", ") : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="sk-panel min-w-0 p-4">
            <div className="mb-3 flex min-w-0 items-center gap-2.5">
              <div aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <UserRound className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="sk-eyebrow">Roll Number</p>
                <p className="truncate text-base font-bold text-ink-strong">{user.rollNo || "—"}</p>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex min-w-0 justify-between gap-3">
                <dt className="shrink-0 font-medium text-ink-muted">Name</dt>
                <dd className="min-w-0 truncate font-semibold text-ink-strong">{user.fullName}</dd>
              </div>
              <div className="flex min-w-0 justify-between gap-3">
                <dt className="shrink-0 font-medium text-ink-muted">Campus</dt>
                <dd className="min-w-0 truncate font-semibold text-ink-strong">{user.campusName}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="sk-rise grid grid-cols-2 gap-3 md:grid-cols-4" style={{ animationDelay: "40ms" }}>
          <StatCard icon={BookOpen} label="Subjects" value={user.subjects.length} sub="Enrolled" />
          <StatCard
            icon={Award}
            label="Average"
            value={`${averages.overall}%`}
            sub={user.marks.length ? `From ${user.marks.length} ${user.marks.length === 1 ? "score" : "scores"}` : "No marks yet"}
            tone="green"
            ring={user.marks.length ? averages.overall : undefined}
          />
          <StatCard icon={TrendingUp} label="Best score" value={`${averages.best}%`} sub={averages.best >= 80 ? "Excellent" : averages.best >= 60 ? "Good" : "Needs work"} tone="purple" />
          <StatCard icon={BookOpen} label="Exams" value={new Set(user.marks.map((m: any) => m.exam?.id)).size} sub="Attempted" tone="rose" />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-5 xl:gap-4">
          <div className="sk-rise min-w-0 space-y-3 xl:col-span-2" style={{ animationDelay: "80ms" }}>
            <Panel>
              <PanelHeading
                icon={BookOpen}
                title="Subjects & Teachers"
                sub={`${user.subjects.length} enrolled`}
              />
              {user.subjects.length ? (
                <div className="space-y-2">
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
                <EmptyState
                  size="sm"
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
                <EmptyState
                  size="sm"
                  icon={TrendingUp}
                  title="No marks yet"
                  description="Your scores appear here once teachers publish marks for this cycle."
                />
              )}
            </Panel>
          </div>

          <div className="min-w-0 xl:col-span-3">
            <section aria-labelledby="all-marks-title" className="sk-panel sk-rise overflow-hidden" style={{ animationDelay: "200ms" }}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border-subtle px-4 py-3">
                <h2 id="all-marks-title" className="text-sm font-bold tracking-tight text-ink-strong">All Marks</h2>
                {user.marks.length > 0 && (
                  <span className="text-xs tabular-nums text-ink-subtle">
                    {user.marks.length} entr{user.marks.length === 1 ? "y" : "ies"}
                  </span>
                )}
              </div>
              {user.marks.length > 0 ? (
                <Table className="min-w-[480px]" containerClassName="rounded-none border-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead className="px-3 text-center">Score</TableHead>
                      <TableHead className="px-3 text-center">%</TableHead>
                      <TableHead className="text-end">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {user.marks.map((mark: any) => {
                      const pct = Math.round((mark.marksObtained / (mark.subject?.totalMarks || 100)) * 100);
                      const status = mark.exam?.status ? EXAM_STATUS[mark.exam.status] : undefined;
                      return (
                        <TableRow key={mark.id}>
                          <TableCell className="px-4 py-3">
                            <p className="text-sm font-semibold text-ink-strong">{mark.subject?.name}</p>
                            <p className="mt-0.5 text-xs text-ink-subtle">
                              {mark.exam?.title || "Exam"}
                            </p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-3 text-center tabular-nums">
                            <span className="text-sm font-bold text-ink-strong">{mark.marksObtained}</span>
                            <span className="text-xs text-ink-subtle"> / {mark.subject?.totalMarks || 100}</span>
                          </TableCell>
                          <TableCell className="px-3 py-3 text-center">
                            <Badge variant={scoreTone(pct)} size="sm" className="tabular-nums">
                              {pct}%
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-end">
                            <Badge variant={status?.variant ?? "secondary"} size="sm" dot>
                              {status?.label ?? (mark.exam?.status || "Entered")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  size="sm"
                  icon={BookOpen}
                  title="No marks recorded yet"
                  description="Marks appear here as teachers publish each exam."
                />
              )}
            </section>
          </div>
        </div>
      </div>
    </StudentPage>
  );
}


const SCORE_TEXT: Record<ScoreTone, string> = { success: "text-emerald-700", warning: "text-amber-700", danger: "text-rose-700" };

function SubjectCard({ name, teacher, totalMarks, score }: { name: string; teacher: string; totalMarks: number; score: number | null }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-subtle px-3 py-3 transition-colors duration-200 hover:border-border-subtle-hover hover:bg-white sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-strong">{name}</p>
        <p className="mt-0.5 truncate text-xs text-ink-subtle">{teacher}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {score !== null && (
          <span className={`text-sm font-bold tabular-nums ${SCORE_TEXT[scoreTone(score)]}`}>
            {score}%
          </span>
        )}
        <Badge variant="outline" size="sm" className="tabular-nums">
          {totalMarks} marks
        </Badge>
      </div>
    </div>
  );
}

function PerfBar({ label, exam, score }: { label: string; exam?: string; score: number }) {
  // Colour by the score, not by the row's position in the list: the old
  // index % 3 cycle could paint a 95% rose and a 40% indigo.
  const tone = scoreTone(score);

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-semibold text-ink-strong">
          {label}
          {exam ? <span className="ms-1.5 text-xs font-normal text-ink-subtle">{exam}</span> : null}
        </span>
        <span className={`shrink-0 text-xs font-bold tabular-nums ${SCORE_TEXT[tone]}`}>{score}%</span>
      </div>
      <Progress value={score} label={exam ? `${label} · ${exam}` : label} tone={tone} />
    </div>
  );
}

