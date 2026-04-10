"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, Check, AlertCircle } from "lucide-react";
import { calculateGrade } from "@/lib/utils";
import { toast } from "sonner";

interface StudentMark {
  studentId: string;
  studentName: string;
  registrationNo: string;
  marksObtained: number | null;
  maxMarks: number;
  grade: string;
  remarkEn: string;
  remarkUr: string;
  isDirty: boolean;
  isGenerating: boolean;
  isSaved: boolean;
}

interface MarksEntryTableProps {
  classId: string;
  subjectId: string;
  examId: string;
}

export function MarksEntryTable({
  classId,
  subjectId,
  examId,
}: MarksEntryTableProps) {
  // Demo data until API is connected
  const [students, setStudents] = useState<StudentMark[]>(() =>
    Array.from({ length: 8 }, (_, i) => ({
      studentId: `student-${i + 1}`,
      studentName: [
        "Ahmed Khan",
        "Fatima Ali",
        "Hassan Raza",
        "Ayesha Malik",
        "Usman Tariq",
        "Zainab Hussain",
        "Bilal Ahmed",
        "Sana Noor",
      ][i],
      registrationNo: `STU-2026-${String(i + 1).padStart(3, "0")}`,
      marksObtained: null,
      maxMarks: 100,
      grade: "",
      remarkEn: "",
      remarkUr: "",
      isDirty: false,
      isGenerating: false,
      isSaved: false,
    }))
  );

  const [remarkLanguage, setRemarkLanguage] = useState<"en" | "ur" | "both">(
    "both"
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const debounceTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // ─── Focus management for fast tabbing ─────────────────
  const focusNextInput = useCallback(
    (currentIndex: number) => {
      const nextIndex = currentIndex + 1;
      if (nextIndex < students.length) {
        inputRefs.current[nextIndex]?.focus();
        inputRefs.current[nextIndex]?.select();
      }
    },
    [students.length]
  );

  // ─── Handle marks change with debounced AI remark ──────
  const handleMarksChange = useCallback(
    (index: number, value: string) => {
      const numValue = value === "" ? null : Number(value);

      setStudents((prev) => {
        const updated = [...prev];
        const student = { ...updated[index] };
        student.marksObtained = numValue;
        student.isDirty = true;
        student.isSaved = false;

        if (numValue !== null && student.maxMarks > 0) {
          const pct = (numValue / student.maxMarks) * 100;
          student.grade = calculateGrade(pct);
        } else {
          student.grade = "";
        }

        updated[index] = student;
        return updated;
      });

      // ── Debounced AI remark generation (500ms) ──────────
      const studentId = students[index].studentId;
      const existing = debounceTimers.current.get(studentId);
      if (existing) clearTimeout(existing);

      if (numValue !== null && numValue >= 0) {
        const timer = setTimeout(() => {
          generateRemarkForStudent(index);
        }, 500);
        debounceTimers.current.set(studentId, timer);
      }
    },
    [students]
  );

  // ─── Generate AI remark for a single student ───────────
  const generateRemarkForStudent = async (index: number) => {
    setStudents((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], isGenerating: true };
      return updated;
    });

    try {
      const student = students[index];
      const res = await fetch("/api/ai/generate-remarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.studentId,
          subjectId,
          examId,
          marks: student.marksObtained,
          maxMarks: student.maxMarks,
          language: remarkLanguage,
          tone: "formal",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setStudents((prev) => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            remarkEn: data.data?.remarkEn || "",
            remarkUr: data.data?.remarkUr || "",
            isGenerating: false,
          };
          return updated;
        });
      } else {
        throw new Error("API error");
      }
    } catch {
      setStudents((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], isGenerating: false };
        return updated;
      });
      // Silently fail for individual remarks — user can retry
    }
  };

  // ─── Handle Enter/Tab key for fast navigation ──────────
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      focusNextInput(index);
    }
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      debounceTimers.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* ─── Language Toggle ─────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          AI Remark Language:
        </span>
        {(["en", "ur", "both"] as const).map((lang) => (
          <Button
            key={lang}
            variant={remarkLanguage === lang ? "default" : "outline"}
            size="sm"
            onClick={() => setRemarkLanguage(lang)}
            className="h-7 text-xs"
          >
            {lang === "en" ? "English" : lang === "ur" ? "اردو" : "Both"}
          </Button>
        ))}
      </div>

      {/* ─── Marks Table ─────────────────────────────────── */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead className="w-28">Reg. No</TableHead>
            <TableHead>Student Name</TableHead>
            <TableHead className="w-24">Marks</TableHead>
            <TableHead className="w-20">Grade</TableHead>
            <TableHead>AI Remark (EN)</TableHead>
            <TableHead>AI Remark (UR)</TableHead>
            <TableHead className="w-16">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student, index) => (
            <TableRow key={student.studentId}>
              <TableCell className="text-muted-foreground">
                {index + 1}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {student.registrationNo}
              </TableCell>
              <TableCell className="font-medium">
                {student.studentName}
              </TableCell>
              <TableCell>
                <Input
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="number"
                  min={0}
                  max={student.maxMarks}
                  value={student.marksObtained ?? ""}
                  onChange={(e) => handleMarksChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  placeholder="—"
                  className="h-8 w-20 text-center tabular-nums"
                  id={`marks-input-${student.studentId}`}
                />
              </TableCell>
              <TableCell>
                {student.grade && (
                  <Badge
                    variant={
                      student.grade === "F"
                        ? "destructive"
                        : student.grade.startsWith("A")
                          ? "success"
                          : "secondary"
                    }
                  >
                    {student.grade}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="max-w-[200px]">
                {student.isGenerating ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating...
                  </div>
                ) : student.remarkEn ? (
                  <p className="truncate text-xs text-muted-foreground" title={student.remarkEn}>
                    {student.remarkEn}
                  </p>
                ) : (
                  <span className="text-xs text-muted-foreground/50">—</span>
                )}
              </TableCell>
              <TableCell className="max-w-[200px]" dir="rtl">
                {student.isGenerating ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </div>
                ) : student.remarkUr ? (
                  <p className="truncate text-xs text-muted-foreground" title={student.remarkUr}>
                    {student.remarkUr}
                  </p>
                ) : (
                  <span className="text-xs text-muted-foreground/50">—</span>
                )}
              </TableCell>
              <TableCell>
                {student.isSaved ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : student.isDirty ? (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-xs text-muted-foreground">
        💡 Tip: Press <kbd className="rounded border px-1">Tab</kbd> or{" "}
        <kbd className="rounded border px-1">Enter</kbd> to jump to the next
        student. AI remarks generate automatically 500ms after you stop typing.
      </p>
    </div>
  );
}
