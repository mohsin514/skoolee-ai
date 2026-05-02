import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import {
  Users,
  GraduationCap,
  BookOpen,
  Brain,
  TrendingUp,
  ArrowUpRight,
  Sparkles,
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
    { label: "1. Create Classes", href: "/dashboard/classes", done: totalClasses > 0 },
    { label: "2. Add Students", href: "/dashboard/students", done: totalStudents > 0 },
    { label: "3. Assign Subjects", href: "/dashboard/classes", done: totalSubjects > 0 },
  ];

  const stats = [
    {
      title: "Total Students",
      value: totalStudents,
      icon: Users,
      color: "text-blue-600 bg-blue-500/10",
    },
    {
      title: "Active Classes",
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
      title: "AI Credits Used",
      value: `${school?.aiCreditsUsed || 0} / ${school?.aiCreditsLimit || 100}`,
      icon: Brain,
      color: "text-amber-600 bg-amber-500/10",
    },
  ];

  const creditLimit = school?.aiCreditsLimit || 100;
  const creditUsed = school?.aiCreditsUsed || 0;
  const creditPercent = creditLimit ? Math.min(Math.round((creditUsed / creditLimit) * 100), 100) : 0;

  return (
    <>
      <Header title="Dashboard" description="Overview of your school's live operational records" />

      <div className="p-6 space-y-8">
        <Card className="border-primary/20 bg-primary/5 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Complete your core setup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {setupSteps.map((step, index) => (
                <div key={step.label} className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 border border-sidebar-border rounded-lg group hover:border-primary/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${step.done ? "border-emerald-500 text-emerald-600" : "border-muted text-muted-foreground"}`}>
                      {step.done ? "OK" : index + 1}
                    </div>
                    <span className="text-sm font-medium">{step.label}</span>
                  </div>
                  <Link href={step.href}>
                    <Button variant="ghost" size="sm" className="h-8 px-2">
                      Open <ArrowUpRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="relative overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                    <p className="mt-2 text-2xl font-bold">{stat.value}</p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Recent Exams
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentExams.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
                  No exams yet. Create your first exam to get started.
                </div>
              ) : (
                <div className="space-y-3">
                  {recentExams.map((exam) => (
                    <div key={exam.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <p className="font-medium">{exam.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {exam.class.name} {exam.class.section || ""} - {exam.term} {exam.academicYear}
                        </p>
                      </div>
                      <Badge variant={exam.isLocked ? "success" : "secondary"}>
                        {exam.isLocked ? "Locked" : `${exam._count.marks} marks`}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Top Performing Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topMarkGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
                  No results yet. Enter marks to see analytics.
                </div>
              ) : (
                <div className="space-y-3">
                  {topMarkGroups.map((group) => {
                    const student = studentById.get(group.studentId);
                    return (
                      <div key={group.studentId} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div>
                          <p className="font-medium">{student?.fullName || "Student"}</p>
                          <p className="text-xs text-muted-foreground">
                            {student?.rollNo || ""} {student?.class?.name || ""} {student?.class?.section || ""}
                          </p>
                        </div>
                        <Badge variant="success">{Math.round(group._avg.marksObtained || 0)} avg</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              AI Credit Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Credits used this month</span>
                <span className="font-medium">{creditUsed} / {creditLimit}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500 transition-all duration-500" style={{ width: `${creditPercent}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
