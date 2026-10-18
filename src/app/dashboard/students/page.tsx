"use client";
import { InputGroup } from "@/components/ui/input-group";


import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  School,
  Search,
  SearchX,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { AdmissionForm } from "./admission-form";
import { BulkImportDialog } from "./bulk-import-dialog";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { InfoTip, Tooltip } from "@/components/ui/tooltip";
import { localToday } from "@/lib/date-only";
import { Checkbox as SystemCheckbox } from "@/components/ui/checkbox";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useUiText } from "@/components/locale/LocaleProvider";
import { describeCounts } from "@/components/shared-admin/academic-impact";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LEAVE";

interface ClassRecord {
  id: string;
  name: string;
  section?: string | null;
  academicYear: number;
}

interface StudentRecord {
  id: string;
  fullName: string;
  rollNo: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth?: string | null;
  phone?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianWhatsapp?: string | null;
  guardianEmail?: string | null;
  studentUser?: { email: string; isActive: boolean } | null;
  address?: string | null;
  city?: string | null;
  status?: string;
  classId: string;
  class?: ClassRecord;
}

interface AttendanceStudent extends StudentRecord {
  attendance?: { status: AttendanceStatus } | null;
  absenceWarning: boolean;
  recentAbsences: number;
}

function classLabel(cls?: ClassRecord | null) {
  if (!cls) return "Unassigned";
  return [cls.name, cls.section].filter(Boolean).join(" ");
}

function sectionLabel(cls: ClassRecord) {
  return cls.section || "Main";
}

function classGroupKey(cls: ClassRecord) {
  return `${cls.academicYear}::${cls.name}`;
}

function groupClasses(classes: ClassRecord[]) {
  const groups = new Map<string, { key: string; name: string; academicYear: number; sections: ClassRecord[] }>();

  for (const cls of classes) {
    const key = classGroupKey(cls);
    const group = groups.get(key) || { key, name: cls.name, academicYear: cls.academicYear, sections: [] };
    group.sections.push(cls);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    sections: group.sections.sort((a, b) => sectionLabel(a).localeCompare(sectionLabel(b))),
  }));
}

function statusBadgeVariant(status?: string): "success" | "secondary" | "warning" {
  if (status === "archived") return "warning";
  if (status === "transferred") return "secondary";
  return "success";
}

/** Interface words for the stored enums; the stored values never change. */
const GENDER_LABELS: Record<StudentRecord["gender"], string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };
const STATUS_LABELS: Record<string, string> = { active: "Active", archived: "Archived", transferred: "Transferred" };
const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = { PRESENT: "Present", ABSENT: "Absent", LEAVE: "Leave" };

/**
 * A sortable column header.
 *
 * Defined at module scope rather than inside the page: a component declared in
 * the render body is a new type on every pass, so React unmounts and remounts
 * the entire header row each time the roster reloads.
 */
function SortHeader({
  column,
  sortBy,
  sortDir,
  onSort,
  children,
}: {
  column: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (column: string) => void;
  children: React.ReactNode;
}) {
  const active = sortBy === column;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
      <Button variant="ghost"
        type="button"
        onClick={() => onSort(column)}
        aria-label={`Sort by ${column}${active ? `, currently ${sortDir}ending` : ""}`}
        className="-ms-2 justify-start px-2 text-xs font-semibold text-ink-muted"
      >
        {children}
        <Icon aria-hidden="true" className={active ? "text-primary" : "opacity-40"} />
      </Button>
    </TableHead>
  );
}

/**
 * Explains a disabled header action. A disabled button cannot take focus or
 * hover, so the reason sits on a focusable wrapper and is shown as a tooltip.
 */
function BlockedReason({ blocked, reason, children }: { blocked: boolean; reason: string; children: React.ReactElement }) {
  if (!blocked) return children;
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} className="inline-flex rounded-2xl">
        {children}
      </span>
    </Tooltip>
  );
}

