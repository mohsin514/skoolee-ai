import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Users,
  GraduationCap,
  BookOpen,
  Brain,
  TrendingUp,
  ArrowUpRight,
  Sparkles,
  Check,
  Lock,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await getAuthUser();
  if (!session) redirect("/login");

  const campusWhere: any =
    session.role === "SUPER_ADMIN" && !session.campusId
      ? { campus: { schoolId: session.schoolId } }
      : { campusId: session.campusId || "", campus: { schoolId: session.schoolId } };

  const [school, totalStudents, totalClasses, totalSubjects, recentExams, topMarkGroups] = await Promise.all([
    prisma.school.findUnique({ where: { id: session.schoolId } }),
    prisma.student.count({ where: campusWhere }),
    prisma.class.count({ where: campusWhere }),
    prisma.subject.count({ where: campusWhere }),
    prisma.exam.findMany({
      where: campusWhere,
      include: { class: { select: { name: true, section: true } }, _count: { select: { marks: true } } },
      orderBy: [{ academicYear: "desc" }, { title: "asc" }],
      take: 5,
    }),
    prisma.mark.groupBy({
      by: ["studentId"],
      where: campusWhere,
      _avg: { marksObtained: true },
      _count: { marksObtained: true },
      orderBy: { _avg: { marksObtained: "desc" } },
      take: 5,
    }),
  ]);

  if (school?.status === "SUSPENDED") {
    redirect("/subscription-suspended");
  }

  const topStudents = topMarkGroups.length
    ? await prisma.student.findMany({
        where: { id: { in: topMarkGroups.map((group) => group.studentId) }, ...campusWhere },
        select: { id: true, fullName: true, rollNo: true, class: { select: { name: true, section: true } } },
      })
    : [];
  const studentById = new Map(topStudents.map((student) => [student.id, student]));

  const setupSteps = [
    { label: "Create classes", href: "/dashboard/classes", done: totalClasses > 0 },
    { label: "Add students", href: "/dashboard/students", done: totalStudents > 0 },
    { label: "Assign subjects", href: "/dashboard/classes", done: totalSubjects > 0 },
  ];
  const setupDone = setupSteps.filter((step) => step.done).length;

  const stats = [
    {
      title: "Total students",
      value: totalStudents,
      icon: Users,
      color: "text-blue-600 bg-blue-500/10",
    },
    {
      title: "Active classes",
      value: totalClasses,
      icon: GraduationCap,
      color: "text-emerald-600 bg-emerald-500/10",
    },
    {
      title: "Subjects",
      value: totalSubjects,
      icon: BookOpen,
      color: "text-violet-600 bg-violet-500/10",
    },
    {
      title: "AI credits used",
      value: `${school?.aiCreditsUsed || 0} / ${school?.aiCreditsLimit || 100}`,
      icon: Brain,
      color: "text-amber-600 bg-amber-500/10",
      info: "Each AI request uses credits from your plan's allowance.",
    },
  ] as Array<{ title: string; value: string | number; icon: typeof Users; color: string; info?: string }>;

  const creditLimit = school?.aiCreditsLimit || 100;
  const creditUsed = school?.aiCreditsUsed || 0;
  const creditPercent = creditLimit ? Math.min(Math.round((creditUsed / creditLimit) * 100), 100) : 0;
  const creditTone = creditPercent >= 90 ? "danger" : creditPercent >= 75 ? "warning" : "brand";
  const marksLink = cn(buttonVariants({ variant: "outline", size: "sm" }), "sk-nudge-trigger");

  return (
    <>
      <Header title="Dashboard" description="Overview of your school's live operational records" />

      <div className="space-y-6 p-4 sm:p-6">
        <Card variant="featured" className="sk-enter">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles aria-hidden="true" className="h-5 w-5 text-primary" />
                Complete your core setup
              </CardTitle>
              <Badge variant={setupDone === setupSteps.length ? "success" : "secondary"} dot>
                <span className="tabular-nums">{setupDone} of {setupSteps.length} done</span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="sk-stagger grid gap-3 md:grid-cols-3">
              {setupSteps.map((step, index) => (
                <li key={step.label} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-white p-3 transition-colors hover:border-primary/40">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold tabular-nums",
                        step.done ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border-subtle text-ink-muted",
                      )}
                    >
                      {step.done ? <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} /> : index + 1}
                    </span>
                    <span className="min-w-0 text-sm font-semibold text-ink-strong">
                      {step.label}
                      {step.done ? <span className="sr-only"> (done)</span> : null}
                    </span>
                  </div>
                  <Link href={step.href} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "sk-nudge-trigger shrink-0 px-3")}>
                    Open <ArrowUpRight aria-hidden="true" className="sk-nudge h-3.5 w-3.5 rtl:-scale-x-100" />
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="sk-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="group relative overflow-hidden hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-sm font-medium text-ink-muted">
                      {stat.title}
                      {stat.info ? <InfoTip content={stat.info} /> : null}
                    </p>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-ink-strong tabular-nums">{stat.value}</p>
                  </div>
                  <div className={cn("sk-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", stat.color)}>
                    <stat.icon aria-hidden="true" className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="sk-enter" style={{ "--sk-delay": "120ms" } as React.CSSProperties}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp aria-hidden="true" className="h-4 w-4 text-primary" />
                Recent exams
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentExams.length === 0 ? (
                <EmptyState
                  size="sm"
                  title="No exams yet"
                  description="Create your first exam to get started."
                  action={<Link href="/dashboard/marks" className={marksLink}>Create an exam <ArrowUpRight aria-hidden="true" className="sk-nudge h-3.5 w-3.5 rtl:-scale-x-100" /></Link>}
                />
              ) : (
                <ul className="space-y-2">
                  {recentExams.map((exam) => (
                    <li key={exam.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border-subtle p-3 transition-colors hover:bg-surface-hover">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-strong">{exam.title}</p>
                        <p className="truncate text-xs text-ink-subtle">
                          {exam.class.name} {exam.class.section || ""} · {exam.term} <span className="tabular-nums">{exam.academicYear}</span>
                        </p>
                      </div>
                      <Badge variant={exam.isLocked ? "success" : "secondary"} className="shrink-0">
                        {exam.isLocked ? <><Lock aria-hidden="true" /> Locked</> : <span className="tabular-nums">{exam._count.marks} marks</span>}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="sk-enter" style={{ "--sk-delay": "180ms" } as React.CSSProperties}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users aria-hidden="true" className="h-4 w-4 text-primary" />
                Top performing students
                <InfoTip content="Ranked by the average marks obtained across every mark entered for the student, highest first." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topMarkGroups.length === 0 ? (
                <EmptyState
                  size="sm"
                  title="No results yet"
                  description="Enter marks to see analytics."
                  action={<Link href="/dashboard/marks" className={marksLink}>Enter marks <ArrowUpRight aria-hidden="true" className="sk-nudge h-3.5 w-3.5 rtl:-scale-x-100" /></Link>}
                />
              ) : (
                <ol className="space-y-2">
                  {topMarkGroups.map((group, index) => {
                    const student = studentById.get(group.studentId);
                    return (
                      <li key={group.studentId} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border-subtle p-3 transition-colors hover:bg-surface-hover">
                        <div className="flex min-w-0 items-center gap-3">
                          <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-primary tabular-nums">{index + 1}</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink-strong">{student?.fullName || "Student"}</p>
                            <p className="truncate text-xs text-ink-subtle">
                              {student?.rollNo || ""} {student?.class?.name || ""} {student?.class?.section || ""}
                            </p>
                          </div>
                        </div>
                        <Badge variant="success" className="shrink-0 tabular-nums">{Math.round(group._avg.marksObtained || 0)} avg</Badge>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="sk-enter" style={{ "--sk-delay": "240ms" } as React.CSSProperties}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain aria-hidden="true" className="h-4 w-4 text-primary" />
              AI credit usage
              <InfoTip content="Each AI request uses credits from your plan's allowance." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress
              value={creditUsed}
              max={creditLimit}
              label="Credits used this month"
              showValue
              valueText={`${creditUsed} / ${creditLimit}`}
              tone={creditTone}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
