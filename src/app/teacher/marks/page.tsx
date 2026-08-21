"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart3, CheckCircle2, Download, FileText, Loader2, Plus, Star } from "lucide-react";
import { BrandButton } from "@/components/role-dashboard";
import { Select } from "@/components/ui/select";
import {
  classLabel, CreateAssessmentModal, EmptyInline, FinalGradesModal, GradeConfigModal, MarksSkeleton, MiniMetric, StatusPill, StudentMini, TeacherErrorState, useTeacherData,
} from "@/components/teacher/teacher-components";
import { useGradingTools } from "../use-grading-tools";
import { GradingModals, GradingToolbar } from "../grading-tools";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { csvCell } from "@/lib/csv";

export default function MarksPage() {
  const { data, loading, error, loadData } = useTeacherData();
  const [selectedExamId, setSelectedExamId] = useState("");
  const [markSheet, setMarkSheet] = useState<any>(null);
  const [marksByKey, setMarksByKey] = useState<Record<string, string>>({});
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksSaving, setMarksSaving] = useState(false);

  const grading = useGradingTools({ onChanged: loadData });

  const classHubs = data?.classHubs || [];
  const activeExam = (data?.exams || []).find((exam: any) => exam.id === selectedExamId);
  const isLocked = activeExam?.isLocked || ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(activeExam?.status || "");

  useEffect(() => {
    if (!data) return;
    if (!selectedExamId && (data.activeExams?.[0]?.id || data.exams?.[0]?.id)) {
      setSelectedExamId(data.activeExams?.[0]?.id || data.exams?.[0]?.id);
    }
  }, [data, selectedExamId]);

  const loadMarks = useCallback(async (examId: string) => {
    if (!examId) { setMarkSheet(null); setMarksByKey({}); return; }
    setMarksLoading(true);
    try {
      const res = await fetch(`/api/marks?examId=${examId}`);
      const text = await res.text();
      const result = JSON.parse(text);
      if (result.success) {
        setMarkSheet({
          students: result.students || [],
          subjects: result.subjects || [],
          existingMarks: result.marks || [],
        });
        const map: Record<string, string> = {};
        for (const student of result.students || []) {
          for (const subject of result.subjects || []) {
            const key = `${student.id}:${subject.id}`;
            const mark = (result.marks || []).find((m: any) => m.studentId === student.id && m.subjectId === subject.id);
            if (mark) map[key] = String(mark.marksObtained);
          }
        }
        setMarksByKey(map);
      } else {
        setMarkSheet(null);
        setMarksByKey({});
      }
    } catch { setMarkSheet(null); setMarksByKey({}); }
    finally { setMarksLoading(false); }
  }, []);

  useEffect(() => { loadMarks(selectedExamId); }, [selectedExamId, loadMarks]);

  const saveMarks = useCallback(async () => {
    if (!selectedExamId || !markSheet) return;
    setMarksSaving(true);
    try {
      const payload: any[] = [];
      for (const student of markSheet.students || []) {
        for (const subject of markSheet.subjects || []) {
          const key = `${student.id}:${subject.id}`;
          const value = marksByKey[key];
          if (value === "" || value === undefined) continue;
          payload.push({ studentId: student.id, subjectId: subject.id, marksObtained: Number(value) });
        }
      }
      if (payload.length === 0) { toast.error("Enter marks first"); return; }
      const res = await fetch("/api/marks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedExamId, entries: payload }),
      });
      const text = await res.text();
      const result = JSON.parse(text);
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Failed to save marks"));
      toast.success("Marks saved");
      await loadMarks(selectedExamId);
      await loadData();
    } catch (error: any) { toast.error(error.message); }
    finally { setMarksSaving(false); }
  }, [selectedExamId, markSheet, marksByKey, loadMarks, loadData]);

  const exportMarksCSV = useCallback(() => {
    if (!markSheet) return;
    const rows = [["Student", "Roll No", ...markSheet.subjects.map((s: any) => s.name)]];
    for (const student of markSheet.students || []) {
      const row = [student.fullName, student.rollNo || ""];
      for (const subject of markSheet.subjects || []) {
        const key = `${student.id}:${subject.id}`;
        row.push(marksByKey[key] || "");
      }
      rows.push(row);
    }
    // Student names routinely contain commas ("Khan, Ayesha"); unquoted they
    // shift every following column into the wrong subject.
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `marks-${selectedExamId}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [markSheet, marksByKey, selectedExamId]);

  if (loading && !data) return <MarksSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={loadData} />;

  const totalCells = markSheet ? markSheet.students.length * markSheet.subjects.length : 0;
  const filledCells = Object.values(marksByKey).filter((v) => v !== "" && v !== undefined).length;
  const completion = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;

  // The server rejects the whole batch if any one mark exceeds its subject's
  // total, so a single mistyped cell used to discard an entire sheet of work.
  // The cells are already flagged in red here — hold the save until they're
  // fixed instead of letting the round-trip throw it all away.
  const invalidCells = markSheet
    ? (markSheet.students || []).flatMap((student: any) =>
        (markSheet.subjects || []).flatMap((subject: any) => {
          const value = marksByKey[`${student.id}:${subject.id}`];
          if (value === "" || value === undefined) return [];
          const num = Number(value);
          const max = subject.totalMarks || 100;
          return Number.isFinite(num) && num >= 0 && num <= max ? [] : [{ student, subject }];
        })
      )
    : [];

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <header className="relative overflow-hidden p-7 px-9 border-b border-[#cfc2d6]/12 bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <FileText className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">{data.exams?.length || 0} exam cycles</span>
          </div>
          <h1 className="text-3xl font-bold text-[#1d1b20] tracking-tight">Tests, Exams & Marks</h1>
          <p className="mt-1 text-sm font-semibold text-ink-muted">Enter marks, create assessments, and manage grade configurations.</p>
        </div>
        {/* justify-end so a wrapped third button lines up with the header's
            right edge instead of stranding itself under the first one. */}
        <div className="relative flex flex-wrap gap-2 xl:justify-end">
          <GradingToolbar grading={grading} classHubs={classHubs} createLabel="Create Assessment" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/20 space-y-6">

        {/* Zero state — with no assessments the selector, sheet and save bar are
            all inert, so show the way forward instead of three dead controls. */}
        {!data.exams?.length ? (
          <div className="sk-rise flex flex-col items-center justify-center rounded-[28px] border border-[#cfc2d6]/25 bg-white px-8 py-14 text-center shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-lg shadow-[#8127cf]/25">
              <Star className="h-8 w-8 text-white" />
            </div>
            <h3 className="mt-5 text-xl font-bold text-[#1d1b20]">No assessments yet</h3>
            <p className="mt-1.5 max-w-md text-sm font-semibold leading-relaxed text-ink-muted">
              Create a test or exam for one of your classes, and its mark sheet will open up here for
              you to fill in.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />}
                onClick={() => grading.setShowExamModal(true)}>
                Create Assessment
              </BrandButton>
              {classHubs.length ? (
                <BrandButton variant="soft" icon={<FileText className="h-4 w-4" />}
                  onClick={() => grading.openGradeConfig(classHubs[0]?.id)}>
                  Set Grade Config
                </BrandButton>
              ) : null}
            </div>
            {!classHubs.length ? (
              <p className="mt-5 rounded-full bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-700">
                You have no classes assigned yet — ask your campus admin to assign one.
              </p>
            ) : null}
          </div>
        ) : (<>

        {/* Exam selector */}
        <div className="w-full max-w-md">
          <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Select Assessment</label>
          <Select value={selectedExamId} onChange={(e) => setSelectedExamId(e.target.value)}>
            {(data.exams || []).map((exam: any) => (
              <option key={exam.id} value={exam.id}>{exam.title}{exam.subject ? ` (${exam.subject.name})` : ""} &mdash; {classLabel(exam.class)}</option>
            ))}
            {!data.exams?.length ? <option value="">No exams</option> : null}
          </Select>
        </div>

        {/* Locked banner */}
        {isLocked && (
          <div className="flex items-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-5 py-3" title="This exam has been locked. Marks cannot be edited.">
            <BarChart3 className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm font-semibold text-amber-800">This exam is locked &mdash; marks are read-only.</p>
          </div>
        )}

        {/* Exam cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {(data.exams || []).slice(0, 6).map((exam: any, index: number) => {
            const isSelected = selectedExamId === exam.id;
            const isLockedExam = exam.isLocked || ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(exam.status || "");
            return (
              <button key={exam.id} type="button" onClick={() => setSelectedExamId(exam.id)} title={`Select ${exam.title}`}
                className={cn(
                  "sk-rise rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25",
                  isSelected ? "border-[#8127cf]/30 bg-[#fbf0fe] ring-1 ring-[#8127cf]/20 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" : "border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]"
                )}
                style={{ animationDelay: `${index * 80}ms` }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#1d1b20] truncate">{exam.title}</p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">{exam.subject ? `${exam.subject.name} · ` : ""}{classLabel(exam.class)}</p>
                  </div>
                  <StatusPill status={exam.status} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{exam.enteredMarks || 0} entered
                  </span>
                  {exam.missingMarks > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />{exam.missingMarks} missing
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Progress bar */}
        {markSheet && totalCells > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-[#f3f4f9] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-purple-500 transition-all duration-500" style={{ width: `${completion}%` }} />
            </div>
            <span className="text-xs font-semibold text-ink-muted whitespace-nowrap">{filledCells}/{totalCells} cells ({completion}%)</span>
          </div>
        )}

        {/* Marks table */}
        <div className="sk-rise overflow-hidden rounded-2xl border border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "120ms" }}>
          {marksLoading ? (
            <div>
              <div className="bg-[#f3f4f9]/45 px-5 py-4 flex gap-8">
                <div className="skeleton-shimmer bg-[#e8e0ec]/60 h-3 w-20 rounded-2xl" />
                <div className="skeleton-shimmer bg-[#e8e0ec]/60 h-3 w-16 rounded-2xl" />
                <div className="skeleton-shimmer bg-[#e8e0ec]/60 h-3 w-16 rounded-2xl" />
              </div>
              {[...Array(4)].map((_, ri) => (
                <div key={ri} className="flex items-center gap-4 px-5 py-4 border-t border-[#f3f4f9]">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="skeleton-shimmer bg-[#e8e0ec]/60 h-10 w-10 rounded-xl shrink-0" />
                    <div>
                      <div className="skeleton-shimmer bg-[#e8e0ec]/60 h-4 w-28 mb-1 rounded-2xl" />
                      <div className="skeleton-shimmer bg-[#e8e0ec]/60 h-3 w-20 rounded-2xl" />
                    </div>
                  </div>
                  {[...Array(3)].map((_, ci) => (
                    <div key={ci} className="skeleton-shimmer bg-[#e8e0ec]/60 h-11 w-20 rounded-2xl" />
                  ))}
                </div>
              ))}
            </div>
          ) : markSheet?.subjects?.length && markSheet?.students?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="bg-[#fbf0fe]/40 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    <th className="px-5 py-4">Student</th>
                    {markSheet.subjects.map((subject: any) => (
                      <th key={subject.id} className="px-3 py-4 text-center" title={`Max marks: ${subject.totalMarks || 100}`}>{subject.name}<br /><span className="text-[10px] font-normal text-ink-subtle">/ {subject.totalMarks || 100}</span></th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3f4f9]">
                  {markSheet.students.map((student: any) => (
                    <tr key={student.id} className="hover:bg-[#fbf0fe]/20 transition-colors">
                      <td className="px-5 py-3"><StudentMini student={student} /></td>
                      {markSheet.subjects.map((subject: any) => {
                        const key = `${student.id}:${subject.id}`;
                        const value = marksByKey[key] || "";
                        const max = subject.totalMarks || 100;
                        const numVal = Number(value);
                        // Matches the save guard exactly, so every cell that
                        // blocks the save is the one highlighted.
                        const isOverLimit = value !== "" && (!Number.isFinite(numVal) || numVal < 0 || numVal > max);
                        return (
                          <td key={subject.id} className="px-3 py-3">
                            <input type="number" min={0} max={max} value={value} disabled={isLocked}
                              onChange={(e) => setMarksByKey((c) => ({ ...c, [key]: e.target.value }))}
                              title={isLocked ? "This exam is locked — marks are read-only" : `Enter marks for ${subject.name} (max ${max})`}
                              className={cn(
                                "h-11 w-full rounded-xl border px-3 text-center text-sm font-bold outline-none transition-all",
                                "focus:border-[#8127cf]/35 focus:bg-white focus:ring-1 focus:ring-[#8127cf]/20",
                                isLocked ? "bg-[#f3f4f9]/40 text-ink-muted cursor-not-allowed" : "bg-[#fbf0fe]/40",
                                isOverLimit ? "border-rose-300 bg-rose-50 text-rose-700" : "border-[#cfc2d6]/20"
                              )} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyInline text={selectedExamId ? "No editable subjects for this exam." : "Select an exam to enter marks."} />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {invalidCells.length ? (
            <p className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3.5 py-2 text-sm font-semibold text-rose-700">
              <BarChart3 className="h-4 w-4 shrink-0" />
              {invalidCells.length} mark{invalidCells.length !== 1 ? "s are" : " is"} outside the allowed
              range — fix the highlighted cell{invalidCells.length !== 1 ? "s" : ""} to save.
            </p>
          ) : activeExam ? (
            <p className="text-sm font-semibold text-ink-muted">
              {activeExam.enteredMarks || 0}/{activeExam.expectedMarks || 0} marks entered
            </p>
          ) : (
            /* The empty sheet above already says "Select an exam to enter
               marks."; repeating it here printed the same line twice. */
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {markSheet?.students?.length ? (
              <BrandButton variant="soft" icon={<Download className="w-4 h-4" />} onClick={exportMarksCSV}><span title="Download marks as CSV file">Export CSV</span></BrandButton>
            ) : null}
            <BrandButton variant="dark" icon={marksSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              onClick={saveMarks}
              disabled={marksSaving || !markSheet?.subjects?.length || isLocked || invalidCells.length > 0}
              title={isLocked ? "This exam is locked" : !markSheet?.subjects?.length ? "No subjects to save" : invalidCells.length ? "Some marks are outside the allowed range" : "Save all entered marks"}>
              {marksSaving ? "Saving..." : "Save Marks"}
            </BrandButton>
          </div>
        </div>
        </>)}
      </div>

      <GradingModals grading={grading} classHubs={classHubs} />
    </section>
  );
}
