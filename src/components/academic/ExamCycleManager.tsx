"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  CalendarDays,
  BookOpen,
  CheckCircle2,
  Loader2,
  ChevronDown,
  Lock,
  Layers,
  X,
  GraduationCap,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/shared-admin";
import { ExamDetailPanel } from "@/components/academic/ExamDetailPanel";
import {
  EXAM_TYPE_LABELS,
  OFFICE_EXAM_TYPES,
  TEACHER_EXAM_TYPES,
  type ExamType,
} from "@/lib/academic/exam-permissions";

/** Who is looking at the pipeline. Teachers only ever see their own assessments. */
export type ExamCycleRole = "OFFICE" | "TEACHER";

export type ExamStatus =
  | "DRAFT"
  | "ACTIVE"
  | "MARKS_ENTRY"
  | "LOCKED"
  | "PRINCIPAL_REVIEWED"
  | "PUBLISHED";

export interface ExamItem {
  id: string;
  classId: string;
  title: string;
  term: string;
  academicYear: number;
  examType?: string | null;
  subjectId?: string | null;
  totalMarks: number;
  status: ExamStatus;
  isLocked?: boolean;
  class?: { id?: string; name: string; section?: string | null; academicYear?: number } | null;
  locker?: { fullName?: string } | null;
  subject?: { id: string; name: string; totalMarks: number } | null;
  _count: { marks: number; reportCards: number };
}

type ExamMeta = { subjectsCount: number; studentsCount: number; markedSubjects: number };

const ALL_COLUMNS = [
  { key: "PLANNING", title: "Being Prepared", accent: "#8127cf", hint: "Not started yet" },
  { key: "SCHEDULE", title: "On the Datesheet", accent: "#0d9488", hint: "Dates and rooms set" },
  { key: "MARKS", title: "Entering Marks", accent: "#f59e0b", hint: "Teachers recording marks" },
  { key: "REVIEW", title: "Awaiting Approval", accent: "#d97706", hint: "Marks locked, office checking" },
  { key: "PUBLISHED", title: "Results Released", accent: "#10b981", hint: "Families can see results" },
] as const;

type ColumnKey = (typeof ALL_COLUMNS)[number]["key"];

/**
 * Teachers never build a datesheet and never publish results, so those columns
 * would sit permanently empty for them. Show only the lanes they can act on.
 */
function columnsForRole(role: ExamCycleRole) {
  if (role === "TEACHER") {
    return ALL_COLUMNS.filter(
      (c) => c.key === "PLANNING" || c.key === "MARKS" || c.key === "REVIEW",
    ).map((c) =>
      c.key === "PLANNING"
        ? { ...c, title: "Not Started", hint: "Create and open a test" }
        : c.key === "REVIEW"
        ? { ...c, title: "Sent to Office", hint: "Marks locked and submitted" }
        : c,
    );
  }
  return [...ALL_COLUMNS];
}

function columnFor(exam: ExamItem, hasSchedule: boolean, role: ExamCycleRole): ColumnKey {
  if (exam.status === "PUBLISHED") return role === "TEACHER" ? "REVIEW" : "PUBLISHED";
  if (exam.status === "LOCKED" || exam.status === "PRINCIPAL_REVIEWED") return "REVIEW";
  if (exam.status === "MARKS_ENTRY") return "MARKS";
  // Only office exams pass through a datesheet stage.
  if (exam.status === "ACTIVE") return hasSchedule && role !== "TEACHER" ? "SCHEDULE" : "PLANNING";
  return "PLANNING";
}

type NextAction =
  | { type: "patch"; status: ExamStatus; label: string }
  | { type: "lock"; label: string }
  | { type: "open"; label: string }
  | null;

