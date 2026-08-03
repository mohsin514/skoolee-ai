"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BookOpen, Calendar, Check, ChevronDown,
  Clock, GraduationCap, Loader2, Plus, Send, Trash2, User, X,
} from "lucide-react";
import { toast } from "sonner";

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
  subject: { id: string; name: string } | null;
  teacher: { id: string; fullName: string } | null;
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

const DAYS = [
  { num: 1, short: "Mon", full: "Monday" },
  { num: 2, short: "Tue", full: "Tuesday" },
  { num: 3, short: "Wed", full: "Wednesday" },
  { num: 4, short: "Thu", full: "Thursday" },
  { num: 5, short: "Fri", full: "Friday" },
  { num: 6, short: "Sat", full: "Saturday" },
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
  BREAK: { bg: "bg-[#f3f4f9]", text: "text-[#4d4354]/50", label: "Break" },
  PRAYER: { bg: "bg-amber-50/80", text: "text-amber-600/60", label: "Prayer / Namaz" },
  ASSEMBLY: { bg: "bg-blue-50/80", text: "text-blue-600/60", label: "Assembly" },
  ACTIVITY: { bg: "bg-emerald-50/80", text: "text-emerald-600/60", label: "Activity" },
};

export function TimetablePanel({ campusId }: { campusId?: string }) {
  const [timetables, setTimetables] = useState<TimetableData[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
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

  const qp = campusId ? `?campusId=${campusId}` : "";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ttRes, classRes, teacherRes] = await Promise.all([
        fetch(`/api/timetable${qp}`),
        fetch(`/api/classes${qp}`),
        fetch(`/api/staff${qp}`),
      ]);
      const [ttJson, classJson, teacherJson] = await Promise.all([
        ttRes.json(), classRes.json(), teacherRes.json(),
      ]);

      if (ttJson.success) setTimetables(ttJson.data);
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
      toast.error("Failed to load timetable data");
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { loadData(); }, [loadData]);

  const activeTimetable = useMemo(() => {
    if (!selectedClassId) return null;
    return timetables.find((t) => t.classId === selectedClassId) || null;
  }, [timetables, selectedClassId]);

  useEffect(() => {
    if (!selectedClassId || !activeTimetable) return;
    fetch(`/api/subjects?classId=${selectedClassId}${campusId ? `&campusId=${campusId}` : ""}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success || Array.isArray(j.data)) setSubjects(j.data || []);
      })
      .catch(() => {});
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

  const periods = useMemo(() => {
    if (!activeTimetable) return [];
    const seen = new Map<number, { start: string; end: string; type: string }>();
    for (const s of activeTimetable.slots) {
      if (!seen.has(s.periodNumber)) {
        seen.set(s.periodNumber, { start: s.startTime, end: s.endTime, type: s.slotType });
      }
    }
    return [...seen.entries()]
      .sort(([a], [b]) => a - b)
      .map(([num, v]) => ({ num, ...v }));
  }, [activeTimetable]);

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

  const handleCreateTimetable = async (periods?: typeof defaultPeriods) => {
    if (!selectedClassId) return;
    setCreating(true);
    try {
      const cls = classes.find((c) => c.id === selectedClassId);
      const res = await fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClassId,
          academicYear: cls?.academicYear || new Date().getFullYear(),
          periods: periods || defaultPeriods,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Timetable created!");
        setCustomPeriods([]);
        await loadData();
      } else {
        toast.error(json.error || "Failed to create");
      }
    } catch {
      toast.error("Failed to create timetable");
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
        toast.success("Timetable saved!");
        setPendingChanges(new Map());
        await loadData();
      } else if (json.conflicts) {
        json.conflicts.forEach((c: string) => toast.error(c));
      } else {
        toast.error(json.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save timetable");
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
        toast.success(action === "publish" ? "Timetable published! Teachers and students can now see it." : "Timetable unpublished");
        await loadData();
      } else {
        toast.error(json.error || "Failed");
      }
    } catch {
      toast.error("Action failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleSavePeriodConfig = async (periods: { period: number; start: string; end: string; type: string }[]) => {
    if (!activeTimetable) return;
    setSaving(true);
    try {
      const slotUpdates = activeTimetable.slots.map((s) => {
        const cfg = periods.find((p) => p.period === s.periodNumber);
        return {
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          periodNumber: s.periodNumber,
          startTime: cfg?.start || s.startTime,
          endTime: cfg?.end || s.endTime,
          slotType: cfg?.type || s.slotType,
          subjectId: s.subjectId,
          teacherId: s.teacherId,
          roomNumber: s.roomNumber,
        };
      });
      const res = await fetch(`/api/timetable/${activeTimetable.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: slotUpdates }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Period config saved!");
        await loadData();
      } else {
        toast.error(json.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save period config");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTimetable = async () => {
    if (!activeTimetable) return;
    if (!confirm("Delete this timetable? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/timetable/${activeTimetable.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success("Timetable deleted");
        await loadData();
      } else {
        toast.error(json.error || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  const teacherSlotMap = useMemo(() => {
    const map = new Map<string, { classLabel: string; day: number; period: number; subject: string; start: string; end: string }[]>();
    for (const tt of timetables) {
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
  }, [timetables]);

  const selectedTeacherSlots = selectedTeacherId ? teacherSlotMap.get(selectedTeacherId) || [] : [];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1 w-fit animate-skeleton-in">
          <div className="h-9 w-24 rounded-xl bg-[#e8e0ec]/50 skeleton-shimmer" />
          <div className="h-9 w-28 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1 overflow-x-auto animate-skeleton-in" style={{ animationDelay: "80ms" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-20 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
          ))}
        </div>
        <div className="rounded-[28px] border border-[#cfc2d6]/10 bg-white shadow-xl p-4 animate-skeleton-in" style={{ animationDelay: "160ms" }}>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-16 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j} className="h-10 flex-1 rounded-xl bg-[#e8e0ec]/30 skeleton-shimmer" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* View mode tabs */}
      <div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1 w-fit">
        <button
          type="button"
          onClick={() => setViewMode("class")}
          className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
            viewMode === "class" ? "bg-white text-[#8127cf] shadow-sm" : "text-[#4d4354]/50 hover:text-[#8127cf]"
          }`}
        >
          <Calendar className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Class View
        </button>
        <button
          type="button"
          onClick={() => setViewMode("teacher")}
          className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
            viewMode === "teacher" ? "bg-white text-[#8127cf] shadow-sm" : "text-[#4d4354]/50 hover:text-[#8127cf]"
          }`}
        >
          <User className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Teacher View
        </button>
      </div>

      {viewMode === "teacher" ? (
        <>
          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="h-11 rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 pr-10 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 appearance-none cursor-pointer"
              >
                <option value="">— Select teacher —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.fullName}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4d4354]/40 pointer-events-none" />
            </div>
            {selectedTeacherId && (
              <span className="text-[10px] font-bold text-[#4d4354]/50">
                {selectedTeacherSlots.length} slot{selectedTeacherSlots.length !== 1 ? "s" : ""} assigned
              </span>
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
            <div className="overflow-x-auto rounded-[28px] border border-[#cfc2d6]/10 bg-white shadow-xl">
              <div className="min-w-[800px]">
                <div className="grid border-b border-[#f3f4f9]" style={{ gridTemplateColumns: `80px repeat(${DAYS.length}, 1fr)` }}>
                  <div className="flex items-center justify-center p-3">
                    <Clock className="w-4 h-4 text-[#4d4354]/30" />
                  </div>
                  {DAYS.map((day) => (
                    <div key={day.num} className="flex flex-col items-center justify-center py-3 border-l border-[#f3f4f9]">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/30">{day.short}</span>
                      <span className="text-[8px] font-bold text-[#4d4354]/20 mt-0.5">{day.full}</span>
                    </div>
                  ))}
                </div>

                {periods.length > 0 ? periods.map((period) => (
                  <div key={period.num} className="grid border-b border-[#f3f4f9] last:border-b-0" style={{ gridTemplateColumns: `80px repeat(${DAYS.length}, 1fr)` }}>
                    <div className="flex flex-col items-center justify-center p-2 border-r border-[#f3f4f9]">
                      <span className="text-[10px] font-black text-[#8127cf]">P{period.num}</span>
                      <span className="text-[8px] font-bold text-[#4d4354]/30 mt-0.5">{period.start}</span>
                    </div>
                    {DAYS.map((day) => {
                      const slotInfo = selectedTeacherSlots.find((s) => s.day === day.num && s.period === period.num);
                      const isConflict = selectedTeacherSlots.filter((s) => s.day === day.num && s.period === period.num).length > 1;
                      return (
                        <div key={day.num} className="border-l border-[#f3f4f9] p-1">
                          {slotInfo ? (
                            <div className={`h-full rounded-xl p-2 flex flex-col justify-center ${isConflict ? "bg-rose-100 border border-rose-300" : "bg-emerald-50 border border-emerald-200"}`}>
                              <p className={`text-[10px] font-black leading-tight ${isConflict ? "text-rose-700" : "text-emerald-700"}`}>
                                {slotInfo.subject}
                              </p>
                              <p className="text-[8px] font-semibold text-[#4d4354]/50 mt-0.5">
                                {slotInfo.classLabel}
                              </p>
                              {isConflict && (
                                <span className="text-[7px] font-black uppercase text-rose-600 mt-0.5">CONFLICT</span>
                              )}
                            </div>
                          ) : (
                            <div className="h-full rounded-xl border border-dashed border-[#cfc2d6]/15 flex items-center justify-center">
                              <span className="text-[8px] font-semibold text-[#4d4354]/15">—</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )) : (
                  <div className="flex items-center justify-center py-16 text-sm font-semibold text-[#4d4354]/40">
                    No timetable periods found. Create timetables for classes first.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
      {/* Class selector bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1 overflow-x-auto">
          {classes.map((cls) => {
            const hasTimetable = timetables.some((t) => t.classId === cls.id);
            const isPublished = timetables.find((t) => t.classId === cls.id)?.status === "PUBLISHED";
            return (
              <button
                key={cls.id}
                type="button"
                onClick={() => setSelectedClassId(cls.id)}
                className={`relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  selectedClassId === cls.id
                    ? "bg-white text-[#8127cf] shadow-sm"
                    : "text-[#4d4354]/50 hover:text-[#8127cf]"
                }`}
              >
                {cls.name}{cls.section ? ` - ${cls.section}` : ""}
                {hasTimetable && (
                  <span className={`ml-1 h-1.5 w-1.5 rounded-full ${isPublished ? "bg-emerald-500" : "bg-amber-400"}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {!selectedClassId && (
        <EmptyStateCard
          icon={Calendar}
          title="Select a Class"
          description="Choose a class above to view or create its weekly timetable"
        />
      )}

      {selectedClassId && !activeTimetable && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-20 w-20 rounded-[32px] bg-gradient-to-br from-[#8127cf]/10 to-[#fbf0fe] flex items-center justify-center mb-6">
            <Calendar className="w-10 h-10 text-[#8127cf]/40" />
          </div>
          <h3 className="text-lg font-black text-[#1f1a23] mb-2">No Timetable Yet</h3>
          <p className="text-sm text-[#4d4354]/50 mb-8 max-w-sm text-center">
            Create a weekly schedule for this class with configurable period timings (Mon-Sat)
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setCustomPeriods(defaultPeriods.map((p) => ({ ...p }))); setShowPeriodConfig(true); }}
              className="flex items-center gap-2 rounded-2xl border-2 border-[#8127cf]/20 bg-white px-6 py-3 text-sm font-black text-[#8127cf] transition-all hover:border-[#8127cf]/40 cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              Configure Periods
            </button>
            <button
              type="button"
              onClick={() => handleCreateTimetable()}
              disabled={creating}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] px-6 py-3 text-sm font-black text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl hover:shadow-[#8127cf]/30 cursor-pointer disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Quick Create (Default)
            </button>
          </div>
        </div>
      )}

      {selectedClassId && activeTimetable && (
        <>
          {/* Action bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${
                activeTimetable.status === "PUBLISHED"
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-amber-50 text-amber-600"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  activeTimetable.status === "PUBLISHED" ? "bg-emerald-500" : "bg-amber-400"
                }`} />
                {activeTimetable.status}
              </div>
              {pendingChanges.size > 0 && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded-lg px-2 py-1">
                  {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const p = periods.map((pp) => ({ period: pp.num, start: pp.start, end: pp.end, type: pp.type }));
                  setCustomPeriods(p);
                  setShowPeriodConfig(true);
                }}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-[#f3f4f9] px-3 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/60 transition-all hover:bg-[#8127cf]/10 hover:text-[#8127cf] cursor-pointer"
              >
                <Clock className="h-3.5 w-3.5" />Periods
              </button>
              <button
                type="button"
                onClick={handleDeleteTimetable}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-rose-50 px-3 text-[10px] font-black uppercase tracking-wider text-rose-600 transition-all hover:bg-rose-100 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />Delete
              </button>
              {pendingChanges.size > 0 && (
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-[#8127cf] px-4 text-[10px] font-black uppercase tracking-wider text-white transition-all hover:bg-[#6a1fb0] cursor-pointer disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save Changes
                </button>
              )}
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className={`flex h-9 items-center gap-1.5 rounded-xl px-4 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 ${
                  activeTimetable.status === "PUBLISHED"
                    ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
                    : "bg-emerald-500 text-white hover:bg-emerald-600"
                }`}
              >
                {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {activeTimetable.status === "PUBLISHED" ? "Unpublish" : "Publish"}
              </button>
            </div>
          </div>

          {/* Subject legend */}
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => {
              const c = subjectColorMap.get(s.id);
              return (
                <div key={s.id} className={`flex items-center gap-1.5 rounded-xl ${c?.bg || "bg-gray-100"} px-3 py-1.5`}>
                  <span className={`h-2 w-2 rounded-full ${c?.dot || "bg-gray-400"}`} />
                  <span className={`text-[10px] font-black ${c?.text || "text-gray-600"}`}>{s.name}</span>
                  {s.teacher && (
                    <span className="text-[9px] font-semibold text-[#4d4354]/40 ml-1">({s.teacher.fullName})</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Timetable Grid */}
          <div className="overflow-x-auto rounded-[28px] border border-[#cfc2d6]/10 bg-white shadow-xl">
            <div className="min-w-[800px]">
              {/* Header row */}
              <div className="grid border-b border-[#f3f4f9]" style={{ gridTemplateColumns: `80px repeat(${DAYS.length}, 1fr)` }}>
                <div className="flex items-center justify-center p-3">
                  <Clock className="w-4 h-4 text-[#4d4354]/30" />
                </div>
                {DAYS.map((day) => (
                  <div key={day.num} className="flex flex-col items-center justify-center py-3 border-l border-[#f3f4f9]">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/30">{day.short}</span>
                    <span className="text-[8px] font-bold text-[#4d4354]/20 mt-0.5">{day.full}</span>
                  </div>
                ))}
              </div>

              {/* Period rows */}
              {periods.map((period) => {
                const isSpecial = period.type !== "CLASS";
                const specialStyle = SLOT_TYPE_STYLES[period.type];

                return (
                  <div
                    key={period.num}
                    className={`grid border-b border-[#f3f4f9] last:border-b-0 transition-colors ${
                      isSpecial ? specialStyle?.bg || "bg-[#f3f4f9]" : "hover:bg-[#fbf0fe]/20"
                    }`}
                    style={{ gridTemplateColumns: `80px repeat(${DAYS.length}, 1fr)` }}
                  >
                    {/* Time column */}
                    <div className="flex flex-col items-center justify-center p-2 border-r border-[#f3f4f9]">
                      <span className="text-[10px] font-black text-[#8127cf]">P{period.num}</span>
                      <span className="text-[8px] font-bold text-[#4d4354]/30 mt-0.5">
                        {period.start}
                      </span>
                      <span className="text-[7px] font-semibold text-[#4d4354]/20">
                        {period.end}
                      </span>
                    </div>

                    {/* Day cells */}
                    {DAYS.map((day) => {
                      const slot = getSlot(day.num, period.num);
                      if (!slot) return <div key={day.num} className="border-l border-[#f3f4f9] p-1" />;

                      const effectiveType = pendingChanges.get(slot.id)?.slotType || slot.slotType;

                      if (effectiveType !== "CLASS") {
                        const style = SLOT_TYPE_STYLES[effectiveType];
                        return (
                          <div
                            key={day.num}
                            className="border-l border-[#f3f4f9] flex items-center justify-center p-1 cursor-pointer"
                            onClick={() => setEditingSlot(slot)}
                          >
                            <span className={`text-[9px] font-bold ${style?.text || "text-[#4d4354]/40"}`}>
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

                      const subjectName = effectiveSubjectId
                        ? subjects.find((s) => s.id === effectiveSubjectId)?.name
                        : null;
                      const teacherName = effectiveTeacherId
                        ? teachers.find((t) => t.id === effectiveTeacherId)?.fullName
                        : null;
                      const color = effectiveSubjectId ? subjectColorMap.get(effectiveSubjectId) : null;
                      const hasChange = pendingChanges.has(slot.id);

                      return (
                        <div
                          key={day.num}
                          className={`border-l border-[#f3f4f9] p-1 cursor-pointer group transition-all`}
                          onClick={() => setEditingSlot(slot)}
                        >
                          {subjectName ? (
                            <div className={`h-full rounded-xl ${color?.bg || "bg-gray-50"} ${color?.border || "border-gray-200"} border p-2 flex flex-col justify-between transition-all group-hover:shadow-md group-hover:scale-[1.02] ${hasChange ? "ring-2 ring-amber-300" : ""}`}>
                              <div>
                                <p className={`text-[10px] font-black leading-tight ${color?.text || "text-gray-600"}`}>
                                  {subjectName}
                                </p>
                                {teacherName && (
                                  <p className="text-[8px] font-semibold text-[#4d4354]/40 mt-1 flex items-center gap-0.5">
                                    <User className="w-2.5 h-2.5" />{teacherName}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="h-full rounded-xl border border-dashed border-[#cfc2d6]/20 flex items-center justify-center transition-all group-hover:border-[#8127cf]/30 group-hover:bg-[#fbf0fe]/30">
                              <Plus className="w-3.5 h-3.5 text-[#4d4354]/15 group-hover:text-[#8127cf]/40 transition-colors" />
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
        </>
      )}
      </>
      )}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop-enter" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-[34px] bg-white p-8 shadow-2xl animate-modal-enter" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-6 top-6 rounded-xl p-2 text-[#4d4354]/40 hover:bg-[#f3f4f9] transition-colors cursor-pointer">
          <X className="w-4 h-4" />
        </button>

        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Timetable Setup</p>
          <h3 className="text-xl font-black text-[#1f1a23] mt-1">Configure Periods</h3>
          <p className="text-xs font-semibold text-[#4d4354]/40 mt-1">Set start/end times and types for each period</p>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
          {localPeriods.map((p, i) => (
            <div key={i} className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-3">
              <span className="w-6 text-center text-[10px] font-black text-[#8127cf]">P{p.period}</span>
              <input
                type="time"
                value={p.start}
                onChange={(e) => updatePeriod(i, "start", e.target.value)}
                className="w-28 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 py-2 text-xs font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
              />
              <span className="text-[10px] font-bold text-[#4d4354]/30">to</span>
              <input
                type="time"
                value={p.end}
                onChange={(e) => updatePeriod(i, "end", e.target.value)}
                className="w-28 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 py-2 text-xs font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
              />
              <select
                value={p.type}
                onChange={(e) => updatePeriod(i, "type", e.target.value)}
                className="flex-1 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 py-2 text-[10px] font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 cursor-pointer"
              >
                <option value="CLASS">Class</option>
                <option value="BREAK">Break</option>
                <option value="PRAYER">Prayer</option>
                <option value="ASSEMBLY">Assembly</option>
                <option value="ACTIVITY">Activity</option>
              </select>
              <button
                type="button"
                onClick={() => removePeriod(i)}
                className="h-8 w-8 rounded-xl bg-white flex items-center justify-center text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addPeriod}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#cfc2d6]/30 py-3 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/40 hover:border-[#8127cf]/30 hover:text-[#8127cf] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />Add Period
          </button>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#f3f4f9] px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/60 hover:bg-[#e8e0ec] transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(localPeriods)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-[#8127cf]/20 hover:shadow-xl transition-all cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />{isNew ? "Create Timetable" : "Save Periods"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Slot Editor Modal ────────────────────────────────────
function SlotEditorModal({
  slot,
  pendingChange,
  subjects,
  teachers,
  onSave,
  onClose,
}: {
  slot: SlotData;
  pendingChange?: Partial<SlotData>;
  subjects: SubjectOption[];
  teachers: TeacherOption[];
  onSave: (updates: Partial<SlotData>) => void;
  onClose: () => void;
}) {
  const current = {
    subjectId: pendingChange?.subjectId !== undefined ? pendingChange.subjectId : slot.subjectId,
    teacherId: pendingChange?.teacherId !== undefined ? pendingChange.teacherId : slot.teacherId,
    roomNumber: pendingChange?.roomNumber !== undefined ? pendingChange.roomNumber : slot.roomNumber,
    slotType: pendingChange?.slotType !== undefined ? pendingChange.slotType : slot.slotType,
  };

  const [subjectId, setSubjectId] = useState(current.subjectId || "");
  const [teacherId, setTeacherId] = useState(current.teacherId || "");
  const [roomNumber, setRoomNumber] = useState(current.roomNumber || "");
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

  const handleSave = () => {
    if (slotType !== "CLASS") {
      onSave({ slotType, subjectId: null, teacherId: null, roomNumber: null });
    } else {
      onSave({
        slotType: "CLASS",
        subjectId: subjectId || null,
        teacherId: teacherId || null,
        roomNumber: roomNumber || null,
      });
    }
  };

  const handleClear = () => {
    onSave({ subjectId: null, teacherId: null, roomNumber: null, slotType: "CLASS" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop-enter" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-[34px] bg-white p-8 shadow-2xl animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute right-6 top-6 rounded-xl p-2 text-[#4d4354]/40 hover:bg-[#f3f4f9] transition-colors cursor-pointer">
          <X className="w-4 h-4" />
        </button>

        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Edit Slot</p>
          <h3 className="text-xl font-black text-[#1f1a23] mt-1">{dayName} — Period {slot.periodNumber}</h3>
          <p className="text-xs font-semibold text-[#4d4354]/40 mt-1">{slot.startTime} – {slot.endTime}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50 mb-1.5 block">Slot Type</label>
            <div className="flex gap-1 rounded-2xl bg-[#f3f4f9] p-1">
              {["CLASS", "BREAK", "PRAYER", "ASSEMBLY", "ACTIVITY"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSlotType(type)}
                  className={`flex-1 rounded-xl px-2 py-1.5 text-[9px] font-black uppercase transition-all cursor-pointer ${
                    slotType === type
                      ? "bg-white text-[#8127cf] shadow-sm"
                      : "text-[#4d4354]/40 hover:text-[#8127cf]"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {slotType === "CLASS" && (
            <>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50 mb-1.5 block">Subject</label>
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 focus:ring-2 focus:ring-[#8127cf]/10 transition-all"
                >
                  <option value="">— No subject —</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50 mb-1.5 block">Teacher</label>
                <select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 focus:ring-2 focus:ring-[#8127cf]/10 transition-all"
                >
                  <option value="">— No teacher —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.fullName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50 mb-1.5 block">Room (Optional)</label>
                <input
                  type="text"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="e.g. Room 5A"
                  className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 focus:ring-2 focus:ring-[#8127cf]/10 transition-all"
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 rounded-xl bg-[#f3f4f9] px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/60 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
          >
            <X className="w-3 h-3" />Clear
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-[#8127cf]/20 hover:shadow-xl transition-all cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────
function EmptyStateCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-[28px] bg-[#fbf0fe] flex items-center justify-center mb-5">
        <Icon className="w-8 h-8 text-[#8127cf]/30" />
      </div>
      <h3 className="text-lg font-black text-[#1f1a23]">{title}</h3>
      <p className="mt-2 text-sm font-semibold text-[#4d4354]/50 max-w-sm">{description}</p>
    </div>
  );
}

// ─── Read-Only Timetable View (for teacher/student/parent) ─
export function TimetableReadOnly({ slots, title }: {
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
}) {
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
          <div className="h-8 w-8 rounded-xl bg-[#fbf0fe] flex items-center justify-center">
            <Calendar className="w-4 h-4 text-[#8127cf]" />
          </div>
          <h3 className="text-sm font-black text-[#1f1a23]">{title}</h3>
        </div>
      )}

      {/* Subject legend */}
      <div className="flex flex-wrap gap-1.5">
        {subjectNames.map((name) => {
          const c = subjectColorMap.get(name);
          return (
            <span key={name} className={`flex items-center gap-1 rounded-lg ${c?.bg || "bg-gray-100"} px-2 py-1`}>
              <span className={`h-1.5 w-1.5 rounded-full ${c?.dot || "bg-gray-400"}`} />
              <span className={`text-[9px] font-black ${c?.text || "text-gray-600"}`}>{name}</span>
            </span>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-[24px] border border-[#cfc2d6]/10 bg-white shadow-lg">
        <div className="min-w-[700px]">
          <div className="grid border-b border-[#f3f4f9]" style={{ gridTemplateColumns: `70px repeat(${DAYS.length}, 1fr)` }}>
            <div className="flex items-center justify-center p-2">
              <Clock className="w-3.5 h-3.5 text-[#4d4354]/25" />
            </div>
            {DAYS.map((day) => (
              <div key={day.num} className="flex items-center justify-center py-2.5 border-l border-[#f3f4f9]">
                <span className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/30">{day.short}</span>
              </div>
            ))}
          </div>

          {periods.map((period) => {
            const isSpecial = period.type !== "CLASS";
            const specialStyle = SLOT_TYPE_STYLES[period.type];

            return (
              <div
                key={period.num}
                className={`grid border-b border-[#f3f4f9] last:border-b-0 ${isSpecial ? specialStyle?.bg || "bg-[#f3f4f9]" : ""}`}
                style={{ gridTemplateColumns: `70px repeat(${DAYS.length}, 1fr)` }}
              >
                <div className="flex flex-col items-center justify-center p-1.5 border-r border-[#f3f4f9]">
                  <span className="text-[9px] font-black text-[#8127cf]">P{period.num}</span>
                  <span className="text-[7px] font-bold text-[#4d4354]/25">{period.start}</span>
                </div>
                {DAYS.map((day) => {
                  const slot = getSlot(day.num, period.num);
                  if (!slot) return <div key={day.num} className="border-l border-[#f3f4f9] p-1" />;

                  if (slot.slotType !== "CLASS") {
                    const style = SLOT_TYPE_STYLES[slot.slotType];
                    return (
                      <div key={day.num} className="border-l border-[#f3f4f9] flex items-center justify-center p-1">
                        <span className={`text-[8px] font-bold ${style?.text || "text-[#4d4354]/40"}`}>
                          {style?.label || slot.slotType}
                        </span>
                      </div>
                    );
                  }

                  const color = slot.subject?.name ? subjectColorMap.get(slot.subject.name) : null;

                  return (
                    <div key={day.num} className="border-l border-[#f3f4f9] p-1">
                      {slot.subject ? (
                        <div className={`h-full rounded-lg ${color?.bg || "bg-gray-50"} ${color?.border || "border-gray-200"} border p-1.5`}>
                          <p className={`text-[9px] font-black leading-tight ${color?.text || "text-gray-600"}`}>
                            {slot.subject.name}
                          </p>
                          {slot.className && (
                            <p className="text-[7px] font-semibold text-[#4d4354]/35 mt-0.5">
                              {slot.className}{slot.classSection ? ` - ${slot.classSection}` : ""}
                            </p>
                          )}
                          {slot.teacher && (
                            <p className="text-[7px] font-semibold text-[#4d4354]/30 mt-0.5">
                              {slot.teacher.fullName}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="h-full rounded-lg border border-dashed border-[#cfc2d6]/15 flex items-center justify-center">
                          <span className="text-[8px] font-semibold text-[#4d4354]/15">—</span>
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
