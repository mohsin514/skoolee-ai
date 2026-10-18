"use client";

import { PathwayPanel } from "@/components/pathways/pathway-panel";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AvatarImage } from "@/components/ui/avatar-image";
import {
  CalendarCheck, FileText, LayoutGrid, MessageCircle, Phone, Table2, Users, X,
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
          <span aria-live="polite" className="text-xs font-medium text-ink-subtle">
            <span data-numeric className="tabular-nums">{filtered.length}</span> student{filtered.length !== 1 ? "s" : ""}
          </span>
        </WorkspaceToolbar>

        {/* Today's roll call as filter chips. The directory already knows who is
            in; making that clickable turns "who do I chase up?" into one tap. */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="today-filter-label">
          <span id="today-filter-label" className="sk-eyebrow">Today</span>
          {/* The dot carries each status colour; the label still says it. */}
          {([
            ["", "Everyone", allStudents.length, null],
            ["PRESENT", "Present", todayCounts.PRESENT, "bg-emerald-500"],
            ["ABSENT", "Absent", todayCounts.ABSENT, "bg-rose-500"],
            ["LEAVE", "Leave", todayCounts.LEAVE, "bg-amber-500"],
            ["UNMARKED", "Unmarked", todayCounts.UNMARKED, "bg-ink-faint"],
          ] as [string, string, number, string | null][]).map(([key, label, count, dot]) => (
            <Button className="justify-start" variant="choice" size="sm"
              key={key || "all"}
              type="button"
              onClick={() => setTodayFilter(key)}
              aria-pressed={todayFilter === key}
            >
              {dot ? <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dot)} /> : null}
              {label}
              <span data-numeric className="tabular-nums text-ink-subtle">{count}</span>
            </Button>
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
                    <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-edge/30 bg-brand-50">
                      <AvatarImage src={st.profileImageUrl} name={st.fullName} initialsClassName="text-2xs" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink-strong">{st.fullName}</span>
                      <span className="block text-xs text-ink-subtle tabular-nums">
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
                  <span className="text-sm font-medium text-ink">{classLabel(st.class)}</span>
                ),
              },
              {
                key: "grade",
                label: "Latest grade",
                align: "center",
                render: (st: any) => {
                  const report = st.reportCards?.[0];
                  return report?.grade || report?.percentage != null ? (
                    <span data-numeric className="text-sm font-bold tabular-nums text-primary">
                      {report.grade || `${Math.round(report.percentage)}%`}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-subtle">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">No grade yet</span>
                    </span>
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
                    <p className="truncate text-sm font-medium text-ink">{st.guardianName || "Not linked"}</p>
                    {/* A phone number on a screen a teacher uses on a phone
                        should dial. Printing it as inert text meant copying it
                        out by hand every time a guardian had to be called. */}
                    {st.guardianPhone ? (
                      <Tooltip content={`Call ${st.guardianName || "guardian"}`}>
                        <a
                          href={`tel:${String(st.guardianPhone).replace(/\s+/g, "")}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-primary hover:underline"
                        >
                          <Phone aria-hidden="true" className="h-3 w-3 shrink-0" />
                          <span dir="ltr" className="truncate tabular-nums">{st.guardianPhone}</span>
                        </a>
                      </Tooltip>
                    ) : (
                      <p className="truncate text-xs text-ink-subtle">No phone</p>
                    )}
                  </div>
                ),
              },
            ]}
          />
        ) : filtered.length > 0 ? (
          <div className="sk-stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((student: any) => {
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
                  className="sk-panel sk-hover-lift group flex min-w-0 flex-col p-5 text-start"
                >
                  <Button variant="ghost"
                    type="button"
                    onClick={() => setSelectedStudent(student)}
                    className="block justify-start p-0 text-start actionable-hover:bg-transparent"
                  >
                    <div className="mb-4 flex items-start gap-4">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 border-brand-50 bg-brand-50 shadow-sm">
                        <AvatarImage src={avatar} name={student.fullName} initialsClassName="text-base" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-bold text-ink-strong transition-colors group-hover:text-primary">
                          {student.fullName}
                        </h3>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-xs text-ink-subtle tabular-nums">
                            {student.rollNo || "No roll"}
                          </span>
                          <span aria-hidden="true" className="text-xs text-ink-faint">|</span>
                          <span className="truncate text-xs font-semibold text-primary">
                            {classLabel(student.class)}
                          </span>
                        </div>
                        <div className="mt-2">
                          <TodayChip status={student.todayAttendance} />
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-brand-50/70 px-3 py-2">
                        <p className="sk-eyebrow">Latest grade</p>
                        <p data-numeric className="text-sm font-bold tabular-nums text-primary">
                          {report ? report.grade || `${Math.round(report.percentage || 0)}%` : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-brand-50/70 px-3 py-2">
                        <p className="sk-eyebrow">Status</p>
                        {/* Stored casing varies ("active" / "ACTIVE"), which
                            rendered raw as lowercase text among title-cased UI. */}
                        <p className={`text-sm font-bold capitalize ${(student.status || "").toUpperCase() === "ACTIVE" ? "text-emerald-700" : "text-ink-subtle"}`}>
                          {(student.status || "Active").toLowerCase()}
                        </p>
                      </div>
                    </div>

                    {student.guardianName ? (
                      <div className="rounded-xl bg-muted/50 px-3 py-2">
                        <p className="sk-eyebrow mb-1">Guardian</p>
                        <p className="truncate text-sm font-medium text-ink-strong">{student.guardianName}</p>
                        {student.guardianPhone ? (
                          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-ink-subtle">
                            <Phone aria-hidden="true" className="h-3 w-3 shrink-0" />
                            <span dir="ltr" className="truncate tabular-nums">{student.guardianPhone}</span>
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </Button>

                  {/* Everything a teacher actually does next, without leaving: four
                      equal tiles, links and buttons alike. A missing number
                      disables its tile and the tooltip says why. */}
                  <div className="mt-4 grid grid-cols-4 gap-1.5 border-t border-edge/15 pt-3">
                    {phone ? (
                      <Tooltip content={`Call ${student.guardianName || "guardian"}`}>
                        <a href={`tel:${phone}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), ACTION_TILE)}>
                          <Phone aria-hidden="true" />
                          Call
                        </a>
                      </Tooltip>
                    ) : (
                      <Tooltip content="No guardian phone on file">
                        <span tabIndex={0} className="flex min-w-0">
                          <Button size="sm" variant="secondary" type="button" disabled className={cn("w-full", ACTION_TILE)}>
                            <Phone aria-hidden="true" />
                            Call
                          </Button>
                        </span>
                      </Tooltip>
                    )}
                    {whatsapp ? (
                      <Tooltip content={`Message ${student.guardianName || "guardian"} on WhatsApp`}>
                        <a
                          href={`https://wa.me/${whatsapp.replace(/^\+/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), ACTION_TILE)}
                        >
                          <MessageCircle aria-hidden="true" />
                          Chat
                        </a>
                      </Tooltip>
                    ) : (
                      <Tooltip content="No guardian number on file">
                        <span tabIndex={0} className="flex min-w-0">
                          <Button size="sm" variant="secondary" type="button" disabled className={cn("w-full", ACTION_TILE)}>
                            <MessageCircle aria-hidden="true" />
                            Chat
                          </Button>
                        </span>
                      </Tooltip>
                    )}
                    <Tooltip content={`Open ${student.fullName}'s report card`}>
                      <Button size="sm" variant="secondary"
                        type="button"
                        onClick={() =>
                          router.push(
                            `/teacher/reports?studentId=${encodeURIComponent(student.id)}&classId=${encodeURIComponent(student.class?.id || "")}`,
                          )
                        }
                        className={ACTION_TILE}
                      >
                        <FileText aria-hidden="true" />
                        Report
                      </Button>
                    </Tooltip>
                    <Tooltip content={`Mark attendance for ${classLabel(student.class)}`}>
                      <Button size="sm" variant="secondary"
                        type="button"
                        onClick={() =>
                          router.push(`/teacher/attendance?classId=${encodeURIComponent(student.class?.id || "")}`)
                        }
                        className={ACTION_TILE}
                      >
                        <CalendarCheck aria-hidden="true" />
                        Attend
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="sk-panel">
            {/* Telling someone to adjust a filter without giving them a way to
                clear it leaves them to hunt for the two controls themselves. */}
            <EmptyState
              icon={Users}
              title="No students found"
              description={search || classFilter || todayFilter ? "Try adjusting your search or filter" : "No students are assigned to your classes yet"}
              action={search || classFilter || todayFilter ? (
                <Button variant="secondary" type="button" onClick={() => { setSearch(""); setClassFilter(""); setTodayFilter(""); }}>
                  <X aria-hidden="true" /> Clear filters
                </Button>
              ) : undefined}
            />
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
      <PathwayPanel />
    </TeacherPage>
  );
}


/** The footer action tiles on a student card: icon over a short label. */
const ACTION_TILE = "min-w-0 flex-col gap-1 px-1 py-2 text-xs";

/** Today's attendance, rendered where the teacher is already looking. */
const TODAY_TONE: Record<string, { label: string; variant: NonNullable<BadgeProps["variant"]> }> = {
  PRESENT: { label: "In today", variant: "success" },
  ABSENT: { label: "Absent today", variant: "danger" },
  LEAVE: { label: "On leave", variant: "warning" },
};

function TodayChip({ status }: { status?: string | null }) {
  const tone = status ? TODAY_TONE[status] : null;
  if (!tone) {
    return (
      <Badge variant="neutral" dot>
        Unmarked
      </Badge>
    );
  }
  return (
    <Badge variant={tone.variant} dot>
      {tone.label}
    </Badge>
  );
}
