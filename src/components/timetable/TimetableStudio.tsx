"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BookOpen, Calendar, Check, ChevronDown,
  Clock, DoorOpen, GraduationCap, Loader2, Plus, Printer, Send, Trash2, User, X,
} from "lucide-react";
import { toast } from "sonner";

import { ConflictPanel } from "./ConflictPanel";
import { RoomView } from "./RoomView";
import { SubjectPalette } from "./SubjectPalette";
import { TeacherView } from "./TeacherView";
import { TimetableGrid } from "./TimetableGrid";

// ─── Exported shared types (imported by sub-components) ─────
export interface StudioSlot {
  id: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  slotType: string;
  subjectId: string | null;
  teacherId: string | null;
  roomId: string | null;
  roomNumber: string | null;
  subject?: { id: string; name: string } | null;
  teacher?: { id: string; fullName: string } | null;
  room?: { id: string; roomNumber: string; capacity: number } | null;
}

export interface GridDay {
  num: number;
  short: string;
  full: string;
}

export interface GridPeriod {
  num: number;
  start: string;
  end: string;
  type: string;
}

export interface RoomOption {
  id: string;
  roomNumber: string;
  capacity: number;
}

export interface SubjectOption {
  id: string;
  name: string;
  teacherId: string | null;
  teacher?: { id: string; fullName: string } | null;
}

export interface TeacherOption {
  id: string;
  fullName: string;
}

export interface SubjectColor {
  bg: string;
  border: string;
  text: string;
  dot: string;
}

export interface SlotChange {
  slotType?: string;
  subjectId?: string | null;
  teacherId?: string | null;
  roomId?: string | null;
  roomNumber?: string | null;
}

export interface TimetableData {
  id: string;
  classId: string;
  academicYear: number;
  term: string;
  status: string;
  publishedAt: string | null;
  class: { id: string; name: string; section: string | null };
  slots: StudioSlot[];
}

// ─── Local constants ───────────────────────────────────────
const DAYS: GridDay[] = [
  { num: 1, short: "Mon", full: "Monday" },
  { num: 2, short: "Tue", full: "Tuesday" },
  { num: 3, short: "Wed", full: "Wednesday" },
  { num: 4, short: "Thu", full: "Thursday" },
  { num: 5, short: "Fri", full: "Friday" },
  { num: 6, short: "Sat", full: "Saturday" },
];

const SUBJECT_COLORS: SubjectColor[] = [
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
  BREAK: { bg: "bg-[#f3f4f9]", text: "text-ink-muted", label: "Break" },
  PRAYER: { bg: "bg-amber-50/80", text: "text-amber-600/60", label: "Prayer / Namaz" },
  ASSEMBLY: { bg: "bg-blue-50/80", text: "text-blue-600/60", label: "Assembly" },
  ACTIVITY: { bg: "bg-emerald-50/80", text: "text-emerald-600/60", label: "Activity" },
};

interface ClassOption {
  id: string;
  name: string;
  section: string | null;
  academicYear: number;
}

interface PeriodDef {
  id: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
}

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

