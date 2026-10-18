"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, InfoTip } from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import { CalendarCheck, FileText, GraduationCap, Star, Users } from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import {
  classLabel, DashboardSkeleton, TeacherErrorState,
} from "@/components/teacher/teacher-components";
import { cn } from "@/lib/utils";
import { useTeacherData } from "../teacher-data-context";

export default function TeacherClassesPage() {
  const router = useRouter();
  const { data, loading, error, refetch } = useTeacherData();

  if (loading && !data) return <DashboardSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={refetch} />;

  const classHubs = data?.classHubs || [];

  return (
    <TeacherPage
      tone="classes"
      icon={GraduationCap}
      eyebrow="My Teaching Load"
      title="My Classes"
      summary="Every class assigned to you, with students and pending work"
    >
      <div className="space-y-3">
        {classHubs.length === 0 ? (
          <div className="sk-panel sk-enter">
            <EmptyState
              icon={GraduationCap}
              title="No classes assigned yet"
              description="Your classes appear here as soon as a school administrator assigns them to you. If you expected to see a class, ask your administrator to check your teaching assignments."
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-ink-strong">Assigned classes</h2>
              <Badge variant="neutral" size="sm" data-numeric>{classHubs.length} active</Badge>
            </div>
            <div className="sk-stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {classHubs.map((cls: any) => {
                const clsStudents = (data.students || []).filter((s: any) => s.class?.id === cls.id);
                const clsExams = (data.activeExams || []).filter((e: any) => e.classId === cls.id);
                const clsMissingMarks = clsExams.reduce((sum: number, e: any) => sum + (e.missingMarks || 0), 0);
                return (
                  <div key={cls.id} className="sk-panel sk-hover-lift group min-w-0 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="sk-eyebrow text-primary">{cls.role || "Teacher"}</p>
                        <h3 className="mt-0.5 truncate text-base font-bold tracking-tight text-ink-strong transition-colors group-hover:text-primary">{classLabel(cls)}</h3>
                      </div>
                      <div aria-hidden="true" className="sk-icon-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mb-3 grid grid-cols-3 gap-1.5">
                      <div className="rounded-xl bg-brand-50/70 px-2 py-1.5 text-center">
                        <p className="text-base font-bold tabular-nums text-primary">{clsStudents.length}</p>
                        <p className="truncate text-2xs font-semibold uppercase tracking-wider text-ink-subtle">Students</p>
                      </div>
                      <div className="rounded-xl bg-brand-50/70 px-2 py-1.5 text-center">
                        <p className="text-base font-bold tabular-nums text-ink-strong">{cls.subjects?.length || 0}</p>
                        <p className="truncate text-2xs font-semibold uppercase tracking-wider text-ink-subtle">Subjects</p>
                      </div>
                      <div className="rounded-xl bg-brand-50/70 px-2 py-1.5 text-center">
                        <p className={cn("text-base font-bold tabular-nums", clsMissingMarks > 0 ? "text-rose-600" : "text-emerald-600")}>{clsMissingMarks}</p>
                        <p className="inline-flex max-w-full items-center justify-center gap-0.5 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
                          <span className="truncate">Pending</span>
                          <InfoTip label="About pending marks" content="Marks not yet entered for this class's active assessments, added up across every assessment." />
                        </p>
                      </div>
                    </div>
                    {(cls.subjects?.length || 0) > 0 ? (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {(cls.subjects || []).slice(0, 4).map((subject: any) => (
                          <Badge key={subject.id} variant="secondary" size="sm" className="max-w-[12rem]"><span className="truncate">{subject.name}</span></Badge>
                        ))}
                        {(cls.subjects?.length || 0) > 4 && (
                          <Badge variant="neutral" size="sm" data-numeric>+{cls.subjects.length - 4}</Badge>
                        )}
                      </div>
                    ) : null}
                    {/* Each action carries this class through. They used to
                        link to the bare page, so tapping "Attendance" on Grade
                        5A landed on whichever class sorted first and the
                        teacher had to pick 5A again. */}
                    <div className="grid grid-cols-2 gap-1.5 min-[400px]:grid-cols-4">
                      {[
                        { icon: CalendarCheck, label: "Attendance", href: "/teacher/attendance" },
                        { icon: Star, label: "Marks", href: "/teacher/marks" },
                        { icon: FileText, label: "Reports", href: "/teacher/reports" },
                        { icon: Users, label: "Students", href: "/teacher/students" },
                      ].map(({ icon: ActionIcon, label, href }) => (
                        <Tooltip key={label} content={`${label} for ${classLabel(cls)}`}>
                          <Button size="sm" variant="secondary"
                            type="button"
                            onClick={() => router.push(`${href}?classId=${encodeURIComponent(cls.id)}`)}
                            className="min-w-0 flex-col justify-start px-1 text-xs"
                          >
                            <ActionIcon aria-hidden="true" className="h-3.5 w-3.5" />
                            {label}
                          </Button>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </TeacherPage>
  );
}
