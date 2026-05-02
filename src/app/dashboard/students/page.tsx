"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CalendarCheck, Loader2, Plus, Search, Upload, Users } from "lucide-react";
import { toast } from "sonner";

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
  classId: string;
  class?: ClassRecord;
}

interface AttendanceStudent extends StudentRecord {
  attendance?: { status: AttendanceStatus } | null;
  absenceWarning: boolean;
  recentAbsences: number;
}

const emptyStudentForm = {
  fullName: "",
  rollNo: "",
  classId: "",
  gender: "OTHER",
  dateOfBirth: "",
  phone: "",
  studentEmail: "",
  guardianName: "",
  guardianPhone: "",
  guardianWhatsapp: "",
  guardianEmail: "",
  address: "",
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pick(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value) return value;
  }
  return "";
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

export default function StudentsPage() {
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [studentForm, setStudentForm] = useState(emptyStudentForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
      setStudentForm((form) => ({ ...form, classId: form.classId || loadedClasses[0]?.id || "" }));
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
  const selectedStudentClass = classes.find((cls) => cls.id === studentForm.classId);
  const selectedStudentGroupKey = selectedStudentClass ? classGroupKey(selectedStudentClass) : "";
  const selectedStudentGroup = classGroups.find((group) => group.key === selectedStudentGroupKey);
  const selectStudentClassGroup = (key: string) => {
    const group = classGroups.find((item) => item.key === key);
    setStudentForm((form) => ({ ...form, classId: group?.sections[0]?.id || "" }));
  };

  const addStudent = async (event: FormEvent) => {
    event.preventDefault();
    const guardianEmail = studentForm.guardianEmail.trim();
    const studentEmail = studentForm.studentEmail.trim();
    if (studentEmail && !isValidEmail(studentEmail)) {
      return toast.error("Enter a valid student login email or leave it blank");
    }
    if (guardianEmail && !isValidEmail(guardianEmail)) {
      return toast.error("Enter a valid guardian email or leave it blank");
    }
    if (studentEmail && guardianEmail && studentEmail.toLowerCase() === guardianEmail.toLowerCase()) {
      return toast.error("Student login email must be different from guardian email");
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...studentForm, studentEmail: studentEmail || null, guardianEmail: guardianEmail || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add student");
      toast.success(data.message || "Student added");
      if (data.guardianInviteFailures?.length) {
        toast.warning("Student was created, but the guardian invite email could not be sent.");
      }
      if (data.studentInviteFailures?.length) {
        toast.warning("Student was created, but the student login invite email could not be sent.");
      }
      setShowAddDialog(false);
      setStudentForm({ ...emptyStudentForm, classId: classes[0]?.id || "" });
      await loadStudents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add student");
    } finally {
      setIsSaving(false);
    }
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const [headers, ...bodyRows] = rows;
      if (!headers || bodyRows.length === 0) throw new Error("CSV needs a header row and at least one student");

      const normalizedHeaders = headers.map(normalizeHeader);
      const studentsFromCsv = bodyRows.map((values) => {
        const row = normalizedHeaders.reduce<Record<string, string>>((acc, header, index) => {
          acc[header] = values[index] || "";
          return acc;
        }, {});
        return {
          fullName: pick(row, ["fullName", "studentName", "name"]),
          rollNo: pick(row, ["rollNo", "rollNumber", "registrationNo", "regNo"]),
          classId: pick(row, ["classId"]) || classFilter || attendanceClassId || classes[0]?.id || "",
          gender: (pick(row, ["gender"]).toUpperCase() || "OTHER") as "MALE" | "FEMALE" | "OTHER",
          dateOfBirth: pick(row, ["dateOfBirth", "dob"]),
          phone: pick(row, ["phone", "studentPhone"]),
          studentEmail: pick(row, ["studentEmail", "studentLoginEmail", "studentEmailAddress", "email"]),
          guardianName: pick(row, ["guardianName", "parentName"]),
          guardianPhone: pick(row, ["guardianPhone", "parentPhone"]),
          guardianWhatsapp: pick(row, ["guardianWhatsapp", "whatsapp"]),
          guardianEmail: pick(row, ["guardianEmail", "parentEmail"]),
          address: pick(row, ["address"]),
        };
      });

      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: studentsFromCsv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not import CSV");
      toast.success(data.message || "Students imported");
      if (data.guardianInviteFailures?.length) {
        toast.warning("Some guardian invite emails could not be sent.");
      }
      await loadStudents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV import failed");
    }
  };

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

  return (
    <>
      <Header
        title="Students"
        description="Manage student records, guardians, classes, and daily attendance"
        actions={
          <div className="flex gap-2">
            <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />
            <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()} disabled={classes.length === 0}>
              <Upload className="h-4 w-4" />
              Bulk Import
            </Button>
            <Button size="sm" onClick={() => setShowAddDialog(true)} disabled={classes.length === 0}>
              <Plus className="h-4 w-4" />
              Add Student
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        <Card>
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
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
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
                      <TableHead>WhatsApp</TableHead>
                      <TableHead>Gender</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-mono text-xs">{student.rollNo}</TableCell>
                        <TableCell className="font-medium">{student.fullName}</TableCell>
                        <TableCell>{classLabel(student.class)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{student.studentUser?.email || "Not linked"}</TableCell>
                        <TableCell className="text-muted-foreground">{student.guardianName || "Not recorded"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{student.guardianPhone || student.phone || "Not recorded"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{student.guardianWhatsapp || "Not recorded"}</TableCell>
                        <TableCell><Badge variant="secondary">{student.gender}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
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
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
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

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Student</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={addStudent}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input value={studentForm.fullName} onChange={(event) => setStudentForm((form) => ({ ...form, fullName: event.target.value }))} placeholder="Ahmed Khan" required />
              </div>
              <div className="space-y-2">
                <Label>Roll Number *</Label>
                <Input value={studentForm.rollNo} onChange={(event) => setStudentForm((form) => ({ ...form, rollNo: event.target.value }))} placeholder="10-A-001" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class *</Label>
                <Select value={selectedStudentGroupKey} onChange={(event) => selectStudentClassGroup(event.target.value)} required>
                  <option value="">Select class</option>
                  {classGroups.map((group) => (
                    <option key={group.key} value={group.key}>{group.name} - {group.academicYear}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section *</Label>
                <Select value={studentForm.classId} onChange={(event) => setStudentForm((form) => ({ ...form, classId: event.target.value }))} required>
                  <option value="">Select section</option>
                  {(selectedStudentGroup?.sections || []).map((cls) => (
                    <option key={cls.id} value={cls.id}>Section {sectionLabel(cls)}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={studentForm.gender} onChange={(event) => setStudentForm((form) => ({ ...form, gender: event.target.value }))}>
                  <option value="OTHER">Other</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input type="date" value={studentForm.dateOfBirth} onChange={(event) => setStudentForm((form) => ({ ...form, dateOfBirth: event.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Student Phone</Label>
                <Input value={studentForm.phone} onChange={(event) => setStudentForm((form) => ({ ...form, phone: event.target.value }))} placeholder="+92 300 1234567" />
              </div>
              <div className="space-y-2">
                <Label>Student Login Email</Label>
                <Input type="email" value={studentForm.studentEmail} onChange={(event) => setStudentForm((form) => ({ ...form, studentEmail: event.target.value }))} placeholder="student@example.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Guardian Name</Label>
                <Input value={studentForm.guardianName} onChange={(event) => setStudentForm((form) => ({ ...form, guardianName: event.target.value }))} placeholder="Muhammad Khan" />
              </div>
              <div className="space-y-2">
                <Label>Guardian Phone</Label>
                <Input value={studentForm.guardianPhone} onChange={(event) => setStudentForm((form) => ({ ...form, guardianPhone: event.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input value={studentForm.guardianWhatsapp} onChange={(event) => setStudentForm((form) => ({ ...form, guardianWhatsapp: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Guardian Email</Label>
                <Input type="email" value={studentForm.guardianEmail} onChange={(event) => setStudentForm((form) => ({ ...form, guardianEmail: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea value={studentForm.address} onChange={(event) => setStudentForm((form) => ({ ...form, address: event.target.value }))} placeholder="Home address" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Add Student
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
