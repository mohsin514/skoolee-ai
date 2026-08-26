"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AvatarImage } from "@/components/ui/avatar-image";
import {
  CalendarCheck, FileText, LayoutGrid, MessageCircle, Phone, Star, Table2, Users, X,
} from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import {
  DataTable,
  SearchField,
  SortDirButton,
  ToolbarSelect,
  ViewSwitch,
  WorkspaceToolbar,
  useWorkspacePrefs,
} from "@/components/shared-admin/workspace";
import { cn } from "@/lib/utils";
import { useTeacherData } from "../teacher-data-context";
import {
  classLabel, StudentDetailModal, StudentsSkeleton, TeacherErrorState,
} from "@/components/teacher/teacher-components";

export default function TeacherStudentsPage() {
  const { data, loading, error, refetch } = useTeacherData();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [prefs, patchPrefs] = useWorkspacePrefs("teacher-students", {
    view: "cards",
    sortKey: "roll",
    sortDir: "asc",
  });
  const searchParams = useSearchParams();
  const [classFilter, setClassFilter] = useState("");
  const [todayFilter, setTodayFilter] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  // Arriving from a class card should show that class, not everyone; the
  // command palette additionally carries the name it was searching for, so the
  // roster opens already narrowed to the one person the teacher asked for.
  useEffect(() => {
    const requested = searchParams.get("classId");
    if (requested) setClassFilter(requested);
    const q = searchParams.get("q");
    if (q) setSearch(q);
  }, [searchParams]);

  const classHubs = data?.classHubs || [];
  const allStudents: any[] = data?.students || [];
  const outOfCycleCount = classHubs.filter((cls: any) => cls.inActiveCycle === false).length;

  /* Today's roll call, taken straight from the dashboard payload. Counting it
     here is what makes "show me who is absent" a one-click question instead of
     a trip to the attendance screen, class picker and all. */
  const todayCounts = useMemo(() => {
    const scope = classFilter ? allStudents.filter((s) => s.class?.id === classFilter) : allStudents;
    return {
      PRESENT: scope.filter((s) => s.todayAttendance === "PRESENT").length,
      ABSENT: scope.filter((s) => s.todayAttendance === "ABSENT").length,
      LEAVE: scope.filter((s) => s.todayAttendance === "LEAVE").length,
      UNMARKED: scope.filter((s) => !s.todayAttendance).length,
    };
  }, [allStudents, classFilter]);

  const filtered = useMemo(() => {
    let list = allStudents;
    if (classFilter) list = list.filter((s) => s.class?.id === classFilter);
    if (todayFilter) {
      list = list.filter((s) =>
        todayFilter === "UNMARKED" ? !s.todayAttendance : s.todayAttendance === todayFilter,
      );
    }
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

    // Roll number is stored as text, so a plain string sort orders 10 before 2.
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const dir = prefs.sortDir === "desc" ? -1 : 1;
    const pct = (st: any) => st.reportCards?.[0]?.percentage ?? -1;
    const sorted = [...list].sort((a, b) => {
      if (prefs.sortKey === "name") return dir * collator.compare(a.fullName || "", b.fullName || "");
      if (prefs.sortKey === "grade") return dir * (pct(a) - pct(b));
      if (prefs.sortKey === "class")
        return dir * collator.compare(classLabel(a.class) || "", classLabel(b.class) || "");
      return dir * collator.compare(String(a.rollNo || ""), String(b.rollNo || ""));
    });
    return sorted;
  }, [allStudents, classFilter, todayFilter, search, prefs.sortKey, prefs.sortDir]);

  if (loading && !data) return <StudentsSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={refetch} />;

  return (
    <TeacherPage
      tone="students"
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
          <ToolbarSelect
            value={prefs.sortKey}
            onChange={(v) => patchPrefs({ sortKey: v })}
            label="Sort"
            options={[
              ["roll", "Roll no"],
              ["name", "Name"],
              ["class", "Class"],
              ["grade", "Latest grade"],
            ]}
          />
          <SortDirButton
            dir={prefs.sortDir}
            onToggle={() => patchPrefs({ sortDir: prefs.sortDir === "asc" ? "desc" : "asc" })}
          />
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
            {filtered.length} student{filtered.length !== 1 ? "s" : ""}
          </span>
        </WorkspaceToolbar>

        {/* Today's roll call as filter chips. The directory already knows who is
            in; making that clickable turns "who do I chase up?" into one tap. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">Today</span>
          {([
            ["", "Everyone", allStudents.length, "border-[#cfc2d6]/30 bg-white text-ink-muted"],
            ["PRESENT", "Present", todayCounts.PRESENT, "border-emerald-200 bg-emerald-50 text-emerald-700"],
            ["ABSENT", "Absent", todayCounts.ABSENT, "border-rose-200 bg-rose-50 text-rose-700"],
            ["LEAVE", "Leave", todayCounts.LEAVE, "border-amber-200 bg-amber-50 text-amber-700"],
            ["UNMARKED", "Unmarked", todayCounts.UNMARKED, "border-[#8127cf]/20 bg-[#fbf0fe] text-[#8127cf]"],
          ] as [string, string, number, string][]).map(([key, label, count, tone]) => (
            <button
              key={key || "all"}
              type="button"
              onClick={() => setTodayFilter(key)}
              aria-pressed={todayFilter === key}
              title={`Show ${label.toLowerCase()}`}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[11px] font-black uppercase tracking-wider transition-all active:scale-[0.96]",
                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25",
                todayFilter === key
                  ? "border-[#8127cf] bg-[#8127cf] text-white shadow-[0_6px_16px_-6px_rgba(129,39,207,0.7)]"
                  : `${tone} hover:brightness-95`,
              )}
            >
              {label}
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          ))}
        </div>

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
                key: "today",
                label: "Today",
                align: "center",
                render: (st: any) => <TodayChip status={st.todayAttendance} />,
              },
              {
                key: "guardian",
                label: "Guardian",
                secondary: true,
                render: (st: any) => (
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-ink">{st.guardianName || "Not linked"}</p>
                    {/* A phone number on a screen a teacher uses on a phone
                        should dial. Printing it as inert text meant copying it
                        out by hand every time a guardian had to be called. */}
                    {st.guardianPhone ? (
                      <a
                        href={`tel:${String(st.guardianPhone).replace(/\s+/g, "")}`}
                        onClick={(e) => e.stopPropagation()}
                        title={`Call ${st.guardianName || "guardian"}`}
                        className="inline-flex items-center gap-1 truncate text-[10px] font-bold text-[#8127cf] hover:underline"
                      >
                        <Phone className="h-2.5 w-2.5" />
                        {st.guardianPhone}
                      </a>
                    ) : (
                      <p className="truncate text-[10px] font-semibold text-ink-subtle">No phone</p>
                    )}
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
              const phone = student.guardianPhone ? String(student.guardianPhone).replace(/\s+/g, "") : "";
              const whatsapp = student.guardianWhatsapp
                ? String(student.guardianWhatsapp).replace(/[^\d+]/g, "")
                : phone;
              return (
                /* The card was one big <button>, so nothing inside it could be a
                   control of its own — calling a guardian or opening a report
                   card meant opening the profile modal first and hunting. The
                   body opens the profile; the footer carries real actions. */
                <div
                  key={student.id}
                  className="sk-rise group flex flex-col rounded-[28px] border border-[#cfc2d6]/25 bg-white p-5 text-left shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedStudent(student)}
                    title={`Open ${student.fullName}'s profile`}
                    className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25 rounded-2xl"
                  >
                    <div className="mb-4 flex items-start gap-4">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 border-[#fbf0fe] bg-[#fbf0fe] shadow-sm">
                        <AvatarImage src={avatar} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-base font-bold text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">
                          {student.fullName}
                        </h4>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
                            {student.rollNo || "No roll"}
                          </span>
                          <span className="text-[10px] text-ink-subtle">|</span>
                          <span className="text-[10px] font-semibold text-[#8127cf]">
                            {classLabel(student.class)}
                          </span>
                        </div>
                        <div className="mt-2">
                          <TodayChip status={student.todayAttendance} />
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-2">
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

                    {student.guardianName ? (
                      <div className="rounded-xl bg-[#f3f4f9]/50 px-3 py-2">
                        <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-ink-subtle">Guardian</p>
                        <p className="truncate text-xs font-semibold text-[#1d1b20]">{student.guardianName}</p>
                        {student.guardianPhone ? (
                          <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-ink-subtle">
                            <Phone className="h-3 w-3" /> {student.guardianPhone}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </button>

                  {/* Everything a teacher actually does next, without leaving. */}
                  <div className="mt-4 grid grid-cols-4 gap-1.5 border-t border-[#cfc2d6]/15 pt-3">
                    {phone ? (
                      <a
                        href={`tel:${phone}`}
                        title={`Call ${student.guardianName || "guardian"}`}
                        className="flex cursor-pointer flex-col items-center gap-1 rounded-xl bg-[#fbf0fe]/60 px-2 py-2 text-[9px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#fbf0fe] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        Call
                      </a>
                    ) : (
                      <span className="flex flex-col items-center gap-1 rounded-xl bg-[#f3f4f9]/60 px-2 py-2 text-[9px] font-black uppercase tracking-wider text-ink-faint" title="No guardian phone on file">
                        <Phone className="h-3.5 w-3.5" />
                        Call
                      </span>
                    )}
                    {whatsapp ? (
                      <a
                        href={`https://wa.me/${whatsapp.replace(/^\+/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Message ${student.guardianName || "guardian"} on WhatsApp`}
                        className="flex cursor-pointer flex-col items-center gap-1 rounded-xl bg-[#fbf0fe]/60 px-2 py-2 text-[9px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#fbf0fe] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Chat
                      </a>
                    ) : (
                      <span className="flex flex-col items-center gap-1 rounded-xl bg-[#f3f4f9]/60 px-2 py-2 text-[9px] font-black uppercase tracking-wider text-ink-faint" title="No guardian number on file">
                        <MessageCircle className="h-3.5 w-3.5" />
                        Chat
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/teacher/reports?studentId=${encodeURIComponent(student.id)}&classId=${encodeURIComponent(student.class?.id || "")}`,
                        )
                      }
                      title={`Open ${student.fullName}'s report card`}
                      className="flex cursor-pointer flex-col items-center gap-1 rounded-xl bg-[#fbf0fe]/60 px-2 py-2 text-[9px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#fbf0fe] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Report
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/teacher/attendance?classId=${encodeURIComponent(student.class?.id || "")}`)
                      }
                      title={`Mark attendance for ${classLabel(student.class)}`}
                      className="flex cursor-pointer flex-col items-center gap-1 rounded-xl bg-[#fbf0fe]/60 px-2 py-2 text-[9px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#fbf0fe] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25"
                    >
                      <CalendarCheck className="h-3.5 w-3.5" />
                      Attend
                    </button>
                  </div>
                </div>
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
              {search || classFilter || todayFilter ? "Try adjusting your search or filter" : "No students are assigned to your classes yet"}
            </p>
            {/* Telling someone to adjust a filter without giving them a way to
                clear it leaves them to hunt for the two controls themselves. */}
            {search || classFilter || todayFilter ? (
              <button type="button" onClick={() => { setSearch(""); setClassFilter(""); setTodayFilter(""); }}
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


/** Today's attendance, rendered where the teacher is already looking. */
const TODAY_TONE: Record<string, { label: string; className: string }> = {
  PRESENT: { label: "In today", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ABSENT: { label: "Absent today", className: "bg-rose-50 text-rose-700 border-rose-200" },
  LEAVE: { label: "On leave", className: "bg-amber-50 text-amber-700 border-amber-200" },
};

function TodayChip({ status }: { status?: string | null }) {
  const tone = status ? TODAY_TONE[status] : null;
  if (!tone) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cfc2d6]/30 bg-[#faf7fc] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
        Unmarked
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider", tone.className)}>
      {tone.label}
    </span>
  );
}
