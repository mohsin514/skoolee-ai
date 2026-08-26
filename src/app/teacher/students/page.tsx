"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AvatarImage } from "@/components/ui/avatar-image";
import { LayoutGrid, Phone, Table2, Users, X } from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import {
  DataTable,
  SearchField,
  ToolbarSelect,
  ViewSwitch,
  WorkspaceToolbar,
  useWorkspacePrefs,
} from "@/components/shared-admin/workspace";
import { useTeacherData } from "../teacher-data-context";
import {
  classLabel, StudentDetailModal, StudentsSkeleton, TeacherErrorState,
} from "@/components/teacher/teacher-components";

export default function TeacherStudentsPage() {
  const { data, loading, error, refetch } = useTeacherData();
  const [search, setSearch] = useState("");
  const [prefs, patchPrefs] = useWorkspacePrefs("teacher-students", { view: "cards" });
  const searchParams = useSearchParams();

  // Arriving from a class card should show that class, not everyone.
  useEffect(() => {
    const requested = searchParams.get("classId");
    if (requested) setClassFilter(requested);
  }, [searchParams]);
  const [classFilter, setClassFilter] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  const classHubs = data?.classHubs || [];
  const allStudents: any[] = data?.students || [];
  const outOfCycleCount = classHubs.filter((cls: any) => cls.inActiveCycle === false).length;

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
    <TeacherPage
      icon={Users}
      eyebrow="Student Directory"
      title="My Students"
      /* The filter list marks out-of-cycle classes, so a bare "across N
         classes" total silently disagreed with it. Call the split out. */
      summary={
        <>
          {allStudents.length} student{allStudents.length !== 1 ? "s" : ""} across {classHubs.length} class
          {classHubs.length !== 1 ? "es" : ""}
          {outOfCycleCount > 0 ? ` · ${outOfCycleCount} outside the active cycle` : ""}
        </>
      }
    >
      <div className="space-y-3">

        {/* Filters */}
        <WorkspaceToolbar
          trailing={
            <ViewSwitch
              value={prefs.view}
              onChange={(v) => patchPrefs({ view: v })}
              options={[
                { value: "cards", label: "Cards", icon: LayoutGrid },
                { value: "table", label: "List", icon: Table2 },
              ]}
            />
          }
        >
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Name, roll no or guardian…"
          />
          <ToolbarSelect
            value={classFilter}
            onChange={setClassFilter}
            label="Class"
            options={[
              ["", "All classes"],
              ...classHubs.map(
                (cls: any) =>
                  [
                    cls.id,
                    `${classLabel(cls)}${cls.inActiveCycle === false ? " (outside active cycle)" : ""}`,
                  ] as [string, string],
              ),
            ]}
          />
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
            {filtered.length} student{filtered.length !== 1 ? "s" : ""}
          </span>
        </WorkspaceToolbar>

        {/* A class of forty is a scanning job, not a browsing one — the table
            puts roll number, grade and attendance in comparable columns. */}
        {filtered.length > 0 && prefs.view === "table" ? (
          <DataTable
            rows={filtered}
            rowKey={(st: any) => st.id}
            minWidth={720}
            onRowClick={(st: any) => setSelectedStudent(st)}
            columns={[
              {
                key: "name",
                label: "Student",
                render: (st: any) => (
                  <div className="flex items-center gap-2.5">
                    <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[#cfc2d6]/30 bg-[#fbf0fe]">
                      <AvatarImage src={st.profileImageUrl} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-[#1d1b20]">{st.fullName}</span>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
                        {st.rollNo || "No roll"}
                      </span>
                    </span>
                  </div>
                ),
              },
              {
                key: "class",
                label: "Class",
                render: (st: any) => (
                  <span className="text-xs font-bold text-ink">{classLabel(st.class)}</span>
                ),
              },
              {
                key: "grade",
                label: "Latest grade",
                align: "center",
                render: (st: any) => {
                  const report = st.reportCards?.[0];
                  return report?.grade || report?.percentage != null ? (
                    <span className="text-sm font-black text-[#8127cf]">
                      {report.grade || `${Math.round(report.percentage)}%`}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-ink-subtle">—</span>
                  );
                },
              },
              {
                key: "guardian",
                label: "Guardian",
                secondary: true,
                render: (st: any) => (
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-ink">{st.guardianName || "Not linked"}</p>
                    <p className="truncate text-[10px] font-semibold text-ink-subtle">
                      {st.guardianPhone || "No phone"}
                    </p>
                  </div>
                ),
              },
            ]}
          />
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((student: any, index: number) => {
              const report = student.reportCards?.[0];
              const avatar = student.profileImageUrl;
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
                      <AvatarImage src={avatar} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-base font-bold text-[#1d1b20] group-hover:text-[#8127cf] transition-colors">
                        {student.fullName}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider">
                          {student.rollNo || "No roll"}
                        </span>
                        <span className="text-[10px] text-ink-subtle">|</span>
                        <span className="text-[10px] font-semibold text-[#8127cf]">
                          {classLabel(student.class)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Performance Indicators */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="rounded-xl bg-[#fbf0fe]/70 px-3 py-2">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Latest Grade</p>
                      <p className="text-sm font-bold text-[#8127cf]">
                        {report ? report.grade || `${Math.round(report.percentage || 0)}%` : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#fbf0fe]/70 px-3 py-2">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Status</p>
                      {/* Stored casing varies ("active" / "ACTIVE"), which
                          rendered raw as lowercase text among title-cased UI. */}
                      <p className={`text-sm font-bold capitalize ${(student.status || "").toUpperCase() === "ACTIVE" ? "text-emerald-600" : "text-ink-subtle"}`}>
                        {(student.status || "Active").toLowerCase()}
                      </p>
                    </div>
                  </div>

                  {/* Guardian Info */}
                  {student.guardianName && (
                    <div className="rounded-xl bg-[#f3f4f9]/50 px-3 py-2">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-subtle mb-1">Guardian</p>
                      <p className="text-xs font-semibold text-[#1d1b20] truncate">{student.guardianName}</p>
                      {student.guardianPhone && (
                        <p className="text-[10px] font-semibold text-ink-subtle mt-0.5 flex items-center gap-1">
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
            <p className="text-sm font-semibold text-ink-muted mt-1">
              {search || classFilter ? "Try adjusting your search or filter" : "No students are assigned to your classes yet"}
            </p>
            {/* Telling someone to adjust a filter without giving them a way to
                clear it leaves them to hunt for the two controls themselves. */}
            {search || classFilter ? (
              <button type="button" onClick={() => { setSearch(""); setClassFilter(""); }}
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[#fbf0fe] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#f3eeff] cursor-pointer active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            ) : null}
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
    </TeacherPage>
  );
}
