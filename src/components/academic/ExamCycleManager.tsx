"use client";
import { Button } from "@/components/ui/button";
import { InputGroup } from "@/components/ui/input-group";


import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { BrandButton } from "@/components/role-dashboard";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toneOf } from "@/lib/ui/module-tones";
import { Select as SystemSelect } from "@/components/ui/select";
import { Input as SystemInput } from "@/components/ui/input";
import { Textarea as SystemTextarea } from "@/components/ui/textarea";

/** Constant lookup — hoisted so it is not recomputed on every render. */
const examTone = toneOf("exams");
import { ExamDetailDialog } from "@/components/academic/exams/ExamDetailDialog";
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
  hideHeading = false,
  newRequest,
}: {
  campusId?: string;
  role?: ExamCycleRole;
  /**
   * F25: the hosting page already renders the one PageHeader (title + "New test" primary), so the board's own
   * title block and New button are dropped; the term filter and refresh stay as a toolbar.
   */
  hideHeading?: boolean;
  /** Each change of this number opens the create flow (the host's PageHeader primary action). */
  newRequest?: number;
}) {
  const ui = useUiText();
  const isTeacher = role === "TEACHER";
  // R11: lane titles and hints are EN keys from the pipeline; every lane, tile and dialog shows them translated.
  const columns = useMemo(() => columnsForRole(role).map((c) => ({ ...c, title: ui(c.title), hint: ui(c.hint) })), [role, ui]);

  const [exams, setExams] = useState<ExamItem[]>([]);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [meta, setMeta] = useState<Record<string, ExamMeta>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  // The host's "New test" primary bumps `newRequest`; the first render never opens the dialog.
  const lastNewRequest = useRef(newRequest);
  useEffect(() => {
    if (newRequest === undefined || newRequest === lastNewRequest.current) return;
    lastNewRequest.current = newRequest;
    setCreating(true);
  }, [newRequest]);
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
  // R4: the first load failing is an inline ErrorState with retry; a quiet refresh failing keeps the board.
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(
    async (silent = false) => {
      if (!silent) { setLoading(true); setLoadFailed(false); }
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

        if (!examsRes.success) throw new Error("load failed");
        const all: ExamItem[] = examsRes.exams;
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
        if (!silent) setLoadFailed(true);
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

  // One translated line under the board title (or, with `hideHeading`, as the toolbar's only text). A teacher's
  // board holds tests and quizzes, the office board exams.
  const boardSummary = [
    filtered.length === 1
      ? ui(isTeacher ? "1 test shown" : "1 exam shown")
      : ui(isTeacher ? "{0} tests shown" : "{0} exams shown", [filtered.length]),
    flagged.size > 0 ? ui("{0} need your attention", [flagged.size]) : null,
    overallProgress !== null ? ui("{0}% of marks entered", [overallProgress]) : null,
  ].filter(Boolean).join(" · ");

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
        eyebrow: ui("Move to {0}", [columnTitle]),
        successText: (n) =>
          n === 1 ? ui("Moved to {0}", [columnTitle]) : ui("{0} exams moved to {1}", [n, columnTitle]),
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
    [exams, role, hasSchedule, meta, columns, ui],
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
          failures.push(ui("{0}: {1}", [exam.title, friendlyErrorMessage(e, ui("That did not work. Try again."))]));
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
          ui(plan.blocked.length === 1 ? "{0} left where it was" : "{0} left where they were", [plan.blocked.length]),
          { description: ui(plan.blocked[0].reason) },
        );
      }
      clearSelection();
      await load();
    },
    [clearSelection, load, ui],
  );

  const requestMove = useCallback(
    (ids: string[], to: ColumnKey) => {
      const plan = buildPlan(ids, to);
      if (plan.eligible.length === 0) {
        const first = plan.blocked[0];
        toast.error(ui(first ? first.reason : "That move is not possible."));
        setAnnouncement(ui(first?.reason || "Move not possible."));
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
    [buildPlan, runPlan, ui],
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
        .forEach((e) => push("reject", "Send marks back", "var(--status-error-text)", e));
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
          eyebrow: ui("Approve marks"),
          successText: (n) => (n === 1 ? ui("Marks approved") : ui("{0} exams approved", [n])),
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
    [requestMove, ui],
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
          toast.success(ui("Marks locked — {0} report cards generated", [data.reportCardsGenerated ?? 0]));
        } else {
          const res = await fetch("/api/exams", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: exam.id, status: action.status }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to update status");
          // R7: a translated stage name, never the raw status enum.
          toast.success(action.status === "PUBLISHED" ? ui("Results released") : action.status === "PRINCIPAL_REVIEWED" ? ui("Results approved") : action.status === "MARKS_ENTRY" ? ui("Marks entry is open") : ui("Exam updated"));
        }
        await load();
      } catch (e) {
        toast.error(friendlyErrorMessage(e, ui("That did not work. Try again.")));
      }
    },
    [load, ui],
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
        if (!res.ok) throw new Error(data.error || "");
        done += 1;
      } catch (e) {
        toast.error(friendlyErrorMessage(e, ui("Could not send the marks back")));
      }
    }
    setRejectBusy(false);
    if (done > 0) {
      toast.success(
        done === 1 ? ui("Marks sent back to the teacher") : ui("{0} exams sent back to their teachers", [done]),
      );
      setRejecting(null);
      setRejectReason("");
      clearSelection();
      await load();
    }
  }, [rejecting, rejectReason, clearSelection, load, ui]);

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
      setAnnouncement(ui("Card order updated in {0}.", [columns.find((c) => c.key === col)?.title ?? ""]));
    },
    [byColumn, role, campusId, columns, ui],
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
          ? { ok: true, message: ui("Drop to reorder") }
          : { ok: false, message: ui("Switch sorting to “Board order” to arrange cards by hand") };
      }
      const plan = buildPlan(ids, col);
      if (plan.eligible.length === 0) {
        return { ok: false, message: ui(plan.blocked[0]?.reason || "Not allowed here") };
      }
      const label = ui(plan.eligible[0].verdict.label);
      return {
        ok: true,
        message:
          plan.blocked.length > 0
            ? ui("{0} · {1} of {2} can move", [label, plan.eligible.length, ids.length])
            : label,
      };
    },
    [exams, hasSchedule, role, prefs.sortKey, buildPlan, ui],
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
          toast.message(ui("Sorting is not manual"), {
            description: ui("Switch the sort to “Board order” to arrange cards by hand."),
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
    <div className="space-y-3">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* ── Header ── */}
      <div className="sk-panel sk-rise relative overflow-hidden px-4 py-3 sm:px-5">
        <span
          aria-hidden
          className={cn("absolute inset-y-0 start-0 w-[3px] bg-gradient-to-b", examTone.rail)}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -end-16 -top-16 h-40 w-40 rounded-full blur-2xl"
          style={{ background: `radial-gradient(circle, ${examTone.hex}14, transparent 70%)` }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {hideHeading ? (
            <p className="min-w-0 truncate text-2xs font-semibold leading-tight text-ink-muted">{boardSummary}</p>
          ) : (
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", examTone.tile)}
              style={{ boxShadow: `0 4px 12px -2px ${examTone.hex}73` }}
            >
              <GraduationCap className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h2 className="truncate text-lg font-bold leading-tight tracking-tight text-ink-strong">
                  {ui(isTeacher ? "Tests & quizzes" : "Exams & results")}
                </h2>
                <span className={cn("hidden shrink-0 text-2xs font-semibold opacity-80 sm:inline", examTone.text)}>
                  {ui(isTeacher ? "My classroom" : "Academics")}
                </span>
              </div>
              <p className="truncate text-2xs font-semibold leading-tight text-ink-muted">{boardSummary}</p>
            </div>
          </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <SystemSelect
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                aria-label={ui("Filter by term")}
                className="appearance-none ps-3 pe-8"
              >
                <option value="ALL">{ui("All terms")}</option>
                {termOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </SystemSelect>

            </div>
            <Button variant="outline" size="icon"
              type="button"
              onClick={() => load(true)}
              aria-label={ui("Refresh")}
              className="flex items-center justify-center"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin motion-reduce:animate-none")} />
            </Button>
            {hideHeading ? null : (
              <BrandButton
                variant="gradient"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setCreating(true)}
              >
                {ui(isTeacher ? "New test" : "New exam")}
              </BrandButton>
            )}
          </div>
        </div>
      </div>

      {/* ── Stage tiles: the fastest way to narrow the board ── */}
      <div
        className={cn(
          "grid gap-2.5",
          isTeacher ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
        )}
      >
        <StageTile
          label={ui(isTeacher ? "All tests" : "All exams")}
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
      <div className="sticky top-0 z-20 sk-toolbar flex flex-wrap items-center gap-2 p-2">
        <InputGroup surfaceClassName="bg-surface-subtle" className="relative min-w-[190px] flex-1">
          <Search data-field-affix="start" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-edge" />
          <SystemInput
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ui(isTeacher ? "Search tests, classes, subjects… ( / )" : "Search exams, classes, subjects… ( / )")}
            aria-label={ui(isTeacher ? "Search tests" : "Search exams")}
            className="w-full ps-9 pe-3"
          />
        </InputGroup>

        <FilterSelect
          value={classFilter}
          onChange={setClassFilter}
          label={ui("Class")}
          options={[["ALL", ui("All classes")], ...classOptions]}
        />
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          label={ui("Type")}
          options={[
            ["ALL", ui("All types")],
            ...typeOptions.map(
              (t) => [t, ui(EXAM_TYPE_LABELS[t as ExamType] || t.replaceAll("_", " "))] as [string, string],
            ),
          ]}
        />
        <Button variant="choice"
          type="button"
          onClick={() => setAttentionOnly((v) => !v)}
          aria-pressed={attentionOnly}
          className={"justify-start " + (cn(
            "flex items-center gap-1.5 px-3 py-2.5",
            "",
          ))}
        >
          <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
          {ui("Needs attention")}
          {flagged.size > 0 ? (
            <span className="rounded-full bg-status-warning-text px-1.5 text-2xs text-primary-foreground">
              {flagged.size}
            </span>
          ) : null}
        </Button>

        {filtersActive ? (
          <Button variant="ghost"
            type="button"
            onClick={resetFilters}
            className="px-3 py-2.5"
          >
            {ui("Clear")}
          </Button>
        ) : null}

        <div className="ms-auto flex items-center gap-2.5">
          <FilterSelect
            value={prefs.sortKey}
            onChange={(v) => patchPrefs({ sortKey: v as SortKey })}
            label={ui("Sort")}
            options={[
              ["manual", ui("Board order")],
              ["title", ui("Title")],
              ["class", ui("Class")],
              ["stage", ui("Stage")],
              ["progress", ui("Marks progress")],
              ["date", ui("Exam date")],
            ]}
          />
          {prefs.sortKey !== "manual" ? (
            <Button variant="outline" size="icon"
              type="button"
              onClick={() => patchPrefs({ sortDir: prefs.sortDir === "asc" ? "desc" : "asc" })}
              aria-label={ui(prefs.sortDir === "asc" ? "Sort descending" : "Sort ascending")}
              className="flex items-center justify-center"
            >
              {prefs.sortDir === "asc" ? (
                <ArrowUpWideNarrow className="h-4 w-4" />
              ) : (
                <ArrowDownWideNarrow className="h-4 w-4" />
              )}
            </Button>
          ) : null}
          {prefs.view === "board" ? (
            <Button variant="outline" size="icon"
              type="button"
              onClick={() =>
                patchPrefs({ density: prefs.density === "compact" ? "comfortable" : "compact" })
              }
              aria-label={ui(prefs.density === "compact" ? "Switch to comfortable cards" : "Switch to compact cards")}
              className="flex items-center justify-center"
            >
              {prefs.density === "compact" ? (
                <Rows3 className="h-4 w-4" />
              ) : (
                <LayoutList className="h-4 w-4" />
              )}
            </Button>
          ) : null}

          <div className="flex items-center gap-0.5 rounded-2xl border border-edge/20 bg-surface-subtle p-1">
            <ViewTab
              active={prefs.view === "board"}
              icon={Columns3}
              label={ui("Board")}
              onClick={() => patchPrefs({ view: "board" })}
            />
            <ViewTab
              active={prefs.view === "table"}
              icon={Table2}
              label={ui("List")}
              onClick={() => patchPrefs({ view: "table" })}
            />
            {!isTeacher ? (
              <ViewTab
                active={prefs.view === "timeline"}
                icon={CalendarDays}
                label={ui("Datesheet")}
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
      {loadFailed && !loading ? (
        <ErrorState title={ui(isTeacher ? "Tests could not be loaded" : "Exams could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void load()} />
      ) : loading ? (
        <BoardSkeleton count={columns.length} />
      ) : exams.length === 0 ? (
        <EmptyBoard isTeacher={isTeacher} onCreate={() => setCreating(true)} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={ui("Nothing matches those filters")}
          description={ui(isTeacher ? "Clear the filters to see every test again." : "Clear the filters to see every exam again.")}
          action={
            <Button type="button" onClick={resetFilters}>
              {ui("Clear filters")}
            </Button>
          }
        />
      ) : prefs.view === "board" ? (
        <>
          {stageFilter !== "ALL" ? (
            <Button variant="secondary"
              type="button"
              onClick={() => setStageFilter("ALL")}
              className="justify-start flex items-center gap-1.5 px-3 py-1.5"
            >
              <X aria-hidden="true" className="h-3 w-3" /> {ui("Showing one stage — show all")}
            </Button>
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
        <p className="flex items-center gap-1.5 px-1 text-2xs font-semibold text-ink-subtle">
          <Info aria-hidden="true" className="h-3 w-3" />
          {ui("Drag a card to move it along the pipeline, or focus one and press ← / →. Tick cards to act on a batch from the bar at the top.")}
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
        <ExamDetailDialog
          exam={selectedExam}
          campusId={campusId}
          role={role}
          initialTab={detailTab === "schedule" ? "papers" : detailTab}
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
  const ui = useUiText();
  const dragging = draggingIds.length > 0;

  if (collapsed) {
    return (
      <Button variant="outline"
        type="button"
        onClick={onToggleCollapse}
        aria-label={ui("Expand {0}", [column.title])}
        className="flex w-14 shrink-0 flex-col items-center gap-3 py-4"
      >
        <ChevronRight aria-hidden="true" className="h-4 w-4 text-ink-subtle rtl:rotate-180" />
        <Badge
          size="sm"
          variant="outline"
          className="border-transparent tabular-nums"
          style={{ backgroundColor: `${column.accent}1a`, color: column.accent }}
        >
          {exams.length}
        </Badge>
        <span
          className="text-2xs font-semibold text-ink-muted"
          style={{ writingMode: "vertical-rl" }}
        >
          {column.title}
        </span>
      </Button>
    );
  }

  return (
    <section
      aria-label={column.title}
      className={cn(
        "flex w-[min(320px,85vw)] shrink-0 flex-col rounded-3xl border bg-gradient-to-b from-card to-surface-subtle p-4 shadow-sm transition-all",
        dropZone
          ? dropZone.ok
            ? "border-primary/60 ring-4 ring-primary/10"
            : "border-status-error-border ring-4 ring-status-error-surface"
          : "border-edge/10",
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
          <h3 className="text-sm font-bold text-ink-strong">{column.title}</h3>
        </div>
        <div className="flex items-center gap-1">
          <Badge
            size="sm"
            variant="outline"
            className="border-transparent tabular-nums"
            style={{ backgroundColor: `${column.accent}1a`, color: column.accent }}
          >
            {exams.length}
          </Badge>
          <Button variant="secondary" size="icon"
            type="button"
            onClick={onToggleCollapse}
            aria-label={ui("Collapse {0}", [column.title])}
            className="flex items-center justify-center"
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5 rtl:rotate-180" />
          </Button>
        </div>
      </div>
      <p className="mb-3 text-2xs font-semibold text-ink-subtle">{column.hint}</p>

      {dropZone ? (
        <Alert tone={dropZone.ok ? "brand" : "danger"} compact live="polite" className="mb-3">
          {dropZone.message}
        </Alert>
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
              "rounded-2xl border border-dashed py-10 text-center text-2xs font-semibold transition-colors",
              dropZone?.ok
                ? "border-primary/40 bg-brand-50/40 text-primary"
                : "border-edge/20 text-ink-subtle",
            )}
          >
            {ui(dragging ? "Drop here" : "Empty")}
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
    <Button variant="choice"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={"justify-start " + (cn(
        "group relative flex items-center gap-2.5 overflow-hidden px-3 py-2.5 text-start hover:-translate-y-0.5",
        "",
      ))}
      style={active ? { boxShadow: `0 0 0 1.5px ${accent}, 0 10px 24px -14px ${accent}` } : undefined}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 start-0 w-[3px]",
          active ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-60",
        )}
        style={{ backgroundColor: accent }}
      />
      <span className="text-xl font-bold leading-none tracking-tight tabular-nums text-ink-strong sm:text-[22px]">
        {count}
      </span>
      {/* Wrapping beats truncating: "On the Dateshee…" and "Awaiting Appr…"
          are not names anyone can act on. */}
      <span className="min-w-0 flex-1 text-xs font-semibold leading-tight text-ink-muted">
        {label}
      </span>
    </Button>
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
    <Button variant="choice"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={"justify-start " + (cn(
        "flex items-center gap-1.5 px-3 py-2",
        "",
      ))}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </Button>
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
      <SystemSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="appearance-none ps-3 pe-8"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </SystemSelect>

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
  const ui = useUiText();
  return (
    <div className="sticky top-[60px] z-[19] flex flex-wrap items-center gap-2 rounded-[18px] border border-primary/25 bg-card/95 p-2 shadow-lg backdrop-blur-xl">
      <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
        {ui("{0} selected", [total])}
      </span>
      {groups.length === 0 ? (
        <span className="text-2xs font-semibold text-ink-muted">
          {ui("Nothing left to do on these — they are already finished.")}
        </span>
      ) : (
        groups.map((g) => (
          <Button variant="default"
            key={g.key}
            type="button"
            loading={busy}
            onClick={() => onRun(g.key, g.exams)}
            className="justify-start flex items-center gap-1.5 px-3.5 py-2"
            style={{ backgroundColor: g.accent }}
          >
            {ui(g.label)}
            <span className="rounded-full bg-card/25 px-1.5 tabular-nums">{g.exams.length}</span>
          </Button>
        ))
      )}
      <Button variant="ghost"
        type="button"
        onClick={onClear}
        className="ms-auto px-3 py-2"
      >
        {ui("Clear")}
      </Button>
    </div>
  );
}

function BoardSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="sk-panel p-4">
          <div className="skeleton-shimmer mb-4 h-3 w-24 rounded-full bg-border-subtle/50" />
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j} className="skeleton-shimmer h-24 rounded-2xl bg-border-subtle/40" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyBoard({ isTeacher, onCreate }: { isTeacher: boolean; onCreate: () => void }) {
  const ui = useUiText();
  return (
    <div className="sk-panel border-dashed p-6 sm:p-10">
      <EmptyState
        icon={CalendarDays}
        title={ui(isTeacher ? "No tests yet" : "No exams yet")}
        description={ui(
          isTeacher
            ? "Create a quiz or class test for one of your subjects."
            : "Create your first exam to start the cycle.",
        )}
        action={
          // R5: the empty state repeats the PageHeader primary with the same label.
          <BrandButton variant="gradient" icon={<Plus className="h-4 w-4" />} onClick={onCreate}>
            {ui(isTeacher ? "New test" : "New exam")}
          </BrandButton>
        }
      />
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
  const ui = useUiText();
  const consequence = plan.eligible.find((e) => "confirm" in e.verdict && e.verdict.confirm);
  const verdictLabel = ui(plan.eligible[0]?.verdict.label ?? "Move");
  return (
    <Modal
      title={verdictLabel}
      eyebrow={plan.eyebrow}
      icon={Lock}
      role="alertdialog"
      size="xs"
      onClose={onCancel}
      disableBackdropClose={busy}
      footer={
        <div className="flex gap-2">
          <BrandButton variant="soft" onClick={onCancel} disabled={busy} className="flex-1">
            {ui("Keep editing")}
          </BrandButton>
          <BrandButton variant="gradient" onClick={onConfirm} loading={busy} className="flex-1">
            {busy ? null : <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
            {verdictLabel}
          </BrandButton>
        </div>
      }
    >

        <div className="space-y-3 px-6 py-5">
          {consequence && "confirm" in consequence.verdict ? (
            <p className="text-sm leading-relaxed text-ink">
              {ui(consequence.verdict.confirm ?? "")}
            </p>
          ) : null}

          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-2xl bg-surface-subtle p-3 custom-scrollbar">
            {plan.eligible.map(({ exam }) => (
              <li key={exam.id} className="flex items-center gap-2 text-xs font-semibold text-ink-strong">
                <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-status-success-text" />
                <bdi className="truncate">
                  {exam.title} · {classLabel(exam.class)}
                </bdi>
              </li>
            ))}
          </ul>

          {plan.blocked.length > 0 ? (
            <Alert
              tone="warning"
              compact
              live="off"
              title={ui(plan.blocked.length === 1 ? "{0} will stay where it is" : "{0} will stay where they are", [plan.blocked.length])}
            >
              {ui(plan.blocked[0].reason)}
            </Alert>
          ) : null}
        </div>

    </Modal>
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
  const ui = useUiText();
  const tooShort = reason.trim().length < 5;
  const reportCards = exams.reduce((sum, e) => sum + (e._count?.reportCards ?? 0), 0);
  const single = exams.length === 1 ? exams[0] : null;

  return (
    <Modal
      title={ui("Send marks back")}
      eyebrow={ui("Marks review")}
      icon={RotateCcw}
      tone="amber"
      size="xs"
      onClose={onClose}
      // The reason is typed prose; a mistimed backdrop click used to bin it.
      dirty={reason.trim().length > 0}
      dirtyMessage={ui("Discard the reason you have written?")}
      footer={
        <div className="flex gap-2">
          <BrandButton variant="soft" onClick={onClose} disabled={busy} className="flex-1">
            {ui("Keep editing")}
          </BrandButton>
          <Tooltip content={ui(tooShort ? "Write a reason for the teacher first" : "Send these marks back to the teacher")}>
            <span tabIndex={tooShort ? 0 : -1} className="flex flex-1">
              <BrandButton
                variant="gradient"
                onClick={onSubmit}
                disabled={tooShort}
                loading={busy}
                className="flex-1"
              >
                {busy ? null : <RotateCcw aria-hidden="true" className="h-4 w-4" />}
                {ui("Send back")}
              </BrandButton>
            </span>
          </Tooltip>
        </div>
      }
    >
        <p className="mb-4 text-2xs font-semibold leading-relaxed text-ink-muted">
          <bdi>
            {single
              ? `${single.title}${single.class ? ` · ${classLabel(single.class)}` : ""}.`
              : ui("{0} exams.", [exams.length])}
          </bdi>{" "}
          {ui(reportCards === 1
            ? "The teacher will be able to edit the marks again, and the 1 report card generated at locking will be withdrawn until re-locked."
            : "The teacher will be able to edit the marks again, and the {0} report cards generated at locking will be withdrawn until re-locked.", [reportCards])}
        </p>

        {exams.length > 1 ? (
          <ul className="mb-4 max-h-28 space-y-1 overflow-y-auto rounded-2xl bg-surface-subtle p-3 custom-scrollbar">
            {exams.map((e) => (
              <li key={e.id} className="truncate text-2xs font-bold text-ink-strong">
                <bdi>{e.title} · {classLabel(e.class)}</bdi>
              </li>
            ))}
          </ul>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
            {ui("Reason for the teacher")}
          </span>
          <SystemTextarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
            maxLength={2000}
            placeholder={ui("e.g. Mathematics totals need re-checking against the answer sheets.")}
            className="w-full"
          />
        </label>
        {/* Send back was simply disabled until the reason was long enough,
            with nothing on screen saying so — the admin was left clicking a
            dead button. */}
        <p className={cn(
          "mt-1.5 text-2xs font-semibold",
          tooShort ? "text-status-warning-text" : "text-ink-subtle",
        )}>
          {tooShort
            ? ui("Write at least a few words — this is the only thing the teacher will see.")
            : ui("{0} characters · the teacher sees this verbatim", [reason.trim().length])}
        </p>

    </Modal>
  );
}

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
  // Quizzes and class tests are the teacher's own; mid-terms and finals are
  // scheduled by the office through the exam-session wizard, for every class at
  // once, because they need a date sheet and a seating plan this board has no
  // notion of.
  const ui = useUiText();
  const typeOptions: readonly ExamType[] =
    role === "TEACHER" ? TEACHER_EXAM_TYPES : OFFICE_EXAM_TYPES;
  // Stamp new exams with the active cycle's year, not the calendar year — a
  // cycle labelled 2027 starts in August 2026, and filing under 2026 hides the
  // exam from the office's board.
  const cycleYear = useAcademicYear();
  const [classResult, setClassResult] = useState<{ scope: string | undefined; data: { id: string; name: string; section?: string | null }[] }>({ scope: campusId, data: [] });
  const classes = classResult.scope === campusId ? classResult.data : [];
  const classRequest = useRef<AbortController | null>(null);
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
    classRequest.current?.abort();
    const controller = new AbortController();
    classRequest.current = controller;
    setClassResult({ scope: campusId, data: [] });
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const params = new URLSearchParams();
      if (campusId) params.set("campusId", campusId);
      const res = await fetch(`/api/classes?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "");
      const list = d.data || [];
      if (classRequest.current !== controller) return;
      setClassResult({ scope: campusId, data: list });
    } catch (e) {
      if (classRequest.current !== controller) return;
      const err = e as { name?: string; message?: string };
      setClassesError(
        err?.name === "AbortError"
          ? ui("Classes took too long to load")
          : friendlyErrorMessage(e, ui("The classes could not be loaded.")),
      );
    } finally {
      clearTimeout(timeout);
      if (classRequest.current === controller) setLoadingClasses(false);
    }
  }, [campusId, ui]);

  useEffect(() => {
    setForm(current => ({ ...current, classId: "", subjectId: "" }));
    void loadClasses();
    return () => { classRequest.current?.abort(); classRequest.current = null; };
  }, [loadClasses]);


  /* Class and title were "required", but the button stayed live and the check
     ran on submit as a toast — so a missing class was reported as an error the
     office had made rather than a field they had not filled in yet. */
  const scopeReady = classResult.scope === campusId && !loadingClasses;
  const selectedClassValid = scopeReady && classes.some(item => item.id === form.classId);
  const blockedReason = !scopeReady
    ? ui("Wait for this campus's classes to load.")
    : classesError
      ? ui("Classes could not be loaded — retry above first.")
      : !selectedClassValid && !form.title.trim()
        ? ui("Choose a class and a title to continue.")
        : !selectedClassValid
          ? ui("Choose a class to continue.")
          : !form.title.trim()
            ? ui("Choose a title to continue.")
            : null;

  const submit = async () => {
    if (blockedReason) return;
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
      if (!res.ok) {
        // Server text is not guaranteed to be user-safe; log it and show a human message.
        console.error("Create exam failed", data?.error);
        toast.error(ui(role === "TEACHER" ? "Could not create the test. Please try again." : "Could not create the exam. Please try again."));
        return;
      }
      toast.success(ui(role === "TEACHER" ? "Test created" : "Exam created"));
      onCreated();
    } catch (e) {
      console.error(e);
      toast.error(ui(role === "TEACHER" ? "Could not create the test. Please try again." : "Could not create the exam. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={ui(role === "TEACHER" ? "New test" : "New exam")}
      icon={Plus}
      size="sm"
      onClose={onClose}
      dirty={Boolean(form.title.trim() || form.classId)}
      dirtyMessage={ui(role === "TEACHER" ? "Discard this test without creating it?" : "Discard this exam without creating it?")}
      footer={
        <div>
          {blockedReason && !loadingClasses ? (
            <Alert tone="warning" compact live="off" className="mb-2.5">
              {blockedReason}
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="secondary"
              type="button"
              onClick={onClose}
              className="px-5 py-2.5"
            >
              {ui("Cancel")}
            </Button>
            <Tooltip content={blockedReason || ui(role === "TEACHER" ? "Create this test" : "Create this exam")}>
              <span tabIndex={loadingClasses || blockedReason ? 0 : -1} className="inline-flex">
                <BrandButton
                  variant="gradient"
                  onClick={submit}
                  disabled={loadingClasses || Boolean(blockedReason)}
                  loading={busy}
                >
                  {busy ? null : <BookOpen aria-hidden="true" className="h-4 w-4" />}
                  {ui(role === "TEACHER" ? "Create test" : "Create exam")}
                </BrandButton>
              </span>
            </Tooltip>
          </div>
        </div>
      }
    >
        <div className="space-y-4">
          {loadingClasses ? (
            <SkeletonBlock className="h-40 rounded-2xl" label={ui("Loading classes")} />
          ) : classesError ? (
            <ErrorState
              title={ui("Could not load classes")}
              description={classesError}
              onRetry={loadClasses}
            />
          ) : (
            <>
              <Field label="Class">
                <SystemSelect
                  value={form.classId}
                  onChange={(e) => setForm({ ...form, classId: e.target.value })}
                  className="w-full"
                >
                  <option value="">{ui("Select class…")}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {classLabel(c)}
                    </option>
                  ))}
                </SystemSelect>
              </Field>

              <Field label={role === "TEACHER" ? "Test title" : "Exam title"}>
                <SystemInput
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={ui(role === "TEACHER" ? "e.g. Fractions class test" : "e.g. Mid-term examination")}
                  className="w-full"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Term">
                  <SystemInput
                    value={form.term}
                    onChange={(e) => setForm({ ...form, term: e.target.value })}
                    className="w-full"
                  />
                </Field>
                <Field label="Academic year">
                  <SystemInput
                    type="number"
                    value={form.academicYear}
                    onChange={(e) => setForm({ ...form, academicYear: Number(e.target.value) })}
                    className="w-full"
                  />
                </Field>
              </div>

              <Field label={role === "TEACHER" ? "Type of test" : "Type of exam"}>
                <SystemSelect
                  value={form.examType}
                  onChange={(e) => setForm({ ...form, examType: e.target.value })}
                  className="w-full"
                >
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {ui(EXAM_TYPE_LABELS[t])}
                    </option>
                  ))}
                </SystemSelect>
                {role === "TEACHER" ? (
                  <p className="mt-1.5 text-2xs font-semibold text-ink-subtle">
                    {ui("Mid-term and final exams are set up by the school office.")}
                  </p>
                ) : null}
              </Field>
            </>
          )}
        </div>

    </Modal>
  );
}

/** `label` is an EN UI key (translated here). */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const ui = useUiText();
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
        {ui(label)}
      </span>
      {children}
    </label>
  );
}
