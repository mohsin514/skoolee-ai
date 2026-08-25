"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  GraduationCap,
  Info,
  LayoutList,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Rows3,
  RotateCcw,
  Search,
  Table2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import { ExamDetailPanel } from "@/components/academic/ExamDetailPanel";
import { ExamBoardCard, type DetailTab } from "@/components/academic/ExamBoardCard";
import { ExamTableView, type SortKey } from "@/components/academic/ExamTableView";
import { ExamTimelineView, type ScheduleRow } from "@/components/academic/ExamTimelineView";
import { useAcademicYear } from "@/components/academic-year/CycleGate";
import {
  EXAM_TYPE_LABELS,
  OFFICE_EXAM_TYPES,
  TEACHER_EXAM_TYPES,
  type ExamType,
} from "@/lib/academic/exam-permissions";
import {
  classLabel,
  columnFor,
  columnsForRole,
  evaluateMove,
  marksProgress,
  needsAttention,
  nextAction,
  type BoardColumn,
  type ColumnKey,
  type ExamCycleRole,
  type ExamItem,
  type ExamMeta,
  type ExamStatus,
  type MoveVerdict,
  type NextAction,
  type ScheduleSummary,
} from "@/lib/academic/exam-pipeline";

// Re-exported so the panels that hang off this board keep their existing
// import path while the rules themselves live in the pipeline module.
export type { ExamCycleRole, ExamItem, ExamStatus };

type ViewMode = "board" | "table" | "timeline";

interface Prefs {
  view: ViewMode;
  density: "compact" | "comfortable";
  collapsed: ColumnKey[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
}

const DEFAULT_PREFS: Prefs = {
  view: "board",
  density: "comfortable",
  collapsed: [],
  sortKey: "manual",
  sortDir: "asc",
};

function prefsKey(role: ExamCycleRole, campusId?: string) {
  return `skoolee.examBoard.prefs.${role}.${campusId || "default"}`;
}

function orderKey(role: ExamCycleRole, campusId?: string) {
  return `skoolee.examBoard.order.${role}.${campusId || "default"}`;
}

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a full or blocked storage must never break the board */
  }
}

/** Fetch in small batches so a big exam list doesn't fire 40 requests at once. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}

/** One planned drag or menu move, with the parts that can't go through named. */
interface MovePlan {
  to: ColumnKey;
  /** Small label above the dialog title. */
  eyebrow: string;
  /** Success wording once it has run — an approval is not "a move". */
  successText: (count: number) => string;
  eligible: { exam: ExamItem; verdict: Extract<MoveVerdict, { ok: true }> }[];
  blocked: { exam: ExamItem; reason: string }[];
}

/** Card and button colour per status, so an action looks like its destination. */
const STATUS_ACCENT: Record<string, string> = {
  ACTIVE: "#8127cf",
  MARKS_ENTRY: "#f59e0b",
  LOCKED: "#d97706",
  PRINCIPAL_REVIEWED: "#d97706",
  PUBLISHED: "#10b981",
};

