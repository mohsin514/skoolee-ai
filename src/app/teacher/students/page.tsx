"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck, FileText, GraduationCap, Mail, Phone, Search, Star, Users, X,
} from "lucide-react";
import { useTeacherData } from "../teacher-data-context";
import {
  classLabel, StudentDetailModal, StudentsSkeleton, TeacherErrorState,
} from "@/components/teacher/teacher-components";

export default function TeacherStudentsPage() {
  const router = useRouter();
  const { data, loading, error, refetch } = useTeacherData();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  const classHubs = data?.classHubs || [];
  const allStudents: any[] = data?.students || [];

  const filtered = useMemo(() => {
    let list = allStudents;
    if (classFilter) list = list.filter((s) => s.class?.id === classFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.fullName?.toLowerCase().includes(q) ||
          s.rollNo?.toLowerCase().includes(q) ||
          s.guardianName?.toLowerCase().includes(q) ||
          s.guardianPhone?.includes(q)
      );
    }
    return list;
  }, [allStudents, classFilter, search]);

  if (loading && !data) return <StudentsSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={refetch} />;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white border-b border-[#cfc2d6]/12 shrink-0">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <Users className="w-4 h-4" />
            <p className="text-[10px] font-semibold uppercase tracking-wider">Student Directory</p>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">My Students</h2>
          <p className="mt-1 text-sm font-semibold text-[#4d4354]/60">
            {allStudents.length} students across {classHubs.length} class{classHubs.length !== 1 ? "es" : ""}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 bg-[#fbf0fe]/20 space-y-6">

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#4d4354]/30" />
            <input
              type="text"
              placeholder="Search by name, roll no, or guardian..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white pl-11 pr-10 text-sm font-semibold outline-none transition-all placeholder:text-[#4d4354]/35 focus:border-[#8127cf]/35 focus:shadow-md hover:border-[#8127cf]/20"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4d4354]/30 hover:text-rose-500 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-12 rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 text-sm font-semibold outline-none transition-all cursor-pointer focus:border-[#8127cf]/35 hover:border-[#8127cf]/20"
          >
            <option value="">All Classes</option>
            {classHubs.map((cls: any) => (
              <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
            ))}
          </select>
          <span className="text-[11px] font-bold text-[#4d4354]/40 uppercase tracking-wider">
            {filtered.length} student{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Student Cards */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((student: any, index: number) => {
              const report = student.reportCards?.[0];
              const avatar = student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`;
              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => setSelectedStudent(student)}
                  className="sk-rise group text-left rounded-[28px] border border-[#cfc2d6]/25 bg-white p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25 hover:-translate-y-0.5 cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 border-[#fbf0fe] bg-[#fbf0fe] shadow-sm">
                      <img src={avatar} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-base font-bold text-[#1d1b20] group-hover:text-[#8127cf] transition-colors">
                        {student.fullName}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-[#4d4354]/40 uppercase tracking-wider">
                          {student.rollNo || "No roll"}
                        </span>
                        <span className="text-[10px] text-[#4d4354]/20">|</span>
                        <span className="text-[10px] font-semibold text-[#8127cf]">
                          {classLabel(student.class)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Performance Indicators */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="rounded-xl bg-[#fbf0fe]/70 px-3 py-2">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-[#4d4354]/40">Latest Grade</p>
                      <p className="text-sm font-bold text-[#8127cf]">
                        {report ? report.grade || `${Math.round(report.percentage || 0)}%` : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#fbf0fe]/70 px-3 py-2">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-[#4d4354]/40">Status</p>
                      <p className={`text-sm font-bold ${student.status === "ACTIVE" ? "text-emerald-600" : "text-[#4d4354]/40"}`}>
                        {student.status || "Active"}
                      </p>
                    </div>
                  </div>

                  {/* Guardian Info */}
                  {student.guardianName && (
                    <div className="rounded-xl bg-[#f3f4f9]/50 px-3 py-2">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-[#4d4354]/35 mb-1">Guardian</p>
                      <p className="text-xs font-semibold text-[#1d1b20] truncate">{student.guardianName}</p>
                      {student.guardianPhone && (
                        <p className="text-[10px] font-semibold text-[#4d4354]/40 mt-0.5 flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {student.guardianPhone}
                        </p>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#fbf0fe] text-[#8127cf] mb-4">
              <Users className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-[#1d1b20]">No students found</h3>
            <p className="text-sm font-semibold text-[#4d4354]/50 mt-1">
              {search || classFilter ? "Try adjusting your search or filter" : "No students are assigned to your classes yet"}
            </p>
          </div>
        )}
      </div>

      {/* Student Detail Modal */}
      {selectedStudent ? (
        <StudentDetailModal
          student={selectedStudent}
          exams={data.exams || []}
          onClose={() => setSelectedStudent(null)}
        />
      ) : null}
    </section>
  );
}
