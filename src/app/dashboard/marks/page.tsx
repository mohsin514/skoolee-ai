"use client";

import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Loader2,
  Lock,
  Play,
  Plus,
  Save,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface Student {
  id: string;
  fullName: string;
  rollNo: string;
}

interface Subject {
  id: string;
  name: string;
  totalMarks: number;
}

interface ClassItem {
  id: string;
  name: string;
  section?: string | null;
  academicYear: number;
  _count?: { students: number; subjects: number };
}

interface Exam {
  id: string;
  campusId: string;
  classId: string;
  title: string;
  term: string;
  academicYear: number;
  status: "DRAFT" | "ACTIVE" | "MARKS_ENTRY" | "LOCKED" | "PRINCIPAL_REVIEWED" | "PUBLISHED";
  isLocked: boolean;
  lockedAt?: string;
  locker?: { fullName: string };
  _count?: { marks: number; reportCards?: number };
  class: { id?: string; name: string; section?: string | null; academicYear?: number };
}

interface MarkRow {
  studentId: string;
  subjectId: string;
  marksObtained: number;
}

type MarksGrid = Record<string, Record<string, number | "">>;

const statusMeta: Record<Exam["status"], { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-slate-100 text-slate-700" },
  ACTIVE: { label: "Active", className: "bg-blue-100 text-blue-700" },
  MARKS_ENTRY: { label: "Marks Entry", className: "bg-amber-100 text-amber-700" },
  LOCKED: { label: "Locked", className: "bg-red-100 text-red-700" },
  PRINCIPAL_REVIEWED: { label: "Reviewed", className: "bg-emerald-100 text-emerald-700" },
  PUBLISHED: { label: "Published", className: "bg-violet-100 text-violet-700" },
};

function classLabel(cls: Pick<ClassItem, "name" | "section"> | Exam["class"]) {
  return [cls.name, cls.section].filter(Boolean).join(" - ");
}

function getGrade(obtained: number, total: number) {
  const pct = total > 0 ? (obtained / total) * 100 : 0;
  if (pct >= 90) return { grade: "A+", color: "bg-emerald-100 text-emerald-700" };
  if (pct >= 80) return { grade: "A", color: "bg-green-100 text-green-700" };
  if (pct >= 70) return { grade: "B", color: "bg-blue-100 text-blue-700" };
  if (pct >= 60) return { grade: "C", color: "bg-yellow-100 text-yellow-700" };
  if (pct >= 50) return { grade: "D", color: "bg-orange-100 text-orange-700" };
  return { grade: "F", color: "bg-red-100 text-red-700" };
}