export function ExamCycleManager({
  campusId,
  role = "OFFICE",
}: {
  campusId?: string;
  role?: ExamCycleRole;
}) {
  const isTeacher = role === "TEACHER";
  const columns = useMemo(() => columnsForRole(role), [role]);

  const [exams, setExams] = useState<ExamItem[]>([]);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [meta, setMeta] = useState<Record<string, ExamMeta>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab | undefined>();

  // ── Filters ──
  const [term, setTerm] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [stageFilter, setStageFilter] = useState<ColumnKey | "ALL">("ALL");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Board preferences, remembered between visits ──
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [order, setOrder] = useState<Record<string, string[]>>({});
  // Which storage key the current `prefs` were read from. A plain "have we
  // loaded yet" ref is not enough: the writer effect runs in the same commit as
  // the loader, still holding the default prefs, and wrote them straight over
  // whatever was saved — every visit came back on the Board view.
  const [prefsFor, setPrefsFor] = useState<string | null>(null);

  useEffect(() => {
    const key = prefsKey(role, campusId);
    setPrefs(readJSON(key, DEFAULT_PREFS));
    setOrder(readJSON<Record<string, string[]>>(orderKey(role, campusId), {}));
    setPrefsFor(key);
  }, [role, campusId]);

  useEffect(() => {
    const key = prefsKey(role, campusId);
    if (prefsFor !== key) return;
    writeJSON(key, prefs);
  }, [prefs, prefsFor, role, campusId]);

  const patchPrefs = useCallback((next: Partial<Prefs>) => {
    setPrefs((p) => ({ ...p, ...next }));
  }, []);

  // ── Selection ──
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Drag state ──
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [dropZone, setDropZone] = useState<{
    col: ColumnKey;
    index: number | null;
    ok: boolean;
    message: string;
  } | null>(null);

  // ── Pending confirmations ──
  const [pendingPlan, setPendingPlan] = useState<MovePlan | null>(null);
  const [rejecting, setRejecting] = useState<ExamItem[] | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const [announcement, setAnnouncement] = useState("");

  // `silent` refreshes skip the skeleton so background polling doesn't flicker.
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
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
          ? all.filter((e) => (TEACHER_EXAM_TYPES as readonly string[]).includes(e.examType || ""))
          : all;
        setExams(list);
        setScheduleRows((schedRes.data || []) as ScheduleRow[]);

        const needMeta = list.filter((e) => e.status !== "DRAFT" && e.status !== "ACTIVE");
        const metas = await mapWithLimit(needMeta, 6, async (e) => {
          try {
            const m = await fetch(`/api/marks?examId=${e.id}`).then((r) => r.json());
            const subjects: { id: string }[] = m.subjects || [];
            const students: { id: string }[] = m.students || [];
            const marks: { studentId: string; subjectId: string }[] = m.marks || [];
            const subjectIds = new Set(subjects.map((s) => s.id));
            const studentIds = new Set(students.map((s) => s.id));
            const pairs = new Set(
              marks
                .filter((mk) => subjectIds.has(mk.subjectId) && studentIds.has(mk.studentId))
                .map((mk) => `${mk.studentId}:${mk.subjectId}`),
            );
            return {
              id: e.id,
              meta: {
                subjectsCount: subjects.length,
                studentsCount: students.length,
                markedSubjects: new Set(marks.map((mk) => mk.subjectId)).size,
                enteredMarks: pairs.size,
                expectedMarks: students.length * subjects.length,
              } as ExamMeta,
            };
          } catch {
            return {
              id: e.id,
              meta: {
                subjectsCount: 0,
                studentsCount: 0,
                markedSubjects: 0,
                enteredMarks: 0,
                expectedMarks: 0,
              } as ExamMeta,
            };
          }
        });
        const metaMap: Record<string, ExamMeta> = {};
        metas.forEach((x) => (metaMap[x.id] = x.meta));
        setMeta(metaMap);
      } catch {
        if (!silent) toast.error("Failed to load exams");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [campusId, isTeacher],
  );

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

  // ── Derived data ──
  const schedules = useMemo(() => {
    const map: Record<string, ScheduleSummary> = {};
    scheduleRows.forEach((r) => {
      const day = String(r.date).slice(0, 10);
      const cur = map[r.examId];
      if (!cur) {
        map[r.examId] = { papers: 1, firstDate: day, lastDate: day };
        return;
      }
      cur.papers += 1;
      if (!cur.firstDate || day < cur.firstDate) cur.firstDate = day;
      if (!cur.lastDate || day > cur.lastDate) cur.lastDate = day;
    });
    return map;
  }, [scheduleRows]);

  const hasSchedule = useCallback(
    (id: string) => (schedules[id]?.papers ?? 0) > 0,
    [schedules],
  );

  const flagged = useMemo(() => {
    const set = new Set<string>();
    exams.forEach((e) => {
      if (needsAttention(e, meta[e.id], hasSchedule(e.id), role)) set.add(e.id);
    });
    return set;
  }, [exams, meta, hasSchedule, role]);

  const termOptions = useMemo(() => {
    const set = new Set<string>();
    exams.forEach((e) => set.add(`${e.academicYear} · ${e.term}`));
    return Array.from(set).sort().reverse();
  }, [exams]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    exams.forEach((e) => map.set(e.classId, classLabel(e.class)));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [exams]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    exams.forEach((e) => e.examType && set.add(e.examType));
    return Array.from(set);
  }, [exams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exams.filter((e) => {
      if (term !== "ALL" && `${e.academicYear} · ${e.term}` !== term) return false;
      if (classFilter !== "ALL" && e.classId !== classFilter) return false;
      if (typeFilter !== "ALL" && e.examType !== typeFilter) return false;
      if (attentionOnly && !flagged.has(e.id)) return false;
      if (q) {
        const haystack = [e.title, classLabel(e.class), e.subject?.name, e.term]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [exams, term, classFilter, typeFilter, attentionOnly, flagged, query]);

  const sortExams = useCallback(
    (list: ExamItem[], col?: ColumnKey) => {
      const arr = [...list];
      const { sortKey: key, sortDir } = prefs;
      if (key === "manual") {
        // On the board, "board order" is the hand-arranged order of one lane.
        // In the list there are no lanes, so it means pipeline order — which is
        // still the arrangement the user is looking at, just flattened.
        const rank = new Map<string, number>();
        if (col) {
          (order[col] || []).forEach((id, i) => rank.set(id, i));
        } else {
          columns.forEach((c, laneIndex) => {
            (order[c.key] || []).forEach((id, i) => rank.set(id, laneIndex * 1000 + i));
          });
        }
        const stageRank = (e: ExamItem) =>
          columns.findIndex((c) => c.key === columnFor(e, hasSchedule(e.id), role));
        arr.sort((a, b) => {
          if (!col) {
            const sa = stageRank(a);
            const sb = stageRank(b);
            if (sa !== sb) return sa - sb;
          }
          const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          if (ra !== rb) return ra - rb;
          return a.title.localeCompare(b.title);
        });
        return arr;
      }
      const direction = sortDir === "desc" ? -1 : 1;
      arr.sort((a, b) => {
        let cmp: number;
        switch (key) {
          case "class":
            cmp = classLabel(a.class).localeCompare(classLabel(b.class));
            break;
          case "progress":
            cmp = marksProgress(meta[a.id]) - marksProgress(meta[b.id]);
            break;
          case "date": {
            // Unscheduled exams sort last either way — an exam with no dates is
            // not "the earliest" just because the list is reversed.
            const da = schedules[a.id]?.firstDate;
            const db = schedules[b.id]?.firstDate;
            if (!da && !db) cmp = 0;
            else if (!da) return 1;
            else if (!db) return -1;
            else cmp = da.localeCompare(db);
            break;
          }
          case "stage":
            cmp =
              columns.findIndex((c) => c.key === columnFor(a, hasSchedule(a.id), role)) -
              columns.findIndex((c) => c.key === columnFor(b, hasSchedule(b.id), role));
            break;
          default:
            cmp = a.title.localeCompare(b.title);
        }
        return cmp === 0 ? a.title.localeCompare(b.title) : cmp * direction;
      });
      return arr;
    },
    [prefs, order, meta, schedules, columns, hasSchedule, role],
  );

  const byColumn = useMemo(() => {
    const map: Record<ColumnKey, ExamItem[]> = {
      PLANNING: [],
      SCHEDULE: [],
      MARKS: [],
      REVIEW: [],
      PUBLISHED: [],
    };
    filtered.forEach((e) => map[columnFor(e, hasSchedule(e.id), role)].push(e));
    (Object.keys(map) as ColumnKey[]).forEach((k) => {
      map[k] = sortExams(map[k], k);
    });
    return map;
  }, [filtered, hasSchedule, role, sortExams]);

  /** Counts ignore the stage filter — the tiles are how you change it. */
  const stageCounts = useMemo(() => {
    const map: Record<ColumnKey, number> = {
      PLANNING: 0,
      SCHEDULE: 0,
      MARKS: 0,
      REVIEW: 0,
      PUBLISHED: 0,
    };
    filtered.forEach((e) => {
      map[columnFor(e, hasSchedule(e.id), role)] += 1;
    });
    return map;
  }, [filtered, hasSchedule, role]);

  const overallProgress = useMemo(() => {
    let entered = 0;
    let expected = 0;
    filtered.forEach((e) => {
      const m = meta[e.id];
      if (m && m.expectedMarks > 0) {
        entered += m.enteredMarks;
        expected += m.expectedMarks;
      }
    });
    return expected > 0 ? Math.round((entered / expected) * 100) : null;
  }, [filtered, meta]);

  const visibleColumns = useMemo(
    () => (stageFilter === "ALL" ? columns : columns.filter((c) => c.key === stageFilter)),
    [columns, stageFilter],
  );

  const tableExams = useMemo(() => {
    const list =
      stageFilter === "ALL"
        ? filtered
        : filtered.filter((e) => columnFor(e, hasSchedule(e.id), role) === stageFilter);
    return sortExams(list);
  }, [filtered, stageFilter, hasSchedule, role, sortExams]);

  const selectedExam = selectedId ? exams.find((e) => e.id === selectedId) || null : null;
  // The panel steps through whatever the board is currently showing, so
  // "next exam" means the next one on screen, not the next one in the database.
  const panelSequence = useMemo(
    () =>
      prefs.view === "board"
        ? visibleColumns.flatMap((c) => byColumn[c.key])
        : tableExams,
    [prefs.view, visibleColumns, byColumn, tableExams],
  );

  // ── Selection helpers ──
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedExams = useMemo(
    () => exams.filter((e) => selected.has(e.id)),
    [exams, selected],
  );

  // ── Move execution ──
  const buildPlan = useCallback(
    (ids: string[], to: ColumnKey): MovePlan => {
      const columnTitle = columns.find((c) => c.key === to)?.title ?? to;
      const plan: MovePlan = {
        to,
        eyebrow: `Move to ${columnTitle}`,
        successText: (n) =>
          n === 1 ? `Moved to ${columnTitle}` : `${n} exams moved to ${columnTitle}`,
        eligible: [],
        blocked: [],
      };
      ids.forEach((id) => {
        const exam = exams.find((e) => e.id === id);
        if (!exam) return;
        const verdict = evaluateMove(exam, to, {
          role,
          hasSchedule: hasSchedule(id),
          meta: meta[id],
        });
        if (verdict.ok) plan.eligible.push({ exam, verdict });
        else plan.blocked.push({ exam, reason: verdict.reason });
      });
      return plan;
    },
    [exams, role, hasSchedule, meta, columns],
  );

  const runPlan = useCallback(
    async (plan: MovePlan) => {
      setBusy(true);
      let done = 0;
      const failures: string[] = [];
      for (const { exam, verdict } of plan.eligible) {
        try {
          if (verdict.kind === "lock") {
            const res = await fetch(`/api/exams/${exam.id}/lock`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to lock exam");
          } else if (verdict.kind === "patch") {
            const res = await fetch("/api/exams", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: exam.id, status: verdict.status }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update status");
          }
          done += 1;
        } catch (e) {
          failures.push(`${exam.title}: ${(e as Error)?.message || "failed"}`);
        }
      }
      setBusy(false);
      setPendingPlan(null);

      if (done > 0) {
        toast.success(plan.successText(done));
        setAnnouncement(plan.successText(done));
      }
      failures.forEach((f) => toast.error(f));
      if (plan.blocked.length > 0 && done > 0) {
        toast.message(
          `${plan.blocked.length} left where ${plan.blocked.length === 1 ? "it was" : "they were"}`,
          { description: plan.blocked[0].reason },
        );
      }
      clearSelection();
      await load();
    },
    [clearSelection, load],
  );

  const requestMove = useCallback(
    (ids: string[], to: ColumnKey) => {
      const plan = buildPlan(ids, to);
      if (plan.eligible.length === 0) {
        const first = plan.blocked[0];
        toast.error(first ? first.reason : "That move is not possible.");
        setAnnouncement(first?.reason || "Move not possible.");
        return;
      }
      // Sending marks back needs a reason, so it always goes through the dialog.
      const rejects = plan.eligible.filter((e) => e.verdict.kind === "reject");
      if (rejects.length > 0) {
        setRejecting(rejects.map((r) => r.exam));
        setRejectReason("");
        return;
      }
      if (plan.eligible.some((e) => "confirm" in e.verdict && e.verdict.confirm)) {
        setPendingPlan(plan);
        return;
      }
      void runPlan(plan);
    },
    [buildPlan, runPlan],
  );

  /**
   * Bulk actions are grouped by what each selected exam actually needs next, so
   * a mixed selection offers "Approve 6" and "Release results 3" rather than one
   * button that means something different per card. Approving is the one step
   * that keeps an exam in its lane, so it cannot come from the column list.
   */
  const bulkGroups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; accent: string; exams: ExamItem[] }
    >();
    const push = (key: string, label: string, accent: string, exam: ExamItem) => {
      const g = map.get(key) ?? { key, label, accent, exams: [] };
      g.exams.push(exam);
      map.set(key, g);
    };
    selectedExams.forEach((e) => {
      const a = nextAction(e, hasSchedule(e.id), role);
      // "Set dates" opens one exam's datesheet — there is no bulk form of it.
      if (!a || a.type === "open") return;
      if (a.type === "lock") push("lock", a.label, STATUS_ACCENT.LOCKED, e);
      else push(`patch:${a.status}`, a.label, STATUS_ACCENT[a.status] ?? "#8127cf", e);
    });
    if (role !== "TEACHER") {
      selectedExams
        .filter((e) => e.status === "LOCKED" || e.status === "PRINCIPAL_REVIEWED")
        .forEach((e) => push("reject", "Send marks back", "#e11d48", e));
    }
    return Array.from(map.values());
  }, [selectedExams, hasSchedule, role]);

  const runBulkGroup = useCallback(
    (key: string, groupExams: ExamItem[]) => {
      const ids = groupExams.map((e) => e.id);
      if (key === "reject") {
        setRejecting(groupExams);
        setRejectReason("");
        return;
      }
      if (key === "lock") return requestMove(ids, "REVIEW");
      if (key === "patch:MARKS_ENTRY") return requestMove(ids, "MARKS");
      if (key === "patch:PUBLISHED") return requestMove(ids, "PUBLISHED");
      if (key === "patch:ACTIVE") return requestMove(ids, "PLANNING");
      if (key === "patch:PRINCIPAL_REVIEWED") {
        // Approval keeps the exam in "Awaiting Approval", so it has no column to
        // be dropped on — build the plan by hand rather than faking a move.
        setPendingPlan({
          to: "REVIEW",
          eyebrow: "Approve marks",
          successText: (n) => (n === 1 ? "Marks approved" : `${n} exams approved`),
          eligible: groupExams.map((exam) => ({
            exam,
            verdict: {
              ok: true,
              kind: "patch",
              status: "PRINCIPAL_REVIEWED",
              label: "Approve",
              confirm:
                "Approved results are ready to release to families. You can still send the marks back afterwards.",
            } as const,
          })),
          blocked: [],
        });
      }
    },
    [requestMove],
  );

  /** The card's own primary button — one exam, one step, no dialog. */
  const advance = useCallback(
    async (exam: ExamItem, action: NextAction) => {
      if (!action) return;
      if (action.type === "open") {
        setDetailTab("schedule");
        setSelectedId(exam.id);
        return;
      }
      try {
        if (action.type === "lock") {
          const res = await fetch(`/api/exams/${exam.id}/lock`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to lock exam");
          toast.success(`Exam locked — ${data.reportCardsGenerated ?? 0} report cards generated`);
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
      } catch (e) {
        toast.error((e as Error)?.message || "Action failed");
      }
    },
    [load],
  );

  const submitReject = useCallback(async () => {
    if (!rejecting) return;
    setRejectBusy(true);
    let done = 0;
    for (const exam of rejecting) {
      try {
        const res = await fetch(`/api/exams/${exam.id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not send the marks back");
        done += 1;
      } catch (e) {
        toast.error((e as Error)?.message || "Could not send the marks back");
      }
    }
    setRejectBusy(false);
    if (done > 0) {
      toast.success(
        done === 1 ? "Marks sent back to the teacher" : `${done} exams sent back to their teachers`,
      );
      setRejecting(null);
      setRejectReason("");
      clearSelection();
      await load();
    }
  }, [rejecting, rejectReason, clearSelection, load]);

  // ── Manual card order ──
  const reorderWithin = useCallback(
    (ids: string[], col: ColumnKey, index: number) => {
      const current = byColumn[col].map((e) => e.id);
      const moving = ids.filter((id) => current.includes(id));
      if (moving.length === 0) return;
      const without = current.filter((id) => !moving.includes(id));
      const before = current.slice(0, index).filter((id) => !moving.includes(id)).length;
      const next = [...without.slice(0, before), ...moving, ...without.slice(before)];
      setOrder((prev) => {
        const merged = { ...prev, [col]: next };
        writeJSON(orderKey(role, campusId), merged);
        return merged;
      });
      setAnnouncement(`Card order updated in ${columns.find((c) => c.key === col)?.title}.`);
    },
    [byColumn, role, campusId, columns],
  );

  // ── Drag handlers ──
  const beginDrag = useCallback(
    (e: React.DragEvent, examId: string) => {
      const ids = selected.has(examId) && selected.size > 1 ? Array.from(selected) : [examId];
      setDraggingIds(ids);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/exam-id", ids.join(","));
    },
    [selected],
  );

  const endDrag = useCallback(() => {
    setDraggingIds([]);
    setDropZone(null);
  }, []);

  const describeDrop = useCallback(
    (col: ColumnKey, ids: string[]): { ok: boolean; message: string } => {
      if (ids.length === 0) return { ok: false, message: "" };
      const sameColumn = ids.every((id) => {
        const exam = exams.find((e) => e.id === id);
        return exam ? columnFor(exam, hasSchedule(id), role) === col : false;
      });
      if (sameColumn) {
        return prefs.sortKey === "manual"
          ? { ok: true, message: "Drop to reorder" }
          : { ok: false, message: "Switch sorting to “Board order” to arrange cards by hand" };
      }
      const plan = buildPlan(ids, col);
      if (plan.eligible.length === 0) {
        return { ok: false, message: plan.blocked[0]?.reason || "Not allowed here" };
      }
      const label = plan.eligible[0].verdict.label;
      return {
        ok: true,
        message:
          plan.blocked.length > 0
            ? `${label} · ${plan.eligible.length} of ${ids.length} can move`
            : label,
      };
    },
    [exams, hasSchedule, role, prefs.sortKey, buildPlan],
  );

  const handleDrop = useCallback(
    (col: ColumnKey, index: number | null) => {
      const ids = draggingIds;
      endDrag();
      if (ids.length === 0) return;
      const sameColumn = ids.every((id) => {
        const exam = exams.find((e) => e.id === id);
        return exam ? columnFor(exam, hasSchedule(id), role) === col : false;
      });
      if (sameColumn) {
        if (prefs.sortKey !== "manual") {
          toast.message("Sorting is not manual", {
            description: "Switch the sort to “Board order” to arrange cards by hand.",
          });
          return;
        }
        reorderWithin(ids, col, index ?? byColumn[col].length);
        return;
      }
      requestMove(ids, col);
    },
    [
      draggingIds,
      endDrag,
      exams,
      hasSchedule,
      role,
      prefs.sortKey,
      reorderWithin,
      byColumn,
      requestMove,
    ],
  );

  /** Arrow keys on a focused card walk it along the pipeline. */
  const nudge = useCallback(
    (exam: ExamItem, direction: -1 | 1) => {
      const from = columnFor(exam, hasSchedule(exam.id), role);
      const idx = columns.findIndex((c) => c.key === from);
      const target = columns[idx + direction];
      if (!target) return;
      requestMove([exam.id], target.key);
    },
    [hasSchedule, role, columns, requestMove],
  );

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "1") {
        patchPrefs({ view: "board" });
      } else if (e.key === "2") {
        patchPrefs({ view: "table" });
      } else if (e.key === "3" && !isTeacher) {
        patchPrefs({ view: "timeline" });
      } else if (e.key === "Escape" && selected.size > 0) {
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [patchPrefs, isTeacher, selected.size, clearSelection]);

  const toggleColumnCollapse = useCallback(
    (key: ColumnKey) => {
      setPrefs((p) => ({
        ...p,
        collapsed: p.collapsed.includes(key)
          ? p.collapsed.filter((k) => k !== key)
          : [...p.collapsed, key],
      }));
    },
    [],
  );

  const filtersActive =
    term !== "ALL" ||
    classFilter !== "ALL" ||
    typeFilter !== "ALL" ||
    stageFilter !== "ALL" ||
    attentionOnly ||
    query.trim() !== "";

  const resetFilters = () => {
    setTerm("ALL");
    setClassFilter("ALL");
    setTypeFilter("ALL");
    setStageFilter("ALL");
    setAttentionOnly(false);
    setQuery("");
  };

  return (
    <div className="space-y-5">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-3xl border border-[#cfc2d6]/15 bg-gradient-to-br from-[#faf7fc] via-white to-[#f3eeff] p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#6a1fb0] text-white shadow-lg shadow-[#8127cf]/20">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">
                {isTeacher ? "My Classroom" : "Academics"}
              </p>
              <h2 className="text-xl font-black tracking-tight text-[#1d1b20]">
                {isTeacher ? "My Tests & Quizzes" : "Exams & Results"}
              </h2>
              <p className="mt-0.5 text-[11px] font-semibold text-ink-muted">
                {filtered.length} exam{filtered.length === 1 ? "" : "s"} shown
                {flagged.size > 0 ? ` · ${flagged.size} need your attention` : ""}
                {overallProgress !== null ? ` · ${overallProgress}% of marks entered` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                aria-label="Filter by term"
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
            <button
              type="button"
              onClick={() => load(true)}
              aria-label="Refresh"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl border border-[#cfc2d6]/20 bg-white text-[#8127cf] shadow-sm transition-colors hover:bg-[#fbf0fe]"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </button>
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

      {/* ── Stage tiles: the fastest way to narrow the board ── */}
      <div
        className={cn(
          "grid gap-3",
          isTeacher ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
        )}
      >
        <StageTile
          label="All exams"
          count={filtered.length}
          accent="#6b7280"
          active={stageFilter === "ALL"}
          onClick={() => setStageFilter("ALL")}
        />
        {columns.map((c) => (
          <StageTile
            key={c.key}
            label={c.title}
            count={stageCounts[c.key]}
            accent={c.accent}
            active={stageFilter === c.key}
            onClick={() => setStageFilter(stageFilter === c.key ? "ALL" : c.key)}
          />
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-3xl border border-[#cfc2d6]/15 bg-white p-3 shadow-sm">
        <div className="relative min-w-[190px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#cfc2d6]" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exams, classes, subjects…   ( / )"
            aria-label="Search exams"
            className="w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#faf7fc] py-2.5 pl-9 pr-3 text-xs font-semibold text-[#1d1b20] outline-none transition focus:border-[#8127cf]/40 focus:bg-white"
          />
        </div>

        <FilterSelect
          value={classFilter}
          onChange={setClassFilter}
          label="Class"
          options={[["ALL", "All classes"], ...classOptions]}
        />
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          label="Type"
          options={[
            ["ALL", "All types"],
            ...typeOptions.map(
              (t) => [t, EXAM_TYPE_LABELS[t as ExamType] || t.replaceAll("_", " ")] as [string, string],
            ),
          ]}
        />
        <button
          type="button"
          onClick={() => setAttentionOnly((v) => !v)}
          aria-pressed={attentionOnly}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-2xl border px-3 py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors",
            attentionOnly
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-[#cfc2d6]/20 bg-white text-ink-muted hover:text-[#8127cf]",
          )}
        >
          <TriangleAlert className="h-3.5 w-3.5" />
          Needs attention
          {flagged.size > 0 ? (
            <span className="rounded-full bg-amber-500 px-1.5 text-[9px] text-white">
              {flagged.size}
            </span>
          ) : null}
        </button>

        {filtersActive ? (
          <button
            type="button"
            onClick={resetFilters}
            className="cursor-pointer rounded-2xl px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-ink-subtle transition-colors hover:text-[#8127cf]"
          >
            Clear
          </button>
        ) : null}

        <div className="ml-auto flex items-center gap-2.5">
          <FilterSelect
            value={prefs.sortKey}
            onChange={(v) => patchPrefs({ sortKey: v as SortKey })}
            label="Sort"
            options={[
              ["manual", "Board order"],
              ["title", "Title"],
              ["class", "Class"],
              ["stage", "Stage"],
              ["progress", "Marks progress"],
              ["date", "Exam date"],
            ]}
          />
          {prefs.sortKey !== "manual" ? (
            <button
              type="button"
              onClick={() => patchPrefs({ sortDir: prefs.sortDir === "asc" ? "desc" : "asc" })}
              aria-label={prefs.sortDir === "asc" ? "Sort descending" : "Sort ascending"}
              title={prefs.sortDir === "asc" ? "Ascending" : "Descending"}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl border border-[#cfc2d6]/20 bg-white text-ink-muted transition-colors hover:text-[#8127cf]"
            >
              {prefs.sortDir === "asc" ? (
                <ArrowUpWideNarrow className="h-4 w-4" />
              ) : (
                <ArrowDownWideNarrow className="h-4 w-4" />
              )}
            </button>
          ) : null}
          {prefs.view === "board" ? (
            <button
              type="button"
              onClick={() =>
                patchPrefs({ density: prefs.density === "compact" ? "comfortable" : "compact" })
              }
              aria-label={
                prefs.density === "compact" ? "Switch to comfortable cards" : "Switch to compact cards"
              }
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl border border-[#cfc2d6]/20 bg-white text-ink-muted transition-colors hover:text-[#8127cf]"
            >
              {prefs.density === "compact" ? (
                <Rows3 className="h-4 w-4" />
              ) : (
                <LayoutList className="h-4 w-4" />
              )}
            </button>
          ) : null}

          <div className="flex items-center gap-0.5 rounded-2xl border border-[#cfc2d6]/20 bg-[#faf7fc] p-1">
            <ViewTab
              active={prefs.view === "board"}
              icon={Columns3}
              label="Board"
              onClick={() => patchPrefs({ view: "board" })}
            />
            <ViewTab
              active={prefs.view === "table"}
              icon={Table2}
              label="List"
              onClick={() => patchPrefs({ view: "table" })}
            />
            {!isTeacher ? (
              <ViewTab
                active={prefs.view === "timeline"}
                icon={CalendarDays}
                label="Datesheet"
                onClick={() => patchPrefs({ view: "timeline" })}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Bulk actions ── */}
      {selected.size > 0 ? (
        <BulkBar
          total={selected.size}
          groups={bulkGroups}
          onRun={runBulkGroup}
          onClear={clearSelection}
          busy={busy}
        />
      ) : null}

      {/* ── Views ── */}
      {loading ? (
        <BoardSkeleton count={columns.length} />
      ) : exams.length === 0 ? (
        <EmptyBoard isTeacher={isTeacher} onCreate={() => setCreating(true)} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#cfc2d6]/30 bg-white p-16 text-center">
          <Search className="mb-3 h-10 w-10 text-ink-subtle" />
          <p className="text-sm font-bold text-ink-muted">Nothing matches those filters</p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-3 cursor-pointer rounded-xl bg-[#8127cf] px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-[#6a1fb0]"
          >
            Clear filters
          </button>
        </div>
      ) : prefs.view === "board" ? (
        <>
          {stageFilter !== "ALL" ? (
            <button
              type="button"
              onClick={() => setStageFilter("ALL")}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-[#fbf0fe] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#8127cf]"
            >
              <X className="h-3 w-3" /> Showing one stage — show all
            </button>
          ) : null}
          <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
            {visibleColumns.map((col) => (
              <BoardLane
                key={col.key}
                column={col}
                exams={byColumn[col.key]}
                meta={meta}
                schedules={schedules}
                role={role}
                density={prefs.density}
                collapsed={prefs.collapsed.includes(col.key)}
                onToggleCollapse={() => toggleColumnCollapse(col.key)}
                selected={selected}
                selectionActive={selected.size > 0}
                draggingIds={draggingIds}
                dropZone={dropZone?.col === col.key ? dropZone : null}
                flagged={flagged}
                onDragEnterColumn={(index) => {
                  if (draggingIds.length === 0) return;
                  // dragover fires continuously; without this the board
                  // re-rendered on every mouse tick of a drag.
                  setDropZone((prev) =>
                    prev && prev.col === col.key && prev.index === index
                      ? prev
                      : { col: col.key, index, ...describeDrop(col.key, draggingIds) },
                  );
                }}
                onDropColumn={(index) => handleDrop(col.key, index)}
                onCardDragStart={beginDrag}
                onCardDragEnd={endDrag}
                onOpen={(id, tab) => {
                  setDetailTab(tab);
                  setSelectedId(id);
                }}
                onToggleSelect={toggleSelect}
                onAdvance={advance}
                onReject={(exam) => {
                  setRejecting([exam]);
                  setRejectReason("");
                }}
                onMove={(id, to) => requestMove([id], to)}
                onNudge={nudge}
              />
            ))}
          </div>
        </>
      ) : prefs.view === "table" ? (
        <ExamTableView
          exams={tableExams}
          meta={meta}
          schedules={schedules}
          role={role}
          selected={selected}
          sort={{ key: prefs.sortKey, dir: prefs.sortDir }}
          onSort={(key) =>
            patchPrefs(
              key === prefs.sortKey
                ? { sortDir: prefs.sortDir === "asc" ? "desc" : "asc" }
                : { sortKey: key, sortDir: "asc" },
            )
          }
          onToggleSelect={toggleSelect}
          onToggleAll={() =>
            setSelected((prev) =>
              tableExams.every((e) => prev.has(e.id))
                ? new Set()
                : new Set(tableExams.map((e) => e.id)),
            )
          }
          onOpen={(id, tab) => {
            setDetailTab(tab);
            setSelectedId(id);
          }}
          onAdvance={advance}
          onReject={(exam) => {
            setRejecting([exam]);
            setRejectReason("");
          }}
          flagged={flagged}
        />
      ) : (
        <ExamTimelineView
          rows={scheduleRows.filter((r) => filtered.some((e) => e.id === r.examId))}
          unscheduled={filtered.filter(
            (e) => !hasSchedule(e.id) && e.status !== "PUBLISHED",
          )}
          onOpen={(id, tab) => {
            setDetailTab(tab);
            setSelectedId(id);
          }}
        />
      )}

      {prefs.view === "board" && !loading && filtered.length > 0 ? (
        <p className="flex items-center gap-1.5 px-1 text-[10px] font-semibold text-ink-subtle">
          <Info className="h-3 w-3" />
          Drag a card to move it along the pipeline, or focus one and press ← / →. Tick cards to
          act on a batch from the bar at the top.
        </p>
      ) : null}

      {/* ── Dialogs ── */}
      {pendingPlan ? (
        <ConfirmMoveModal
          plan={pendingPlan}
          busy={busy}
          onCancel={() => setPendingPlan(null)}
          onConfirm={() => runPlan(pendingPlan)}
        />
      ) : null}

      {rejecting ? (
        <RejectMarksModal
          exams={rejecting}
          reason={rejectReason}
          setReason={setRejectReason}
          busy={rejectBusy}
          onClose={() => setRejecting(null)}
          onSubmit={submitReject}
        />
      ) : null}

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
          initialTab={detailTab}
          sequence={panelSequence.map((e) => ({ id: e.id, title: e.title }))}
          onNavigate={(id) => setSelectedId(id)}
          onClose={() => {
            setSelectedId(null);
            setDetailTab(undefined);
          }}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}

/* ────────────────────────── Board lane ────────────────────────── */

function BoardLane({
  column,
  exams,
  meta,
  schedules,
  role,
  density,
  collapsed,
  onToggleCollapse,
  selected,
  selectionActive,
  draggingIds,
  dropZone,
  flagged,
  onDragEnterColumn,
  onDropColumn,
  onCardDragStart,
  onCardDragEnd,
  onOpen,
  onToggleSelect,
  onAdvance,
  onReject,
  onMove,
  onNudge,
}: {
  column: BoardColumn;
  exams: ExamItem[];
  meta: Record<string, ExamMeta>;
  schedules: Record<string, ScheduleSummary>;
  role: ExamCycleRole;
  density: "compact" | "comfortable";
  collapsed: boolean;
  onToggleCollapse: () => void;
  selected: Set<string>;
  selectionActive: boolean;
  draggingIds: string[];
  dropZone: { index: number | null; ok: boolean; message: string } | null;
  flagged: Set<string>;
  onDragEnterColumn: (index: number | null) => void;
  onDropColumn: (index: number | null) => void;
  onCardDragStart: (e: React.DragEvent, id: string) => void;
  onCardDragEnd: () => void;
  onOpen: (id: string, tab?: DetailTab) => void;
  onToggleSelect: (id: string) => void;
  onAdvance: (exam: ExamItem, action: NextAction) => void;
  onReject: (exam: ExamItem) => void;
  onMove: (id: string, to: ColumnKey) => void;
  onNudge: (exam: ExamItem, direction: -1 | 1) => void;
}) {
  const dragging = draggingIds.length > 0;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        title={`Expand ${column.title}`}
        className="flex w-14 shrink-0 cursor-pointer flex-col items-center gap-3 rounded-3xl border border-[#cfc2d6]/10 bg-gradient-to-b from-white to-[#faf7fc] py-4 shadow-sm transition-colors hover:border-[#8127cf]/30"
      >
        <ChevronRight className="h-4 w-4 text-ink-subtle" />
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-black"
          style={{ backgroundColor: `${column.accent}1a`, color: column.accent }}
        >
          {exams.length}
        </span>
        <span
          className="text-[10px] font-black uppercase tracking-wider text-ink-muted"
          style={{ writingMode: "vertical-rl" }}
        >
          {column.title}
        </span>
      </button>
    );
  }

  return (
    <section
      aria-label={column.title}
      className={cn(
        "flex w-[320px] shrink-0 flex-col rounded-3xl border bg-gradient-to-b from-white to-[#faf7fc] p-4 shadow-sm transition-all",
        dropZone
          ? dropZone.ok
            ? "border-[#8127cf]/60 ring-4 ring-[#8127cf]/10"
            : "border-rose-300 ring-4 ring-rose-100"
          : "border-[#cfc2d6]/10",
      )}
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = dropZone && !dropZone.ok ? "none" : "move";
        if (!dropZone) onDragEnterColumn(null);
      }}
      onDrop={(e) => {
        if (!dragging) return;
        e.preventDefault();
        onDropColumn(dropZone?.index ?? null);
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: column.accent }} />
          <h3 className="text-sm font-black text-[#1d1b20]">{column.title}</h3>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider"
            style={{ backgroundColor: `${column.accent}1a`, color: column.accent }}
          >
            {exams.length}
          </span>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={`Collapse ${column.title}`}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[#f3f4f9] hover:text-[#8127cf]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="mb-3 text-[10px] font-semibold text-ink-subtle">{column.hint}</p>

      {dropZone ? (
        <div
          className={cn(
            "mb-3 flex items-start gap-1.5 rounded-2xl px-3 py-2 text-[11px] font-bold",
            dropZone.ok ? "bg-[#fbf0fe] text-[#8127cf]" : "bg-rose-50 text-rose-600",
          )}
        >
          {dropZone.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span className="leading-snug">{dropZone.message}</span>
        </div>
      ) : null}

      <div role="list" className="flex flex-1 flex-col gap-3">
        {exams.map((exam, i) => (
          <div
            key={exam.id}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const after = e.clientY > rect.top + rect.height / 2;
              onDragEnterColumn(after ? i + 1 : i);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                onNudge(exam, 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                onNudge(exam, -1);
              }
            }}
          >
            {dropZone?.index === i && dropZone.ok ? <DropLine accent={column.accent} /> : null}
            <ExamBoardCard
              exam={exam}
              meta={meta[exam.id]}
              schedule={schedules[exam.id]}
              role={role}
              density={density}
              selected={selected.has(exam.id)}
              selectionActive={selectionActive}
              dragging={draggingIds.includes(exam.id)}
              flagged={flagged.has(exam.id)}
              onOpen={(tab) => onOpen(exam.id, tab)}
              onToggleSelect={() => onToggleSelect(exam.id)}
              onAdvance={(action) => onAdvance(exam, action)}
              onReject={() => onReject(exam)}
              onMove={(to) => onMove(exam.id, to)}
              onDragStart={(e) => onCardDragStart(e, exam.id)}
              onDragEnd={onCardDragEnd}
            />
          </div>
        ))}
        {dropZone?.index === exams.length && dropZone.ok ? (
          <DropLine accent={column.accent} />
        ) : null}
        {exams.length === 0 ? (
          <div
            className={cn(
              "rounded-2xl border border-dashed py-10 text-center text-[11px] font-semibold transition-colors",
              dropZone?.ok
                ? "border-[#8127cf]/40 bg-[#fbf0fe]/40 text-[#8127cf]"
                : "border-[#cfc2d6]/20 text-ink-subtle",
            )}
          >
            {dragging ? "Drop here" : "Empty"}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DropLine({ accent }: { accent: string }) {
  return (
    <div className="my-1 flex items-center gap-1" aria-hidden>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
      <span className="h-0.5 flex-1 rounded-full" style={{ backgroundColor: accent }} />
    </div>
  );
}

/* ────────────────────────── Toolbar pieces ────────────────────────── */

function StageTile({
  label,
  count,
  accent,
  active,
  onClick,
}: {
  label: string;
  count: number;
  accent: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex cursor-pointer flex-col justify-between rounded-2xl border bg-white p-3 text-left transition-all hover:-translate-y-0.5",
        active ? "border-transparent shadow-md ring-2" : "border-[#cfc2d6]/15 shadow-sm",
      )}
      style={active ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}
    >
      <div className="flex items-start gap-1.5">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        {/* Wrapping beats truncating: "On the Dateshee…" and "Awaiting Appr…"
            are not names anyone can act on. */}
        <p className="text-[10px] font-black uppercase leading-tight tracking-wider text-ink-muted">
          {label}
        </p>
      </div>
      <p className="mt-1 text-2xl font-black tracking-tight text-[#1d1b20]">{count}</p>
    </button>
  );
}

function ViewTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wider transition-all",
        active ? "bg-white text-[#8127cf] shadow-sm" : "text-ink-muted hover:text-[#8127cf]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: [string, string][];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="appearance-none rounded-2xl border border-[#cfc2d6]/20 bg-white py-2.5 pl-3 pr-8 text-[11px] font-bold text-[#1d1b20] focus:outline-none focus:ring-4 focus:ring-[#8127cf]/20"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8127cf]" />
    </div>
  );
}

/**
 * Bulk actions. Selected exams rarely sit at the same stage, so instead of one
 * "advance" button that means different things per card, the bar offers each
 * destination that at least one selected exam can actually reach, and says how
 * many that is.
 */
function BulkBar({
  total,
  groups,
  onRun,
  onClear,
  busy,
}: {
  total: number;
  groups: { key: string; label: string; accent: string; exams: ExamItem[] }[];
  onRun: (key: string, exams: ExamItem[]) => void;
  onClear: () => void;
  busy: boolean;
}) {
  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2.5 rounded-3xl border border-[#8127cf]/25 bg-white/95 p-3 shadow-[0_16px_40px_-14px_rgba(129,39,207,0.35)] backdrop-blur">
      <span className="rounded-full bg-[#8127cf] px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white">
        {total} selected
      </span>
      {groups.length === 0 ? (
        <span className="text-[11px] font-semibold text-ink-muted">
          Nothing left to do on these — they are already finished.
        </span>
      ) : (
        groups.map((g) => (
          <button
            key={g.key}
            type="button"
            disabled={busy}
            onClick={() => onRun(g.key, g.exams)}
            className="flex cursor-pointer items-center gap-1.5 rounded-2xl px-3.5 py-2 text-[11px] font-black uppercase tracking-wider text-white transition-all hover:scale-[1.02] disabled:opacity-50"
            style={{ backgroundColor: g.accent }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {g.label}
            <span className="rounded-full bg-white/25 px-1.5">{g.exams.length}</span>
          </button>
        ))
      )}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto cursor-pointer rounded-2xl px-3 py-2 text-[11px] font-black uppercase tracking-wider text-ink-muted transition-colors hover:text-[#8127cf]"
      >
        Clear
      </button>
    </div>
  );
}

function BoardSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-3xl border border-[#cfc2d6]/10 bg-white p-4 shadow-sm">
          <div className="skeleton-shimmer mb-4 h-3 w-24 rounded-full bg-[#e8e0ec]/50" />
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j} className="skeleton-shimmer h-24 rounded-2xl bg-[#e8e0ec]/40" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyBoard({ isTeacher, onCreate }: { isTeacher: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#cfc2d6]/30 bg-white p-16 text-center">
      <CalendarDays className="mb-3 h-10 w-10 text-ink-subtle" />
      <p className="text-sm font-bold text-ink-muted">{isTeacher ? "No tests yet" : "No exams yet"}</p>
      <p className="mt-1 text-xs font-semibold text-ink-subtle">
        {isTeacher
          ? "Create a quiz or class test for one of your subjects."
          : "Create your first exam to start the cycle."}
      </p>
      <BrandButton variant="gradient" icon={<Plus className="h-4 w-4" />} onClick={onCreate} className="mt-5">
        {isTeacher ? "New Test" : "New Exam"}
      </BrandButton>
    </div>
  );
}

/* ────────────────────────── Dialogs ────────────────────────── */

/**
 * Shown before a move that cannot simply be undone — locking marks, reopening a
 * closed stage, releasing results. It names the consequence and lists exactly
 * which exams are about to change.
 */
function ConfirmMoveModal({
  plan,
  busy,
  onCancel,
  onConfirm,
}: {
  plan: MovePlan;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const consequence = plan.eligible.find((e) => "confirm" in e.verdict && e.verdict.confirm);
  const verdictLabel = plan.eligible[0]?.verdict.label ?? "Move";

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[#1f1a23]/45 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-move-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[30px] bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-[#cfc2d6]/10 px-6 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">
              {plan.eyebrow}
            </p>
            <h3 id="confirm-move-title" className="text-lg font-black text-[#1d1b20]">
              {verdictLabel}
            </h3>
          </div>
        </div>

        <div className="space-y-3 px-6 py-5">
          {consequence && "confirm" in consequence.verdict ? (
            <p className="text-xs font-semibold leading-relaxed text-ink">
              {consequence.verdict.confirm}
            </p>
          ) : null}

          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-2xl bg-[#faf7fc] p-3 custom-scrollbar">
            {plan.eligible.map(({ exam }) => (
              <li key={exam.id} className="flex items-center gap-2 text-xs font-bold text-[#1d1b20]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="truncate">
                  {exam.title} · {classLabel(exam.class)}
                </span>
              </li>
            ))}
          </ul>

          {plan.blocked.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                {plan.blocked.length} will stay where {plan.blocked.length === 1 ? "it is" : "they are"}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-amber-800">
                {plan.blocked[0].reason}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-[#cfc2d6]/10 bg-[#faf7fc] px-6 py-4">
          <BrandButton variant="soft" onClick={onCancel} disabled={busy} className="flex-1">
            Cancel
          </BrandButton>
          <BrandButton variant="gradient" onClick={onConfirm} disabled={busy} className="flex-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {verdictLabel}
          </BrandButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Reject dialog. The reason is mandatory — the teacher has to know what to
 * change — and the destructive consequence (withdrawing the report cards that
 * locking generated) is stated before the admin commits.
 */
function RejectMarksModal({
  exams,
  reason,
  setReason,
  busy,
  onClose,
  onSubmit,
}: {
  exams: ExamItem[];
  reason: string;
  setReason: (v: string) => void;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const tooShort = reason.trim().length < 5;
  const reportCards = exams.reduce((sum, e) => sum + (e._count?.reportCards ?? 0), 0);
  const single = exams.length === 1 ? exams[0] : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-marks-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 id="reject-marks-title" className="text-base font-black text-[#1d1b20]">
            Send marks back
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-full p-1 text-ink-muted transition hover:bg-[#f3f4f9]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-[11px] font-semibold leading-relaxed text-ink-muted">
          {single
            ? `${single.title}${single.class ? ` · ${classLabel(single.class)}` : ""}.`
            : `${exams.length} exams.`}{" "}
          The teacher will be able to edit the marks again, and the {reportCards} report card
          {reportCards === 1 ? "" : "s"} generated when {exams.length === 1 ? "this exam was" : "these exams were"}{" "}
          locked will be withdrawn until re-locked.
        </p>

        {exams.length > 1 ? (
          <ul className="mb-4 max-h-28 space-y-1 overflow-y-auto rounded-2xl bg-[#faf7fc] p-3 custom-scrollbar">
            {exams.map((e) => (
              <li key={e.id} className="truncate text-[11px] font-bold text-[#1d1b20]">
                {e.title} · {classLabel(e.class)}
              </li>
            ))}
          </ul>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">
            Reason for the teacher
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
            maxLength={2000}
            placeholder="e.g. Mathematics totals need re-checking against the answer sheets."
            className="w-full rounded-2xl border border-[#cfc2d6]/30 bg-white px-3 py-2 text-sm font-semibold text-[#1d1b20] outline-none transition focus:border-[#8127cf]/50"
          />
        </label>

        <div className="mt-5 flex gap-2">
          <BrandButton variant="soft" onClick={onClose} disabled={busy} className="flex-1">
            Cancel
          </BrandButton>
          <BrandButton
            variant="gradient"
            onClick={onSubmit}
            disabled={busy || tooShort}
            className="flex-1"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Send back
          </BrandButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const CLASSES_CACHE = new Map<string, { data: { id: string; name: string; section?: string | null }[]; ts: number }>();
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
  // Stamp new exams with the active cycle's year, not the calendar year — a
  // cycle labelled 2027 starts in August 2026, and filing under 2026 hides the
  // exam from the office's board.
  const cycleYear = useAcademicYear();
  const [classes, setClasses] = useState<{ id: string; name: string; section?: string | null }[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    classId: "",
    title: "",
    term: "Term 1",
    academicYear: cycleYear,
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
    } catch (e) {
      const err = e as { name?: string; message?: string };
      setClassesError(
        err?.name === "AbortError"
          ? "Classes took too long to load"
          : err?.message || "Failed to load classes",
      );
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
    } catch (e) {
      toast.error((e as Error)?.message || "Failed to create exam");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="animate-backdrop-enter fixed inset-0 z-[140] flex items-center justify-center bg-[#1f1a23]/45 p-4 backdrop-blur-md">
      <div className="animate-modal-enter w-full max-w-lg overflow-hidden rounded-[34px] border border-[#cfc2d6]/15 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)]">
        <div className="flex items-center justify-between bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-white/70">New</p>
              <h3 className="text-lg font-black">Create Exam</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-2xl text-white/80 transition-colors hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-6 custom-scrollbar">
          {loadingClasses ? (
            <div className="space-y-3">
              <div className="skeleton-shimmer h-40 w-full rounded-2xl bg-[#e8e0ec]/40" />
              <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
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
                className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#8127cf] px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-all hover:bg-[#6a1fb0]"
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
                    onChange={(e) => setForm({ ...form, academicYear: Number(e.target.value) })}
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
                  <p className="mt-1.5 text-[10px] font-semibold text-ink-subtle">
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
            className="cursor-pointer rounded-2xl px-5 py-2.5 text-sm font-black text-ink-muted transition-colors hover:bg-[#4d4354]/5"
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
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
