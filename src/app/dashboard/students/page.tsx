"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Loader2,
  Plus,
  Search,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionForm } from "./admission-form";
import { BulkImportDialog } from "./bulk-import-dialog";
import { SkeletonList } from "@/components/ui/skeleton";
import { localToday } from "@/lib/date-only";

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
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-label={`Sort by ${column}${active ? `, currently ${sortDir}ending` : ""}`}
        className="flex cursor-pointer items-center gap-1 hover:text-primary"
      >
        {children}
        <Icon className={`h-3 w-3 ${active ? "text-primary" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}

export default function StudentsPage() {
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
  const [attendanceDate, setAttendanceDate] = useState(localToday());
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attendanceStudents, setAttendanceStudents] = useState<AttendanceStudent[]>([]);
  const [attendanceEntries, setAttendanceEntries] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceSummary, setAttendanceSummary] = useState({ total: 0, present: 0, absent: 0, leave: 0, unmarked: 0, repeatedAbsenceWarnings: 0 });
  const [attendanceLoading, setAttendanceLoading] = useState(false);

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load students");
    } finally {
      setIsLoading(false);
    }
  }, [classFilter, searchQuery, statusFilter, sortBy, sortDir, page]);

  // Any change to what is being listed resets to page 1 — otherwise filtering a
  // 200-student roster down to 3 while sitting on page 4 shows an empty table.
  const resetPage = () => setPage(1);

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

  const bulkSetStatus = async (status: string) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk update failed");
      toast.success(`${data.updated} student${data.updated === 1 ? "" : "s"} set to ${status}`);
      await loadStudents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk update failed");
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load attendance");
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
    if (!attendanceClassId) return toast.error("Select a class first");
    const entries = attendanceStudents.map((student) => ({
      studentId: student.id,
      status: attendanceEntries[student.id] || "PRESENT",
    }));

    setAttendanceLoading(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: attendanceClassId, date: attendanceDate, entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save attendance");
      toast.success("Attendance saved");
      await loadAttendance();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save attendance");
    } finally {
      setAttendanceLoading(false);
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

  return (
    <>
      <Header
        title="Students"
        description="Manage student records, guardians, classes, and daily attendance"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowBulkImport(true)} disabled={classes.length === 0}>
              <Upload className="h-4 w-4" />
              Bulk Import
            </Button>
            <Button size="sm" onClick={() => setShowAdmissionForm(true)} disabled={classes.length === 0}>
              <Plus className="h-4 w-4" />
              Add Student
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Student Roster */}
        <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: "0ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Student Roster
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name, roll, guardian..."
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    resetPage();
                  }}
                  className="pl-9"
                />
              </div>
              <Select
                aria-label="Filter students by class"
                className="w-full md:w-56"
                value={classFilter}
                onChange={(event) => {
                  setClassFilter(event.target.value);
                  resetPage();
                }}
              >
                <option value="">All Classes</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
                ))}
              </Select>
              <Select
                className="w-full md:w-44"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as "active" | "archived");
                  resetPage();
                }}
                aria-label="Filter by status"
              >
                <option value="active">On roll</option>
                <option value="archived">Archived / left</option>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={students.length === 0}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>

            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <span className="text-sm font-semibold">
                  {selected.size} selected
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => bulkSetStatus(statusFilter === "archived" ? "active" : "archived")}
                >
                  {bulkBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {statusFilter === "archived" ? "Restore to roll" : "Archive"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              </div>
            )}

            {isLoading ? (
              <SkeletonList rows={4} label="Loading classes" />
            ) : classes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Plus className="mb-3 h-8 w-8 text-muted-foreground" />
                <h3 className="font-semibold">Create a class first</h3>
                <p className="mt-1 text-sm text-muted-foreground">Students need to be linked to a class and campus.</p>
              </div>
            ) : students.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Plus className="mb-3 h-8 w-8 text-muted-foreground" />
                <h3 className="font-semibold">No students found</h3>
                <p className="mt-1 text-sm text-muted-foreground">Add one student or import a CSV roster.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <input
                          type="checkbox"
                          checked={allOnPageSelected}
                          onChange={() =>
                            setSelected(allOnPageSelected ? new Set() : new Set(students.map((s) => s.id)))
                          }
                          aria-label="Select all students on this page"
                          className="h-4 w-4 accent-[#8127cf]"
                        />
                      </TableHead>
                      <SortHeader column="rollNo" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Roll No</SortHeader>
                      <SortHeader column="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Name</SortHeader>
                      <SortHeader column="class" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Class</SortHeader>
                      <TableHead>Login</TableHead>
                      <SortHeader column="guardian" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Guardian</SortHeader>
                      <TableHead>Phone</TableHead>
                      <TableHead>Gender</TableHead>
                      <SortHeader column="status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Status</SortHeader>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selected.has(student.id)}
                            onChange={() => toggleRow(student.id)}
                            aria-label={`Select ${student.fullName}`}
                            className="h-4 w-4 accent-[#8127cf]"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{student.rollNo}</TableCell>
                        <TableCell>
                          <div className="font-medium">{student.fullName}</div>
                          {student.city && (
                            <div className="text-xs text-muted-foreground">{student.city}</div>
                          )}
                        </TableCell>
                        <TableCell>{classLabel(student.class)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{student.studentUser?.email || "Not linked"}</TableCell>
                        <TableCell>
                          <div className="text-muted-foreground">{student.guardianName || "Not recorded"}</div>
                          {student.guardianPhone && (
                            <div className="text-xs text-muted-foreground">{student.guardianPhone}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{student.phone || student.guardianPhone || "—"}</TableCell>
                        <TableCell><Badge variant="secondary">{student.gender}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(student.status)}>
                            {student.status || "active"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination. The API has always capped the roster at 50 rows and
                returned a total; without these controls every student past the
                50th was simply unreachable from this screen. */}
            {!isLoading && pagination.total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-sm text-muted-foreground">
                  Showing{" "}
                  <span className="font-semibold text-foreground">
                    {(pagination.page - 1) * pagination.limit + 1}–
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                  </span>{" "}
                  of <span className="font-semibold text-foreground">{pagination.total}</span> students
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pagination.page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm font-semibold">
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                    disabled={pagination.page >= pagination.pages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Attendance */}
        <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: "160ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              Daily Attendance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[220px_220px_1fr] md:items-end">
              <div className="space-y-1">
                <Label htmlFor="attendance-date">Date</Label>
                <Input id="attendance-date" type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="attendance-class">Class</Label>
                <Select id="attendance-class" value={attendanceClassId} onChange={(event) => setAttendanceClassId(event.target.value)}>
                  <option value="">Select class</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => markAll("PRESENT")} disabled={attendanceStudents.length === 0}>All Present</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => markAll("ABSENT")} disabled={attendanceStudents.length === 0}>All Absent</Button>
                <Button type="button" size="sm" onClick={saveAttendance} disabled={attendanceLoading || attendanceStudents.length === 0}>
                  {attendanceLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Attendance
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-5">
              {[
                ["Total", attendanceSummary.total],
                ["Present", attendanceSummary.present],
                ["Absent", attendanceSummary.absent],
                ["Leave", attendanceSummary.leave],
                ["Warnings", attendanceSummary.repeatedAbsenceWarnings],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold">{value}</p>
                </div>
              ))}
            </div>

            {attendanceLoading ? (
              <SkeletonList rows={5} label="Loading students" />
            ) : attendanceStudents.length === 0 ? (
              <div className="py-8 text-sm text-muted-foreground">Select a class with students to mark attendance.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Warning</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceStudents.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell>
                          <div className="font-medium">{student.fullName}</div>
                          <div className="text-xs text-muted-foreground">{student.rollNo}</div>
                        </TableCell>
                        <TableCell>{classLabel(student.class)}</TableCell>
                        <TableCell>
                          {student.absenceWarning ? (
                            <Badge variant="warning" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {student.recentAbsences} absences
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Clear</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {(["PRESENT", "ABSENT", "LEAVE"] as const).map((status) => (
                              <Button
                                key={status}
                                type="button"
                                size="sm"
                                variant={attendanceEntries[student.id] === status ? "default" : "outline"}
                                onClick={() => setAttendanceEntries((entries) => ({ ...entries, [student.id]: status }))}
                              >
                                {status}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