export default function MarksEntryPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [marks, setMarks] = useState<MarksGrid>({});
  const [analytics, setAnalytics] = useState<{ classAverage: number; subjectAverages: Array<{ subjectId: string; subject: string; average: number; entries: number }> } | null>(null);
  const [newExam, setNewExam] = useState({
    title: "",
    term: "",
    classId: "",
    academicYear: new Date().getFullYear(),
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isLoadingMarks, setIsLoadingMarks] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const refreshExams = useCallback(async () => {
    const res = await fetch("/api/exams");
    const data = await res.json();
    setExams(data.exams || []);
  }, []);

  useEffect(() => {
    Promise.all([fetch("/api/classes"), fetch("/api/exams")])
      .then(async ([classRes, examRes]) => {
        const [classData, examData] = await Promise.all([classRes.json(), examRes.json()]);
        const classList = classData.data || [];
        setClasses(classList);
        setExams(examData.exams || []);
        if (classList[0]) {
          setNewExam((prev) => ({
            ...prev,
            classId: prev.classId || classList[0].id,
            academicYear: prev.academicYear || classList[0].academicYear,
          }));
        }
      })
      .catch(() => toast.error("Could not load academic setup"));
  }, []);

  const loadExamData = useCallback(async (exam: Exam) => {
    setSelectedExam(exam);
    setIsLoadingMarks(true);
    try {
      const res = await fetch(`/api/marks?examId=${exam.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load marks");

      setSelectedExam(data.exam || exam);
      setStudents(data.students || []);
      setSubjects(data.subjects || []);
      setAnalytics(data.analytics || null);

      const marksGrid: MarksGrid = {};
      (data.marks || []).forEach((mark: MarkRow) => {
        if (!marksGrid[mark.studentId]) marksGrid[mark.studentId] = {};
        marksGrid[mark.studentId][mark.subjectId] = mark.marksObtained;
      });
      setMarks(marksGrid);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load marks");
    } finally {
      setIsLoadingMarks(false);
    }
  }, []);

  const createExam = async () => {
    if (!newExam.title.trim() || !newExam.term.trim() || !newExam.classId) {
      toast.error("Add title, term, and class");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newExam),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create exam");
      setExams((prev) => [data.exam, ...prev]);
      await loadExamData(data.exam);
      toast.success("Draft exam created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create exam");
    } finally {
      setIsCreating(false);
    }
  };

  const updateExamStatus = async (status: Exam["status"]) => {
    if (!selectedExam) return;
    setIsUpdatingStatus(true);
    try {
      const res = await fetch("/api/exams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedExam.id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update exam");
      setSelectedExam(data.exam);
      setExams((prev) => prev.map((exam) => (exam.id === data.exam.id ? data.exam : exam)));
      toast.success(`Exam moved to ${statusMeta[status].label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update exam");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const setMark = (studentId: string, subjectId: string, value: string) => {
    const num = value === "" ? "" : Number(value);
    setMarks((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [subjectId]: num },
    }));
  };

  const focusCell = (rowIndex: number, colIndex: number) => {
    const student = students[rowIndex];
    const subject = subjects[colIndex];
    if (!student || !subject) return;
    inputRefs.current[`${student.id}:${subject.id}`]?.focus();
    inputRefs.current[`${student.id}:${subject.id}`]?.select();
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number
  ) => {
    const keyMap: Record<string, [number, number]> = {
      Enter: [rowIndex + 1, colIndex],
      ArrowDown: [rowIndex + 1, colIndex],
      ArrowUp: [rowIndex - 1, colIndex],
      ArrowRight: [rowIndex, colIndex + 1],
      ArrowLeft: [rowIndex, colIndex - 1],
    };

    const target = keyMap[event.key];
    if (!target) return;
    event.preventDefault();
    focusCell(target[0], target[1]);
  };

  const saveBulkMarks = async () => {
    if (!selectedExam) return;
    if (selectedExam.status === "DRAFT") {
      toast.error("Activate this exam before marks entry");
      return;
    }

    const entries: Array<{ studentId: string; subjectId: string; marksObtained: number }> = [];
    const invalidCells: string[] = [];

    students.forEach((student) => {
      subjects.forEach((subject) => {
        const value = marks[student.id]?.[subject.id];
        if (value === undefined || value === "") return;
        if (Number(value) < 0 || Number(value) > subject.totalMarks) {
          invalidCells.push(`${student.fullName} - ${subject.name}`);
          return;
        }
        entries.push({ studentId: student.id, subjectId: subject.id, marksObtained: Number(value) });
      });
    });

    if (invalidCells.length > 0) {
      toast.error(`Fix marks over max: ${invalidCells.slice(0, 2).join(", ")}`);
      return;
    }
    if (entries.length === 0) {
      toast.error("Enter at least one mark");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedExam.id, entries }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save marks");
      toast.success(`Saved ${data.count} entries, ${data.changed} changed`);
      await refreshExams();
      await loadExamData({ ...selectedExam, status: selectedExam.status === "ACTIVE" ? "MARKS_ENTRY" : selectedExam.status });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save marks");
    } finally {
      setIsSaving(false);
    }
  };

  const lockExam = async () => {
    if (!selectedExam) return;
    setIsLocking(true);
    try {
      const res = await fetch(`/api/exams/${selectedExam.id}/lock`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not lock exam");
      setSelectedExam(data.exam);
      setExams((prev) => prev.map((exam) => (exam.id === selectedExam.id ? data.exam : exam)));
      toast.success(`Exam locked. ${data.reportCardsGenerated} report cards generated.`);
      setLockConfirmOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not lock exam");
    } finally {
      setIsLocking(false);
    }
  };

  const selectedStatus = selectedExam ? statusMeta[selectedExam.status] : null;
  const isEditable = Boolean(selectedExam && !selectedExam.isLocked && selectedExam.status !== "DRAFT");

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Academic Engine"
        description="Draft exams, enter marks, lock results, and prepare report cards"
        actions={
          selectedExam ? (
            <div className="flex items-center gap-2">
              {selectedExam.status === "DRAFT" ? (
                <Button onClick={() => updateExamStatus("ACTIVE")} disabled={isUpdatingStatus} size="sm">
                  {isUpdatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  Activate
                </Button>
              ) : null}
              {isEditable ? (
                <>
                  <Button onClick={saveBulkMarks} disabled={isSaving} size="sm">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save
                  </Button>
                  <Button onClick={() => setLockConfirmOpen(true)} disabled={isLocking} variant="destructive" size="sm">
                    {isLocking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                    Lock
                  </Button>
                </>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Create Draft Exam</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_120px_auto]">
              <Input
                placeholder="Exam title"
                value={newExam.title}
                onChange={(event) => setNewExam((prev) => ({ ...prev, title: event.target.value }))}
              />
              <Input
                placeholder="Term"
                value={newExam.term}
                onChange={(event) => setNewExam((prev) => ({ ...prev, term: event.target.value }))}
              />
              <Select
                value={newExam.classId}
                onChange={(event) => {
                  const cls = classes.find((item) => item.id === event.target.value);
                  setNewExam((prev) => ({
                    ...prev,
                    classId: event.target.value,
                    academicYear: cls?.academicYear || prev.academicYear,
                  }));
                }}
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {classLabel(cls)}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                value={newExam.academicYear}
                onChange={(event) => setNewExam((prev) => ({ ...prev, academicYear: Number(event.target.value) }))}
              />
              <Button onClick={createExam} disabled={isCreating || classes.length === 0}>
                {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Exam Lifecycle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {exams.map((exam) => {
                const meta = statusMeta[exam.status] || statusMeta.DRAFT;
                return (
                  <button
                    key={exam.id}
                    onClick={() => loadExamData(exam)}
                    className={`text-left p-4 rounded-lg border transition-all ${
                      selectedExam?.id === exam.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-semibold text-sm">{exam.title}</span>
                      <Badge variant="secondary" className={`text-xs ${meta.className}`}>
                        {exam.isLocked ? <Lock className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {exam.term} | {exam.academicYear} | {exam._count?.marks || 0} marks
                    </p>
                    <p className="text-xs text-muted-foreground">{classLabel(exam.class)}</p>
                  </button>
                );
              })}
              {exams.length === 0 ? (
                <div className="col-span-full text-center py-8 text-muted-foreground">
                  <AlertCircle className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No exams yet. Create a draft exam to begin.</p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {selectedExam ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="mt-2">
                    <Badge className={selectedStatus?.className}>{selectedStatus?.label}</Badge>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Class Average</p>
                  <p className="text-2xl font-semibold">{analytics?.classAverage || 0}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Students</p>
                  <p className="text-2xl font-semibold">{students.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Subjects</p>
                  <p className="text-2xl font-semibold">{subjects.length}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base">
                    {selectedExam.title} - {classLabel(selectedExam.class)}
                  </CardTitle>
                  {selectedExam.isLocked || selectedExam.status === "DRAFT" ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {selectedExam.isLocked ? <Lock className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                      {selectedExam.isLocked ? "Locked - edit disabled" : "Draft - activate before entry"}
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingMarks ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="sticky left-0 z-10 bg-muted/30 px-4 py-3 text-left font-semibold w-12">#</th>
                          <th className="sticky left-12 z-10 bg-muted/30 px-4 py-3 text-left font-semibold min-w-[210px]">Student</th>
                          {subjects.map((subject) => (
                            <th key={subject.id} className="px-3 py-3 text-center font-semibold min-w-[110px]">
                              <div>{subject.name}</div>
                              <div className="text-xs font-normal text-muted-foreground">/{subject.totalMarks}</div>
                            </th>
                          ))}
                          <th className="px-4 py-3 text-center font-semibold min-w-[80px]">Total</th>
                          <th className="px-4 py-3 text-center font-semibold min-w-[70px]">Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student, rowIndex) => {
                          const studentMarks = marks[student.id] || {};
                          const total = subjects.reduce((sum, subject) => {
                            const value = studentMarks[subject.id];
                            return sum + (value !== "" && value !== undefined ? Number(value) : 0);
                          }, 0);
                          const maxTotal = subjects.reduce((sum, subject) => sum + subject.totalMarks, 0);
                          const grade = maxTotal > 0 ? getGrade(total, maxTotal) : { grade: "-", color: "bg-gray-100 text-gray-500" };

                          return (
                            <tr key={student.id} className={`border-b hover:bg-muted/20 ${rowIndex % 2 === 0 ? "" : "bg-muted/10"}`}>
                              <td className="sticky left-0 z-10 bg-background px-4 py-2.5 text-muted-foreground">{rowIndex + 1}</td>
                              <td className="sticky left-12 z-10 bg-background px-4 py-2.5">
                                <div className="font-medium">{student.fullName}</div>
                                <div className="text-xs text-muted-foreground">#{student.rollNo}</div>
                              </td>
                              {subjects.map((subject, colIndex) => {
                                const value = studentMarks[subject.id] ?? "";
                                const invalid = value !== "" && (Number(value) < 0 || Number(value) > subject.totalMarks);
                                return (
                                  <td key={subject.id} className="px-3 py-2.5 text-center">
                                    <Input
                                      ref={(node) => {
                                        inputRefs.current[`${student.id}:${subject.id}`] = node;
                                      }}
                                      type="number"
                                      min={0}
                                      max={subject.totalMarks}
                                      disabled={!isEditable}
                                      value={value}
                                      onChange={(event) => setMark(student.id, subject.id, event.target.value)}
                                      onKeyDown={(event) => handleCellKeyDown(event, rowIndex, colIndex)}
                                      className={`w-20 text-center mx-auto h-8 text-sm disabled:opacity-60 ${invalid ? "border-red-500 bg-red-50" : ""}`}
                                    />
                                  </td>
                                );
                              })}
                              <td className="px-4 py-2.5 text-center font-semibold">{total}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${grade.color}`}>
                                  {grade.grade}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {students.length === 0 ? (
                          <tr>
                            <td colSpan={subjects.length + 4} className="py-8 text-center text-muted-foreground">
                              No students in this class
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {analytics?.subjectAverages?.length ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Subject Averages
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {analytics.subjectAverages.map((subject) => (
                      <div key={subject.subjectId} className="rounded-lg border p-3">
                        <div className="text-sm font-medium">{subject.subject}</div>
                        <div className="mt-1 text-2xl font-semibold">{subject.average}%</div>
                        <div className="text-xs text-muted-foreground">{subject.entries} entries</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
      <ConfirmAction
        open={lockConfirmOpen}
        title="Lock this exam?"
        description="Marks will become read-only and report cards will be generated for the selected exam."
        confirmLabel="Lock exam"
        tone="warning"
        busy={isLocking}
        onCancel={() => setLockConfirmOpen(false)}
        onConfirm={lockExam}
      />
    </div>
  );
}
