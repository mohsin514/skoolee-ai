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
import { AlertCircle, CalendarCheck, Loader2, Plus, Search, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { AdmissionForm } from "./admission-form";
import { BulkImportDialog } from "./bulk-import-dialog";
import { SkeletonList } from "@/components/ui/skeleton";

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

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
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

      const [studentsRes, classesRes] = await Promise.all([
        fetch(`/api/students?${params.toString()}`),
        fetch("/api/classes"),
      ]);
      const [studentsData, classesData] = await Promise.all([studentsRes.json(), classesRes.json()]);

      if (!studentsRes.ok) throw new Error(studentsData.error || "Could not load students");
      if (!classesRes.ok) throw new Error(classesData.error || "Could not load classes");

      const loadedClasses = classesData.data || [];
      setStudents(studentsData.data || []);
      setClasses(loadedClasses);
      setAttendanceClassId((current) => current || loadedClasses[0]?.id || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load students");
    } finally {
      setIsLoading(false);
    }
  }, [classFilter, searchQuery]);

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
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-9"
                />
              </div>
              <Select className="w-full md:w-56" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                <option value="">All Classes</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
                ))}
              </Select>
            </div>

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
                      <TableHead>Roll No</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Login</TableHead>
                      <TableHead>Guardian</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => (
                      <TableRow key={student.id}>
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
                <Label>Date</Label>
                <Input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Class</Label>
                <Select value={attendanceClassId} onChange={(event) => setAttendanceClassId(event.target.value)}>
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