function nextAction(exam: ExamItem, hasSchedule: boolean, role: ExamCycleRole): NextAction {
  const isTeacher = role === "TEACHER";
  switch (exam.status) {
    case "DRAFT":
      return { type: "patch", status: "ACTIVE", label: "Open for Marks" };
    case "ACTIVE":
      // Teachers go straight to marks; office exams need a datesheet first.
      if (isTeacher) return { type: "patch", status: "MARKS_ENTRY", label: "Start Entering Marks" };
      return hasSchedule
        ? { type: "patch", status: "MARKS_ENTRY", label: "Start Entering Marks" }
        : { type: "open", label: "Set Dates" };
    case "MARKS_ENTRY":
      return { type: "lock", label: isTeacher ? "Submit to Office" : "Lock Marks" };
    case "LOCKED":
      // Review and publish are office-only decisions.
      return isTeacher ? null : { type: "patch", status: "PRINCIPAL_REVIEWED", label: "Approve" };
    case "PRINCIPAL_REVIEWED":
      return isTeacher ? null : { type: "patch", status: "PUBLISHED", label: "Release Results" };
    default:
      return null;
  }
}

function classLabel(item: { name: string; section?: string | null } | null | undefined) {
  if (!item) return "Unassigned";
  return [item.name, item.section].filter(Boolean).join(" ");
}

