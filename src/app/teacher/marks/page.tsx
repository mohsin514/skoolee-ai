"use client";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { FormErrorSummary } from "@/components/ui/form-field";
import { DraftRecovery } from "@/components/ui/draft-recovery";
import { InputGroup, FieldAction } from "@/components/ui/input-group";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { Progress } from "@/components/ui/progress";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { InfoTip, Tooltip } from "@/components/ui/tooltip";
import { MarkScanPanel } from "@/components/marks/mark-scan-panel";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useUiText } from "@/components/locale/LocaleProvider";
import { toast } from "@/components/ui/toast";
import {
  ArrowDownToLine, BarChart3, ChevronDown, ClipboardList, Download, Eraser, Keyboard,
  Lock, PenLine, Plus, Search, Star, X,
} from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
  classLabel, MarksSkeleton, StatusPill, StudentMini, TeacherErrorState, useTeacherData,
} from "@/components/teacher/teacher-components";
import { useGradingTools } from "../use-grading-tools";
import { FinalGradesPreview } from "../grading-tools";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { csvCell } from "@/lib/csv";
import { StickySaveBar } from "@/components/teacher/sticky-save-bar";
import { Input as SystemInput } from "@/components/ui/input";

/** How many assessment cards show before "Show all". */
const EXAM_PAGE = 6;

