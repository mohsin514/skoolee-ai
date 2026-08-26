"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownToLine, BarChart3, ChevronDown, Command, Download, Eraser, FileText, Keyboard,
  Loader2, Plus, Search, Star, X,
} from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { BrandButton } from "@/components/role-dashboard";
import {
  classLabel, CreateAssessmentModal, EmptyInline, FinalGradesModal, GradeConfigModal, MarksSkeleton, MiniMetric, StatusPill, StudentMini, TeacherErrorState, useTeacherData,
} from "@/components/teacher/teacher-components";
import { useGradingTools } from "../use-grading-tools";
import { GradingModals, GradingToolbar } from "../grading-tools";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { csvCell } from "@/lib/csv";
import { StickySaveBar } from "@/components/teacher/sticky-save-bar";
import { useNavGuard, useUnsavedGuard } from "@/lib/hooks/use-unsaved-guard";

/** How many assessment cards show before "Show all". */
const EXAM_PAGE = 6;

export default function MarksPage() {
  const { data, loading, error, loadData } = useTeacherData();
  const searchParams = useSearchParams();
  const [selectedExamId, setSelectedExamId] = useState("");
  const [markSheet, setMarkSheet] = useState<any>(null);
  const [marksByKey, setMarksByKey] = useState<Record<string, string>>({});
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksSaving, setMarksSaving] = useState(false);
  /* The sheet exactly as the server returned it. Dirty state is measured
     against this, so "8 unsaved changes" means eight cells this teacher
     typed — not eight cells that merely have a value in them. */
  const [baselineMarks, setBaselineMarks] = useState<Record<string, string>>({});
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [examQuery, setExamQuery] = useState("");
  const [showAllExams, setShowAllExams] = useState(false);
  const gridRef = useRef<HTMLTableSectionElement>(null);

  const grading = useGradingTools({ onChanged: loadData });

  const classHubs = data?.classHubs || [];
  const activeExam = (data?.exams || []).find((exam: any) => exam.id === selectedExamId);
  const isLocked = activeExam?.isLocked || ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(activeExam?.status || "");

  useEffect(() => {
    if (!data) return;
    if (!selectedExamId) {
      // A class card links here with its id; open that class's first
      // assessment rather than whichever exam happens to sort first.
      const requestedClass = searchParams.get("classId");
      if (requestedClass) {
        const match =
          (data.activeExams || []).find((e: any) => e.classId === requestedClass) ||
          (data.exams || []).find((e: any) => e.classId === requestedClass);
        if (match) {
          setSelectedExamId(match.id);
          return;
        }
      }
    }
    if (!selectedExamId && (data.activeExams?.[0]?.id || data.exams?.[0]?.id)) {
      setSelectedExamId(data.activeExams?.[0]?.id || data.exams?.[0]?.id);
    }
  }, [data, selectedExamId, searchParams]);

  const loadMarks = useCallback(async (examId: string) => {
    if (!examId) { setMarkSheet(null); setMarksByKey({}); setBaselineMarks({}); return; }
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
        setBaselineMarks(map);
      } else {
        setMarkSheet(null);
        setMarksByKey({});
        setBaselineMarks({});
      }
    } catch { setMarkSheet(null); setMarksByKey({}); setBaselineMarks({}); }
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

  const visibleExams = useMemo(() => {
    const all: any[] = data?.exams || [];
    const q = examQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((exam) =>
      `${exam.title || ""} ${exam.subject?.name || ""} ${classLabel(exam.class) || ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [data, examQuery]);

  const dirtyKeys = useMemo(() => {
    const keys = new Set<string>();
    const all = new Set([...Object.keys(marksByKey), ...Object.keys(baselineMarks)]);
    for (const key of all) {
      if ((marksByKey[key] ?? "") !== (baselineMarks[key] ?? "")) keys.add(key);
    }
    return keys;
  }, [marksByKey, baselineMarks]);

  const resetMarks = useCallback(() => setMarksByKey(baselineMarks), [baselineMarks]);

  useUnsavedGuard(dirtyKeys.size > 0);
  useNavGuard(dirtyKeys.size > 0, "You have unsaved marks. Leave this page and lose them?");

  /* Move the caret around the sheet the way a spreadsheet does. Entering a
     column of forty marks previously meant Tab-Tab-Tab across every subject to
     reach the next student in the same column — Enter and the arrows walk
     straight down it instead. */
  const focusCell = useCallback((row: number, col: number) => {
    const cell = gridRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${row}"][data-col="${col}"]`,
    );
    if (!cell) return false;
    cell.focus();
    cell.select();
    cell.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }, []);

  /* Ctrl/⌘+D — copy the focused cell down every *empty* cell beneath it. A
     whole class scoring the same on a five-mark quiz is routine, and typing
     "5" forty times is not data entry, it is penance. Cells that already hold
     a value are left alone so this can never silently overwrite real marks. */
  const fillDown = useCallback((studentIdx: number, subjectId: string, value: string) => {
    if (!markSheet || value === "" || value === undefined) return 0;
    // The target keys are worked out here rather than inside the updater: the
    // caller reports how many cells were filled, and a count accumulated inside
    // setState is not available yet when that message is written (and is
    // double-counted under StrictMode's double invocation).
    const targets: string[] = [];
    for (let i = studentIdx + 1; i < markSheet.students.length; i += 1) {
      const key = `${markSheet.students[i].id}:${subjectId}`;
      const existing = marksByKey[key];
      if (existing === undefined || existing === "") targets.push(key);
    }
    if (targets.length === 0) return 0;
    setMarksByKey((current) => {
      const next = { ...current };
      for (const key of targets) next[key] = value;
      return next;
    });
    return targets.length;
  }, [markSheet, marksByKey]);

  const clearColumn = useCallback((subjectId: string, subjectName: string) => {
    if (!markSheet) return;
    if (!window.confirm(`Clear every entered mark in ${subjectName}? This is undoable until you save.`)) return;
    setMarksByKey((current) => {
      const next = { ...current };
      for (const student of markSheet.students) delete next[`${student.id}:${subjectId}`];
      return next;
    });
  }, [markSheet]);

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
    <TeacherPage
      tone="exams"
      icon={FileText}
      eyebrow="Marks Entry"
      title="Tests, Exams & Marks"
      summary={`${data.exams?.length || 0} exam cycle${(data.exams?.length || 0) === 1 ? "" : "s"} · enter marks, create assessments and manage grading`}
      actions={<GradingToolbar grading={grading} classHubs={classHubs} createLabel="Create Assessment" />}
    >
      <div className="space-y-3">

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

        {/* Assessment picker.

            This screen used to carry two controls for the same choice: a
            <select> listing every assessment, and below it a grid of cards
            showing only the first six. Whichever the teacher used, the other
            silently disagreed — pick the twelfth exam in the dropdown and no
            card was highlighted, so the sheet appeared to belong to nothing.

            The cards are the better control (they carry marks-entered and
            locked state, which the dropdown could not), so they are now the
            only one — with a filter in front of them, which is what the
            dropdown was really being used for once the list grew. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-[320px] sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
            <input
              value={examQuery}
              onChange={(e) => setExamQuery(e.target.value)}
              placeholder="Find an assessment or class…"
              aria-label="Filter assessments"
              className="h-9 w-full rounded-xl border border-[#cfc2d6]/25 bg-white pl-9 pr-8 text-xs font-semibold text-[#1d1b20] outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/35 focus:ring-4 focus:ring-[#8127cf]/12"
            />
            {examQuery ? (
              <button type="button" onClick={() => setExamQuery("")} aria-label="Clear assessment filter"
                className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf]">
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-ink-subtle">
            {visibleExams.length} of {data.exams.length} assessment{data.exams.length === 1 ? "" : "s"}
          </span>
          {/* The grid caps at a readable number; without this the teacher had
              no way to know the other six existed. */}
          {visibleExams.length > EXAM_PAGE && (
            <button type="button" onClick={() => setShowAllExams((v) => !v)}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-[#8127cf]/15 bg-[#fbf0fe] px-3 text-[11px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAllExams && "rotate-180")} />
              {showAllExams ? "Show fewer" : `Show all ${visibleExams.length}`}
            </button>
          )}
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
          {(showAllExams ? visibleExams : visibleExams.slice(0, EXAM_PAGE)).map((exam: any, index: number) => {
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
          {visibleExams.length === 0 ? (
            <div className="col-span-full flex flex-col items-center gap-3 rounded-2xl border border-[#cfc2d6]/25 bg-white p-8 text-center">
              <p className="text-sm font-bold text-[#1d1b20]">No assessment matches “{examQuery}”</p>
              <button type="button" onClick={() => setExamQuery("")}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#fbf0fe] px-4 py-2 text-[11px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#f3eeff] active:scale-[0.97]">
                <X className="h-3.5 w-3.5" /> Clear filter
              </button>
            </div>
          ) : null}
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
                    {/* The student column is frozen: past three subjects the
                        names scrolled out of view and the teacher was typing
                        into an anonymous grid. */}
                    <th className="sticky left-0 z-10 bg-[#fbf0fe]/95 px-5 py-4 backdrop-blur-sm">Student</th>
                    {markSheet.subjects.map((subject: any, col: number) => {
                      const entered = markSheet.students.filter(
                        (st: any) => (marksByKey[`${st.id}:${subject.id}`] ?? "") !== "",
                      ).length;
                      return (
                        <th key={subject.id} className="px-3 py-3 text-center" title={`Max marks: ${subject.totalMarks || 100}`}>
                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{subject.name}</span>
                          <span className="block text-[10px] font-normal text-ink-subtle">
                            / {subject.totalMarks || 100} · {entered}/{markSheet.students.length}
                          </span>
                          {!isLocked ? (
                            <span className="mt-1 flex items-center justify-center gap-1">
                              <button type="button"
                                onClick={() => focusCell(0, col)}
                                title={`Jump to the first ${subject.name} cell`}
                                className="cursor-pointer rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:bg-[#8127cf] hover:text-white">
                                Enter
                              </button>
                              <button type="button"
                                onClick={() => clearColumn(subject.id, subject.name)}
                                title={`Clear every ${subject.name} mark on this sheet`}
                                aria-label={`Clear the ${subject.name} column`}
                                className="cursor-pointer rounded-md p-0.5 text-ink-faint transition-colors hover:bg-rose-100 hover:text-rose-600">
                                <Eraser className="h-3 w-3" />
                              </button>
                            </span>
                          ) : null}
                        </th>
                      );
                    })}
                    {/* A mark sheet without a running total makes the teacher do
                        the arithmetic they came here to avoid. */}
                    <th className="px-4 py-4 text-center">Total</th>
                  </tr>
                </thead>
                <tbody ref={gridRef} className="divide-y divide-[#f3f4f9]">
                  {markSheet.students.map((student: any, row: number) => {
                    const rowMarks = markSheet.subjects.map((subject: any) => ({
                      subject,
                      raw: marksByKey[`${student.id}:${subject.id}`] ?? "",
                    }));
                    const scored = rowMarks.filter((m: any) => m.raw !== "" && Number.isFinite(Number(m.raw)));
                    const obtained = scored.reduce((sum: number, m: any) => sum + Number(m.raw), 0);
                    const outOf = scored.reduce((sum: number, m: any) => sum + (m.subject.totalMarks || 100), 0);
                    const pct = outOf > 0 ? Math.round((obtained / outOf) * 100) : null;
                    const rowIncomplete = scored.length < markSheet.subjects.length;
                    return (
                      <tr key={student.id} className={cn(
                        "transition-colors hover:bg-[#fbf0fe]/20",
                        rowIncomplete && !isLocked && "bg-amber-50/25",
                      )}>
                        <td className="sticky left-0 z-10 bg-white px-5 py-3">
                          <StudentMini student={student} />
                        </td>
                        {markSheet.subjects.map((subject: any, col: number) => {
                          const key = `${student.id}:${subject.id}`;
                          const value = marksByKey[key] || "";
                          const max = subject.totalMarks || 100;
                          const numVal = Number(value);
                          // Matches the save guard exactly, so every cell that
                          // blocks the save is the one highlighted.
                          const isOverLimit = value !== "" && (!Number.isFinite(numVal) || numVal < 0 || numVal > max);
                          const isDirty = dirtyKeys.has(key);
                          return (
                            <td key={subject.id} className="px-3 py-3">
                              <input type="number" min={0} max={max} value={value} disabled={isLocked}
                                data-row={row} data-col={col}
                                onChange={(e) => setMarksByKey((c) => ({ ...c, [key]: e.target.value }))}
                                onFocus={(e) => e.currentTarget.select()}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === "ArrowDown") {
                                    e.preventDefault();
                                    focusCell(row + 1, col);
                                  } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    focusCell(row - 1, col);
                                  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
                                    e.preventDefault();
                                    const filled = fillDown(row, subject.id, value);
                                    toast.success(
                                      filled
                                        ? `Filled ${filled} empty ${subject.name} cell${filled === 1 ? "" : "s"} with ${value}`
                                        : `No empty ${subject.name} cells below this one`,
                                    );
                                  }
                                }}
                                title={isLocked ? "This exam is locked — marks are read-only" : `${student.fullName} · ${subject.name}, max ${max}. Enter moves down, ⌘D fills down.`}
                                aria-label={`${subject.name} marks for ${student.fullName}, out of ${max}`}
                                className={cn(
                                  "h-11 w-full rounded-xl border px-3 text-center text-sm font-bold outline-none transition-all",
                                  "focus:border-[#8127cf]/35 focus:bg-white focus:ring-4 focus:ring-[#8127cf]/20",
                                  isLocked ? "bg-[#f3f4f9]/40 text-ink-muted cursor-not-allowed" : "bg-[#fbf0fe]/40",
                                  isDirty && !isOverLimit && "border-amber-300 bg-amber-50/70",
                                  isOverLimit ? "border-rose-300 bg-rose-50 text-rose-700" : "border-[#cfc2d6]/20"
                                )} />
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center">
                          {scored.length ? (
                            <span className="inline-flex flex-col items-center leading-tight">
                              <span className={cn(
                                "text-sm font-black tabular-nums",
                                pct !== null && pct >= 50 ? "text-[#8127cf]" : "text-rose-600",
                              )}>
                                {obtained}/{outOf}
                              </span>
                              <span className="text-[10px] font-bold tabular-nums text-ink-subtle">
                                {pct}%{rowIncomplete ? " so far" : ""}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold text-ink-subtle">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
          {activeExam ? (
            <p className="text-sm font-semibold text-ink-muted">
              {activeExam.enteredMarks || 0}/{activeExam.expectedMarks || 0} marks entered
            </p>
          ) : (
            /* The empty sheet above already says "Select an exam to enter
               marks."; repeating it here printed the same line twice. */
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {markSheet?.students?.length && !isLocked ? (
              <button type="button" onClick={() => setShortcutsOpen((v) => !v)} aria-pressed={shortcutsOpen}
                title="Show the keyboard shortcuts for entering a mark sheet quickly"
                className={cn(
                  "inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-2xl border px-4 text-xs font-black uppercase tracking-wider transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25",
                  shortcutsOpen
                    ? "border-[#8127cf]/30 bg-[#8127cf] text-white"
                    : "border-[#8127cf]/10 bg-[#fbf0fe] text-[#8127cf] hover:bg-white",
                )}>
                <Keyboard className="h-4 w-4" />
                Shortcuts
              </button>
            ) : null}
            {markSheet?.students?.length ? (
              <BrandButton variant="soft" icon={<Download className="w-4 h-4" />} onClick={exportMarksCSV}><span title="Download marks as CSV file">Export CSV</span></BrandButton>
            ) : null}
          </div>
        </div>

        {shortcutsOpen && !isLocked ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-[#8127cf]/15 bg-[#fbf0fe]/60 px-4 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#8127cf]">
              <Command className="h-3 w-3" /> Mark sheet
            </span>
            {[
              ["↵ / ↓", "Next student, same subject"],
              ["↑", "Previous student"],
              ["⇥", "Next subject"],
              ["⌘D", "Fill this mark down the empty cells below"],
              ["⌘S", "Save"],
            ].map(([k, meaning]) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
                <kbd className="rounded-md border border-[#cfc2d6]/50 bg-white px-1.5 py-0.5 text-[10px] font-black text-[#1d1b20]">{k}</kbd>
                {meaning}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-subtle">
              <ArrowDownToLine className="h-3 w-3" /> Fill-down never overwrites a mark that is already there.
            </span>
          </div>
        ) : null}

        {/* Save bar — the sheet is routinely forty rows deep, so the button
            that commits it cannot live at the bottom of it. */}
        <StickySaveBar
          dirtyCount={dirtyKeys.size}
          saving={marksSaving}
          onSave={saveMarks}
          onReset={resetMarks}
          saveLabel="Save marks"
          blocked={invalidCells.length > 0 || isLocked}
          blockedReason={
            isLocked
              ? "This exam is locked — marks are read-only"
              : `${invalidCells.length} mark${invalidCells.length !== 1 ? "s are" : " is"} outside the allowed range`
          }
          hint={
            invalidCells.length
              ? `Fix the highlighted cell${invalidCells.length !== 1 ? "s" : ""} to save`
              : `${activeExam?.title || "This sheet"} · ${filledCells}/${totalCells} cells filled (${completion}%)`
          }
        />
        </>)}
      </div>

      <GradingModals grading={grading} classHubs={classHubs} />
    </TeacherPage>
  );
}
