"use client";

import { PathwayPanel } from "@/components/pathways/pathway-panel";
import { DeskFilterStatus, DeskPill, DeskStats, StatTile, type DeskTone } from "@/components/ui/desk";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Menu } from "@/components/ui/menu";
import Link from "next/link";
import { useUiText } from "@/components/locale/LocaleProvider";
import { LearningActions } from "@/components/learning/learning-actions";
import { csvCell } from "@/lib/csv";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AvatarImage } from "@/components/ui/avatar-image";
import {
  CalendarCheck, CalendarX2, CircleDashed, Download, FileText, LayoutGrid, MessageCircle, MoreHorizontal, Phone, Plane, Table2, UserCheck, Users, X,
} from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import {
  DataTable,
  SearchField,
  SortDirButton,
  ToolbarSelect,
  ViewSwitch,
  additionalWorkspaceViews,
  WorkspaceToolbar,
  useWorkspacePrefs,
} from "@/components/shared-admin/workspace";
import { cn } from "@/lib/utils";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { useTeacherData } from "../teacher-data-context";
import {
  classLabel, StudentDetailModal, StudentsSkeleton, TeacherErrorState,
} from "@/components/teacher/teacher-components";

export default function TeacherStudentsPage() {
  const ui = useUiText();
  const { data, loading, error, refetch } = useTeacherData();
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
  const requestedClass = searchParams.get("classId");
  const requestedQuery = searchParams.get("q");
  useEffect(() => {
    const requested = requestedClass;
    if (requested) setClassFilter(requested);
    const q = requestedQuery;
    if (q) setSearch(q);
  }, [requestedClass, requestedQuery]);

  const classHubs = data?.classHubs || [];
  const allStudents: any[] = data?.students || [];
  const outOfCycleCount = classHubs.filter((cls: any) => cls.inActiveCycle === false).length;

  /* Today's roll call, taken straight from the dashboard payload. Counting it
     here is what makes "show me who is absent" a one-click question instead of
     a trip to the attendance screen, class picker and all. */
  const todayCounts = useMemo(() => {
    const scope = classFilter ? allStudents.filter((s) => s.class?.id === classFilter) : allStudents;
    return {
      PRESENT: scope.filter((s) => todayBucket(s.todayAttendance) === "PRESENT").length,
      ABSENT: scope.filter((s) => todayBucket(s.todayAttendance) === "ABSENT").length,
      LEAVE: scope.filter((s) => todayBucket(s.todayAttendance) === "LEAVE").length,
      UNMARKED: scope.filter((s) => todayBucket(s.todayAttendance) === "UNMARKED").length,
    };
  }, [allStudents, classFilter]);

  const filtered = useMemo(() => {
    let list = allStudents;
    if (classFilter) list = list.filter((s) => s.class?.id === classFilter);
    if (todayFilter) {
      list = list.filter((s) => todayBucket(s.todayAttendance) === todayFilter);
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

  const exportCsv = () => {
    const rows = [[ui("Pupil"), ui("Roll number"), ui("Class"), ui("Today"), ui("Guardian"), ui("Phone")]];
    // Today's status in words (translated), never the stored enum (R7).
    for (const st of filtered) rows.push([st.fullName || "", st.rollNo || "", classLabel(st.class) || "", todayLabel(ui, st.todayAttendance), st.guardianName || "", st.guardianPhone || ""]);
    // UTF-8 BOM so Arabic and Urdu names open correctly in spreadsheet apps.
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "my-students.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <TeacherPage
      icon={Users}
      title="Students"
      description={outOfCycleCount > 0
        ? ui("{0} pupils across {1} classes · {2} outside the active cycle", [allStudents.length, classHubs.length, outOfCycleCount])
        : ui("{0} pupils across {1} classes", [allStudents.length, classHubs.length])}
      secondaryActions={filtered.length ? [{ id: "export", label: "Export", icon: Download, onClick: exportCsv }] : []}
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
                ...additionalWorkspaceViews,
              ]}
            />
          }
        >
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={ui("Name, roll number or guardian…")}
          />
          <ToolbarSelect
            value={classFilter}
            onChange={setClassFilter}
            label={ui("Class")}
            options={[
              ["", ui("All classes")],
              ...classHubs.map(
                (cls: any) =>
                  [
                    cls.id,
                    `${classLabel(cls)}${cls.inActiveCycle === false ? ` ${ui("(outside active cycle)")}` : ""}`,
                  ] as [string, string],
              ),
            ]}
          />
          <ToolbarSelect
            value={prefs.sortKey}
            onChange={(v) => patchPrefs({ sortKey: v })}
            label={ui("Sort")}
            options={[
              ["roll", ui("Roll number")],
              ["name", ui("Name")],
              ["class", ui("Class")],
              ["grade", ui("Latest grade")],
            ]}
          />
          <SortDirButton
            dir={prefs.sortDir}
            onToggle={() => patchPrefs({ sortDir: prefs.sortDir === "asc" ? "desc" : "asc" })}
          />
          <span aria-live="polite" className="text-xs font-medium text-ink-subtle">
            {ui("{0} pupils", [filtered.length])}
          </span>
        </WorkspaceToolbar>

        {/* Today's roll call as filter tiles. The directory already knows who is
            in; making each count a toggle turns "who do I chase up?" into one tap. */}
        <DeskStats role="group" aria-label={ui("Today")}>
          {([
            ["PRESENT", ui("Present"), todayCounts.PRESENT, "success", UserCheck],
            ["ABSENT", ui("Absent"), todayCounts.ABSENT, "danger", CalendarX2],
            ["LEAVE", ui("Leave"), todayCounts.LEAVE, "warning", Plane],
            ["UNMARKED", ui("Unmarked"), todayCounts.UNMARKED, "neutral", CircleDashed],
          ] as [string, string, number, DeskTone, typeof Users][]).map(([key, label, count, tone, icon], index) => (
            <StatTile key={key} index={index} icon={icon} tone={tone} label={label} value={<bdi>{count}</bdi>}
              valueProps={{ "data-count": key.toLowerCase() }}
              onSelect={() => setTodayFilter((current) => (current === key ? "" : key))} selected={todayFilter === key} />
          ))}
        </DeskStats>
        <DeskFilterStatus shown={filtered.length} total={allStudents.length} onClear={() => { setSearch(""); setClassFilter(""); setTodayFilter(""); }} />

        {/* A class of forty is a scanning job, not a browsing one — the table
            puts roll number, grade and attendance in comparable columns. */}
        {filtered.length > 0 && prefs.view !== "cards" ? (
          <DataTable
          view={prefs.view}
          calendarLabel="Enrollment date"
          getCalendarDate={(row) => ({ value: row.enrollmentDate, kind: "date" })}
            rows={filtered}
            rowKey={(st: any) => st.id}
            minWidth={720}
            onRowClick={(st: any) => setSelectedStudent(st)}
            columns={[
              {
                key: "name",
                label: ui("Pupil"),
                render: (st: any) => (
                  <div className="flex items-center gap-2.5">
                    <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-edge/30 bg-brand-50">
                      <AvatarImage src={st.profileImageUrl} name={st.fullName} initialsClassName="text-2xs" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink-strong">{st.fullName}</span>
                      <span className="block text-xs text-ink-subtle tabular-nums">
                        {st.rollNo || ui("No roll number")}
                      </span>
                    </span>
                  </div>
                ),
              },
              {
                key: "class",
                label: ui("Class"),
                render: (st: any) => (
                  <span className="text-sm font-medium text-ink">{classLabel(st.class)}</span>
                ),
              },
              {
                key: "grade",
                label: ui("Latest grade"),
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
                      <span className="sr-only">{ui("No grade yet")}</span>
                    </span>
                  );
                },
              },
              {
                key: "today",
                label: ui("Today"),
                align: "center",
                render: (st: any) => <TodayChip status={st.todayAttendance} />,
              },
              {
                key: "guardian",
                label: ui("Guardian"),
                secondary: true,
                render: (st: any) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink"><bdi>{st.guardianName || ui("Not linked")}</bdi></p>
                    {st.guardianPhone ? (
                      <p className="truncate text-xs text-ink-subtle"><bdi dir="ltr" className="tabular-nums">{st.guardianPhone}</bdi></p>
                    ) : (
                      <p className="truncate text-xs text-ink-subtle">{ui("No phone")}</p>
                    )}
                  </div>
                ),
              },
              {
                /* §4.4b teacher · Students: one inline row action — a message on the school record (D6) — and the
                   rest (a call, the report card, the register) in the row overflow, as on the cards (§4.5.2). */
                key: "actions",
                label: ui("Actions"),
                align: "end",
                render: (st: any) => (
                  <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <Link href="/messages" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <MessageCircle aria-hidden="true" />
                      {ui("Message guardian")}
                    </Link>
                    <StudentRowMenu student={st} />
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
                          <bdi>{student.fullName}</bdi>
                        </h3>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-xs text-ink-subtle tabular-nums">
                            {student.rollNo || ui("No roll number")}
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
                        <p className="sk-eyebrow">{ui("Latest grade")}</p>
                        <p data-numeric className="text-sm font-bold tabular-nums text-primary">
                          {report ? report.grade || `${Math.round(report.percentage || 0)}%` : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-brand-50/70 px-3 py-2">
                        <p className="sk-eyebrow">{ui("Status")}</p>
                        {/* Stored casing varies ("active" / "ACTIVE"), which
                            rendered raw as lowercase text among title-cased UI. */}
                        <p className={`text-sm font-bold ${(student.status || "ACTIVE").toUpperCase() === "ACTIVE" ? "text-status-success-text" : "text-ink-subtle"}`}>
                          {(student.status || "ACTIVE").toUpperCase() === "ACTIVE" ? ui("Active") : ui("Inactive")}
                        </p>
                      </div>
                    </div>

                    {student.guardianName ? (
                      <div className="rounded-xl bg-muted/50 px-3 py-2">
                        <p className="sk-eyebrow mb-1">{ui("Guardian")}</p>
                        <p className="truncate text-sm font-medium text-ink-strong"><bdi>{student.guardianName}</bdi></p>
                        {student.guardianPhone ? (
                          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-ink-subtle">
                            <Phone aria-hidden="true" className="h-3 w-3 shrink-0" />
                            <span dir="ltr" className="truncate tabular-nums">{student.guardianPhone}</span>
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </Button>

                  {/* One inline action — a message on the school record (D6) — and the rest in the
                      row overflow: a call, the report card and the register (§4.5.2). */}
                  <div className="mt-4 flex items-center gap-2 border-t border-border-subtle pt-3">
                    <Link href="/messages" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}>
                      <MessageCircle aria-hidden="true" />
                      {ui("Message guardian")}
                    </Link>
                    <StudentRowMenu student={student} />
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
              title={ui("No pupils found")}
              description={search || classFilter || todayFilter ? ui("Try adjusting your search or filter.") : ui("No pupils are assigned to your classes yet.")}
              action={search || classFilter || todayFilter ? (
                <Button variant="secondary" type="button" onClick={() => { setSearch(""); setClassFilter(""); setTodayFilter(""); }}>
                  <X aria-hidden="true" /> {ui("Clear filters")}
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
      {/* M65: the support plans teachers propose for their pupils live with the pupils. */}
      <section aria-label={ui("Learning actions")} className="mt-6">
        <LearningActions />
      </section>
      <div className="mt-6"><PathwayPanel /></div>
    </TeacherPage>
  );
}


/**
 * Today's attendance, rendered where the teacher is already looking. Every register status has its own word
 * (late, part day and excused days are not "Unmarked").
 */
const TODAY_TONE: Record<string, { label: string; variant: DeskTone }> = {
  PRESENT: { label: "In today", variant: "success" },
  LATE: { label: "Late today", variant: "warning" },
  PARTIAL: { label: "Part day", variant: "info" },
  ABSENT: { label: "Absent today", variant: "danger" },
  EXCUSED: { label: "Excused absence", variant: "info" },
  LEAVE: { label: "On leave", variant: "warning" },
};

/** The filter chip a status counts under: in school (present, late, part day), absent, away with leave, unmarked. */
function todayBucket(status?: string | null): "PRESENT" | "ABSENT" | "LEAVE" | "UNMARKED" {
  if (status === "PRESENT" || status === "LATE" || status === "PARTIAL") return "PRESENT";
  if (status === "ABSENT") return "ABSENT";
  if (status === "LEAVE" || status === "EXCUSED") return "LEAVE";
  return "UNMARKED";
}

function todayLabel(ui: (key: string, values?: unknown[]) => string, status?: string | null) {
  const tone = status ? TODAY_TONE[status] : null;
  return tone ? ui(tone.label) : ui("Unmarked");
}

function TodayChip({ status }: { status?: string | null }) {
  const ui = useUiText();
  const tone = status ? TODAY_TONE[status] : null;
  return (
    <DeskPill tone={tone?.variant ?? "neutral"}>
      {todayLabel(ui, status)}
    </DeskPill>
  );
}

/** The row overflow for one pupil: call the guardian (tel:), the report card and the register — each only when offered. */
function StudentRowMenu({ student }: { student: any }) {
  const ui = useUiText();
  const router = useRouter();
  const access = useConsoleAccess();
  const phone = student.guardianPhone ? String(student.guardianPhone).replace(/\s+/g, "") : "";
  const classId = encodeURIComponent(student.class?.id || "");
  const items = [
    ...(phone ? [{ id: "call", label: "Call guardian", icon: Phone, href: `tel:${phone}` }] : []),
    ...(access.leafVisible("teacher", "report-cards") ? [{ id: "report", label: "Report card", icon: FileText, onSelect: () => router.push(`/teacher/reports?studentId=${encodeURIComponent(student.id)}&classId=${classId}`) }] : []),
    ...(access.leafVisible("teacher", "attendance") ? [{ id: "attendance", label: "Attendance", icon: CalendarCheck, onSelect: () => router.push(`/teacher/attendance?classId=${classId}`) }] : []),
  ];
  if (!items.length) return null;
  return (
    <Menu
      label="More actions"
      align="end"
      trigger={<IconButton size="sm" variant="ghost" label={ui("More actions for {0}", [student.fullName])}><MoreHorizontal aria-hidden="true" /></IconButton>}
      items={items}
    />
  );
}