export default function StudentsPage() {
  const ui = useUiText();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">("active");
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(localToday());
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attendanceStudents, setAttendanceStudents] = useState<AttendanceStudent[]>([]);
  const [attendanceEntries, setAttendanceEntries] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceSummary, setAttendanceSummary] = useState({ total: 0, present: 0, absent: 0, leave: 0, unmarked: 0, repeatedAbsenceWarnings: 0 });
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceLoadFailed, setAttendanceLoadFailed] = useState(false);

  const loadStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (classFilter) params.set("classId", classFilter);
      if (statusFilter === "archived") params.set("status", "archived");
      if (sortBy) {
        params.set("sortBy", sortBy);
        params.set("sortDir", sortDir);
      }
      params.set("page", String(page));

      const [studentsRes, classesRes] = await Promise.all([
        fetch(`/api/students?${params.toString()}`),
        fetch("/api/classes"),
      ]);
      const [studentsData, classesData] = await Promise.all([studentsRes.json(), classesRes.json()]);

      if (!studentsRes.ok) throw new Error(studentsData.error || "Could not load students");
      if (!classesRes.ok) throw new Error(classesData.error || "Could not load classes");

      const loadedClasses = classesData.data || [];
      setStudents(studentsData.data || []);
      setPagination(studentsData.pagination || { page: 1, limit: 50, total: 0, pages: 1 });
      // A selection is only meaningful for rows that are still on screen.
      setSelected(new Set());
      setClasses(loadedClasses);
      setAttendanceClassId((current) => current || loadedClasses[0]?.id || "");
      setLoadFailed(false);
    } catch {
      // Shown in place of the roster with a retry, rather than as an empty table.
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, [classFilter, searchQuery, statusFilter, sortBy, sortDir, page]);

  // Any change to what is being listed resets to page 1 — otherwise filtering a
  // 200-student roster down to 3 while sitting on page 4 shows an empty table.
  const resetPage = () => setPage(1);

  const filtersActive = Boolean(searchQuery.trim() || classFilter || statusFilter === "archived");
  const clearFilters = () => {
    setSearchQuery("");
    setClassFilter("");
    setStatusFilter("active");
    resetPage();
  };

  const toggleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
    resetPage();
  };

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOnPageSelected = students.length > 0 && students.every((s) => selected.has(s.id));

  // SKO-389: a bulk archive shows the summed history counts in a labelled dialog before anything changes.
  const [archiveReview, setArchiveReview] = useState<{ count: number; summary: string } | null>(null);
  const bulkSetStatus = async (status: string) => {
    if (selected.size === 0) return;
    if (status !== "archived") { await applyBulkStatus(status); return; }
    setBulkBusy(true);
    try {
      const previews = await Promise.all([...selected].map(async (id) => {
        const response = await fetch(`/api/students?id=${encodeURIComponent(id)}&preview=true`, { method: "DELETE" });
        const preview = await response.json();
        if (!response.ok) throw new Error(preview.error || ui("Could not calculate student impact"));
        return preview.dependencies as Record<string, number>;
      }));
      const totals = previews.reduce<Record<string, number>>((all, item) => {
        for (const [key, count] of Object.entries(item)) all[key] = (all[key] || 0) + Number(count || 0);
        return all;
      }, {});
      setArchiveReview({ count: selected.size, summary: describeCounts(totals, ui) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : ui("Could not calculate student impact"));
    } finally {
      setBulkBusy(false);
    }
  };
  const applyBulkStatus = async (status: string) => {
    setBulkBusy(true);
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], status, reason: "Archived by administrator" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ui("Could not change the selected students. Please try again."));
      toast.success(data.unchanged ? ui("{0} student(s) changed; {1} already had this status.", [data.updated, data.unchanged]) : ui("{0} student(s) changed.", [data.updated]));
      setArchiveReview(null);
      await loadStudents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : ui("Could not change the selected students. Please try again."));
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = () => {
    // Export exactly what the filters currently describe, not the page — an
    // export that silently gave you 50 of 300 rows would be worse than none.
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (classFilter) params.set("classId", classFilter);
    if (statusFilter === "archived") params.set("status", "archived");
    window.location.href = `/api/students/export?${params.toString()}`;
  };

  const loadAttendance = useCallback(async () => {
    if (!attendanceClassId) {
      setAttendanceStudents([]);
      setAttendanceLoadFailed(false);
      return;
    }

    setAttendanceLoading(true);
    try {
      const params = new URLSearchParams({ classId: attendanceClassId, date: attendanceDate });
      const res = await fetch(`/api/attendance?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load attendance");

      const roster = data.students || [];
      setAttendanceStudents(roster);
      setAttendanceSummary(data.summary);
      setAttendanceEntries(
        roster.reduce((acc: Record<string, AttendanceStatus>, student: AttendanceStudent) => {
          if (student.attendance?.status) acc[student.id] = student.attendance.status;
          return acc;
        }, {})
      );
      setAttendanceLoadFailed(false);
    } catch {
      // Shown in place of the register with a retry.
      setAttendanceLoadFailed(true);
    } finally {
      setAttendanceLoading(false);
    }
  }, [attendanceClassId, attendanceDate]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const classGroups = groupClasses(classes);

  const saveAttendance = async () => {
    if (!attendanceClassId) return toast.error(ui("Select a class first"));
    const entries = attendanceStudents.map((student) => ({
      studentId: student.id,
      status: attendanceEntries[student.id] || "PRESENT",
    }));

    setAttendanceLoading(true);
    setAttendanceSaving(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: attendanceClassId, date: attendanceDate, entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ui("Could not save attendance. Please try again."));
      toast.success(ui("Attendance saved for {0} student(s).", [entries.length]));
      await loadAttendance();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : ui("Could not save attendance. Please try again."));
    } finally {
      setAttendanceLoading(false);
      setAttendanceSaving(false);
    }
  };

  const markAll = (status: AttendanceStatus) => {
    setAttendanceEntries(
      attendanceStudents.reduce<Record<string, AttendanceStatus>>((acc, student) => {
        acc[student.id] = status;
        return acc;
      }, {})
    );
  };

  const handleAdmissionSuccess = () => {
    setShowAdmissionForm(false);
    loadStudents();
  };

  const handleBulkImportSuccess = () => {
    loadStudents();
  };

  // Admission and import both need a class to place students in.
  const needsClass = !isLoading && !loadFailed && classes.length === 0;
  const needsClassReason = ui("Create a class first. Students need to be linked to a class and campus.");

  return (
    <>
      <ConfirmAction open={Boolean(archiveReview)} title={ui("Archive {0} student(s)?", [archiveReview?.count ?? 0])} description={ui("The selected students have {0}. Archive removes them from active lists; academic, financial and document history stays preserved and each can be restored later.", [archiveReview?.summary ?? ""])} confirmLabel={ui("Archive Student")} tone="warning" busy={bulkBusy} onCancel={() => setArchiveReview(null)} onConfirm={() => void applyBulkStatus("archived")} />
      <Header
        title={ui("Students")}
        description={ui("Manage student records, guardians, classes, and daily attendance")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/guardians" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {ui("Guardians & access")}
            </Link>
            <BlockedReason blocked={needsClass} reason={needsClassReason}>
              <Button variant="outline" size="sm" onClick={() => setShowBulkImport(true)} disabled={classes.length === 0}>
                <Upload aria-hidden="true" />
                {ui("Bulk Import")}
              </Button>
            </BlockedReason>
            <BlockedReason blocked={needsClass} reason={needsClassReason}>
              <Button size="sm" onClick={() => setShowAdmissionForm(true)} disabled={classes.length === 0}>
                <Plus aria-hidden="true" />
                {ui("Add Student")}
              </Button>
            </BlockedReason>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {/* Student Roster */}
        <Card className="sk-enter min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-primary">
                <Users className="size-4" />
              </span>
              {ui("Student Roster")}
            </CardTitle>
            <CardDescription>
              {ui("Search, sort and export student records. Select rows to archive them or restore them to the roll.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
              <InputGroup className="min-w-0 flex-1 md:max-w-sm">
                <Search data-field-affix="start" aria-hidden="true" className="size-4 text-ink-subtle" />
                <Input
                  aria-label={ui("Search students")}
                  placeholder={ui("Search name, roll, guardian...")}
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    resetPage();
                  }}

                />
              </InputGroup>
              <Select
                aria-label={ui("Filter students by class")}
                className={"w-full md:w-56"}
                value={classFilter}
                onChange={(event) => {
                  setClassFilter(event.target.value);
                  resetPage();
                }}
              >
                <option value="">{ui("All Classes")}</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
                ))}
              </Select>
              <Select
                className={"w-full md:w-44"}
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as "active" | "archived");
                  resetPage();
                }}
                aria-label={ui("Filter by status")}
              >
                <option value="active">{ui("On roll")}</option>
                <option value="archived">{ui("Archived / left")}</option>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={students.length === 0} className="md:ms-auto">
                <Download aria-hidden="true" />
                {ui("Export CSV")}
              </Button>
            </div>

            {selected.size > 0 && (
              <div className="sk-enter flex flex-wrap items-center gap-3 rounded-2xl border border-status-brand-border bg-status-brand-surface px-3 py-2">
                <span className="text-sm font-semibold tabular-nums text-status-brand-text">
                  {ui("{0} selected", [selected.size])}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={bulkBusy}
                  onClick={() => bulkSetStatus(statusFilter === "archived" ? "active" : "archived")}
                >
                  {statusFilter === "archived" ? ui("Restore to roll") : ui("Archive")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  {ui("Clear selection")}
                </Button>
              </div>
            )}

            {isLoading ? (
              <SkeletonTable rows={6} columns={5} label={ui("Loading students")} />
            ) : loadFailed ? (
              <ErrorState
                title={ui("Could not load students")}
                description={ui("The student roster did not load. Check your connection and try again.")}
                onRetry={() => void loadStudents()}
              />
            ) : classes.length === 0 ? (
              <EmptyState
                icon={School}
                size="sm"
                title={ui("Create a class first")}
                description={ui("Students need to be linked to a class and campus.")}
                action={
                  <Link href="/dashboard/classes" className={buttonVariants({ size: "sm" })}>
                    <Plus aria-hidden="true" />
                    {ui("Go to classes")}
                  </Link>
                }
              />
            ) : students.length === 0 ? (
              filtersActive ? (
                <EmptyState
                  icon={SearchX}
                  size="sm"
                  title={ui("No students match these filters")}
                  description={ui("Try another name or class, or clear the filters to see everyone on roll.")}
                  action={
                    <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                      {ui("Clear filters")}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={UserPlus}
                  size="sm"
                  title={ui("No students found")}
                  description={ui("Add one student or import a CSV roster.")}
                  action={
                    <Button type="button" size="sm" onClick={() => setShowAdmissionForm(true)}>
                      <Plus aria-hidden="true" />
                      {ui("Add Student")}
                    </Button>
                  }
                  secondaryAction={
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowBulkImport(true)}>
                      <Upload aria-hidden="true" />
                      {ui("Bulk Import")}
                    </Button>
                  }
                />
              )
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <SystemCheckbox

                        checked={allOnPageSelected}
                        onChange={() =>
                          setSelected(allOnPageSelected ? new Set() : new Set(students.map((s) => s.id)))
                        }
                        aria-label="Select all students on this page"
                      />
                    </TableHead>
                    <SortHeader column="rollNo" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{ui("Roll No")}</SortHeader>
                    <SortHeader column="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{ui("Name")}</SortHeader>
                    <SortHeader column="class" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{ui("Class")}</SortHeader>
                    <TableHead>
                      <span className="inline-flex items-center gap-1">
                        {ui("Login")}
                        <InfoTip content={ui("The email this student signs in with. Not linked means the student has no login yet.")} />
                      </span>
                    </TableHead>
                    <SortHeader column="guardian" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{ui("Guardian")}</SortHeader>
                    <TableHead>{ui("Phone")}</TableHead>
                    <TableHead>{ui("Gender")}</TableHead>
                    <SortHeader column="status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{ui("Status")}</SortHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id} data-state={selected.has(student.id) ? "selected" : undefined}>
                      <TableCell>
                        <SystemCheckbox

                          checked={selected.has(student.id)}
                          onChange={() => toggleRow(student.id)}
                          aria-label={`Select ${student.fullName}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-ink-muted">{student.rollNo}</TableCell>
                      <TableCell className="min-w-40">
                        <div className="font-semibold text-ink-strong">{student.fullName}</div>
                        {student.city && (
                          <div className="text-xs text-ink-subtle">{student.city}</div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{student.class ? classLabel(student.class) : ui("Unassigned")}</TableCell>
                      <TableCell className="text-sm text-ink-muted">
                        {student.studentUser?.email ? <bdi>{student.studentUser.email}</bdi> : <span className="text-ink-subtle">{ui("Not linked")}</span>}
                      </TableCell>
                      <TableCell className="min-w-36">
                        <div className="text-ink-muted">{student.guardianName || <span className="text-ink-subtle">{ui("Not recorded")}</span>}</div>
                        {student.guardianPhone && (
                          <div className="text-xs tabular-nums text-ink-subtle"><bdi dir="ltr">{student.guardianPhone}</bdi></div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums text-ink-muted">
                        {student.phone || student.guardianPhone ? <bdi dir="ltr">{student.phone || student.guardianPhone}</bdi> : "—"}
                      </TableCell>
                      <TableCell><Badge variant="neutral" size="sm">{ui(GENDER_LABELS[student.gender] ?? student.gender)}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(student.status)} size="sm" dot>
                          {ui(STATUS_LABELS[student.status || "active"] ?? student.status ?? "Active")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Pagination. The API has always capped the roster at 50 rows and
                returned a total; without these controls every student past the
                50th was simply unreachable from this screen. */}
            {!isLoading && !loadFailed && pagination.total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
                <p className="text-sm text-ink-muted tabular-nums">
                  {ui("Showing {0}–{1} of {2} students", [
                    (pagination.page - 1) * pagination.limit + 1,
                    Math.min(pagination.page * pagination.limit, pagination.total),
                    pagination.total,
                  ])}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pagination.page <= 1}
                  >
                    <ChevronLeft aria-hidden="true" className="rtl:rotate-180" />
                    {ui("Previous")}
                  </Button>
                  <span className="text-sm font-medium tabular-nums text-ink-muted">
                    {ui("Page {0} of {1}", [pagination.page, pagination.pages])}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                    disabled={pagination.page >= pagination.pages}
                  >
                    {ui("Next")}
                    <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Attendance */}
        <Card className="sk-enter min-w-0" style={{ "--sk-delay": "80ms" } as React.CSSProperties}>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-primary">
                <CalendarCheck className="size-4" />
              </span>
              {ui("Daily Attendance")}
            </CardTitle>
            <CardDescription>
              {ui("Mark each student for the chosen date, then save. Anyone left unmarked is saved as present.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] xl:items-end">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="attendance-date">{ui("Date")}</Label>
                <Input id="attendance-date" type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="attendance-class">{ui("Class")}</Label>
                <Select id="attendance-class" value={attendanceClassId} onChange={(event) => setAttendanceClassId(event.target.value)}>
                  <option value="">{ui("Select class")}</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1 xl:justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => markAll("PRESENT")} disabled={attendanceStudents.length === 0}>{ui("All Present")}</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => markAll("ABSENT")} disabled={attendanceStudents.length === 0}>{ui("All Absent")}</Button>
                <Button type="button" size="sm" onClick={saveAttendance} loading={attendanceSaving} disabled={attendanceLoading || attendanceStudents.length === 0}>
                  {ui("Save Attendance")}
                </Button>
              </div>
            </div>

            <div className="sk-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {[
                ["Total", attendanceSummary.total],
                ["Present", attendanceSummary.present],
                ["Absent", attendanceSummary.absent],
                ["Leave", attendanceSummary.leave],
                ["Warnings", attendanceSummary.repeatedAbsenceWarnings],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-2xl border border-border-subtle bg-surface-subtle p-3">
                  <p className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
                    {ui(String(label))}
                    {label === "Warnings" ? (
                      <InfoTip content={ui("Students absent 3 or more times in the 7 days up to the chosen date.")} className="-my-1" />
                    ) : null}
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-ink-strong">{value}</p>
                </div>
              ))}
            </div>

            {attendanceLoading ? (
              <SkeletonTable rows={5} columns={4} label={ui("Loading students")} />
            ) : attendanceLoadFailed ? (
              <ErrorState
                title={ui("Could not load attendance")}
                description={ui("The register for this class and date did not load. Check your connection and try again.")}
                onRetry={() => void loadAttendance()}
              />
            ) : attendanceStudents.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                size="sm"
                title={ui("No students to mark")}
                description={ui("Select a class with students to mark attendance.")}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ui("Student")}</TableHead>
                    <TableHead>{ui("Class")}</TableHead>
                    <TableHead>{ui("Warning")}</TableHead>
                    <TableHead className="text-end">{ui("Status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="min-w-40">
                        <div className="font-semibold text-ink-strong">{student.fullName}</div>
                        <div className="text-xs tabular-nums text-ink-subtle">{student.rollNo}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{student.class ? classLabel(student.class) : ui("Unassigned")}</TableCell>
                      <TableCell>
                        {student.absenceWarning ? (
                          <Badge variant="warning" size="sm" className="tabular-nums">
                            <AlertCircle aria-hidden="true" />
                            {ui("{0} absences", [student.recentAbsences])}
                          </Badge>
                        ) : (
                          <span className="text-xs text-ink-subtle">{ui("Clear")}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div role="group" aria-label={ui("Attendance for {0}", [student.fullName])} className="flex justify-end gap-1">
                          {(["PRESENT", "ABSENT", "LEAVE"] as const).map((status) => (
                            <Button
                              key={status}
                              type="button"
                              size="sm"
                              aria-pressed={attendanceEntries[student.id] === status}
                              variant={attendanceEntries[student.id] === status ? "default" : "outline"}
                              onClick={() => setAttendanceEntries((entries) => ({ ...entries, [student.id]: status }))}
                            >
                              {ui(ATTENDANCE_LABELS[status])}
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4-Step Admission Form */}
      {showAdmissionForm && (
        <AdmissionForm
          classes={classes}
          classGroups={classGroups}
          onSuccess={handleAdmissionSuccess}
          onClose={() => setShowAdmissionForm(false)}
        />
      )}

      {/* Bulk Import Dialog */}
      <BulkImportDialog
        open={showBulkImport}
        onOpenChange={setShowBulkImport}
        classes={classes}
        defaultClassId={classFilter || classes[0]?.id || ""}
        onSuccess={handleBulkImportSuccess}
      />
    </>
  );
}
