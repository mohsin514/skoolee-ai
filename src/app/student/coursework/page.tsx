"use client";

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useMemo } from "react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Award, BookOpen, MapPin, TrendingUp, UserRound } from "lucide-react";
import { Panel, PanelHeading, StatCard } from "@/components/student/student-ui";
import { DeskStats } from "@/components/ui/desk";
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
  const ui = useUiText();
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
      icon={BookOpen}
      title="My class & subjects"
      description="Your class, subjects and teachers, with every mark you have received."
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
                <p className="sk-eyebrow">{ui("Current class")}</p>
                <p className="truncate text-base font-bold text-ink-strong"><bdi>{user.className}</bdi></p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-border-subtle bg-surface-subtle p-3">
                <p className="sk-eyebrow">{ui("Class teacher")}</p>
                <p className="mt-1.5 truncate text-sm font-semibold text-ink-strong">{user.classTeacher?.fullName ? <bdi>{user.classTeacher.fullName}</bdi> : ui("Not assigned")}</p>
                {user.classTeacher?.email && (
                  <p dir="ltr" className="mt-0.5 truncate text-start text-xs text-ink-subtle">{user.classTeacher.email}</p>
                )}
              </div>
              <div className="min-w-0 rounded-2xl border border-border-subtle bg-surface-subtle p-3">
                <p className="sk-eyebrow">{ui("Enrolled subjects")}</p>
                <p className="mt-1.5 text-sm font-semibold tabular-nums text-ink-strong">{user.subjects.length === 1 ? ui("1 subject") : ui("{0} subjects", [user.subjects.length])}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                  {user.subjects?.length ? user.subjects.map((s: any) => s.name).join(", ") : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="sk-panel min-w-0 p-4">
            <div className="mb-3 flex min-w-0 items-center gap-2.5">
              <div aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-status-success-surface text-status-success-text">
                <UserRound className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="sk-eyebrow">{ui("Roll number")}</p>
                <p className="truncate text-base font-bold text-ink-strong"><bdi>{user.rollNo || "—"}</bdi></p>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex min-w-0 justify-between gap-3">
                <dt className="shrink-0 font-medium text-ink-muted">{ui("Name")}</dt>
                <dd className="min-w-0 truncate font-semibold text-ink-strong"><bdi>{user.fullName}</bdi></dd>
              </div>
              <div className="flex min-w-0 justify-between gap-3">
                <dt className="shrink-0 font-medium text-ink-muted">{ui("Campus")}</dt>
                <dd className="min-w-0 truncate font-semibold text-ink-strong"><bdi>{user.campusName}</bdi></dd>
              </div>
            </dl>
          </div>
        </div>

        <DeskStats>
          <StatCard icon={BookOpen} label={ui("Subjects")} value={user.subjects.length} sub={ui("Enrolled")} />
          <StatCard
            icon={Award}
            label={ui("Average")}
            value={`${averages.overall}%`}
            sub={user.marks.length ? ui("From {0} scores", [user.marks.length]) : ui("No marks yet")}
            tone="green"
            ring={user.marks.length ? averages.overall : undefined}
            delay={40}
          />
          <StatCard icon={TrendingUp} label={ui("Best score")} value={`${averages.best}%`} sub={averages.best >= 80 ? ui("Excellent") : averages.best >= 60 ? ui("Good") : ui("Needs work")} tone="purple" delay={80} />
          <StatCard icon={BookOpen} label={ui("Exams")} value={new Set(user.marks.map((m: any) => m.exam?.id)).size} sub={ui("Attempted")} tone="rose" delay={120} />
        </DeskStats>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-5 xl:gap-4">
          <div className="sk-rise min-w-0 space-y-3 xl:col-span-2" style={{ animationDelay: "80ms" }}>
            <Panel>
              <PanelHeading
                icon={BookOpen}
                title={ui("Subjects & teachers")}
                sub={ui("{0} enrolled", [user.subjects.length])}
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
                        teacher={subject.teacher?.fullName || user.classTeacher?.fullName || ui("Teacher pending")}
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
                  title={ui("No subjects yet")}
                  description={ui("Subjects appear here once the office adds them to your section.")}
                />
              )}
            </Panel>

            <Panel>
              <PanelHeading
                icon={TrendingUp}
                title={ui("Recent scores")}
                sub={ui("Your five most recent scores")}
                tone="green"
              />
              {user.marks.length > 0 ? (
                <div className="space-y-4">
                  {user.marks.slice(0, 5).map((mark: any) => (
                    <PerfBar
                      key={mark.id}
                      label={mark.subject?.name || ui("Subject")}
                      exam={mark.exam?.title}
                      score={Math.round((mark.marksObtained / (mark.subject?.totalMarks || 100)) * 100)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  size="sm"
                  icon={TrendingUp}
                  title={ui("No marks yet")}
                  description={ui("Your scores appear here once teachers publish marks for this cycle.")}
                />
              )}
            </Panel>
          </div>

          <div className="min-w-0 xl:col-span-3">
            <section aria-labelledby="all-marks-title" className="sk-panel sk-rise overflow-hidden" style={{ animationDelay: "200ms" }}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border-subtle px-4 py-3">
                <h2 id="all-marks-title" className="text-sm font-bold tracking-tight text-ink-strong">{ui("All marks")}</h2>
                {user.marks.length > 0 && (
                  <span className="text-xs tabular-nums text-ink-subtle">
                    {ui("{0} entries", [user.marks.length])}
                  </span>
                )}
              </div>
              {user.marks.length > 0 ? (
                <Table className="min-w-[480px]" containerClassName="rounded-none border-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{ui("Subject")}</TableHead>
                      <TableHead className="px-3 text-center">{ui("Score")}</TableHead>
                      <TableHead className="px-3 text-center">%</TableHead>
                      <TableHead className="text-end">{ui("Status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {user.marks.map((mark: any) => {
                      const pct = Math.round((mark.marksObtained / (mark.subject?.totalMarks || 100)) * 100);
                      const status = mark.exam?.status ? EXAM_STATUS[mark.exam.status] : undefined;
                      return (
                        <TableRow key={mark.id}>
                          <TableCell className="px-4 py-3">
                            <p className="text-sm font-semibold text-ink-strong"><bdi>{mark.subject?.name}</bdi></p>
                            <p className="mt-0.5 text-xs text-ink-subtle">
                              {mark.exam?.title ? <bdi>{mark.exam.title}</bdi> : ui("Exam")}
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
                              {ui(status?.label ?? "Entered")}
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
                  title={ui("No marks recorded yet")}
                  description={ui("Marks appear here as teachers publish each exam.")}
                />
              )}
            </section>
          </div>
        </div>
      </div>
    </StudentPage>
  );
}


const SCORE_TEXT: Record<ScoreTone, string> = { success: "text-status-success-text", warning: "text-status-warning-text", danger: "text-status-error-text" };

function SubjectCard({ name, teacher, totalMarks, score }: { name: string; teacher: string; totalMarks: number; score: number | null }) {
  const ui = useUiText();
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-subtle px-3 py-3 transition-colors duration-200 hover:border-border-subtle-hover hover:bg-card sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-strong"><bdi>{name}</bdi></p>
        <p className="mt-0.5 truncate text-xs text-ink-subtle"><bdi>{teacher}</bdi></p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {score !== null && (
          <span className={`text-sm font-bold tabular-nums ${SCORE_TEXT[scoreTone(score)]}`}>
            {score}%
          </span>
        )}
        <Badge variant="outline" size="sm" className="tabular-nums">
          {ui("{0} marks", [totalMarks])}
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
          <bdi>{label}</bdi>
          {exam ? <bdi className="ms-1.5 text-xs font-normal text-ink-subtle">{exam}</bdi> : null}
        </span>
        <span className={`shrink-0 text-xs font-bold tabular-nums ${SCORE_TEXT[tone]}`}>{score}%</span>
      </div>
      <Progress value={score} label={exam ? `${label} · ${exam}` : label} tone={tone} />
    </div>
  );
}

