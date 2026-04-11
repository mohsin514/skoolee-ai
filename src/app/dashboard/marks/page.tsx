"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { toast } from "sonner";
import {
  Lock,
  Save,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

interface Exam {
  id: string;
  title: string;
  term: string;
  academicYear: number;
  isLocked: boolean;
  lockedAt?: string;
  locker?: { fullName: string };
  _count: { marks: number };
  class: { name: string; section?: string };
}

interface Mark {
  studentId: string;
  subjectId: string;
  value: number | "";
}

export default function MarksEntryPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [marks, setMarks] = useState<Record<string, Record<string, number | "">>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isLoadingMarks, setIsLoadingMarks] = useState(false);

  // Load exams
  useEffect(() => {
    fetch("/api/exams")
      .then((r) => r.json())
      .then((d) => setExams(d.exams || []));
  }, []);

  // Load marks when exam selected
  const loadExamData = useCallback(async (exam: Exam) => {
    setSelectedExam(exam);
    setIsLoadingMarks(true);
    try {
      const [studRes, markRes] = await Promise.all([
        fetch(`/api/students?classId=${exam.class ? (exam as any).classId : ""}`),
        fetch(`/api/marks?examId=${exam.id}`),
      ]);
      const studData = await studRes.json();
      const markData = await markRes.json();

      setStudents(studData.students || []);

      // Extract subjects from mark data
      const subjectMap: Record<string, Subject> = {};
      (markData.marks || []).forEach((m: any) => {
        if (!subjectMap[m.subjectId]) {
          subjectMap[m.subjectId] = { id: m.subjectId, name: m.subject.name, totalMarks: m.subject.totalMarks };
        }
      });
      setSubjects(Object.values(subjectMap));

      // Build marks grid
      const marksGrid: Record<string, Record<string, number | "">> = {};
      (markData.marks || []).forEach((m: any) => {
        if (!marksGrid[m.studentId]) marksGrid[m.studentId] = {};
        marksGrid[m.studentId][m.subjectId] = m.marksObtained;
      });
      setMarks(marksGrid);
    } finally {
      setIsLoadingMarks(false);
    }
  }, []);

  const setMark = (studentId: string, subjectId: string, value: string) => {
    const num = value === "" ? "" : Number(value);
    setMarks((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [subjectId]: num },
    }));
  };

  const saveBulkMarks = async () => {
    if (!selectedExam) return;
    setIsSaving(true);
    try {
      const entries: Array<{ studentId: string; subjectId: string; marksObtained: number }> = [];
      students.forEach((student) => {
        subjects.forEach((subject) => {
          const val = marks[student.id]?.[subject.id];
          if (val !== undefined && val !== "") {
            entries.push({
              studentId: student.id,
              subjectId: subject.id,
              marksObtained: Number(val),
            });
          }
        });
      });

      const res = await fetch("/api/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: selectedExam.id,
          campusId: selectedExam.campusId ?? "",
          entries,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Saved ${data.count} mark entries`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save marks");
    } finally {
      setIsSaving(false);
    }
  };

  const lockExam = async () => {
    if (!selectedExam) return;
    if (!confirm("Lock this exam? Teachers will no longer be able to edit marks.")) return;
    setIsLocking(true);
    try {
      const res = await fetch(`/api/exams/${selectedExam.id}/lock`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedExam((prev) => prev ? { ...prev, isLocked: true } : null);
      setExams((prev) => prev.map((e) => e.id === selectedExam.id ? { ...e, isLocked: true } : e));
      toast.success("Exam locked! Grade calculation complete.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not lock exam");
    } finally {
      setIsLocking(false);
    }
  };

  const getGrade = (obtained: number, total: number) => {
    const pct = (obtained / total) * 100;
    if (pct >= 90) return { grade: "A+", color: "bg-emerald-100 text-emerald-700" };
    if (pct >= 80) return { grade: "A", color: "bg-green-100 text-green-700" };
    if (pct >= 70) return { grade: "B", color: "bg-blue-100 text-blue-700" };
    if (pct >= 60) return { grade: "C", color: "bg-yellow-100 text-yellow-700" };
    if (pct >= 50) return { grade: "D", color: "bg-orange-100 text-orange-700" };
    return { grade: "F", color: "bg-red-100 text-red-700" };
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Marks Entry"
        description="Enter marks per subject per student"
        actions={
          selectedExam && !selectedExam.isLocked ? (
            <div className="flex items-center gap-2">
              <Button onClick={saveBulkMarks} disabled={isSaving} size="sm">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Marks
              </Button>
              <Button onClick={lockExam} disabled={isLocking} variant="destructive" size="sm">
                {isLocking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                Lock Exam
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="p-6 space-y-6">
        {/* Exam selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select Exam</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {exams.map((exam) => (
                <button
                  key={exam.id}
                  onClick={() => loadExamData(exam)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    selectedExam?.id === exam.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{exam.title}</span>
                    {exam.isLocked ? (
                      <Badge variant="secondary" className="text-xs bg-red-100 text-red-700">
                        <Lock className="h-3 w-3 mr-1" /> Locked
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Open
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {exam.term} · {exam.academicYear} · {exam._count.marks} marks
                  </p>
                  <p className="text-xs text-muted-foreground">{exam.class?.name}</p>
                </button>
              ))}
              {exams.length === 0 && (
                <div className="col-span-3 text-center py-8 text-muted-foreground">
                  <AlertCircle className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No exams found. Create an exam first.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Marks grid */}
        {selectedExam && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {selectedExam.title} — {selectedExam.class?.name}
                  {selectedExam.class?.section ? ` (${selectedExam.class.section})` : ""}
                </CardTitle>
                {selectedExam.isLocked && (
                  <div className="flex items-center gap-2 text-red-600">
                    <Lock className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      Locked — edit disabled
                    </span>
                  </div>
                )}
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
                        <th className="sticky left-12 z-10 bg-muted/30 px-4 py-3 text-left font-semibold min-w-[200px]">Student</th>
                        {subjects.map((sub) => (
                          <th key={sub.id} className="px-3 py-3 text-center font-semibold min-w-[100px]">
                            <div>{sub.name}</div>
                            <div className="text-xs font-normal text-muted-foreground">/{sub.totalMarks}</div>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-center font-semibold min-w-[80px]">Total</th>
                        <th className="px-4 py-3 text-center font-semibold min-w-[60px]">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student, idx) => {
                        const studentMarks = marks[student.id] || {};
                        const total = subjects.reduce((sum, sub) => {
                          const v = studentMarks[sub.id];
                          return sum + (v !== "" && v !== undefined ? Number(v) : 0);
                        }, 0);
                        const maxTotal = subjects.reduce((sum, sub) => sum + sub.totalMarks, 0);
                        const { grade, color } = maxTotal > 0 ? getGrade(total, maxTotal) : { grade: "-", color: "bg-gray-100 text-gray-500" };

                        return (
                          <tr key={student.id} className={`border-b hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                            <td className="sticky left-0 z-10 bg-background px-4 py-2.5 text-muted-foreground">{idx + 1}</td>
                            <td className="sticky left-12 z-10 bg-background px-4 py-2.5">
                              <div className="font-medium">{student.fullName}</div>
                              <div className="text-xs text-muted-foreground">#{student.rollNo}</div>
                            </td>
                            {subjects.map((sub) => (
                              <td key={sub.id} className="px-3 py-2.5 text-center">
                                <Input
                                  type="number"
                                  min={0}
                                  max={sub.totalMarks}
                                  disabled={selectedExam.isLocked}
                                  value={studentMarks[sub.id] ?? ""}
                                  onChange={(e) => setMark(student.id, sub.id, e.target.value)}
                                  className="w-20 text-center mx-auto h-8 text-sm disabled:opacity-60"
                                />
                              </td>
                            ))}
                            <td className="px-4 py-2.5 text-center font-semibold">{total}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
                                {grade}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={subjects.length + 4} className="py-8 text-center text-muted-foreground">
                            No students in this class
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
