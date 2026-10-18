"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  DoorOpen,
  GraduationCap,
  Pencil,
  Plus,
  Printer,
  Send,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Select as SystemSelect } from "@/components/ui/select";
import { Input as SystemInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { useUiText } from "@/components/locale/LocaleProvider";
import { useLocale } from "@/components/locale/LocaleProvider";
import { TimetableScopeControls, timetableScopeCopy, useTimetableScope } from "./TimetableScopeControls";
import { timetablePeriods } from "@/lib/timetable/view-scope";
import { AddPeriodDialog, addPeriodCopy } from "./AddPeriodDialog";
import { PeriodChangeReview } from "./PeriodChangeReview";
import { planPeriodChanges, type PeriodConfiguration } from "@/lib/timetable/period-changes";


// ─── Types ────────────────────────────────────────────────
interface SlotData {
  id: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  slotType: string;
  subjectId: string | null;
  teacherId: string | null;
  roomNumber: string | null;
  roomId: string | null;
  subject: { id: string; name: string } | null;
  teacher: { id: string; fullName: string } | null;
  room: { id: string; roomNumber: string; capacity: number } | null;
}

interface TimetableData {
  id: string;
  classId: string;
  academicYear: number;
  term: string;
  status: string;
  publishedAt: string | null;
  class: { id: string; name: string; section: string | null };
  slots: SlotData[];
}

interface ClassOption {
  id: string;
  name: string;
  section: string | null;
  academicYear: number;
}

interface SubjectOption {
  id: string;
  name: string;
  teacherId: string | null;
  teacher: { id: string; fullName: string } | null;
}

interface TeacherOption {
  id: string;
  fullName: string;
}

interface RoomOption {
  id: string;
  roomNumber: string;
  capacity: number;
}

const DAYS = [
  { num: 1, short: "Mon", full: "Monday" },
  { num: 2, short: "Tue", full: "Tuesday" },
  { num: 3, short: "Wed", full: "Wednesday" },
  { num: 4, short: "Thu", full: "Thursday" },
  { num: 5, short: "Fri", full: "Friday" },
  { num: 6, short: "Sat", full: "Saturday" },
  { num: 7, short: "Sun", full: "Sunday" },
];

const SUBJECT_COLORS = [
  { bg: "bg-violet-100", border: "border-violet-300", text: "text-violet-700", dot: "bg-violet-500" },
  { bg: "bg-sky-100", border: "border-sky-300", text: "text-sky-700", dot: "bg-sky-500" },
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-700", dot: "bg-emerald-500" },
  { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-700", dot: "bg-amber-500" },
  { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-700", dot: "bg-rose-500" },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-700", dot: "bg-indigo-500" },
  { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-700", dot: "bg-teal-500" },
  { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-700", dot: "bg-pink-500" },
  { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-700", dot: "bg-orange-500" },
  { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-700", dot: "bg-cyan-500" },
];

const SLOT_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  BREAK: { bg: "bg-muted", text: "text-ink-muted", label: "Break" },
  PRAYER: { bg: "bg-amber-50/80", text: "text-amber-600/60", label: "Prayer / Namaz" },
  ASSEMBLY: { bg: "bg-blue-50/80", text: "text-blue-600/60", label: "Assembly" },
  ACTIVITY: { bg: "bg-emerald-50/80", text: "text-emerald-600/60", label: "Activity" },
};

type GridPeriod = { num: number; start: string; end: string; type: string };
type GridDay = { num: number; short: string; full: string };

function TimetableGridSkeleton({ periods, visibleDays }: { periods: GridPeriod[]; visibleDays: GridDay[] }) {
  return (
    <div className="min-w-[800px]">
      <div className="grid border-b border-muted" style={{ gridTemplateColumns: `80px repeat(${visibleDays.length}, 1fr)` }}>
        <div className="flex items-center justify-center p-3">
          <div className="h-4 w-4 rounded bg-border-subtle/50 skeleton-shimmer" />
        </div>
        {visibleDays.map((day) => (
          <div key={day.num} className="flex flex-col items-center justify-center py-3 border-s border-muted">
            <div className="h-3 w-10 rounded bg-border-subtle/50 skeleton-shimmer" />
            <div className="h-2 w-12 mt-1 rounded bg-border-subtle/40 skeleton-shimmer" />
          </div>
        ))}
      </div>
      {periods.map((p) => (
        <div key={p.num} className="grid border-b border-muted last:border-b-0" style={{ gridTemplateColumns: `80px repeat(${visibleDays.length}, 1fr)` }}>
          <div className="flex flex-col items-center justify-center p-2 border-e border-muted">
            <div className="h-3 w-6 rounded bg-border-subtle/50 skeleton-shimmer" />
            <div className="h-2 w-10 mt-1 rounded bg-border-subtle/40 skeleton-shimmer" />
          </div>
          {visibleDays.map((day) => (
            <div key={day.num} className="border-s border-muted p-1">
              <div className="h-full min-h-[48px] rounded-xl bg-border-subtle/30 skeleton-shimmer" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TimetablePanel({ campusId }: { campusId?: string }) {
  const [timetables, setTimetables] = useState<TimetableData[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const { language } = useLocale();
  const scopeCopy = timetableScopeCopy(language);
  const addCopy = addPeriodCopy(language);
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [periodReview, setPeriodReview] = useState<PeriodConfiguration[] | null>(null);
  const [pendingSelection, setPendingSelection] = useState<(() => void) | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editingSlot, setEditingSlot] = useState<SlotData | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<string, Partial<SlotData>>>(new Map());
  const [viewMode, setViewMode] = useState<"class" | "teacher">("class");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [showPeriodConfig, setShowPeriodConfig] = useState(false);
  const [customPeriods, setCustomPeriods] = useState<{ period: number; start: string; end: string; type: string }[]>([]);
  const [periodDefs, setPeriodDefs] = useState<{ id: string; periodNumber: number; startTime: string; endTime: string }[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [weekendDays, setWeekendDays] = useState<number[]>([]);

  // Only render the campus's working days. The school calendar defines which
  // day-of-week values are weekends; those columns are hidden entirely so a
  // 5-day calendar shows Mon–Fri without Saturday.
  const visibleDays = useMemo(
    () => DAYS.filter((d) => !weekendDays.includes(d.num)),
    [weekendDays],
  );

  const qp = campusId ? `?campusId=${campusId}` : "";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ttRes, classRes, teacherRes, periodRes, roomRes, calRes] = await Promise.all([
        fetch(`/api/timetable${qp}`),
        fetch(`/api/classes${qp}`),
        fetch(`/api/staff${qp}`),
        fetch(`/api/academic/periods?timeType=CLASS${campusId ? `&campusId=${encodeURIComponent(campusId)}` : ""}`),
        fetch(`/api/academic/rooms${qp}`),
        fetch(`/api/academic/calendar${qp}`),
      ]);
      const [ttJson, classJson, teacherJson, periodJson, roomJson, calJson] = await Promise.all([
        ttRes.json(), classRes.json(), teacherRes.json(), periodRes.json(), roomRes.json(), calRes.json(),
      ]);

      if (ttJson.success) setTimetables(ttJson.data);
      if (periodJson.success) setPeriodDefs(periodJson.data || []);
      if (roomJson.success) setRooms(roomJson.data || []);
      if (calJson.success) setWeekendDays(calJson.data.weekends || []);
      if (classJson.success || Array.isArray(classJson.data)) {
        const cls = classJson.data || classJson;
        setClasses(Array.isArray(cls) ? cls : []);
      }
      if (teacherJson.success) {
        const staffList = teacherJson.staff || [];
        const teacherList = (Array.isArray(staffList) ? staffList : []).filter(
          (u: any) => u.role === "TEACHER"
        );
        setTeachers(teacherList);
      }
    } catch {
      toast.error("Could not load the timetable. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { loadData(); }, [loadData]);

  const scope = useTimetableScope(timetables, classes, campusId);
  const scopeClasses = useMemo(() => {
    const options = classes.filter(cls => cls.academicYear === scope.year || timetables.some(timetable => timetable.classId === cls.id && timetable.academicYear === scope.year));
    for (const timetable of timetables) if (timetable.academicYear === scope.year && !options.some(cls => cls.id === timetable.classId)) options.push({ ...timetable.class, academicYear: scope.year });
    return options;
  }, [classes, timetables, scope.year]);
  const activeTimetable = scope.exact.find(timetable => timetable.classId === selectedClassId) || null;
  const changing = creating || saving || publishing;
  const changeSelection = (change: () => void) => {
    if (changing) return;
    if (pendingChanges.size) { setPendingSelection(() => change); return; }
    setEditingSlot(null); change();
  };
  const finishSelection = () => { setPendingChanges(new Map()); setEditingSlot(null); pendingSelection?.(); setPendingSelection(null); };


  useEffect(() => {
    setSubjects([]);
    if (!selectedClassId || !activeTimetable) return;
    const controller = new AbortController();
    fetch(`/api/subjects?classId=${selectedClassId}${campusId ? `&campusId=${campusId}` : ""}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => {
        if (!controller.signal.aborted && (j.success || Array.isArray(j.data))) setSubjects(j.data || []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [selectedClassId, activeTimetable, campusId]);

  const subjectColorMap = useMemo(() => {
    const m = new Map<string, typeof SUBJECT_COLORS[0]>();
    subjects.forEach((s, i) => m.set(s.id, SUBJECT_COLORS[i % SUBJECT_COLORS.length]));
    return m;
  }, [subjects]);

  const getSlot = useCallback(
    (day: number, period: number): SlotData | undefined => {
      return activeTimetable?.slots.find(
        (s) => s.dayOfWeek === day && s.periodNumber === period
      );
    },
    [activeTimetable]
  );

  const periods = useMemo(() => timetablePeriods(viewMode === "class" ? activeTimetable?.slots || [] : scope.resources.flatMap(timetable => timetable.slots), periodDefs), [viewMode, activeTimetable, scope.resources, periodDefs]);

  const defaultPeriods = [
    { period: 1, start: "08:00", end: "08:40", type: "CLASS" },
    { period: 2, start: "08:40", end: "09:20", type: "CLASS" },
    { period: 3, start: "09:20", end: "10:00", type: "CLASS" },
    { period: 4, start: "10:00", end: "10:20", type: "BREAK" },
    { period: 5, start: "10:20", end: "11:00", type: "CLASS" },
    { period: 6, start: "11:00", end: "11:40", type: "CLASS" },
    { period: 7, start: "11:40", end: "12:10", type: "PRAYER" },
    { period: 8, start: "12:10", end: "12:50", type: "CLASS" },
  ];

  const gridSkeletonPeriods = periods.length
    ? periods
    : defaultPeriods.map((p) => ({ num: p.period, start: p.start, end: p.end, type: p.type }));

  const handleCreateTimetable = async (periods?: typeof defaultPeriods) => {
    if (!selectedClassId) return;
    setCreating(true);
    try {
      const fromDefs =
        periodDefs.length > 0
          ? periodDefs
              .sort((a, b) => a.periodNumber - b.periodNumber)
              .map((p) => ({ period: p.periodNumber, start: p.startTime, end: p.endTime, type: "CLASS" }))
          : null;
      const res = await fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClassId,
          campusId,
          academicYear: scope.year,
          term: scope.term,
          periods: periods || fromDefs || defaultPeriods,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Timetable created. Add lessons to each period.");
        setCustomPeriods([]);
        await loadData();
      } else {
        toast.error(json.error || "Could not create the timetable. Please try again.");
      }
    } catch {
      toast.error("Could not create the timetable. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleSlotUpdate = (slotId: string, updates: Partial<SlotData>) => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const existing = next.get(slotId) || {};
      next.set(slotId, { ...existing, ...updates });
      return next;
    });
  };

  const handleSaveAll = async () => {
    if (!activeTimetable || pendingChanges.size === 0) return;
    setSaving(true);
    try {
      const slotsToUpdate = [...pendingChanges.entries()].map(([id, changes]) => {
        const original = activeTimetable.slots.find((s) => s.id === id)!;
        return {
          id,
          dayOfWeek: original.dayOfWeek,
          periodNumber: original.periodNumber,
          subjectId: changes.subjectId !== undefined ? changes.subjectId : original.subjectId,
          teacherId: changes.teacherId !== undefined ? changes.teacherId : original.teacherId,
          roomId: changes.roomId !== undefined ? changes.roomId : original.roomId,
          roomNumber: changes.roomNumber !== undefined ? changes.roomNumber : original.roomNumber,
          slotType: changes.slotType !== undefined ? changes.slotType : original.slotType,
          startTime: changes.startTime || original.startTime,
          endTime: changes.endTime || original.endTime,
        };
      });

      const res = await fetch(`/api/timetable/${activeTimetable.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: slotsToUpdate }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Timetable changes saved.");
        setPendingChanges(new Map());
        await loadData();
      } else if (json.conflicts) {
        json.conflicts.forEach((c: string) => toast.error(c));
      } else {
        toast.error(json.error || "Could not save the timetable. Please try again.");
      }
    } catch {
      toast.error("Could not save the timetable. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!activeTimetable) return;
    setPublishing(true);
    try {
      const action = activeTimetable.status === "PUBLISHED" ? "unpublish" : "publish";
      const res = await fetch(`/api/timetable/${activeTimetable.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(action === "publish" ? "Timetable published! Teachers and students can now see it." : "Timetable unpublished. It is back to draft.");
        await loadData();
      } else {
        toast.error(json.error || "Could not change the timetable status. Please try again.");
      }
    } catch {
      toast.error("Could not change the timetable status. Check your connection and try again.");
    } finally {
      setPublishing(false);
    }
  };

  const savePeriodConfig = async (configuration: PeriodConfiguration[]): Promise<boolean> => {
    if (!activeTimetable) return false;
    setSaving(true);
    try {
      const { updates } = planPeriodChanges(activeTimetable.slots, configuration);
      const res = await fetch(`/api/timetable/${activeTimetable.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: updates }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Period settings saved.");
        await loadData();
        return true;
      }
      toast.error(json.error || "Could not save the period settings. Please try again.");
      return false;
    } catch {
      toast.error("Could not save the period settings. Check your connection and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const [confirmDeleteTimetable, setConfirmDeleteTimetable] = useState(false), [deletingTimetable, setDeletingTimetable] = useState(false);
  const ui = useUiText();
  const handleSavePeriodConfig = (configuration: PeriodConfiguration[]) => {
    if (!activeTimetable || pendingChanges.size > 0 || changing) return;
    if (planPeriodChanges(activeTimetable.slots, configuration).clearing.length) setPeriodReview(configuration);
    else void savePeriodConfig(configuration);
  };

  // SKO-389: deletion is confirmed in a labelled dialog; the server refuses it once substitute history exists.
  const handleDeleteTimetable = () => { if (activeTimetable) setConfirmDeleteTimetable(true); };
  const deleteTimetable = async () => {
    if (!activeTimetable) return;
    setDeletingTimetable(true);
    try {
      const res = await fetch(`/api/timetable/${activeTimetable.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success("Timetable deleted");
        await loadData();
      } else {
        toast.error(json.error || "Could not delete the timetable. Please try again.");
      }
    } catch {
      toast.error("Could not delete the timetable. Check your connection and try again.");
    } finally {
      setDeletingTimetable(false); setConfirmDeleteTimetable(false);
    }
  };

  const teacherSlotMap = useMemo(() => {
    const map = new Map<string, { classLabel: string; day: number; period: number; subject: string; start: string; end: string }[]>();
    for (const tt of scope.resources) {
      const clsLabel = `${tt.class.name}${tt.class.section ? ` ${tt.class.section}` : ""}`;
      for (const s of tt.slots) {
        if (!s.teacherId) continue;
        const existing = map.get(s.teacherId) || [];
        existing.push({
          classLabel: clsLabel,
          day: s.dayOfWeek,
          period: s.periodNumber,
          subject: s.subject?.name || "",
          start: s.startTime,
          end: s.endTime,
        });
        map.set(s.teacherId, existing);
      }
    }
    return map;
  }, [scope.resources]);

  const selectedTeacherSlots = selectedTeacherId ? teacherSlotMap.get(selectedTeacherId) || [] : [];

  if (loading) {
    return (
      <div className="flex flex-col gap-6 min-h-[100vh]">
        <div className="flex items-center gap-2 rounded-2xl bg-muted p-1 w-fit animate-skeleton-in">
          <div className="h-9 w-24 rounded-xl bg-border-subtle/50 skeleton-shimmer" />
          <div className="h-9 w-28 rounded-xl bg-border-subtle/40 skeleton-shimmer" />
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-muted p-1 overflow-x-auto animate-skeleton-in" style={{ animationDelay: "80ms" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-20 rounded-xl bg-border-subtle/40 skeleton-shimmer" />
          ))}
        </div>
        <div className="sk-panel p-4 flex-1 min-h-[400px] animate-skeleton-in" style={{ animationDelay: "160ms" }}>
          <div className="space-y-3">
            {Array.from({ length: periodDefs.length || 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-16 rounded-xl bg-border-subtle/40 skeleton-shimmer" />
                {Array.from({ length: visibleDays.length }).map((_, j) => (
                  <div key={j} className="h-10 flex-1 rounded-xl bg-border-subtle/30 skeleton-shimmer" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <TimetableScopeControls year={scope.year} term={scope.term} years={scope.years} terms={scope.terms} disabled={changing} onYear={year => changeSelection(() => { scope.setYear(year); setSelectedClassId(null); })} onTerm={term => changeSelection(() => scope.setTerm(term))} />
      <ConfirmAction open={pendingSelection !== null} title={scopeCopy.changeTitle} description={scopeCopy.changeHint} confirmLabel={scopeCopy.discard} cancelLabel={scopeCopy.keep} onCancel={() => setPendingSelection(null)} onConfirm={finishSelection} />
      <ConfirmAction open={confirmDeleteTimetable} title={ui("Delete this timetable?")} description={ui("Its lessons are removed from this class's weekly schedule. Attendance and marks already recorded are not affected. A timetable with substitute history cannot be deleted.")} confirmLabel={ui("Delete timetable")} tone="danger" busy={deletingTimetable} onCancel={() => setConfirmDeleteTimetable(false)} onConfirm={() => void deleteTimetable()} />
      {addingPeriod && activeTimetable && <AddPeriodDialog key={activeTimetable.id} timetableId={activeTimetable.id} slots={activeTimetable.slots} definitions={periodDefs} weekendDays={weekendDays} onClose={() => setAddingPeriod(false)} onAdded={slot => { setTimetables(previous => previous.map(timetable => timetable.id === activeTimetable.id ? { ...timetable, slots: [...timetable.slots.filter(existing => existing.id !== slot.id), slot] } : timetable)); toast.success(addCopy.saved); }} />}
      {/* View mode tabs */}
      <div className="flex items-center gap-2 rounded-2xl bg-muted p-1 w-fit">
        <Button aria-pressed={viewMode === "class"} variant="choice" size="sm"
          type="button"
          onClick={() => setViewMode("class")}
          className="class"
        >
          <Calendar className="w-3.5 h-3.5 inline me-1.5 -mt-0.5" />Class View
        </Button>
        <Button aria-pressed={viewMode === "teacher"} variant="choice" size="sm"
          type="button"
          onClick={() => setViewMode("teacher")}
          className="teacher"
        >
          <User className="w-3.5 h-3.5 inline me-1.5 -mt-0.5" />Teacher View
        </Button>
      </div>

      {viewMode === "teacher" ? (
        <>
          <div className="flex items-center gap-3">
            <div className="relative">
              <SystemSelect
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="px-4 pe-10 appearance-none"
              >
                <option value="">— Select teacher —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.fullName}</option>
                ))}
              </SystemSelect>

            </div>
            {selectedTeacherId && (
              <span className="text-2xs font-bold text-ink-muted">
                {selectedTeacherSlots.length} slot{selectedTeacherSlots.length !== 1 ? "s" : ""} assigned
              </span>
            )}
            {selectedTeacherId && (
              <Button variant="secondary" size="sm"
                type="button"
                onClick={() => window.print()}
                className="flex justify-start items-center gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />Print Routine
              </Button>
            )}
          </div>

          {!selectedTeacherId && (
            <EmptyStateCard
              icon={User}
              title="Select a Teacher"
              description="Choose a teacher above to see their full weekly schedule across all classes"
            />
          )}

          {selectedTeacherId && (
            <div className="sk-panel sk-rise overflow-x-auto" style={{ animationDelay: "160ms" }}>
              <div className="min-w-[800px]">
                <div className="grid border-b border-muted" style={{ gridTemplateColumns: `80px repeat(${visibleDays.length}, 1fr)` }}>
                  <div className="flex items-center justify-center p-3">
                    <Clock className="w-4 h-4 text-ink-subtle" />
                  </div>
                  {visibleDays.map((day) => (
                    <div key={day.num} className={`flex flex-col items-center justify-center py-3 border-s border-muted ${weekendDays.includes(day.num) ? "opacity-50 bg-muted/70" : ""}`}>
                      <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{day.short}</span>
                      <span className="text-2xs font-medium text-ink-subtle mt-0.5">{day.full}</span>
                      {weekendDays.includes(day.num) && (
                        <span className="mt-0.5 rounded bg-status-error-surface px-1 py-px text-3xs font-semibold uppercase text-status-error-text">Off</span>
                      )}
                    </div>
                  ))}
                </div>

                {periods.length > 0 ? periods.map((period) => (
                  <div key={period.num} className="grid border-b border-muted last:border-b-0" style={{ gridTemplateColumns: `80px repeat(${visibleDays.length}, 1fr)` }}>
                    <div className="flex flex-col items-center justify-center p-2 border-e border-muted">
                      <span className="text-2xs font-bold text-primary">P{period.num}</span>
                      <span className="text-2xs font-medium tabular-nums text-ink-subtle mt-0.5">{period.start}</span>
                    </div>
                    {visibleDays.map((day) => {
                      const isOff = weekendDays.includes(day.num);
                      const slotInfo = selectedTeacherSlots.find((s) => s.day === day.num && s.period === period.num);
                      const isConflict = selectedTeacherSlots.filter((s) => s.day === day.num && s.period === period.num).length > 1;
                      return (
                        <div key={day.num} className={`border-s border-muted p-1 ${isOff ? "opacity-40 bg-muted/70" : ""}`}>
                          {slotInfo ? (
                            <div className={`h-full rounded-xl p-2 flex flex-col justify-center ${isConflict ? "bg-status-error-surface border border-status-error-border" : "bg-status-success-surface border border-status-success-border"}`}>
                              <p className={`text-2xs font-bold leading-tight ${isConflict ? "text-status-error-text" : "text-status-success-text"}`}>
                                {slotInfo.subject}
                              </p>
                              <p className="text-3xs font-semibold text-ink-muted mt-0.5">
                                {slotInfo.classLabel}
                              </p>
                              {isConflict && (
                                <span className="text-3xs font-semibold uppercase text-status-error-text mt-0.5">CONFLICT</span>
                              )}
                            </div>
                          ) : (
                            <div className="h-full rounded-xl border border-dashed border-edge/15 flex items-center justify-center">
                              <span className="text-3xs font-semibold text-ink-subtle">—</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )) : (
                  <EmptyState size="sm" icon={Clock} title={ui("No timetable periods found")} description={ui("Create timetables for classes first.")} />
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
      {/* Class selector bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl bg-muted p-1 overflow-x-auto">
          {scopeClasses.map((cls) => {
            const hasTimetable = scope.exact.some((t) => t.classId === cls.id);
            const isPublished = scope.exact.find((t) => t.classId === cls.id)?.status === "PUBLISHED";
            return (
              <Button aria-pressed={selectedClassId === cls.id} variant="choice" size="sm"
                key={cls.id}
                type="button"
                onClick={() => changeSelection(() => setSelectedClassId(cls.id))}
                disabled={changing}
                className="relative flex justify-start items-center gap-1.5 whitespace-nowrap"
              >
                {cls.name}{cls.section ? ` - ${cls.section}` : ""}
                {hasTimetable && (
                  <span className={`ms-1 h-1.5 w-1.5 rounded-full ${isPublished ? "bg-status-success-text" : "bg-status-warning-text"}`} />
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {!selectedClassId && (
        <EmptyStateCard
          icon={Calendar}
          title={ui("Select a Class")}
          description={ui("Choose a class above to view or create its weekly timetable")}
        />
      )}

      {selectedClassId && !activeTimetable && (
        <EmptyState
          className="sk-enter"
          icon={Calendar}
          title={ui("No Timetable Yet")}
          description={`Create a weekly schedule for this class with configurable period timings (${visibleDays.map((d) => d.short).join("–")})`}
          secondaryAction={
            <Button variant="outline"
              type="button"
              onClick={() => { setCustomPeriods(defaultPeriods.map((p) => ({ ...p }))); setShowPeriodConfig(true); }}
              className="flex justify-start items-center gap-2"
            >
              <Clock className="w-4 h-4" aria-hidden="true" />
              Configure Periods
            </Button>
          }
          action={
            <Button variant="default"
              type="button"
              onClick={() => handleCreateTimetable()}
              disabled={creating}
              loading={creating}
              className="flex justify-start items-center gap-2"
            >
              {!creating && <Plus className="h-4 w-4" aria-hidden="true" />}
              Quick Create (Default)
            </Button>
          }
        />
      )}

      {selectedClassId && activeTimetable && (
        <>
          {/* Action bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Badge variant={activeTimetable.status === "PUBLISHED" ? "success" : "warning"} dot>
                {activeTimetable.status === "PUBLISHED" ? ui("Published") : ui("Draft")}
              </Badge>
              {pendingChanges.size > 0 && (
                <Badge variant="warning" size="sm" className="tabular-nums">
                  {pendingChanges.size === 1 ? ui("1 unsaved change") : ui("{0} unsaved changes", [pendingChanges.size])}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {(() => {
                const addDisabled = activeTimetable.status !== "DRAFT" || changing || pendingChanges.size > 0;
                const addButton = <Button variant="outline" size="sm" disabled={addDisabled} onClick={() => setAddingPeriod(true)}><Plus aria-hidden="true" />{addCopy.title}</Button>;
                return addDisabled ? <Tooltip content={addCopy.draftOnly}><span tabIndex={0} className="inline-flex">{addButton}</span></Tooltip> : addButton;
              })()}
              <Button variant="secondary" size="sm"
                type="button"
                disabled={changing || pendingChanges.size > 0}
                onClick={() => {
                  const p = periods.map((pp) => ({ period: pp.num, start: pp.start, end: pp.end, type: pp.type }));
                  setCustomPeriods(p);
                  setShowPeriodConfig(true);
                }}
                className="flex justify-start items-center gap-1.5"
              >
                <Clock className="h-3.5 w-3.5" />Periods
              </Button>
              <Button variant="secondary" size="sm"
                type="button"
                onClick={() => window.print()}
                className="flex justify-start items-center gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />Print
              </Button>
              <Button variant="destructive" size="sm"
                type="button"
                onClick={handleDeleteTimetable}
                className="flex justify-start items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />Delete
              </Button>
              {pendingChanges.size > 0 && (
                <Button variant="default" size="sm"
                  type="button"
                  onClick={handleSaveAll}
                  disabled={saving}
                  loading={saving}
                  className="flex justify-start items-center gap-1.5"
                >
                  {!saving && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  Save Changes
                </Button>
              )}
              <Button variant={activeTimetable?.status === "PUBLISHED" ? "secondary" : "default"} size="sm"
                type="button"
                onClick={handlePublish}
                disabled={changing || pendingChanges.size > 0}
                loading={publishing}
                className="flex justify-start items-center gap-1.5"
              >
                {!publishing && <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                {activeTimetable.status === "PUBLISHED" ? "Unpublish" : "Publish"}
              </Button>
            </div>
          </div>

          {/* Subject legend */}
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => {
              const c = subjectColorMap.get(s.id);
              return (
                <div key={s.id} className={`flex items-center gap-1.5 rounded-xl ${c?.bg || "bg-surface-subtle"} px-3 py-1.5`}>
                  <span className={`h-2 w-2 rounded-full ${c?.dot || "bg-ink-faint"}`} />
                  <span className={`text-2xs font-bold ${c?.text || "text-ink-muted"}`}>{s.name}</span>
                  {s.teacher && (
                    <span className="text-2xs font-semibold text-ink-subtle ms-1">({s.teacher.fullName})</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Timetable Grid */}
          {loading ? (
            <div className="sk-panel sk-rise overflow-x-auto" style={{ animationDelay: "160ms" }}>
              <TimetableGridSkeleton periods={gridSkeletonPeriods} visibleDays={visibleDays} />
            </div>
          ) : (
          <div className="sk-panel sk-rise overflow-x-auto" style={{ animationDelay: "160ms" }}>
            <div className="min-w-[800px]">
              {/* Header row */}
              <div className="grid border-b border-muted" style={{ gridTemplateColumns: `80px repeat(${visibleDays.length}, 1fr)` }}>
                <div className="flex items-center justify-center p-3">
                  <Clock className="w-4 h-4 text-ink-subtle" />
                </div>
                {visibleDays.map((day) => {
                  const isOff = weekendDays.includes(day.num);
                  return (
                    <div key={day.num} className={`flex flex-col items-center justify-center py-3 border-s border-muted ${isOff ? "opacity-50 bg-muted/70" : ""}`}>
                      <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{day.short}</span>
                      <span className="text-2xs font-medium text-ink-subtle mt-0.5">{day.full}</span>
                      {isOff && (
                        <span className="mt-0.5 rounded bg-status-error-surface px-1 py-px text-3xs font-semibold uppercase text-status-error-text">Off</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Period rows */}
              {periods.map((period) => {
                const isSpecial = period.type !== "CLASS";
                const specialStyle = SLOT_TYPE_STYLES[period.type];

                return (
                  <div
                    key={period.num}
                    className={`grid border-b border-muted last:border-b-0 transition-colors ${
                      isSpecial ? specialStyle?.bg || "bg-muted" : "hover:bg-brand-50/20"
                    }`}
                    style={{ gridTemplateColumns: `80px repeat(${visibleDays.length}, 1fr)` }}
                  >
                    {/* Time column */}
                    <div className="flex flex-col items-center justify-center p-2 border-e border-muted">
                      <span className="text-2xs font-bold text-primary">P{period.num}</span>
                      <span className="text-2xs font-medium tabular-nums text-ink-subtle mt-0.5">
                        {period.start}
                      </span>
                      <span className="text-3xs font-semibold text-ink-subtle">
                        {period.end}
                      </span>
                    </div>

                    {/* Day cells */}
                    {visibleDays.map((day) => {
                      const isOff = weekendDays.includes(day.num);
                      const offCls = isOff ? "opacity-40 bg-muted/70" : "";
                      const slot = getSlot(day.num, period.num);
                      if (!slot) return <div key={day.num} className={`border-s border-muted p-1 ${offCls}`} />;

                      const effectiveType = pendingChanges.get(slot.id)?.slotType || slot.slotType;

                      if (effectiveType !== "CLASS") {
                        const style = SLOT_TYPE_STYLES[effectiveType];
                        return (
                          <div
                            key={day.num}
                            className={`border-s border-muted flex items-center justify-center p-1 cursor-pointer hover:bg-surface-hover transition-colors ${offCls}`}
                            onClick={() => setEditingSlot(slot)} role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditingSlot(slot); } }}
                          >
                            <span className={`text-2xs font-bold ${style?.text || "text-ink-subtle"}`}>
                              {style?.label || effectiveType}
                            </span>
                          </div>
                        );
                      }

                      const effectiveSubjectId = pendingChanges.get(slot.id)?.subjectId !== undefined
                        ? pendingChanges.get(slot.id)?.subjectId
                        : slot.subjectId;
                      const effectiveTeacherId = pendingChanges.get(slot.id)?.teacherId !== undefined
                        ? pendingChanges.get(slot.id)?.teacherId
                        : slot.teacherId;
                      const effectiveRoomId = pendingChanges.get(slot.id)?.roomId !== undefined
                        ? pendingChanges.get(slot.id)?.roomId
                        : slot.roomId;

                      const subjectName = effectiveSubjectId
                        ? subjects.find((s) => s.id === effectiveSubjectId)?.name
                        : null;
                      const teacherName = effectiveTeacherId
                        ? teachers.find((t) => t.id === effectiveTeacherId)?.fullName
                        : null;
                      const roomName = effectiveRoomId
                        ? rooms.find((r) => r.id === effectiveRoomId)?.roomNumber
                        : null;
                      const color = effectiveSubjectId ? subjectColorMap.get(effectiveSubjectId) : null;
                      const hasChange = pendingChanges.has(slot.id);

                      return (
                        <div
                          key={day.num}
                          className={`border-s border-muted p-1 cursor-pointer group transition-all hover:bg-surface-hover ${offCls}`}
                          onClick={() => setEditingSlot(slot)} role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditingSlot(slot); } }}
                        >
                          {subjectName ? (
                            <div className={`h-full rounded-xl ${color?.bg || "bg-surface-subtle"}  ${color?.border || "border-border-subtle"} border p-2 flex flex-col justify-between transition-shadow group-hover:shadow-md ${hasChange ? "ring-2 ring-status-warning-border" : ""}`}>
                              <div>
                                <p className={`text-2xs font-bold leading-tight ${color?.text || "text-ink-muted"}`}>
                                  {subjectName}
                                </p>
                                {teacherName && (
                                  <p className="text-3xs font-semibold text-ink-subtle mt-1 flex items-center gap-0.5">
                                    <User className="w-2.5 h-2.5" />{teacherName}
                                  </p>
                                )}
                                {roomName && (
                                  <p className="text-3xs font-semibold text-ink-subtle mt-0.5 flex items-center gap-0.5">
                                    <DoorOpen className="w-2.5 h-2.5" />{roomName}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="h-full rounded-xl border border-dashed border-edge/20 flex items-center justify-center transition-all group-hover:border-primary/30 group-hover:bg-brand-50/30">
                              <Plus className="w-3.5 h-3.5 text-ink-subtle group-hover:text-primary/40 transition-colors" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </>
      )}
      </>
      )}

      {/* Print-only routine (class-wise or teacher-wise) */}
      <div id="routine-print-root">
        {activeTimetable && viewMode === "class" ? (
          <RoutinePrintGrid
            title={`${activeTimetable.class.name}${activeTimetable.class.section ? ` - ${activeTimetable.class.section}` : ""} — Weekly Timetable ${activeTimetable.academicYear} (${activeTimetable.term})`}
            periods={periods}
            days={visibleDays}
            cells={visibleDays.map((day) => periods.map((period) => {
              const s = getSlot(day.num, period.num);
              if (!s) return null;
              return {
                label: s.subject?.name || "",
                sub: [s.teacher?.fullName, (s.room?.roomNumber || s.roomNumber) || ""].filter(Boolean).join(" · "),
                type: s.slotType,
              };
            }))}
          />
        ) : null}
        {selectedTeacherId && viewMode === "teacher" ? (
          <RoutinePrintGrid
            title={`${teachers.find((t) => t.id === selectedTeacherId)?.fullName || "Teacher"} — Weekly Routine`}
            periods={periods}
            days={visibleDays}
            cells={visibleDays.map((day) => periods.map((period) => {
              const slotInfo = selectedTeacherSlots.find((s) => s.day === day.num && s.period === period.num);
              if (!slotInfo) return null;
              return { label: slotInfo.subject, sub: slotInfo.classLabel, type: "CLASS" };
            }))}
          />
        ) : null}
      </div>
      <style>{`
        @media screen { #routine-print-root { display: none; } }
        @media print {
          body * { visibility: hidden; }
          #routine-print-root, #routine-print-root * { visibility: visible; }
          #routine-print-root { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
        }
      `}</style>

      {periodReview && activeTimetable && <PeriodChangeReview clearing={planPeriodChanges(activeTimetable.slots, periodReview).clearing} onCancel={() => { setCustomPeriods(periodReview); setPeriodReview(null); setShowPeriodConfig(true); }} onConfirm={async () => { const saved = await savePeriodConfig(periodReview); if (saved) setPeriodReview(null); return saved; }} />}

      {/* Period Config Modal */}
      {showPeriodConfig && (
        <PeriodConfigModal
          periods={customPeriods}
          isNew={!activeTimetable}
          onSave={(updated) => {
            if (!activeTimetable) {
              handleCreateTimetable(updated);
            } else {
              handleSavePeriodConfig(updated);
            }
            setShowPeriodConfig(false);
          }}
          onClose={() => setShowPeriodConfig(false)}
        />
      )}

      {/* Slot Editor Modal */}
      {editingSlot && (
        <SlotEditorModal
          slot={editingSlot}
          pendingChange={pendingChanges.get(editingSlot.id)}
          subjects={subjects}
          teachers={teachers}
          rooms={rooms}
          onSave={(updates) => {
            handleSlotUpdate(editingSlot.id, updates);
            setEditingSlot(null);
          }}
          onClose={() => setEditingSlot(null)}
        />
      )}
    </div>
  );
}

// ─── Period Config Modal ──────────────────────────────────
function PeriodConfigModal({
  periods,
  isNew,
  onSave,
  onClose,
}: {
  periods: { period: number; start: string; end: string; type: string }[];
  isNew: boolean;
  onSave: (periods: { period: number; start: string; end: string; type: string }[]) => void;
  onClose: () => void;
}) {
  const [localPeriods, setLocalPeriods] = useState(periods.length > 0 ? periods : [
    { period: 1, start: "08:00", end: "08:40", type: "CLASS" },
    { period: 2, start: "08:40", end: "09:20", type: "CLASS" },
    { period: 3, start: "09:20", end: "10:00", type: "CLASS" },
    { period: 4, start: "10:00", end: "10:20", type: "BREAK" },
    { period: 5, start: "10:20", end: "11:00", type: "CLASS" },
    { period: 6, start: "11:00", end: "11:40", type: "CLASS" },
    { period: 7, start: "11:40", end: "12:10", type: "PRAYER" },
    { period: 8, start: "12:10", end: "12:50", type: "CLASS" },
  ]);

  const updatePeriod = (index: number, field: string, value: string) => {
    setLocalPeriods((prev) => {
      const next = prev.map((p, i) => (i === index ? { ...p, [field]: value } : p));
      return next;
    });
  };

  const addPeriod = () => {
    const last = localPeriods[localPeriods.length - 1];
    const newNum = last ? last.period + 1 : 1;
    const newStart = last ? last.end : "08:00";
    const [h, m] = newStart.split(":").map(Number);
    const totalMinutes = h * 60 + m + 40;
    const newEnd = `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
    setLocalPeriods((prev) => [...prev, { period: newNum, start: newStart, end: newEnd, type: "CLASS" }]);
  };

  const removePeriod = (index: number) => {
    setLocalPeriods((prev) => {
      const next = prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, period: i + 1 }));
      return next;
    });
  };

  return (
    <Modal
      title="Configure Periods"
      eyebrow="Timetable Setup"
      subtitle="Set start/end times and types for each period."
      icon={Clock}
      size="sm"
      onClose={onClose}
      footer={
        <ModalActions
          actionLabel={isNew ? "Create Timetable" : "Save Periods"}
          onCancel={onClose}
          onAction={() => onSave(localPeriods)}
        />
      }
    >
        {/* The list used to carry its own `max-h-[60vh] overflow-y-auto`, which
            nested a scroller inside the dialog's scroller — two scrollbars, and
            a wheel gesture that stalled at the inner edge. The dialog body is
            the only thing that scrolls now. */}
        <div className="space-y-3 pe-1">
          {localPeriods.map((p, i) => (
            <div key={i} className="flex items-center gap-2 rounded-2xl bg-muted p-3">
              <span className="w-6 text-center text-2xs font-bold text-primary">P{p.period}</span>
              <SystemInput
                type="time"
                value={p.start}
                onChange={(e) => updatePeriod(i, "start", e.target.value)}
                className="w-28 px-3 py-2"
              />
              <span className="text-2xs font-bold text-ink-subtle">to</span>
              <SystemInput
                type="time"
                value={p.end}
                onChange={(e) => updatePeriod(i, "end", e.target.value)}
                className="w-28 px-3 py-2"
              />
              <SystemSelect
                value={p.type}
                onChange={(e) => updatePeriod(i, "type", e.target.value)}
                className="flex-1 px-3 py-2"
              >
                <option value="CLASS">Class</option>
                <option value="BREAK">Break</option>
                <option value="PRAYER">Prayer</option>
                <option value="ASSEMBLY">Assembly</option>
                <option value="ACTIVITY">Activity</option>
              </SystemSelect>
              <Button variant="destructive" size="icon"
                type="button"
                onClick={() => removePeriod(i)}
                className="flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm"
            type="button"
            onClick={addPeriod}
            className="flex w-full items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />Add Period
          </Button>
        </div>

    </Modal>
  );
}

// ─── Slot Editor Modal ────────────────────────────────────
function SlotEditorModal({
  slot,
  pendingChange,
  subjects,
  teachers,
  rooms,
  onSave,
  onClose,
}: {
  slot: SlotData;
  pendingChange?: Partial<SlotData>;
  subjects: SubjectOption[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
  onSave: (updates: Partial<SlotData>) => void;
  onClose: () => void;
}) {
  const current = {
    subjectId: pendingChange?.subjectId !== undefined ? pendingChange.subjectId : slot.subjectId,
    teacherId: pendingChange?.teacherId !== undefined ? pendingChange.teacherId : slot.teacherId,
    roomId: pendingChange?.roomId !== undefined ? pendingChange.roomId : slot.roomId,
    slotType: pendingChange?.slotType !== undefined ? pendingChange.slotType : slot.slotType,
  };

  const [subjectId, setSubjectId] = useState(current.subjectId || "");
  const [teacherId, setTeacherId] = useState(current.teacherId || "");
  const [roomId, setRoomId] = useState(current.roomId || "");
  const [slotType, setSlotType] = useState(current.slotType);

  const dayName = DAYS.find((d) => d.num === slot.dayOfWeek)?.full || "";

  useEffect(() => {
    if (subjectId) {
      const sub = subjects.find((s) => s.id === subjectId);
      if (sub?.teacherId && !teacherId) {
        setTeacherId(sub.teacherId);
      }
    }
  }, [subjectId, subjects, teacherId]);

  const selectedRoom = rooms.find((r) => r.id === roomId);

  const handleSave = () => {
    if (slotType !== "CLASS") {
      onSave({ slotType, subjectId: null, teacherId: null, roomId: null, roomNumber: null });
    } else {
      const room = rooms.find((r) => r.id === roomId);
      onSave({
        slotType: "CLASS",
        subjectId: subjectId || null,
        teacherId: teacherId || null,
        roomId: roomId || null,
        roomNumber: room?.roomNumber || null,
      });
    }
  };

  const handleClear = () => {
    onSave({ subjectId: null, teacherId: null, roomId: null, roomNumber: null, slotType: "CLASS" });
  };

  return (
    <Modal
      title={`${dayName} — Period ${slot.periodNumber}`}
      eyebrow="Edit Slot"
      subtitle={`${slot.startTime} – ${slot.endTime}`}
      icon={Pencil}
      size="xs"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="destructive" size="sm"
            type="button"
            onClick={handleClear}
            className="flex justify-start items-center gap-1.5"
          >
            <X className="w-3 h-3" />Clear
          </Button>
          <Button variant="default" size="sm"
            type="button"
            onClick={handleSave}
            className="flex justify-start items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />Apply
          </Button>
        </div>
      }
    >

        <div className="space-y-4">
          <div>
            <label className="text-2xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5 block">Slot Type</label>
            <div className="flex gap-1 rounded-2xl bg-muted p-1">
              {["CLASS", "BREAK", "PRAYER", "ASSEMBLY", "ACTIVITY"].map((type) => (
                <Button aria-pressed={slotType === type} variant="choice" size="sm"
                  key={type}
                  type="button"
                  onClick={() => setSlotType(type)}
                  className="flex-1"
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          {slotType === "CLASS" && (
            <>
              <div>
                <label className="text-2xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5 block">Subject</label>
                <SystemSelect
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="w-full px-4 py-2.5"
                >
                  <option value="">— No subject —</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </SystemSelect>
              </div>

              <div>
                <label className="text-2xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5 block">Teacher</label>
                <SystemSelect
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  className="w-full px-4 py-2.5"
                >
                  <option value="">— No teacher —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.fullName}</option>
                  ))}
                </SystemSelect>
              </div>

              <div>
                <label className="text-2xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5 block">Room (Optional)</label>
                <SystemSelect
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full px-4 py-2.5"
                >
                  <option value="">— No room —</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roomNumber}{r.capacity > 0 ? ` (${r.capacity} seats)` : ""}
                    </option>
                  ))}
                </SystemSelect>
                {selectedRoom && selectedRoom.capacity > 0 && (
                  <p className="mt-1.5 text-2xs font-semibold text-ink-subtle">
                    Room capacity is {selectedRoom.capacity} — assigned classes should not exceed this (warning only).
                  </p>
                )}
              </div>
            </>
          )}
        </div>
    </Modal>
  );
}

// ─── Print Grid (class-wise / teacher-wise routine) ───────
function RoutinePrintGrid({
  title,
  periods,
  days,
  cells,
}: {
  title: string;
  periods: { num: number; start: string; end: string; type: string }[];
  days: { num: number; short: string; full: string }[];
  cells: ({ label: string; sub: string; type: string } | null)[][];
}) {
  return (
    <div className="routine-print">
      <style>{`
        .routine-print { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; }
        .routine-print h2 { font-size: 16px; font-weight: 800; margin: 0 0 12px; }
        .routine-print table { width: 100%; border-collapse: collapse; }
        .routine-print th, .routine-print td { border: 1px solid #ccc; padding: 6px 8px; font-size: 11px; text-align: center; vertical-align: top; }
        .routine-print th { background: #f2eef5; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
        .routine-print td.time { font-weight: 800; font-size: 10px; white-space: nowrap; }
        .routine-print .cell { font-weight: 700; }
        .routine-print .sub { font-weight: 400; color: #555; font-size: 9px; }
        .routine-print .special { background: #f7f7f9; color: #666; font-style: italic; }
      `}</style>
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: "90px" }}>Time</th>
            {days.map((d) => (
              <th key={d.num}>{d.short}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period, pi) => (
            <tr key={period.num}>
              <td className="time">P{period.num}<br />{period.start}–{period.end}</td>
              {cells.map((col, di) => {
                const cell = col[pi];
                if (!cell) return <td key={di} />;
                const isSpecial = cell.type !== "CLASS";
                return (
                  <td key={di} className={isSpecial ? "special" : undefined}>
                    <div className="cell">{cell.label || (isSpecial ? cell.type : "")}</div>
                    {cell.sub ? <div className="sub">{cell.sub}</div> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────
function EmptyStateCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="sk-rise flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-[28px] bg-brand-50 flex items-center justify-center mb-5">
        <Icon className="w-8 h-8 text-primary/30" />
      </div>
      <h3 className="text-lg font-bold text-ink-strong">{title}</h3>
      <p className="mt-2 text-sm font-semibold text-ink-muted max-w-sm">{description}</p>
    </div>
  );
}

// ─── Read-Only Timetable View (for teacher/student/parent) ─
export function TimetableReadOnly({ slots, title, weekendDays = [] }: {
  slots: Array<{
    dayOfWeek: number;
    periodNumber: number;
    startTime: string;
    endTime: string;
    slotType: string;
    subject: { name: string } | null;
    className?: string;
    classSection?: string | null;
    roomNumber: string | null;
    teacher?: { fullName: string } | null;
  }>;
  title?: string;
  weekendDays?: number[];
}) {
  // Render only the campus's working days so a 5-day calendar hides Saturday.
  const visibleDays = useMemo(
    () => DAYS.filter((d) => !weekendDays.includes(d.num)),
    [weekendDays],
  );

  const periods = useMemo(() => {
    const seen = new Map<number, { start: string; end: string; type: string }>();
    for (const s of slots) {
      if (!seen.has(s.periodNumber)) {
        seen.set(s.periodNumber, { start: s.startTime, end: s.endTime, type: s.slotType });
      }
    }
    return [...seen.entries()].sort(([a], [b]) => a - b).map(([num, v]) => ({ num, ...v }));
  }, [slots]);

  const subjectNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of slots) {
      if (s.subject?.name) names.add(s.subject.name);
    }
    return [...names];
  }, [slots]);

  const subjectColorMap = useMemo(() => {
    const m = new Map<string, typeof SUBJECT_COLORS[0]>();
    subjectNames.forEach((name, i) => m.set(name, SUBJECT_COLORS[i % SUBJECT_COLORS.length]));
    return m;
  }, [subjectNames]);

  const getSlot = (day: number, period: number) => {
    return slots.find((s) => s.dayOfWeek === day && s.periodNumber === period);
  };

  if (slots.length === 0) {
    return (
      <EmptyStateCard
        icon={Calendar}
        title="No Timetable Available"
        description="The timetable hasn't been published yet. Check back later."
      />
    );
  }

  return (
    <div className="space-y-4">
      {title && (
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-brand-50 flex items-center justify-center">
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold text-ink-strong">{title}</h3>
        </div>
      )}

      {/* Subject legend */}
      <div className="flex flex-wrap gap-1.5">
        {subjectNames.map((name) => {
          const c = subjectColorMap.get(name);
          return (
            <span key={name} className={`flex items-center gap-1 rounded-lg ${c?.bg || "bg-surface-subtle"} px-2 py-1`}>
              <span className={`h-1.5 w-1.5 rounded-full ${c?.dot || "bg-ink-faint"}`} />
              <span className={`text-2xs font-bold ${c?.text || "text-ink-muted"}`}>{name}</span>
            </span>
          );
        })}
      </div>

      <div className="sk-panel overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid border-b border-muted" style={{ gridTemplateColumns: `70px repeat(${visibleDays.length}, 1fr)` }}>
            <div className="flex items-center justify-center p-2">
              <Clock className="w-3.5 h-3.5 text-ink-subtle" />
            </div>
            {visibleDays.map((day) => (
              <div key={day.num} className="flex items-center justify-center py-2.5 border-s border-muted">
                <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{day.short}</span>
              </div>
            ))}
          </div>

          {periods.map((period) => {
            const isSpecial = period.type !== "CLASS";
            const specialStyle = SLOT_TYPE_STYLES[period.type];

            return (
              <div
                key={period.num}
                className={`grid border-b border-muted last:border-b-0 ${isSpecial ? specialStyle?.bg || "bg-muted" : ""}`}
                style={{ gridTemplateColumns: `70px repeat(${visibleDays.length}, 1fr)` }}
              >
                <div className="flex flex-col items-center justify-center p-1.5 border-e border-muted">
                  <span className="text-2xs font-bold text-primary">P{period.num}</span>
                  <span className="text-2xs font-medium tabular-nums text-ink-subtle">{period.start}</span>
                </div>
                {visibleDays.map((day) => {
                  const slot = getSlot(day.num, period.num);
                  if (!slot) return <div key={day.num} className="border-s border-muted p-1" />;

                  if (slot.slotType !== "CLASS") {
                    const style = SLOT_TYPE_STYLES[slot.slotType];
                    return (
                      <div key={day.num} className="border-s border-muted flex items-center justify-center p-1">
                        <span className={`text-3xs font-bold ${style?.text || "text-ink-subtle"}`}>
                          {style?.label || slot.slotType}
                        </span>
                      </div>
                    );
                  }

                  const color = slot.subject?.name ? subjectColorMap.get(slot.subject.name) : null;

                  return (
                    <div key={day.num} className="border-s border-muted p-1">
                      {slot.subject ? (
                        <div className={`h-full rounded-lg ${color?.bg || "bg-surface-subtle"}  ${color?.border || "border-border-subtle"} border p-1.5`}>
                          <p className={`text-2xs font-bold leading-tight ${color?.text || "text-ink-muted"}`}>
                            {slot.subject.name}
                          </p>
                          {slot.className && (
                            <p className="text-3xs font-semibold text-ink-subtle mt-0.5">
                              {slot.className}{slot.classSection ? ` - ${slot.classSection}` : ""}
                            </p>
                          )}
                          {slot.teacher && (
                            <p className="text-3xs font-semibold text-ink-subtle mt-0.5">
                              {slot.teacher.fullName}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="h-full rounded-lg border border-dashed border-edge/15 flex items-center justify-center">
                          <span className="text-3xs font-semibold text-ink-subtle">—</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
