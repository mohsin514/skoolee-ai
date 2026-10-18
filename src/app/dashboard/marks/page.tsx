"use client";

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Lock,
  Play,
  Plus,
  Save,
  Users,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/tooltip";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonCards, SkeletonTable } from "@/components/ui/skeleton";

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

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const statusMeta: Record<Exam["status"], { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: "Draft", variant: "neutral" },
  ACTIVE: { label: "Active", variant: "info" },
  MARKS_ENTRY: { label: "Marks Entry", variant: "warning" },
  LOCKED: { label: "Locked", variant: "danger" },
  PRINCIPAL_REVIEWED: { label: "Reviewed", variant: "success" },
  PUBLISHED: { label: "Published", variant: "secondary" },
};

function classLabel(cls: Pick<ClassItem, "name" | "section"> | Exam["class"]) {
  return [cls.name, cls.section].filter(Boolean).join(" - ");
}

function getGrade(obtained: number, total: number): { grade: string; variant: BadgeVariant } {
  const pct = total > 0 ? (obtained / total) * 100 : 0;
  if (pct >= 90) return { grade: "A+", variant: "success" };
  if (pct >= 80) return { grade: "A", variant: "success" };
  if (pct >= 70) return { grade: "B", variant: "info" };
  if (pct >= 60) return { grade: "C", variant: "warning" };
  if (pct >= 50) return { grade: "D", variant: "warning" };
  return { grade: "F", variant: "danger" };
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
  const [setupState, setSetupState] = useState<"loading" | "ready" | "error">("loading");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const refreshExams = useCallback(async () => {
    const res = await fetch("/api/exams");
    const data = await res.json();
    setExams(data.exams || []);
  }, []);

  const loadSetup = useCallback(() => {
    setSetupState("loading");
    return Promise.all([fetch("/api/classes"), fetch("/api/exams")])
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
        setSetupState("ready");
      })
      .catch(() => {
        setSetupState("error");
        toast.error("Could not load classes and exams. Check your connection and try again.");
      });
  }, []);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

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
      toast.error("Add an exam title, a term and a class to create the draft.");
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
      toast.success(`Draft exam "${data.exam.title}" created`);
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
      toast.error("Activate this exam before entering marks.");
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
      toast.error(`Some marks are outside 0 to the subject maximum: ${invalidCells.slice(0, 2).join(", ")}${invalidCells.length > 2 ? ` and ${invalidCells.length - 2} more` : ""}. Fix them and save again.`);
      return;
    }
    if (entries.length === 0) {
      toast.error("Enter at least one mark before saving.");
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
      toast.success(`Marks saved: ${data.count} entries, ${data.changed} changed`);
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
    <div className="flex flex-1 flex-col">
      <Header
        title="Academic Engine"
        description="Draft exams, enter marks, lock results, and prepare report cards"
        actions={
          selectedExam ? (
            <div className="flex flex-wrap items-center gap-2">
              {selectedExam.status === "DRAFT" ? (
                <Button onClick={() => updateExamStatus("ACTIVE")} loading={isUpdatingStatus} size="sm">
                  {isUpdatingStatus ? null : <Play aria-hidden="true" className="h-4 w-4" />}
                  Activate
                </Button>
              ) : null}
              {isEditable ? (
                <>
                  <Button onClick={() => setLockConfirmOpen(true)} loading={isLocking} variant="outline" size="sm">
                    {isLocking ? null : <Lock aria-hidden="true" className="h-4 w-4" />}
                    Lock
                  </Button>
                  <Button onClick={saveBulkMarks} loading={isSaving} size="sm">
                    {isSaving ? null : <Save aria-hidden="true" className="h-4 w-4" />}
                    Save
                  </Button>
                </>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        <Card className="sk-enter">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Create Draft Exam</CardTitle>
            <CardDescription>A draft can be set up freely. Activate it when you are ready to enter marks.</CardDescription>
          </CardHeader>
          <CardContent>
            {setupState === "ready" && classes.length === 0 ? (
              <Alert
                tone="info"
                live="off"
                className="mb-4"
                title="Create a class first"
                actions={<Link href="/dashboard/classes" className={`${buttonVariants({ variant: "outline", size: "sm" })} sk-nudge-trigger`}>Open classes <ArrowUpRight aria-hidden="true" className="sk-nudge h-3.5 w-3.5 rtl:-scale-x-100" /></Link>}
              >
                Exams belong to a class. Add a class and its subjects, then come back to create the exam.
              </Alert>
            ) : null}
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_9.5rem_auto]">
              <FormField name="exam-title" label="Exam title" required>
                <Input
                  placeholder="Mid-term examination"
                  value={newExam.title}
                  onChange={(event) => setNewExam((prev) => ({ ...prev, title: event.target.value }))}
                />
              </FormField>
              <FormField name="exam-term" label="Term" required>
                <Input
                  placeholder="Term 1"
                  value={newExam.term}
                  onChange={(event) => setNewExam((prev) => ({ ...prev, term: event.target.value }))}
                />
              </FormField>
              <FormField name="exam-class" label="Class" required>
                <Select
                  value={newExam.classId}
                  disabled={setupState !== "ready"}
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
              </FormField>
              <FormField name="exam-year" label="Academic year" required tooltip="Filled from the class you pick. Change it only if the exam belongs to a different academic year.">
                <Input
                  type="number"
                  className="tabular-nums"
                  value={newExam.academicYear}
                  onChange={(event) => setNewExam((prev) => ({ ...prev, academicYear: Number(event.target.value) }))}
                />
              </FormField>
              <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                <span aria-hidden="true" className="mb-1 hidden h-5 lg:block" />
                <Button onClick={createExam} loading={isCreating} disabled={classes.length === 0} className="w-full lg:w-auto">
                  {isCreating ? null : <Plus aria-hidden="true" className="h-4 w-4" />}
                  Create
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="sk-enter" style={{ "--sk-delay": "80ms" } as React.CSSProperties}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Exam Lifecycle</CardTitle>
            <CardDescription>Choose an exam to see and enter its marks.</CardDescription>
          </CardHeader>
          <CardContent>
            {setupState === "loading" ? (
              <SkeletonCards count={3} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3" label="Loading exams" />
            ) : setupState === "error" ? (
              <ErrorState
                title="Exams could not be loaded"
                description="Your classes and exams did not load. Check your connection and try again."
                onRetry={() => void loadSetup()}
              />
            ) : exams.length === 0 ? (
              <EmptyState
                size="sm"
                icon={ClipboardList}
                title="No exams yet"
                description="Create a draft exam above to begin."
              />
            ) : (
              <div className="sk-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {exams.map((exam) => {
                  const meta = statusMeta[exam.status] || statusMeta.DRAFT;
                  return (
                    <Button aria-pressed={selectedExam?.id === exam.id} variant="choice"
                      key={exam.id}
                      onClick={() => loadExamData(exam)}
                      className="block h-auto min-w-0 p-4 text-start"
                    >
                      <span className="mb-2 flex min-w-0 items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink-strong">{exam.title}</span>
                        <Badge variant={meta.variant} size="sm" className="shrink-0">
                          {exam.isLocked ? <Lock aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                          {meta.label}
                        </Badge>
                      </span>
                      <span className="block text-xs font-normal text-ink-subtle">
                        {exam.term} · <span className="tabular-nums">{exam.academicYear}</span> · <span className="tabular-nums">{exam._count?.marks || 0}</span> marks
                      </span>
                      <span className="block truncate text-xs font-normal text-ink-subtle">{classLabel(exam.class)}</span>
                    </Button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedExam ? (
          <>
            <div className="sk-stagger grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-ink-muted">Status</p>
                  <div className="mt-2">
                    {selectedStatus ? <Badge variant={selectedStatus.variant} dot>{selectedStatus.label}</Badge> : null}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <p className="flex items-center gap-1 text-xs font-medium text-ink-muted">
                    Class Average
                    <InfoTip content="The average of each student's percentage across the marks saved for this exam. Papers marked absent are left out." />
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-ink-strong tabular-nums">{analytics?.classAverage || 0}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-ink-muted">Students</p>
                  <p className="text-2xl font-bold tracking-tight text-ink-strong tabular-nums">{students.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-ink-muted">Subjects</p>
                  <p className="text-2xl font-bold tracking-tight text-ink-strong tabular-nums">{subjects.length}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="sk-enter overflow-hidden" style={{ "--sk-delay": "120ms" } as React.CSSProperties}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="min-w-0 text-base">
                    {selectedExam.title} - {classLabel(selectedExam.class)}
                  </CardTitle>
                  {selectedExam.isLocked || selectedExam.status === "DRAFT" ? (
                    <Badge variant={selectedExam.isLocked ? "neutral" : "warning"}>
                      {selectedExam.isLocked ? <Lock aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
                      {selectedExam.isLocked ? "Locked - edit disabled" : "Draft - activate before entry"}
                    </Badge>
                  ) : (
                    <p className="text-xs text-ink-subtle">Use Enter or the arrow keys to move between cells, then save.</p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingMarks ? (
                  <div className="p-4 sm:p-6"><SkeletonTable rows={6} columns={4} label="Loading marks" /></div>
                ) : (

                    <Table containerClassName="overflow-x-auto rounded-none border-x-0 border-b-0" className="w-full text-sm">
                      <TableHeader>
                        <TableRow className="border-b bg-muted/30">
                          <TableHead className="sticky start-0 z-10 bg-surface-subtle px-4 py-3 text-start w-12">#</TableHead>
                          <TableHead className="sticky start-12 z-10 bg-surface-subtle px-4 py-3 text-start min-w-[210px]">Student</TableHead>
                          {subjects.map((subject) => (
                            <TableHead key={subject.id} className="px-3 py-3 text-center min-w-[110px]">
                              <div className="text-ink-strong">{subject.name}</div>
                              <div className="text-xs font-normal text-ink-subtle tabular-nums">/{subject.totalMarks}</div>
                            </TableHead>
                          ))}
                          <TableHead className="px-4 py-3 text-center min-w-[80px]">Total</TableHead>
                          <TableHead className="px-4 py-3 text-center min-w-[70px]">Grade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map((student, rowIndex) => {
                          const studentMarks = marks[student.id] || {};
                          const total = subjects.reduce((sum, subject) => {
                            const value = studentMarks[subject.id];
                            return sum + (value !== "" && value !== undefined ? Number(value) : 0);
                          }, 0);
                          const maxTotal = subjects.reduce((sum, subject) => sum + subject.totalMarks, 0);
                          const grade: { grade: string; variant: BadgeVariant } = maxTotal > 0 ? getGrade(total, maxTotal) : { grade: "-", variant: "neutral" };

                          return (
                            <TableRow key={student.id} className={`border-b hover:bg-muted/20 ${rowIndex % 2 === 0 ? "" : "bg-muted/10"}`}>
                              <TableCell className="sticky start-0 z-10 bg-background px-4 py-2.5 text-ink-subtle tabular-nums">{rowIndex + 1}</TableCell>
                              <TableCell className="sticky start-12 z-10 bg-background px-4 py-2.5">
                                <div className="font-medium text-ink-strong">{student.fullName}</div>
                                <div className="text-xs text-ink-subtle">#{student.rollNo}</div>
                              </TableCell>
                              {subjects.map((subject, colIndex) => {
                                const value = studentMarks[subject.id] ?? "";
                                const invalid = value !== "" && (Number(value) < 0 || Number(value) > subject.totalMarks);
                                return (
                                  <TableCell key={subject.id} className="px-3 py-2.5 text-center">
                                    <Input
                                      ref={(node) => {
                                        inputRefs.current[`${student.id}:${subject.id}`] = node;
                                      }}
                                      type="number"
                                      min={0}
                                      max={subject.totalMarks}
                                      disabled={!isEditable}
                                      value={value}
                                      aria-label={`${subject.name} marks for ${student.fullName}, out of ${subject.totalMarks}`}
                                      aria-invalid={invalid || undefined}
                                      onChange={(event) => setMark(student.id, subject.id, event.target.value)}
                                      onKeyDown={(event) => handleCellKeyDown(event, rowIndex, colIndex)}
                                      className="mx-auto w-20 text-center tabular-nums"
                                    />
                                  </TableCell>
                                );
                              })}
                              <TableCell className="px-4 py-2.5 text-center font-semibold text-ink-strong tabular-nums">{total}</TableCell>
                              <TableCell className="px-4 py-2.5 text-center">
                                <Badge variant={grade.variant} size="sm">{grade.grade}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {students.length === 0 ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={subjects.length + 4} className="p-0">
                              <EmptyState
                                size="sm"
                                icon={Users}
                                title="No students in this class"
                                description="Enrol students in this class to enter their marks."
                                action={<Link href="/dashboard/students" className={buttonVariants({ variant: "outline", size: "sm" })}>Open students</Link>}
                              />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>

                )}
              </CardContent>
            </Card>

            {analytics?.subjectAverages?.length ? (
              <Card className="sk-enter" style={{ "--sk-delay": "180ms" } as React.CSSProperties}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 aria-hidden="true" className="h-4 w-4 text-primary" />
                    Subject Averages
                    <InfoTip content="Marks obtained as a percentage of the subject maximum, across the marks saved for this exam. Absent papers are left out." />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {analytics.subjectAverages.map((subject) => (
                      <div key={subject.subjectId} className="min-w-0 space-y-2 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
                        <div className="truncate text-sm font-semibold text-ink-strong">{subject.subject}</div>
                        <div className="text-2xl font-bold tracking-tight text-ink-strong tabular-nums">{subject.average}%</div>
                        <Progress value={subject.average} size="sm" label={`${subject.subject} average`} tone={subject.average >= 50 ? "brand" : "warning"} />
                        <div className="text-xs text-ink-subtle tabular-nums">{subject.entries} entries</div>
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