// ─── Loading skeleton ──────────────────────────────────────
function FullSkeleton({ periods, visibleDays }: { periods: GridPeriod[]; visibleDays: GridDay[] }) {
  return (
    <div className="flex flex-col gap-6 min-h-[100vh]">
      <div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1 w-fit animate-skeleton-in">
        <div className="h-9 w-32 rounded-xl bg-[#e8e0ec]/50 skeleton-shimmer" />
        <div className="h-9 w-24 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1 overflow-x-auto animate-skeleton-in" style={{ animationDelay: "80ms" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-20 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_300px] gap-4 flex-1">
        <div className="rounded-[28px] border border-[#cfc2d6]/10 bg-white shadow-xl p-4 animate-skeleton-in" style={{ animationDelay: "120ms" }}>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-[#e8e0ec]/30 skeleton-shimmer" />
            ))}
          </div>
        </div>
        <div className="rounded-[28px] border border-[#cfc2d6]/10 bg-white shadow-xl p-4 animate-skeleton-in" style={{ animationDelay: "160ms" }}>
          <div className="space-y-3">
            {periods.map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-16 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
                {Array.from({ length: visibleDays.length }).map((_, j) => (
                  <div key={j} className="h-10 flex-1 rounded-xl bg-[#e8e0ec]/30 skeleton-shimmer" />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[28px] border border-[#cfc2d6]/10 bg-white shadow-xl p-4 animate-skeleton-in" style={{ animationDelay: "200ms" }}>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-[#e8e0ec]/30 skeleton-shimmer" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────
function EmptyStateCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="sk-rise flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-[28px] bg-[#fbf0fe] flex items-center justify-center mb-5">
        <Icon className="w-8 h-8 text-[#8127cf]/30" />
      </div>
      <h3 className="text-lg font-black text-[#1f1a23]">{title}</h3>
      <p className="mt-2 text-sm font-semibold text-ink-muted max-w-sm">{description}</p>
    </div>
  );
}

// ─── Period config modal ───────────────────────────────────
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
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const [localPeriods, setLocalPeriods] = useState(periods.length > 0 ? periods : defaultPeriods);

  const updatePeriod = (index: number, field: string, value: string) => {
    setLocalPeriods((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };
  const addPeriod = () => {
    const last = localPeriods[localPeriods.length - 1];
    const newNum = last ? last.period + 1 : 1;
    const newStart = last ? last.end : "08:00";
    const [h, m] = newStart.split(":").map(Number);
    const total = h * 60 + m + 40;
    const newEnd = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    setLocalPeriods((prev) => [...prev, { period: newNum, start: newStart, end: newEnd, type: "CLASS" }]);
  };
  const removePeriod = (index: number) => {
    setLocalPeriods((prev) => prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, period: i + 1 })));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop-enter" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Configure Periods" className="relative w-full max-w-lg rounded-[34px] bg-white p-8 shadow-2xl animate-modal-enter" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-6 top-6 rounded-xl p-2 text-ink-subtle hover:bg-[#f3f4f9] transition-colors cursor-pointer">
          <X className="w-4 h-4" /><span className="sr-only">Close</span>
        </button>
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Timetable Setup</p>
          <h3 className="text-xl font-black text-[#1f1a23] mt-1">Configure Periods</h3>
          <p className="text-xs font-semibold text-ink-subtle mt-1">Set start/end times and types for each period</p>
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
              <span className="text-[10px] font-bold text-ink-subtle">to</span>
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
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#cfc2d6]/30 py-3 text-[10px] font-black uppercase tracking-wider text-ink-subtle hover:border-[#8127cf]/30 hover:text-[#8127cf] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />Add Period
          </button>
        </div>
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#f3f4f9] px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-ink-muted hover:bg-[#e8e0ec] transition-all cursor-pointer"
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

// ─── Slot editor modal (availability-aware) ───────────────
function SlotEditorModal({
  slot,
  pendingChange,
  subjects,
  activeTimetableId,
  campusId,
  onSave,
  onClose,
}: {
  slot: StudioSlot;
  pendingChange?: SlotChange;
  subjects: SubjectOption[];
  activeTimetableId: string;
  campusId?: string;
  onSave: (updates: SlotChange) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

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
  const [freeTeachers, setFreeTeachers] = useState<TeacherOption[]>([]);
  const [freeRooms, setFreeRooms] = useState<RoomOption[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingAvail(true);
    const q = campusId ? `&campusId=${campusId}` : "";
    fetch(
      `/api/academic/availability?context=timetable&day=${slot.dayOfWeek}&period=${slot.periodNumber}&excludeTimetableId=${activeTimetableId}${q}`
    )
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.success) {
          setFreeTeachers(j.data.teachers || []);
          setFreeRooms(j.data.rooms || []);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingAvail(false); });
    return () => { cancelled = true; };
  }, [slot, activeTimetableId, campusId]);

  const dayName = DAYS.find((d) => d.num === slot.dayOfWeek)?.full || "";

  useEffect(() => {
    if (subjectId && !teacherId) {
      const sub = subjects.find((s) => s.id === subjectId);
      if (sub?.teacherId && freeTeachers.some((t) => t.id === sub.teacherId)) {
        setTeacherId(sub.teacherId);
      }
    }
  }, [subjectId, subjects, teacherId, freeTeachers]);

  const handleSave = () => {
    if (slotType !== "CLASS") {
      onSave({ slotType, subjectId: null, teacherId: null, roomId: null });
    } else {
      onSave({
        slotType: "CLASS",
        subjectId: subjectId || null,
        teacherId: teacherId || null,
        roomId: roomId || null,
      });
    }
  };
  const handleClear = () => {
    onSave({ subjectId: null, teacherId: null, roomId: null, slotType: "CLASS" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop-enter" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label="Edit Slot"
        className="relative w-full max-w-md rounded-[34px] bg-white p-8 shadow-2xl animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute right-6 top-6 rounded-xl p-2 text-ink-subtle hover:bg-[#f3f4f9] transition-colors cursor-pointer">
          <X className="w-4 h-4" /><span className="sr-only">Close</span>
        </button>
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Edit Slot</p>
          <h3 className="text-xl font-black text-[#1f1a23] mt-1">{dayName} — Period {slot.periodNumber}</h3>
          <p className="text-xs font-semibold text-ink-subtle mt-1">{slot.startTime} – {slot.endTime}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1.5 block">Slot Type</label>
            <div className="flex gap-1 rounded-2xl bg-[#f3f4f9] p-1">
              {["CLASS", "BREAK", "PRAYER", "ASSEMBLY", "ACTIVITY"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSlotType(type)}
                  className={`flex-1 rounded-xl px-2 py-1.5 text-[9px] font-black uppercase transition-all cursor-pointer ${
                    slotType === type ? "bg-white text-[#8127cf] shadow-sm" : "text-ink-subtle hover:text-[#8127cf]"
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
                <label className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1.5 block">Subject</label>
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
                <label className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1.5 block">
                  Teacher {loadingAvail && <Loader2 className="inline w-3 h-3 animate-spin" />}
                </label>
                <select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 focus:ring-2 focus:ring-[#8127cf]/10 transition-all"
                >
                  <option value="">— No teacher —</option>
                  {freeTeachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.fullName}</option>
                  ))}
                </select>
                {!loadingAvail && freeTeachers.length === 0 && (
                  <p className="mt-1 text-[10px] font-semibold text-amber-600">No free teachers for this slot.</p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-ink-muted mb-1.5 block">
                  Room (Optional) {loadingAvail && <Loader2 className="inline w-3 h-3 animate-spin" />}
                </label>
                <select
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 focus:ring-2 focus:ring-[#8127cf]/10 transition-all"
                >
                  <option value="">— No room —</option>
                  {freeRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roomNumber}{r.capacity > 0 ? ` (${r.capacity} seats)` : ""}
                    </option>
                  ))}
                </select>
                {!loadingAvail && freeRooms.length === 0 && (
                  <p className="mt-1 text-[10px] font-semibold text-amber-600">No free rooms for this slot.</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 rounded-xl bg-[#f3f4f9] px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-ink-muted hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
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

// ─── Print grid ────────────────────────────────────────────
function RoutinePrintGrid({
  title,
  periods,
  days,
  cells,
}: {
  title: string;
  periods: GridPeriod[];
  days: GridDay[];
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

// ─── Main component ────────────────────────────────────────
export function TimetableStudio({ campusId }: { campusId?: string }) {
  const [timetables, setTimetables] = useState<TimetableData[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [classLoading, setClassLoading] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editingSlot, setEditingSlot] = useState<StudioSlot | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<string, SlotChange>>(new Map());
  const [viewMode, setViewMode] = useState<"class" | "teacher" | "room">("class");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [showPeriodConfig, setShowPeriodConfig] = useState(false);
  const [customPeriods, setCustomPeriods] = useState<{ period: number; start: string; end: string; type: string }[]>([]);
  const [periodDefs, setPeriodDefs] = useState<PeriodDef[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [weekendDays, setWeekendDays] = useState<number[]>([]);

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
        fetch(`/api/academic/periods?timeType=CLASS${qp}`),
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

  useEffect(() => {
    if (!selectedClassId) return;
    const existing = timetables.find((t) => t.classId === selectedClassId);
    if (!existing || existing.slots.length > 0) return;
    let cancelled = false;
    setClassLoading(true);
    fetch(`/api/timetable?classId=${selectedClassId}${qp}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j.success) return;
        const fetched = Array.isArray(j.data) ? j.data[0] : null;
        if (fetched) {
          setTimetables((prev) => prev.map((t) => (t.classId === selectedClassId ? fetched : t)));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setClassLoading(false); });
    return () => { cancelled = true; };
  }, [selectedClassId, timetables, qp]);

  const subjectColorMap = useMemo(() => {
    const m = new Map<string, SubjectColor>();
    subjects.forEach((s, i) => m.set(s.id, SUBJECT_COLORS[i % SUBJECT_COLORS.length]));
    return m;
  }, [subjects]);

  const periods = useMemo<GridPeriod[]>(() => {
    if (!activeTimetable) return [];
    if (periodDefs.length > 0) {
      return [...periodDefs]
        .sort((a, b) => a.periodNumber - b.periodNumber)
        .map((p) => {
          const slot = activeTimetable.slots.find((s) => s.periodNumber === p.periodNumber);
          return { num: p.periodNumber, start: p.startTime, end: p.endTime, type: slot?.slotType || "CLASS" };
        });
    }
    const seen = new Map<number, { start: string; end: string; type: string }>();
    for (const s of activeTimetable.slots) {
      if (!seen.has(s.periodNumber)) {
        seen.set(s.periodNumber, { start: s.startTime, end: s.endTime, type: s.slotType });
      }
    }
    return [...seen.entries()]
      .sort(([a], [b]) => a - b)
      .map(([num, v]) => ({ num, ...v }));
  }, [activeTimetable, periodDefs]);

  const gridSkeletonPeriods = periods.length
    ? periods
    : defaultPeriods.map((p) => ({ num: p.period, start: p.start, end: p.end, type: p.type }));

  const placedBySubject = useMemo(() => {
    const m = new Map<string, number>();
    if (!activeTimetable) return m;
    for (const s of activeTimetable.slots) {
      if (s.slotType !== "CLASS") continue;
      const ch = pendingChanges.get(s.id);
      const sid = ch?.subjectId !== undefined ? ch.subjectId : s.subjectId;
      if (sid) m.set(sid, (m.get(sid) || 0) + 1);
    }
    return m;
  }, [activeTimetable, pendingChanges]);

  const totalClassSlots = useMemo(
    () => (activeTimetable ? activeTimetable.slots.filter((s) => s.slotType === "CLASS").length : 0),
    [activeTimetable]
  );
  const targetDays = totalClassSlots;

  // ─── Handlers (mirroring TimetablePanel) ────────────────
  const handleCreateTimetable = async (periodsArg?: typeof defaultPeriods) => {
    if (!selectedClassId) return;
    setCreating(true);
    try {
      const cls = classes.find((c) => c.id === selectedClassId);
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
          academicYear: cls?.academicYear || new Date().getFullYear(),
          periods: periodsArg || fromDefs || defaultPeriods,
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

  const handleSlotUpdate = (slotId: string, updates: SlotChange) => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const existing = next.get(slotId) || {};
      next.set(slotId, { ...existing, ...updates });
      return next;
    });
  };

  const handleDropSubject = (slot: StudioSlot, subjectId: string) => {
    const sub = subjects.find((s) => s.id === subjectId);
    const change: SlotChange = {
      slotType: "CLASS",
      subjectId,
      teacherId: sub?.teacherId ?? null,
      roomId: null,
    };
    handleSlotUpdate(slot.id, change);
    toast.success(`Placed ${sub?.name || "subject"} — review teacher & save`);
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
          roomNumber: original.roomNumber,
          slotType: changes.slotType !== undefined ? changes.slotType : original.slotType,
          startTime: original.startTime,
          endTime: original.endTime,
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

  const handleSavePeriodConfig = async (periodsArg: { period: number; start: string; end: string; type: string }[]) => {
    if (!activeTimetable) return;
    setSaving(true);
    try {
      const slotUpdates = activeTimetable.slots.map((s) => {
        const cfg = periodsArg.find((p) => p.period === s.periodNumber);
        return {
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          periodNumber: s.periodNumber,
          startTime: cfg?.start || s.startTime,
          endTime: cfg?.end || s.endTime,
          slotType: cfg?.type || s.slotType,
          subjectId: s.subjectId,
          teacherId: s.teacherId,
          roomId: s.roomId,
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
    return <FullSkeleton periods={gridSkeletonPeriods} visibleDays={visibleDays} />;
  }

  return (
    <div className="space-y-6">
      {/* Toolbar: class picker, view tabs, publish */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#faf7fc] via-white to-[#f3eeff] p-2 shadow-sm border border-[#cfc2d6]/10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedClassId || ""}
              onChange={(e) => setSelectedClassId(e.target.value || null)}
              className="h-11 min-w-[180px] rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 pr-10 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 appearance-none cursor-pointer"
            >
              <option value="">— Select class —</option>
              {classes.map((cls) => {
                const hasTt = timetables.some((t) => t.classId === cls.id);
                const isPub = timetables.find((t) => t.classId === cls.id)?.status === "PUBLISHED";
                // Spelled out, not "•" / "○". The glyphs carried the
                // published/draft distinction with no legend anywhere on the
                // screen, so they read as a stray bullet.
                return (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}{cls.section ? ` - ${cls.section}` : ""}
                    {hasTt ? (isPub ? " · Published" : " · Draft") : " · No timetable"}
                  </option>
                );
              })}
            </select>
            <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8127cf]/50 pointer-events-none" />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-2xl bg-[#f3f4f9] p-1">
            <button
              type="button"
              onClick={() => setViewMode("class")}
              className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === "class" ? "bg-white text-[#8127cf] shadow-sm" : "text-ink-muted hover:text-[#8127cf]"
              }`}
            >
              <Calendar className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Class
            </button>
            <button
              type="button"
              onClick={() => setViewMode("teacher")}
              className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === "teacher" ? "bg-white text-[#8127cf] shadow-sm" : "text-ink-muted hover:text-[#8127cf]"
              }`}
            >
              <User className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Teacher
            </button>
            <button
              type="button"
              onClick={() => setViewMode("room")}
              className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === "room" ? "bg-white text-[#8127cf] shadow-sm" : "text-ink-muted hover:text-[#8127cf]"
              }`}
            >
              <DoorOpen className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Room
            </button>
          </div>

          <button
            type="button"
            onClick={handlePublish}
            disabled={!activeTimetable || publishing || viewMode !== "class"}
            className={`flex h-11 items-center gap-1.5 rounded-2xl px-5 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 ${
              activeTimetable?.status === "PUBLISHED"
                ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
                : "bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] text-white hover:shadow-lg shadow-[#8127cf]/25"
            }`}
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {activeTimetable?.status === "PUBLISHED" ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      {/* Teacher view */}
      {viewMode === "teacher" && (
        <TeacherView
          timetables={timetables}
          teachers={teachers}
          periods={periods}
          visibleDays={visibleDays}
          weekendDays={weekendDays}
          selectedTeacherId={selectedTeacherId}
          onSelectTeacher={setSelectedTeacherId}
        />
      )}

      {/* Room view */}
      {viewMode === "room" && (
        <RoomView
          timetables={timetables}
          rooms={rooms}
          visibleDays={visibleDays}
          periods={periods}
          weekendDays={weekendDays}
        />
      )}

      {/* Class view (3-pane) */}
      {viewMode === "class" && (
        <>
          {!selectedClassId && (
            <EmptyStateCard
              icon={Calendar}
              title="Select a Class"
              description="Choose a class above to view or create its weekly timetable"
            />
          )}

          {selectedClassId && !activeTimetable && (
            <div className="sk-rise flex flex-col items-center justify-center py-16" style={{ animationDelay: "120ms" }}>
              <div className="h-20 w-20 rounded-[32px] bg-gradient-to-br from-[#8127cf]/10 to-[#fbf0fe] flex items-center justify-center mb-6">
                <Calendar className="w-10 h-10 text-[#8127cf]/40" />
              </div>
              <h3 className="text-lg font-black text-[#1f1a23] mb-2">No Timetable Yet</h3>
              <p className="text-sm text-ink-muted mb-8 max-w-sm text-center">
                Create a weekly schedule for this class with configurable period timings ({visibleDays.map((d) => d.short).join("–")})
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
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 h-4" />}
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
                    activeTimetable.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${activeTimetable.status === "PUBLISHED" ? "bg-emerald-500" : "bg-amber-400"}`} />
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
                    className="flex h-9 items-center gap-1.5 rounded-xl bg-[#f3f4f9] px-3 text-[10px] font-black uppercase tracking-wider text-ink-muted transition-all hover:bg-[#8127cf]/10 hover:text-[#8127cf] cursor-pointer"
                  >
                    <Clock className="h-3.5 w-3.5" />Periods
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex h-9 items-center gap-1.5 rounded-xl bg-[#f3f4f9] px-3 text-[10px] font-black uppercase tracking-wider text-ink-muted transition-all hover:bg-[#8127cf]/10 hover:text-[#8127cf] cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" />Print
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
                        <span className="text-[9px] font-semibold text-ink-subtle ml-1">({s.teacher.fullName})</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 3-pane layout */}
              <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_320px] gap-4 items-stretch">
                {/* LEFT: Subject palette */}
                <div className="lg:max-h-[78vh] lg:sticky lg:top-4">
                  <SubjectPalette
                    subjects={subjects}
                    placedBySubject={placedBySubject}
                    targetDays={targetDays}
                    totalClassSlots={totalClassSlots}
                    subjectColorMap={subjectColorMap}
                  />
                </div>

                {/* CENTER: Timetable grid */}
                <div className="sk-rise overflow-x-auto rounded-[28px] border border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "160ms" }}>
                  {classLoading ? (
                    <div className="p-4 text-center text-sm font-semibold text-ink-subtle">Loading slots…</div>
                  ) : (
                    <TimetableGrid
                      slots={activeTimetable.slots}
                      periods={periods}
                      visibleDays={visibleDays}
                      subjects={subjects}
                      teachers={teachers}
                      rooms={rooms}
                      pendingChanges={pendingChanges}
                      subjectColorMap={subjectColorMap}
                      weekendDays={weekendDays}
                      onCellClick={setEditingSlot}
                      onDropSubject={handleDropSubject}
                    />
                  )}
                </div>

                {/* RIGHT: Conflict panel */}
                <div className="lg:max-h-[78vh] lg:sticky lg:top-4">
                  <ConflictPanel
                    timetables={timetables}
                    activeTimetable={activeTimetable}
                    subjects={subjects}
                    placedBySubject={placedBySubject}
                    targetDays={targetDays}
                    visibleDays={visibleDays}
                    pendingChanges={pendingChanges}
                    campusId={campusId}
                    onApplied={loadData}
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Print-only routine */}
      <div id="routine-print-root">
        {activeTimetable && viewMode === "class" ? (
          <RoutinePrintGrid
            title={`${activeTimetable.class.name}${activeTimetable.class.section ? ` - ${activeTimetable.class.section}` : ""} — Weekly Timetable ${activeTimetable.academicYear} (${activeTimetable.term})`}
            periods={periods}
            days={visibleDays}
            cells={visibleDays.map((day) => periods.map((period) => {
              const s = activeTimetable.slots.find((sl) => sl.dayOfWeek === day.num && sl.periodNumber === period.num);
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

      {/* Period config modal */}
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

      {/* Slot editor modal */}
      {editingSlot && activeTimetable && (
        <SlotEditorModal
          slot={editingSlot}
          pendingChange={pendingChanges.get(editingSlot.id)}
          subjects={subjects}
          activeTimetableId={activeTimetable.id}
          campusId={campusId}
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