export function ExamCycleManager({
  campusId,
  role = "OFFICE",
}: {
  campusId?: string;
  role?: ExamCycleRole;
}) {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [scheduled, setScheduled] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<Record<string, ExamMeta>>({});
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState<string>("ALL");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isTeacher = role === "TEACHER";
  const columns = useMemo(() => columnsForRole(role), [role]);

  // `silent` refreshes skip the skeleton so background polling doesn't flicker.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campusId) params.set("campusId", campusId);
      const qs = params.toString();

      const [examsRes, schedRes] = await Promise.all([
        fetch(`/api/exams?${qs}`).then((r) => r.json()),
        // Teachers have no datesheet stage, so skip that call for them.
        isTeacher
          ? Promise.resolve({ data: [] })
          : fetch(`/api/academic/exam-schedule?${qs}`).then((r) => r.json()),
      ]);

      const all: ExamItem[] = examsRes.success ? examsRes.exams : [];
      // Teachers only manage their own quizzes and class tests.
      const list = isTeacher
        ? all.filter((e) =>
            (TEACHER_EXAM_TYPES as readonly string[]).includes(e.examType || ""),
          )
        : all;
      setExams(list);

      const schedSet = new Set<string>((schedRes.data || []).map((s: any) => s.examId));
      setScheduled(schedSet);

      const needMeta = list.filter((e) => e.status !== "DRAFT" && e.status !== "ACTIVE");
      const metas = await Promise.all(
        needMeta.map(async (e) => {
          try {
            const m = await fetch(`/api/marks?examId=${e.id}`).then((r) => r.json());
            const subjects: any[] = m.subjects || [];
            const marks: any[] = m.marks || [];
            const markedSubjects = new Set(marks.map((mk: any) => mk.subjectId)).size;
            return {
              id: e.id,
              meta: {
                subjectsCount: subjects.length,
                studentsCount: (m.students || []).length,
                markedSubjects,
              } as ExamMeta,
            };
          } catch {
            return {
              id: e.id,
              meta: { subjectsCount: 0, studentsCount: 0, markedSubjects: 0 } as ExamMeta,
            };
          }
        })
      );
      const metaMap: Record<string, ExamMeta> = {};
      metas.forEach((x) => (metaMap[x.id] = x.meta));
      setMeta(metaMap);
    } catch {
      if (!silent) toast.error("Failed to load exams");
    } finally {
      setLoading(false);
    }
  }, [campusId, isTeacher]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Marks entry flips an exam from ACTIVE to MARKS_ENTRY server-side, and that
   * can happen in a teacher's browser while the office is watching this board.
   * Poll quietly so cards move on their own, and refresh the moment the tab is
   * focused again.
   */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") load(true);
    };
    const id = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  const advance = useCallback(
    async (exam: ExamItem, action: NextAction) => {
      if (!action) return;
      if (action.type === "open") {
        setSelectedId(exam.id);
        return;
      }
      try {
        if (action.type === "lock") {
          const res = await fetch(`/api/exams/${exam.id}/lock`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to lock exam");
          toast.success(
            `Exam locked — ${data.reportCardsGenerated ?? 0} report cards generated`
          );
        } else {
          const res = await fetch("/api/exams", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: exam.id, status: action.status }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to update status");
          toast.success(`Moved to ${action.status.replaceAll("_", " ")}`);
        }
        await load();
      } catch (e: any) {
        toast.error(e?.message || "Action failed");
      }
    },
    [load]
  );

  const termOptions = useMemo(() => {
    const set = new Set<string>();
    exams.forEach((e) => set.add(`${e.academicYear} · ${e.term}`));
    return Array.from(set.keys());
  }, [exams]);

  const visibleExams = useMemo(
    () =>
      term === "ALL"
        ? exams
        : exams.filter((e) => `${e.academicYear} · ${e.term}` === term),
    [exams, term]
  );

  const byColumn = useMemo(() => {
    const map: Record<ColumnKey, ExamItem[]> = {
      PLANNING: [],
      SCHEDULE: [],
      MARKS: [],
      REVIEW: [],
      PUBLISHED: [],
    };
    visibleExams.forEach((e) =>
      map[columnFor(e, scheduled.has(e.id), role)].push(e)
    );
    return map;
  }, [visibleExams, scheduled, role]);

  const selectedExam = selectedId ? exams.find((e) => e.id === selectedId) || null : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-[#cfc2d6]/15 bg-gradient-to-br from-[#faf7fc] via-white to-[#f3eeff] p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#6a1fb0] text-white shadow-lg shadow-[#8127cf]/20">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">
                {isTeacher ? "My Classroom" : "Exams & Results"}
              </p>
              <h2 className="text-xl font-black text-[#1d1b20] tracking-tight">
                {isTeacher ? "My Tests & Quizzes" : "Exams & Results"}
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="appearance-none rounded-2xl border border-[#cfc2d6]/20 bg-white py-2.5 pl-4 pr-9 text-xs font-bold text-[#1d1b20] shadow-sm focus:outline-none focus:ring-4 focus:ring-[#8127cf]/20"
              >
                <option value="ALL">All Terms</option>
                {termOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8127cf]" />
            </div>
            <BrandButton
              variant="gradient"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setCreating(true)}
            >
              {isTeacher ? "New Test" : "New Exam"}
            </BrandButton>
          </div>
        </div>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-3xl border border-[#cfc2d6]/10 bg-white p-4 shadow-sm"
            >
              <div className="mb-4 h-3 w-24 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, j) => (
                  <div
                    key={j}
                    className="h-24 rounded-2xl bg-[#e8e0ec]/40 skeleton-shimmer"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : exams.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#cfc2d6]/30 bg-white p-16 text-center">
          <CalendarDays className="mb-3 h-10 w-10 text-[#4d4354]/20" />
          <p className="text-sm font-bold text-[#4d4354]/50">
            {isTeacher ? "No tests yet" : "No exams yet"}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#4d4354]/30">
            {isTeacher
              ? "Create a quiz or class test for one of your subjects."
              : "Create your first exam to start the cycle."}
          </p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
          {columns.map((col) => (
            <div
              key={col.key}
              className="flex w-[300px] shrink-0 flex-col rounded-3xl border border-[#cfc2d6]/10 bg-gradient-to-b from-white to-[#faf7fc] p-4 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: col.accent }}
                  />
                  <h3 className="text-sm font-black text-[#1d1b20]">{col.title}</h3>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider"
                  style={{ backgroundColor: `${col.accent}1a`, color: col.accent }}
                >
                  {byColumn[col.key].length}
                </span>
              </div>
              <p className="mb-3 text-[10px] font-semibold text-[#4d4354]/40">{col.hint}</p>
              <div className="flex flex-1 flex-col gap-3">
                {byColumn[col.key].map((exam) => (
                  <ExamCard
                    key={exam.id}
                    exam={exam}
                    hasSchedule={scheduled.has(exam.id)}
                    meta={meta[exam.id]}
                    role={role}
                    onOpen={() => setSelectedId(exam.id)}
                    onAdvance={(a) => advance(exam, a)}
                  />
                ))}
                {byColumn[col.key].length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#cfc2d6]/20 py-8 text-center text-[11px] font-semibold text-[#4d4354]/30">
                    Empty
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <CreateExamModal
          campusId={campusId}
          role={role}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}

      {selectedExam ? (
        <ExamDetailPanel
          exam={selectedExam}
          campusId={campusId}
          role={role}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}

function ExamCard({
  exam,
  hasSchedule,
  meta,
  role,
  onOpen,
  onAdvance,
}: {
  exam: ExamItem;
  hasSchedule: boolean;
  meta?: ExamMeta;
  role: ExamCycleRole;
  onOpen: () => void;
  onAdvance: (a: NextAction) => void;
}) {
  const action = nextAction(exam, hasSchedule, role);
  const subjCount = exam.subject ? 1 : (meta?.subjectsCount ?? 0);
  const marked = meta?.markedSubjects ?? 0;
  const pct = subjCount > 0 ? Math.round((marked / subjCount) * 100) : 0;
  const accent =
    exam.status === "PUBLISHED"
      ? "#10b981"
      : exam.status === "LOCKED" || exam.status === "PRINCIPAL_REVIEWED"
      ? "#d97706"
      : exam.status === "MARKS_ENTRY"
      ? "#f59e0b"
      : hasSchedule
      ? "#0d9488"
      : "#8127cf";

  return (
    <div className="group rounded-2xl border border-[#cfc2d6]/15 bg-white p-4 shadow-sm transition-all hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(129,39,207,0.18)]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="text-left font-black text-[#1d1b20] leading-tight hover:text-[#8127cf] transition-colors cursor-pointer"
        >
          {exam.title}
        </button>
        <StatusPill status={exam.status} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-[#fbf0fe] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
          {EXAM_TYPE_LABELS[exam.examType as ExamType] ||
            exam.examType?.replaceAll("_", " ") ||
            "Exam"}
        </span>
        <span className="rounded-full bg-[#f3f4f9] px-2 py-0.5 text-[9px] font-bold text-[#4d4354]/60">
          {classLabel(exam.class)}
        </span>
      </div>

      <p className="mb-3 text-[11px] font-semibold text-[#4d4354]/50">
        {exam.subject ? exam.subject.name : "All subjects"}
        {subjCount ? ` · ${subjCount} subject${subjCount > 1 ? "s" : ""}` : ""}
      </p>

      {subjCount > 0 ? (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold">
            <span className="text-[#4d4354]/50">Subjects marked</span>
            <span className="text-[#4d4354]/70">
              {marked}/{subjCount}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f3f4f9]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: accent }}
            />
          </div>
        </div>
      ) : null}

      {action ? (
        <button
          type="button"
          onClick={() => onAdvance(action)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-black uppercase tracking-wider text-white transition-all hover:scale-[1.01] cursor-pointer"
          style={{ backgroundColor: accent }}
        >
          {action.type === "lock" ? <Lock className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {action.label}
        </button>
      ) : (
        <div className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2 text-[11px] font-black uppercase tracking-wider text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> Complete
        </div>
      )}
    </div>
  );
}

const CLASSES_CACHE = new Map<string, { data: any[]; ts: number }>();
const CLASSES_CACHE_TTL = 60_000;

function CreateExamModal({
  campusId,
  role,
  onClose,
  onCreated,
}: {
  campusId?: string;
  role: ExamCycleRole;
  onClose: () => void;
  onCreated: () => void;
}) {
  // Teachers may only create their own classroom assessments.
  const typeOptions: readonly ExamType[] =
    role === "TEACHER" ? TEACHER_EXAM_TYPES : [...TEACHER_EXAM_TYPES, ...OFFICE_EXAM_TYPES];
  const [classes, setClasses] = useState<any[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    classId: "",
    title: "",
    term: "Term 1",
    academicYear: new Date().getFullYear(),
    examType: "CLASS_TEST",
    subjectId: "",
  });

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setClassesError(null);
    const cacheKey = campusId || "default";
    const cached = CLASSES_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.ts < CLASSES_CACHE_TTL) {
      setClasses(cached.data);
      setLoadingClasses(false);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const params = new URLSearchParams();
      if (campusId) params.set("campusId", campusId);
      const res = await fetch(`/api/classes?${params.toString()}`, { signal: controller.signal });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load classes");
      const list = d.data || [];
      CLASSES_CACHE.set(cacheKey, { data: list, ts: Date.now() });
      setClasses(list);
    } catch (e: any) {
      setClassesError(e?.name === "AbortError" ? "Classes took too long to load" : e?.message || "Failed to load classes");
    } finally {
      clearTimeout(timeout);
      setLoadingClasses(false);
    }
  }, [campusId]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const submit = async () => {
    if (!form.classId || !form.title) {
      toast.error("Class and title are required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: form.classId,
          title: form.title,
          term: form.term,
          academicYear: Number(form.academicYear),
          examType: form.examType,
          subjectId: form.subjectId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create exam");
      toast.success("Exam created");
      onCreated();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create exam");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#1f1a23]/45 p-4 backdrop-blur-md animate-backdrop-enter">
      <div className="w-full max-w-lg overflow-hidden rounded-[34px] border border-[#cfc2d6]/15 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)] animate-modal-enter">
        <div className="flex items-center justify-between bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-white/70">
                New
              </p>
              <h3 className="text-lg font-black">Create Exam</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-2xl text-white/80 hover:bg-white/15 cursor-pointer transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-6 custom-scrollbar">
          {loadingClasses ? (
            <div className="space-y-3">
              <div className="h-40 w-full rounded-2xl bg-[#e8e0ec]/40 skeleton-shimmer" />
              <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/40">
                Loading classes…
              </p>
            </div>
          ) : classesError ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-rose-200 bg-rose-50/50 p-8 text-center">
              <AlertCircle className="h-8 w-8 text-rose-400" />
              <p className="text-xs font-bold text-rose-600">{classesError}</p>
              <button
                type="button"
                onClick={loadClasses}
                className="flex items-center gap-1.5 rounded-xl bg-[#8127cf] px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-all hover:bg-[#6a1fb0] cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          ) : (
            <>
              <Field label="Class">
                <select
                  value={form.classId}
                  onChange={(e) => setForm({ ...form, classId: e.target.value })}
                  className="w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1d1b20] focus:outline-none focus:ring-4 focus:ring-[#8127cf]/20"
                >
                  <option value="">Select class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {classLabel(c)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Exam Title">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Mid-Term Examination"
                  className="w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1d1b20] focus:outline-none focus:ring-4 focus:ring-[#8127cf]/20"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Term">
                  <input
                    value={form.term}
                    onChange={(e) => setForm({ ...form, term: e.target.value })}
                    className="w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1d1b20] focus:outline-none focus:ring-4 focus:ring-[#8127cf]/20"
                  />
                </Field>
                <Field label="Academic Year">
                  <input
                    type="number"
                    value={form.academicYear}
                    onChange={(e) =>
                      setForm({ ...form, academicYear: Number(e.target.value) })
                    }
                    className="w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1d1b20] focus:outline-none focus:ring-4 focus:ring-[#8127cf]/20"
                  />
                </Field>
              </div>

              <Field label={role === "TEACHER" ? "Type of Test" : "Type of Exam"}>
                <select
                  value={form.examType}
                  onChange={(e) => setForm({ ...form, examType: e.target.value })}
                  className="w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1d1b20] focus:outline-none focus:ring-4 focus:ring-[#8127cf]/20"
                >
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {EXAM_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                {role === "TEACHER" ? (
                  <p className="mt-1.5 text-[10px] font-semibold text-[#4d4354]/40">
                    Mid-term and final exams are set up by the school office.
                  </p>
                ) : null}
              </Field>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#cfc2d6]/10 bg-[#faf7fc] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl px-5 py-2.5 text-sm font-black text-[#4d4354]/60 hover:bg-[#4d4354]/5 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <BrandButton variant="gradient" onClick={submit} disabled={busy || loadingClasses}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
            Create Exam
          </BrandButton>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50">
        {label}
      </span>
      {children}
    </label>
  );
}
