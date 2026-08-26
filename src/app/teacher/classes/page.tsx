"use client";

import { useRouter } from "next/navigation";
import { CalendarCheck, FileText, GraduationCap, Star, Users } from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import {
  classLabel, DashboardSkeleton, TeacherErrorState,
} from "@/components/teacher/teacher-components";
import { useTeacherData } from "../teacher-data-context";

export default function TeacherClassesPage() {
  const router = useRouter();
  const { data, loading, error, refetch } = useTeacherData();

  if (loading && !data) return <DashboardSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={refetch} />;

  const classHubs = data?.classHubs || [];

  return (
    <TeacherPage
      icon={GraduationCap}
      eyebrow="My Teaching Load"
      title="My Classes"
      summary="Every class assigned to you, with students and pending work"
    >
      <div className="space-y-3">
        {classHubs.length === 0 ? (
          <div className="sk-rise rounded-[24px] border border-[#cfc2d6]/25 bg-white p-10 text-center shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fbf0fe]">
              <GraduationCap className="h-7 w-7 text-[#8127cf]" />
            </div>
            <h3 className="text-base font-black text-[#1f1a23]">No classes assigned yet</h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm font-semibold text-ink-muted">
              Your classes will appear here once the admin assigns them to you. Check back later.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1d1b20] uppercase tracking-wider">Assigned Classes</h3>
              <span className="text-[10px] font-semibold text-ink-muted">{classHubs.length} active</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {classHubs.map((cls: any) => {
                const clsStudents = (data.students || []).filter((s: any) => s.class?.id === cls.id);
                const clsExams = (data.activeExams || []).filter((e: any) => e.classId === cls.id);
                const clsMissingMarks = clsExams.reduce((sum: number, e: any) => sum + (e.missingMarks || 0), 0);
                return (
                  <div key={cls.id} className="group rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:shadow-[0_2px_6px_rgba(31,26,35,0.06),0_18px_36px_-18px_rgba(129,39,207,0.45)]">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8127cf]">{cls.role || "Teacher"}</p>
                        <h4 className="mt-0.5 truncate text-base font-black tracking-tight text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">{classLabel(cls)}</h4>
                      </div>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf] transition-transform duration-200 group-hover:scale-105">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mb-3 grid grid-cols-3 gap-1.5">
                      <div className="rounded-xl bg-[#fbf0fe]/70 px-2 py-1.5 text-center">
                        <p className="text-base font-black tabular-nums text-[#8127cf]">{clsStudents.length}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Students</p>
                      </div>
                      <div className="rounded-xl bg-[#fbf0fe]/70 px-2 py-1.5 text-center">
                        <p className="text-base font-black tabular-nums text-[#1d1b20]">{cls.subjects?.length || 0}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Subjects</p>
                      </div>
                      <div className="rounded-xl bg-[#fbf0fe]/70 px-2 py-1.5 text-center">
                        <p className={`text-base font-black tabular-nums ${clsMissingMarks > 0 ? "text-rose-600" : "text-emerald-600"}`}>{clsMissingMarks}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Pending</p>
                      </div>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {(cls.subjects || []).slice(0, 4).map((subject: any) => (
                        <span key={subject.id} className="rounded-full bg-[#fbf0fe] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#8127cf]">{subject.name}</span>
                      ))}
                      {(cls.subjects?.length || 0) > 4 && (
                        <span className="rounded-full bg-[#fbf0fe] px-2.5 py-1 text-[9px] font-semibold text-ink-subtle">+{cls.subjects.length - 4}</span>
                      )}
                    </div>
                    {/* Each action carries this class through. They used to
                        link to the bare page, so tapping "Attendance" on Grade
                        5A landed on whichever class sorted first and the
                        teacher had to pick 5A again. */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { icon: CalendarCheck, label: "Attendance", href: "/teacher/attendance" },
                        { icon: Star, label: "Marks", href: "/teacher/marks" },
                        { icon: FileText, label: "Reports", href: "/teacher/reports" },
                        { icon: Users, label: "Students", href: "/teacher/students" },
                      ].map(({ icon: ActionIcon, label, href }) => (
                        <button
                          key={label}
                          type="button"
                          title={`${label} for ${classLabel(cls)}`}
                          onClick={() => router.push(`${href}?classId=${encodeURIComponent(cls.id)}`)}
                          className="flex cursor-pointer flex-col items-center gap-1 rounded-xl bg-[#fbf0fe]/60 px-2 py-2 text-[9px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#fbf0fe] hover:shadow-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25"
                        >
                          <ActionIcon className="h-3.5 w-3.5" />
                          {label}
                        </button>
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