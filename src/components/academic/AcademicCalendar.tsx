"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  BookOpen,
  PartyPopper,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type CalendarRole = "ADMIN" | "PRINCIPAL" | "TEACHER" | "STUDENT" | "PARENT";

interface UnifiedTerm {
  id: string;
  label: string;
  academicYear: number;
  status: string;
  startDate: string;
  endDate: string;
}
interface UnifiedHoliday {
  id: string;
  name: string;
  fromDate: string;
  toDate: string;
}
interface UnifiedExam {
  id: string;
  title: string;
  examType: string;
  status: string;
  className: string;
  dates: string[];
}
interface UnifiedFeed {
  weekends: number[];
  terms: UnifiedTerm[];
  holidays: UnifiedHoliday[];
  exams: UnifiedExam[];
}

const DEADLINE_STATUSES = new Set(["MARKS_ENTRY", "LOCKED", "PRINCIPAL_REVIEWED"]);

function isoOf(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function dowFromIso(iso: string) {
  return ((new Date(`${iso}T00:00:00`).getDay() + 6) % 7) + 1; // 1=Mon..7=Sun
}
function todayIso() {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}

interface DayEvents {
  iso: string;
  dayNum: number;
  isWeekend: boolean;
  exams: UnifiedExam[];
  deadlines: UnifiedExam[];
  holidays: UnifiedHoliday[];
  terms: { type: "start" | "end"; term: UnifiedTerm }[];
}

interface LayerState {
  exams: boolean;
  holidays: boolean;
  terms: boolean;
  deadlines: boolean;
}

export function AcademicCalendar({
  campusId,
  readOnly = false,
  role = "STUDENT",
  onScheduleExam,
}: {
  campusId?: string;
  readOnly?: boolean;
  role?: CalendarRole;
  onScheduleExam?: () => void;
}) {
  const canEdit = !readOnly && (role === "ADMIN" || role === "PRINCIPAL");

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [feed, setFeed] = useState<UnifiedFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState<LayerState>({
    exams: true,
    holidays: true,
    terms: true,
    deadlines: true,
  });
  const [popover, setPopover] = useState<{
    iso: string;
    x: number;
    y: number;
    mode: "view" | "add";
  } | null>(null);

  const qs = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/academic/calendar/unified${qs ? `${qs}&` : "?" }year=${viewYear}`);
      const json = await res.json();
      if (json.success) setFeed(json.data);
      else toast.error("Failed to load unified calendar");
    } catch {
      toast.error("Failed to load unified calendar");
    } finally {
      setLoading(false);
    }
  }, [qs, viewYear]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Aggregate events per day ─────────────────────────────────────────────
  const dayMap = useMemo(() => {
    const map = new Map<string, DayEvents>();
    if (!feed) return map;

    const ensure = (iso: string): DayEvents => {
      if (!map.has(iso)) {
        map.set(iso, {
          iso,
          dayNum: Number(iso.slice(8, 10)),
          isWeekend: feed.weekends.includes(dowFromIso(iso)),
          exams: [],
          deadlines: [],
          holidays: [],
          terms: [],
        });
      }
      return map.get(iso)!;
    };

    feed.holidays.forEach((h) => {
      let cur = new Date(`${h.fromDate}T00:00:00Z`);
      const end = new Date(`${h.toDate}T00:00:00Z`);
      while (cur <= end) {
        const iso = cur.toISOString().slice(0, 10);
        ensure(iso).holidays.push(h);
        cur = new Date(cur.getTime() + 86400000);
      }
    });

    feed.exams.forEach((ex) => {
      ex.dates.forEach((d) => {
        const day = ensure(d);
        day.exams.push(ex);
        if (DEADLINE_STATUSES.has(ex.status)) day.deadlines.push(ex);
      });
    });

    feed.terms.forEach((t) => {
      const startIso = t.startDate.slice(0, 10);
      const endIso = t.endDate.slice(0, 10);
      if (startIso) ensure(startIso).terms.push({ type: "start", term: t });
      if (endIso && endIso !== startIso) ensure(endIso).terms.push({ type: "end", term: t });
    });

    return map;
  }, [feed]);

  // ── Month grid ───────────────────────────────────────────────────────────
  const monthCells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const leading = (first.getDay() + 6) % 7; // Mon=0
    const cells: (DayEvents | null)[] = [];
    for (let i = 0; i < leading; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = isoOf(viewYear, viewMonth, d);
      cells.push(dayMap.get(iso) ?? {
        iso,
        dayNum: d,
        isWeekend: feed ? feed.weekends.includes(dowFromIso(iso)) : false,
        exams: [],
        deadlines: [],
        holidays: [],
        terms: [],
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [dayMap, viewYear, viewMonth, feed]);

  const prevMonth = () => {
    setPopover(null);
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    setPopover(null);
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const hasEvents = (day: DayEvents) =>
    (layers.exams && day.exams.length > 0) ||
    (layers.holidays && day.holidays.length > 0) ||
    (layers.terms && day.terms.length > 0) ||
    (layers.deadlines && day.deadlines.length > 0);

  return (
    <div className="rounded-3xl border border-[#cfc2d6]/15 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.18)] overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between bg-gradient-to-r from-[#faf7fc] via-white to-[#f3eeff] border-b border-[#cfc2d6]/10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight text-[#1d1b20]">Academic Calendar</h3>
            <p className="text-[11px] font-semibold text-[#4d4354]/50">
              {MONTHS[viewMonth]} {viewYear}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#cfc2d6]/20 bg-white text-[#4d4354]/60 transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf]">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setPopover(null); setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); }}
            className="rounded-xl border border-[#cfc2d6]/20 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#4d4354]/60 hover:bg-[#fbf0fe] hover:text-[#8127cf]"
          >
            Today
          </button>
          <button onClick={nextMonth} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#cfc2d6]/20 bg-white text-[#4d4354]/60 transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf]">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Layer toggles */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-[#cfc2d6]/10">
        <LayerChip label="Exams" color="#8127cf" active={layers.exams} onClick={() => setLayers((l) => ({ ...l, exams: !l.exams }))} />
        <LayerChip label="Holidays" color="#0d9488" active={layers.holidays} onClick={() => setLayers((l) => ({ ...l, holidays: !l.holidays }))} />
        <LayerChip label="Terms" color="#d97706" active={layers.terms} onClick={() => setLayers((l) => ({ ...l, terms: !l.terms }))} />
        <LayerChip label="Deadlines" color="#f43f5e" active={layers.deadlines} onClick={() => setLayers((l) => ({ ...l, deadlines: !l.deadlines }))} />
      </div>

      {loading ? (
        <div className="space-y-3 p-5 animate-skeleton-in">
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-7 rounded-lg bg-[#e8e0ec]/40 skeleton-shimmer" />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, r) => (
            <div key={r} className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 7 }).map((_, c) => (
                <div key={c} className="h-16 rounded-xl bg-[#e8e0ec]/30 skeleton-shimmer" style={{ animationDelay: `${(r * 7 + c) * 18}ms` }} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-5">
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d) => (
              <div key={d} className="pb-1 text-center text-[10px] font-black uppercase tracking-wider text-[#4d4354]/40">
                {d}
              </div>
            ))}
            {monthCells.map((cell, idx) => {
              if (!cell) return <div key={`e${idx}`} />;
              const isToday = cell.iso === todayIso();
              const holidayBg = layers.holidays && cell.holidays.length > 0;
              const weekendBg = cell.isWeekend && !(layers.holidays && cell.holidays.length > 0);
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setPopover({ iso: cell.iso, x: r.left, y: r.bottom + 6, mode: canEdit ? "add" : "view" });
                  }}
                  className={cn(
                    "group relative flex h-16 flex-col rounded-xl border p-1.5 text-left transition-all",
                    holidayBg
                      ? "border-[#0d9488]/30 bg-[#0d9488]/10"
                      : weekendBg
                        ? "border-[#cfc2d6]/10 bg-[#f3f4f9]"
                        : "border-[#cfc2d6]/10 bg-white hover:border-[#8127cf]/40 hover:bg-[#fbf0fe]/40",
                    isToday && "ring-2 ring-[#8127cf]/50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("text-xs font-bold", holidayBg ? "text-[#0d9488]" : weekendBg ? "text-[#4d4354]/40" : "text-[#1d1b20]")}>
                      {cell.dayNum}
                    </span>
                    {canEdit && (
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setPopover({ iso: cell.iso, x: r.left, y: r.bottom + 6, mode: "add" });
                        }}
                        className="flex h-4 w-4 items-center justify-center rounded-full bg-[#8127cf] text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Plus className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1">
                    {layers.exams && cell.exams.length > 0 && <Dot color="#8127cf" title={`${cell.exams.length} exam(s)`} />}
                    {layers.deadlines && cell.deadlines.length > 0 && <Dot color="#f43f5e" title="Deadline" />}
                    {layers.terms && cell.terms.length > 0 && (
                      <Dot color="#d97706" title={cell.terms.map((t) => `${t.term.label} ${t.type}`).join(", ")} />
                    )}
                    {layers.holidays && cell.holidays.length > 0 && <Dot color="#0d9488" title={cell.holidays.map((h) => h.name).join(", ")} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {popover && typeof document !== "undefined" &&
        createPortal(
          <DayPopover
            popover={popover}
            day={dayMap.get(popover.iso)}
            layers={layers}
            canEdit={canEdit}
            onClose={() => setPopover(null)}
            onScheduleExam={onScheduleExam}
            onHolidayAdded={() => { setPopover(null); load(); }}
            campusId={campusId}
          />,
          document.body
        )}
    </div>
  );
}

function LayerChip({ label, color, active, onClick }: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // These are filters, not a legend. On/off is conveyed only by a colour
      // shift, so the state has to be exposed for assistive tech too.
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]/30",
        active ? "border-[#cfc2d6]/30 bg-white text-[#1d1b20]" : "border-[#cfc2d6]/15 bg-[#faf7fc] text-[#4d4354]/40"
      )}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: active ? color : "#cfc2d6" }} />
      {label}
    </button>
  );
}

function Dot({ color, title }: { color: string; title: string }) {
  return <span title={title} className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />;
}

function DayPopover({
  popover,
  day,
  layers,
  canEdit,
  onClose,
  onScheduleExam,
  onHolidayAdded,
  campusId,
}: {
  popover: { iso: string; x: number; y: number; mode: "view" | "add" };
  day?: DayEvents;
  layers: LayerState;
  canEdit: boolean;
  onClose: () => void;
  onScheduleExam?: () => void;
  onHolidayAdded: () => void;
  campusId?: string;
}) {
  const [name, setName] = useState("");
  const [fromDate, setFromDate] = useState(popover.iso);
  const [toDate, setToDate] = useState(popover.iso);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const addHoliday = async () => {
    if (!name.trim()) { toast.error("Enter a holiday name"); return; }
    if (fromDate > toDate) { toast.error("End date must be on or after start"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/academic/calendar${campusId ? `?campusId=${encodeURIComponent(campusId)}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), fromDate, toDate }),
      });
      const json = await res.json();
      if (json.success) { toast.success("Holiday added"); onHolidayAdded(); }
      else toast.error(json.error || "Failed to add holiday");
    } catch {
      toast.error("Failed to add holiday");
    } finally {
      setSaving(false);
    }
  };

  const pos = { top: Math.min(popover.y, (typeof window !== "undefined" ? window.innerHeight - 320 : popover.y)), left: Math.min(popover.x, (typeof window !== "undefined" ? window.innerWidth - 300 : popover.x)) };

  const events: { kind: string; color: string; text: string }[] = [];
  if (day) {
    if (layers.holidays) day.holidays.forEach((h) => events.push({ kind: "Holiday", color: "#0d9488", text: h.name }));
    if (layers.exams) day.exams.forEach((e) => events.push({ kind: `Exam · ${e.examType}`, color: "#8127cf", text: `${e.title} (${e.className})` }));
    if (layers.deadlines) day.deadlines.forEach((e) => events.push({ kind: "Deadline", color: "#f43f5e", text: `${e.title} — ${e.status}` }));
    if (layers.terms) day.terms.forEach((t) => events.push({ kind: t.type === "start" ? "Term starts" : "Term ends", color: "#d97706", text: `${t.term.label} (${t.term.academicYear})` }));
  }

  return (
    <div
      ref={ref}
      style={pos}
      className="fixed z-[200] w-[290px] rounded-2xl border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_24px_70px_rgba(31,26,35,0.28)] animate-modal-enter"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black text-[#1d1b20]">
          {new Date(`${popover.iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </p>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-[#4d4354]/40 hover:bg-rose-50 hover:text-rose-500">
          <X className="h-4 w-4" />
        </button>
      </div>

      {events.length === 0 ? (
        <p className="py-2 text-xs font-semibold text-[#4d4354]/40">No events scheduled.</p>
      ) : (
        <ul className="max-h-44 space-y-2 overflow-y-auto custom-scrollbar">
          {events.map((ev, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ev.color }} />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: ev.color }}>{ev.kind}</p>
                <p className="text-xs font-semibold text-[#1d1b20]">{ev.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="mt-3 space-y-3 border-t border-[#cfc2d6]/10 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/55">From</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-lg border border-[#cfc2d6]/30 px-2 py-1.5 text-xs font-semibold outline-none focus:border-[#8127cf]/60" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/55">To</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full rounded-lg border border-[#cfc2d6]/30 px-2 py-1.5 text-xs font-semibold outline-none focus:border-[#8127cf]/60" />
            </label>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Holiday name"
            className="w-full rounded-lg border border-[#cfc2d6]/30 px-3 py-2 text-xs font-semibold outline-none focus:border-[#8127cf]/60"
          />
          <div className="flex gap-2">
            <button
              onClick={addHoliday}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[#0d9488] px-3 py-2 text-[11px] font-black text-white disabled:opacity-50"
            >
              <PartyPopper className="h-3.5 w-3.5" /> Add Holiday
            </button>
            <button
              onClick={() => { onClose(); if (onScheduleExam) onScheduleExam(); else toast.info("Open the Exam Cycles manager to schedule an exam."); }}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] px-3 py-2 text-[11px] font-black text-white"
            >
              <BookOpen className="h-3.5 w-3.5" /> Schedule Exam
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
