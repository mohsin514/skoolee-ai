"use client";

import { useRouter } from "next/navigation";
import { CalendarCheck, FileText, GraduationCap, Star, Users } from "lucide-react";
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
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="sk-rise relative overflow-hidden bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white border-b border-[#cfc2d6]/12 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <GraduationCap className="w-4 h-4" />
            <p className="text-[10px] font-semibold uppercase tracking-wider">My Teaching Load</p>
          </div>
          <h1 className="text-3xl font-bold text-[#1d1b20] tracking-tight">My Classes</h1>
          <p className="mt-1 text-sm font-semibold text-ink-muted">Every class assigned to you, with students and pending work</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 bg-[#fbf0fe]/20">
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
          <div className="space-y-6">
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
                  <div key={cls.id} className="rounded-[28px] border border-[#cfc2d6]/25 bg-white p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:-translate-y-0.5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8127cf]">{cls.role || "Teacher"}</p>
                        <h4 className="mt-0.5 truncate text-lg font-bold text-[#1d1b20] tracking-tight">{classLabel(cls)}</h4>
                      </div>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
                        <GraduationCap className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="rounded-xl bg-[#fbf0fe]/70 px-3 py-2 text-center">
                        <p className="text-lg font-bold text-[#8127cf]">{clsStudents.length}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Students</p>
                      </div>
                      <div className="rounded-xl bg-[#fbf0fe]/70 px-3 py-2 text-center">
                        <p className="text-lg font-bold text-[#1d1b20]">{cls.subjects?.length || 0}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Subjects</p>
                      </div>
                      <div className="rounded-xl bg-[#fbf0fe]/70 px-3 py-2 text-center">
                        <p className={`text-lg font-bold ${clsMissingMarks > 0 ? "text-rose-600" : "text-emerald-600"}`}>{clsMissingMarks}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Pending</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {(cls.subjects || []).slice(0, 4).map((subject: any) => (
                        <span key={subject.id} className="rounded-full bg-[#fbf0fe] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#8127cf]">{subject.name}</span>
                      ))}
                      {(cls.subjects?.length || 0) > 4 && (
                        <span className="rounded-full bg-[#fbf0fe] px-2.5 py-1 text-[9px] font-semibold text-ink-subtle">+{cls.subjects.length - 4}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => router.push("/teacher/attendance")}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe]/60 hover:bg-[#fbf0fe] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-all cursor-pointer hover:shadow-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                        <CalendarCheck className="h-3.5 w-3.5" /> Attendance
                      </button>
                      <button type="button" onClick={() => router.push("/teacher/marks")}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe]/60 hover:bg-[#fbf0fe] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-all cursor-pointer hover:shadow-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                        <Star className="h-3.5 w-3.5" /> Marks
                      </button>
                      <button type="button" onClick={() => router.push("/teacher/reports")}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe]/60 hover:bg-[#fbf0fe] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-all cursor-pointer hover:shadow-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                        <FileText className="h-3.5 w-3.5" /> Reports
                      </button>
                      <button type="button" onClick={() => router.push("/teacher/students")}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe]/60 hover:bg-[#fbf0fe] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-all cursor-pointer hover:shadow-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                        <Users className="h-3.5 w-3.5" /> Students
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}