export default function MarksPage() {
  const ui = useUiText();
  const { data, loading, error, loadData } = useTeacherData();
  const searchParams = useSearchParams();
  const [selectedExamId, setSelectedExamId] = useState("");
  const [markSheet, setMarkSheet] = useState<any>(null);
  const [marksByKey, setMarksByKey] = useState<Record<string, string>>({});
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksSaving, setMarksSaving] = useState(false);
  // A sheet that failed to load used to read "No editable subjects for this
  // exam", which sent teachers to ask for permissions they already had.
  const [marksFailed, setMarksFailed] = useState(false);
  /* The sheet exactly as the server returned it. Dirty state is measured
     against this, so "8 unsaved changes" means eight cells this teacher
     typed — not eight cells that merely have a value in them. */
  const [baselineMarks, setBaselineMarks] = useState<Record<string, string>>({});
  const draft = useFormDraft({ record: `marks:${selectedExamId}`, schema: 1, values: marksByKey, baseline: baselineMarks,
    fields: (markSheet?.students || []).flatMap((student: { id: string }) => (markSheet?.subjects || []).map((subject: { id: string }) => `${student.id}:${subject.id}`)), enabled: !!selectedExamId && !!markSheet && !marksLoading,
    apply: (next) => setMarksByKey(next),
    current: async () => {
      const response = await fetch(`/api/marks?examId=${selectedExamId}`, { cache: "no-store" });
      if (!response.ok) throw new Error([401, 403, 404].includes(response.status) ? "Access revoked" : "Server unavailable");
      const latest = await response.json();
      return Object.fromEntries((latest.marks || []).map((mark: { studentId: string; subjectId: string; marksObtained: number }) => [`${mark.studentId}:${mark.subjectId}`, String(mark.marksObtained)]));
    },
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pendingExamId, setPendingExamId] = useState<string | null>(null);
  const [examQuery, setExamQuery] = useState("");
  const [showAllExams, setShowAllExams] = useState(false);
  const gridRef = useRef<HTMLTableSectionElement>(null);

  const grading = useGradingTools();

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
    if (!examId) { setMarkSheet(null); setMarksByKey({}); setBaselineMarks({}); setMarksFailed(false); return; }
    setMarksLoading(true);
    setMarksFailed(false);
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
        setMarksFailed(true);
      }
    } catch { setMarkSheet(null); setMarksByKey({}); setBaselineMarks({}); setMarksFailed(true); }
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
      if (payload.length === 0) { toast.error(ui("Enter at least one mark before saving.")); return; }
      const res = await fetch("/api/marks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: selectedExamId, entries: payload, expectedMarks: draft.baseline }),
      });
      const text = await res.text();
      const result = JSON.parse(text);
      if (res.status === 409 && result.conflict) {
        await draft.reviewCurrent();
        toast.error(result.error);
        return;
      }
      if (!res.ok) throw new Error(apiErrorMessage(result.error, ui("Could not save the marks. Please try again.")));
      draft.markSaved();
      toast.success(ui("Marks saved for this test."));
      await loadMarks(selectedExamId);
      await loadData();
    } catch (error: unknown) { toast.error(error); }
    finally { setMarksSaving(false); }
  }, [selectedExamId, markSheet, marksByKey, loadMarks, loadData, draft, ui]);

  const exportMarksCSV = useCallback(() => {
    if (!markSheet) return;
    const rows = [[ui("Pupil"), ui("Roll number"), ...markSheet.subjects.map((s: any) => s.name)]];
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
    // The UTF-8 BOM keeps Arabic and Urdu names readable when the file opens in a spreadsheet app.
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `marks-${selectedExamId}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [markSheet, marksByKey, selectedExamId, ui]);

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

  /* Wiping a column of marks was gated behind a native `window.confirm` — an
     OS dialog with no styling, no icon, and no way to say how many entries are
     about to go. It now asks through the same ConfirmAction the rest of the
     product uses, and states the count. */
  const [clearTarget, setClearTarget] = useState<{ subjectId: string; subjectName: string } | null>(null);

  const clearColumn = useCallback((subjectId: string, subjectName: string) => {
    if (!markSheet) return;
    setClearTarget({ subjectId, subjectName });
  }, [markSheet]);

  const confirmClearColumn = useCallback(() => {
    if (!markSheet || !clearTarget) return;
    const { subjectId } = clearTarget;
    setMarksByKey((current) => {
      const next = { ...current };
      for (const student of markSheet.students) next[`${student.id}:${subjectId}`] = "";
      return next;
    });
    setClearTarget(null);
  }, [markSheet, clearTarget]);

  const clearTargetCount = useMemo(() => {
    if (!markSheet || !clearTarget) return 0;
    return markSheet.students.reduce((n: number, student: { id: string }) => {
      const v = marksByKey[`${student.id}:${clearTarget.subjectId}`];
      return n + (v !== undefined && v !== "" ? 1 : 0);
    }, 0);
  }, [markSheet, clearTarget, marksByKey]);

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
      icon={PenLine}
      title="Marks"
      description="Enter marks for your tests; the sticky bar saves the sheet. You lock your own quizzes and class tests; your academic lead locks term exams and publishes results."
      secondaryActions={[
        ...(markSheet?.students?.length ? [{ id: "export-csv", label: "Export CSV", icon: Download, onClick: exportMarksCSV }] : []),
        ...(markSheet?.students?.length && !isLocked ? [{ id: "shortcuts", label: shortcutsOpen ? "Hide shortcuts" : "Shortcuts", icon: Keyboard, onClick: () => setShortcutsOpen((v) => !v) }] : []),
        ...(classHubs.length ? [{ id: "final-grades", label: "Final grades preview", icon: BarChart3, onClick: () => grading.openFinalGrades(activeExam?.classId || classHubs[0]?.id) }] : []),
      ]}
    >
      <DraftRecovery recordLabel={activeExam?.title || ui("Marks entry")} draft={draft} saving={marksSaving} labels={Object.fromEntries((markSheet?.students || []).flatMap((student: any) => (markSheet?.subjects || []).map((subject: any) => [`${student.id}:${subject.id}`, `${student.fullName} — ${subject.name}`])))} />
      <FormErrorSummary errors={Object.fromEntries(invalidCells.map(({ student, subject }: any) => [`mark-${student.id}:${subject.id}`, ui("{0}: {1} must be between 0 and {2}.", [student.fullName, subject.name, subject.totalMarks || 100])]))} onFocusField={(id) => document.getElementById(id)?.focus()} />
      <div className="space-y-3">

        {/* Zero state — with no assessments the selector, sheet and save bar are
            all inert, so show the way forward instead of three dead controls. */}
        {!data.exams?.length ? (
          <div className="sk-panel sk-enter">
            <EmptyState
              icon={Star}
              title={ui("No tests yet")}
              description={ui("Create a quiz or class test for one of your classes, and its mark sheet opens here for you to fill in.")}
              action={classHubs.length ? (
                <Link href="/teacher/tests" className={buttonVariants({ variant: "default" })}>
                  <Plus aria-hidden="true" /> {ui("New test")}
                </Link>
              ) : undefined}
            />
            {!classHubs.length ? (
              <div className="mx-auto max-w-md px-6 pb-8">
                <Alert tone="warning" compact live="off">
                  {ui("You have no classes assigned yet — ask your campus admin to assign one.")}
                </Alert>
              </div>
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
          <InputGroup surfaceClassName="bg-card" className="w-full sm:w-[320px] sm:flex-none">
            <Search data-field-affix="start" aria-hidden="true" className="pointer-events-none size-4 text-ink-subtle" />
            <SystemInput
              value={examQuery}
              onChange={(e) => setExamQuery(e.target.value)}
              placeholder={ui("Find a test or class…")}
              aria-label={ui("Filter tests")}
              className={"w-full"}
            />
            {examQuery ? (
              <FieldAction data-field-affix="end" type="button" onClick={() => setExamQuery("")} label={ui("Clear test filter")}>
                <X aria-hidden="true" />
              </FieldAction>
            ) : null}
          </InputGroup>
          <span aria-live="polite" className="text-xs tabular-nums text-ink-subtle">
            {ui("{0} of {1} tests", [visibleExams.length, data.exams.length])}
          </span>
          {/* The grid caps at a readable number; without this the teacher had
              no way to know the other six existed. */}
          {visibleExams.length > EXAM_PAGE && (
            <Button variant="outline" size="sm" type="button" onClick={() => setShowAllExams((v) => !v)} aria-expanded={showAllExams}
              className="justify-start gap-1.5">
              <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 transition-transform", showAllExams && "rotate-180")} />
              {showAllExams ? ui("Show fewer") : ui("Show all {0}", [visibleExams.length])}
            </Button>
          )}
        </div>

        {/* Locked banner */}
        {isLocked && (
          <Alert tone="warning" icon={Lock} compact live="off">
            <span className="font-semibold text-status-warning-text">{ui("This test is locked — marks are read-only.")}</span>
          </Alert>
        )}

        {/* Exam cards */}
        <div className="sk-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(showAllExams ? visibleExams : visibleExams.slice(0, EXAM_PAGE)).map((exam: any) => {
            const isSelected = selectedExamId === exam.id;
            const isLockedExam = exam.isLocked || ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(exam.status || "");
            return (
              <Button aria-pressed={isSelected} variant="choice" key={exam.id} type="button" onClick={() => { if (draft.dirty && exam.id !== selectedExamId) setPendingExamId(exam.id); else setSelectedExamId(exam.id); }}
                className="block w-full min-w-0 p-4 text-start hover:shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-strong">{exam.title}</p>
                    <p className="mt-0.5 truncate text-xs font-normal text-ink-muted">{exam.subject ? `${exam.subject.name} · ` : ""}{classLabel(exam.class)}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    {isLockedExam ? <Lock role="img" aria-label={ui("Locked")} className="h-3.5 w-3.5 text-status-warning-text" /> : null}
                    <StatusPill status={exam.status} />
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="success" size="sm" dot data-numeric>{ui("{0} entered", [exam.enteredMarks || 0])}</Badge>
                  {exam.missingMarks > 0 && (
                    <Badge variant="danger" size="sm" dot data-numeric>{ui("{0} missing", [exam.missingMarks])}</Badge>
                  )}
                </div>
              </Button>
            );
          })}
          {visibleExams.length === 0 ? (
            <div className="sk-panel col-span-full">
              <EmptyState
                size="sm"
                icon={Search}
                title={ui("No test matches “{0}”", [examQuery])}
                description={ui("Search by test title, subject or class.")}
                action={
                  <Button variant="secondary" size="sm" type="button" onClick={() => setExamQuery("")}>
                    <X aria-hidden="true" /> {ui("Clear filter")}
                  </Button>
                }
              />
            </div>
          ) : null}
        </div>

        {/* Progress bar */}
        {markSheet && totalCells > 0 && (
          <div className="flex items-center gap-3">
            <Progress className="flex-1" value={completion} label={ui("Mark sheet filled")} valueText={ui("{0} of {1} cells", [filledCells, totalCells])} />
            <bdi className="whitespace-nowrap text-xs font-semibold tabular-nums text-ink-muted">{filledCells}/{totalCells} · {completion}%</bdi>
          </div>
        )}

        {/* Marks table */}
        <div className="sk-panel sk-enter overflow-hidden" style={{ "--sk-delay": "120ms" } as CSSProperties}>
          {marksLoading ? (
            <SkeletonRegion label={ui("Loading the mark sheet")}>
              <div className="flex gap-8 bg-muted/45 px-5 py-4">
                <Skeleton className="h-3 w-20 rounded-2xl" />
                <Skeleton className="h-3 w-16 rounded-2xl" />
                <Skeleton className="h-3 w-16 rounded-2xl" />
              </div>
              {[...Array(4)].map((_, ri) => (
                <div key={ri} className="flex items-center gap-4 border-t border-muted px-5 py-4">
                  <div className="flex flex-1 items-center gap-3">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-xl" delay={ri * 60} />
                    <div>
                      <Skeleton className="mb-1 h-4 w-28 rounded-2xl" delay={ri * 60} />
                      <Skeleton className="h-3 w-20 rounded-2xl" delay={ri * 60} />
                    </div>
                  </div>
                  {[...Array(3)].map((_, ci) => (
                    <Skeleton key={ci} className="hidden h-11 w-20 rounded-2xl sm:block" delay={ri * 60} />
                  ))}
                </div>
              ))}
            </SkeletonRegion>
          ) : marksFailed ? (
            <ErrorState
              title={ui("Couldn't load this mark sheet")}
              description={ui("Check your connection and try again. Marks already saved are safe on the server.")}
              onRetry={() => void loadMarks(selectedExamId)}
            />
          ) : markSheet?.subjects?.length && markSheet?.students?.length ? (

              <Table containerClassName="overflow-x-auto" className="w-full min-w-[720px] text-start">
                <TableHeader>
                  <TableRow className="bg-brand-50/40 text-ink-muted">
                    {/* The student column is frozen: past three subjects the
                        names scrolled out of view and the teacher was typing
                        into an anonymous grid. */}
                    <TableHead className="sticky start-0 z-10 bg-brand-50/95 px-5 py-4 backdrop-blur-sm">{ui("Pupil")}</TableHead>
                    {markSheet.subjects.map((subject: any, col: number) => {
                      const entered = markSheet.students.filter(
                        (st: any) => (marksByKey[`${st.id}:${subject.id}`] ?? "") !== "",
                      ).length;
                      return (
                        <TableHead key={subject.id} className="px-3 py-3 text-center">
                          <span className="block text-2xs font-semibold text-ink-muted">{subject.name}</span>
                          <span className="block text-2xs font-normal tabular-nums text-ink-subtle">
                            <span className="sr-only">{ui("Out of")} </span><bdi>/ {subject.totalMarks || 100} · {entered}/{markSheet.students.length}</bdi><span className="sr-only"> {ui("entered")}</span>
                          </span>
                          {!isLocked ? (
                            <span className="mt-1 flex items-center justify-center gap-1">
                              <Tooltip content={ui("Jump to the first {0} cell", [subject.name])}>
                                <Button size="sm" variant="link" type="button"
                                  onClick={() => focusCell(0, col)}
                                  className="px-1">
                                  {ui("Enter")}
                                </Button>
                              </Tooltip>
                              <IconButton size="sm" variant="ghost"
                                onClick={() => clearColumn(subject.id, subject.name)}
                                label={ui("Clear the {0} column", [subject.name])}
                                tooltip={ui("Clear every {0} mark on this sheet", [subject.name])}
                              >
                                <Eraser aria-hidden="true" />
                              </IconButton>
                            </span>
                          ) : null}
                        </TableHead>
                      );
                    })}
                    {/* A mark sheet without a running total makes the teacher do
                        the arithmetic they came here to avoid. */}
                    <TableHead className="px-4 py-4 text-center">{ui("Total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody ref={gridRef} className="divide-y divide-muted">
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
                      <TableRow key={student.id} className={cn(
                        "transition-colors hover:bg-surface-hover",
                        rowIncomplete && !isLocked && "bg-status-warning-surface/40",
                      )}>
                        <TableCell className="sticky start-0 z-10 bg-card px-5 py-3">
                          <StudentMini student={student} />
                        </TableCell>
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
                            <TableCell key={subject.id} className="px-3 py-3">
                              <SystemInput id={`mark-${key}`} aria-invalid={isOverLimit || undefined} aria-describedby={isOverLimit ? `mark-${key}-error` : undefined} type="number" min={0} max={max} value={value} disabled={isLocked || marksSaving || !!draft.recovery}
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
                                        ? ui("Filled {0} empty {1} cells with {2}", [filled, subject.name, value])
                                        : ui("No empty {0} cells below this one", [subject.name]),
                                    );
                                  }
                                }}
                                aria-description={isLocked ? ui("This test is locked. Marks are read-only.") : undefined}
                                aria-label={ui("{0} marks for {1}, out of {2}", [subject.name, student.fullName, max])}
                                className={"w-full text-center"} />
                              {isOverLimit && <p id={`mark-${key}-error`} className="sk-field-message mt-1 text-center text-xs font-medium text-destructive">{ui("Enter 0 to {0}.", [max])}</p>}
                            </TableCell>
                          );
                        })}
                        <TableCell className="px-4 py-3 text-center">
                          {scored.length ? (
                            <span className="inline-flex flex-col items-center leading-tight">
                              <span className={cn(
                                "text-sm font-bold tabular-nums",
                                pct !== null && pct >= 50 ? "text-primary" : "text-status-error-text",
                              )}>
                                {obtained}/{outOf}
                              </span>
                              <span className="text-2xs font-semibold tabular-nums text-ink-subtle">
                                <bdi>{pct}%</bdi>{rowIncomplete ? ` ${ui("so far")}` : ""}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-ink-subtle">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

          ) : (
            selectedExamId ? (
              <EmptyState
                size="sm"
                icon={ClipboardList}
                title={markSheet && !markSheet.students?.length && markSheet.subjects?.length ? ui("No pupils on this sheet") : ui("No subjects you can mark in this test")}
                description={markSheet && !markSheet.students?.length && markSheet.subjects?.length
                  ? ui("This class has no enrolled pupils yet, so there is nothing to mark.")
                  : ui("You can enter marks only for the subjects you teach in this class, or for every subject if you are its class teacher.")}
              />
            ) : (
              <EmptyState size="sm" icon={ClipboardList} title={ui("Choose a test to enter marks")} description={ui("Pick a test above and its mark sheet opens here.")} />
            )
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {activeExam ? (
            <p className="inline-flex items-center gap-0.5 text-sm font-medium tabular-nums text-ink-muted">
              {ui("{0} of {1} marks entered", [activeExam.enteredMarks || 0, activeExam.expectedMarks || 0])}
              <InfoTip content={ui("Saved marks for this test, out of the marks expected in the subjects you can mark. Unsaved edits on the sheet are not counted until you save.")} />
            </p>
          ) : (
            /* The empty sheet above already says "Select an exam to enter
               marks."; repeating it here printed the same line twice. */
            <span />
          )}
        </div>

        {shortcutsOpen && !isLocked ? (
          <Alert tone="brand" icon={Keyboard} live="off" title={ui("Mark sheet shortcuts")} className="sk-enter-scale">
            <ul className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
              {[
                ["↵ / ↓", ui("Next pupil, same subject")],
                ["↑", ui("Previous pupil")],
                ["⇥", ui("Next subject")],
                ["⌘D / Ctrl+D", ui("Fill this mark down the empty cells below")],
                ["⌘S / Ctrl+S", ui("Save")],
              ].map(([k, meaning]) => (
                <li key={k} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                  <kbd dir="ltr" className="rounded-md border border-edge/50 bg-card px-1.5 py-0.5 text-2xs font-semibold text-ink-strong shadow-xs">{k}</kbd>
                  {meaning}
                </li>
              ))}
            </ul>
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-subtle">
              <ArrowDownToLine aria-hidden="true" className="h-3.5 w-3.5" /> {ui("Fill-down never overwrites a mark that is already there.")}
            </p>
          </Alert>
        ) : null}

        {/* Save bar — the sheet is routinely forty rows deep, so the button
            that commits it cannot live at the bottom of it. */}
        <StickySaveBar
          dirtyCount={dirtyKeys.size}
          saving={marksSaving}
          onSave={saveMarks}
          onReset={resetMarks}
          saveLabel={ui("Save marks")}
          // An open, editable sheet keeps its save bar: a calm "All marks saved" status when clean; Save appears with the first change.
          forceShow={Boolean(markSheet?.students?.length) && !isLocked}
          label={dirtyKeys.size ? undefined : ui("All marks saved")}
          blocked={invalidCells.length > 0 || isLocked}
          blockedReason={
            isLocked
              ? ui("This test is locked — marks are read-only")
              : ui("{0} marks are outside the allowed range", [invalidCells.length])
          }
          hint={
            invalidCells.length
              ? ui("Fix the highlighted cells to save")
              : ui("{0} · {1} of {2} cells filled ({3}%)", [activeExam?.title || ui("This sheet"), filledCells, totalCells, completion])
          }
        />
        </>)}
      </div>

      <ConfirmAction open={pendingExamId !== null} title={ui("Change test?")} description={ui("Your marks are not saved to the server. Eligible input stays in this tab as a draft for up to 24 hours.")} confirmLabel={ui("Change test")} cancelLabel={ui("Keep editing")} onConfirm={() => { if (pendingExamId) setSelectedExamId(pendingExamId); setPendingExamId(null); }} onCancel={() => setPendingExamId(null)} />
      <FinalGradesPreview grading={grading} classHubs={classHubs} />



      <ConfirmAction
        open={clearTarget !== null}
        tone="danger"
        title={ui("Clear every mark in {0}?", [clearTarget?.subjectName ?? ui("this subject")])}
        description={ui("This empties the whole column on this sheet. Nothing is sent to the server until you save, so you can still leave without saving to get the marks back.")}
        detail={
          clearTargetCount > 0
            ? ui("{0} entered marks will be removed from the sheet.", [clearTargetCount])
            : ui("Nothing has been entered in this column yet.")
        }
        confirmLabel={ui("Clear column")}
        cancelLabel={ui("Keep editing")}
        onCancel={() => setClearTarget(null)}
        onConfirm={confirmClearColumn}
      />
      {/* SKO-412: paper marks sheets — capture, review every mark, approve, import. */}
      {selectedExamId && markSheet?.subjects?.length ? <div className="mt-4"><MarkScanPanel key={selectedExamId} examId={selectedExamId} subjects={markSheet.subjects.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))} onImported={() => void loadMarks(selectedExamId)} /></div> : null}
    </TeacherPage>
  );
}
