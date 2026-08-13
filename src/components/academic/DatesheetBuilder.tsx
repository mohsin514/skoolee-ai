"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  DoorOpen,
  Loader2,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BrandButton } from "@/components/role-dashboard";
import type { ExamItem } from "@/components/academic/ExamCycleManager";

interface ScheduleRow {
  id: string;
  date: string;
  periodDefinitionId: string | null;
  subject: { id: string; name: string; totalMarks: number };
  periodDefinition?: { id: string; periodNumber: number; startTime: string; endTime: string } | null;
  room?: { id: string; roomNumber: string; capacity: number } | null;
  exam?: any;
}

interface ExamPeriod {
  id: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
}

interface Subject {
  id: string;
  name: string;
  totalMarks: number;
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDow(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function DatesheetBuilder({
  exam,
  campusId,
  onChanged,
}: {
  exam: ExamItem;
  campusId?: string;
  onChanged?: () => void;
}) {
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [periods, setPeriods] = useState<ExamPeriod[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [weekends, setWeekends] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [studentsCount, setStudentsCount] = useState(0);
  const [pending, setPending] = useState<{
    subjectId: string;
    date: string;
    periodId: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = (params: Record<string, string>) => {
        const sp = new URLSearchParams(params);
        if (campusId) sp.set("campusId", campusId);
        return sp.toString();
      };
      const [schedRes, calRes, perRes, marksRes] = await Promise.all([
        fetch(`/api/academic/exam-schedule?${q({ examId: exam.id })}`).then((r) => r.json()),
        fetch(`/api/academic/calendar?${q({})}`).then((r) => r.json()),
        fetch(`/api/academic/periods?${q({ timeType: "EXAM" })}`).then((r) => r.json()),
        fetch(`/api/marks?examId=${exam.id}`).then((r) => r.json()),
      ]);

      const schedData: ScheduleRow[] = (schedRes.data || []).map((s: any) => {
        const raw = typeof s.date === "string" ? s.date : new Date(s.date).toISOString();
        const dateStr = raw.split("T")[0];
        return {
          id: s.id,
          date: dateStr,
          periodDefinitionId: s.periodDefinitionId || null,
          subject: s.subject,
          periodDefinition: s.periodDefinition || null,
          room: s.room || null,
          exam: s.exam,
        };
      });
      setSchedules(schedData);
      setPeriods((perRes.data || []) as ExamPeriod[]);
      setSubjects((marksRes.subjects || []) as Subject[]);
      setStudentsCount((marksRes.students || []).length);
      const wk = new Set<number>((calRes.data?.weekends || []) as number[]);
      setWeekends(wk);
    } catch {
      toast.error("Failed to load datesheet");
    } finally {
      setLoading(false);
    }
  }, [exam.id, campusId]);

  useEffect(() => {
    load();
  }, [load]);

  const scheduledSubjectIds = useMemo(
    () => new Set(schedules.map((s) => s.subject.id)),
    [schedules]
  );

  const days = useMemo(() => {
    const dates: string[] = [];
    if (schedules.length > 0) {
      const sorted = [...schedules].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const min = new Date(sorted[0].date);
      const max = new Date(sorted[sorted.length - 1].date);
      min.setDate(min.getDate() - 2);
      max.setDate(max.getDate() + 4);
      const cur = new Date(min);
      while (cur <= max && dates.length < 24) {
        if (!weekends.has(isoDow(cur))) dates.push(toYMD(cur));
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      const start = new Date();
      const cur = new Date(start);
      while (dates.length < 14) {
        if (!weekends.has(isoDow(cur))) dates.push(toYMD(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
    return dates;
  }, [schedules, weekends]);

  const periodCols: { id: string | null; label: string }[] = useMemo(() => {
    if (periods.length === 0) return [{ id: null, label: "All day" }];
    return periods
      .slice()
      .sort((a, b) => a.periodNumber - b.periodNumber)
      .map((p) => ({
        id: p.id,
        label: `P${p.periodNumber} · ${p.startTime}-${p.endTime}`,
      }));
  }, [periods]);

  const cellKey = (date: string, periodId: string | null) => `${date}__${periodId || "none"}`;
  const scheduleMap = useMemo(() => {
    const m = new Map<string, ScheduleRow>();
    schedules.forEach((s) => m.set(cellKey(s.date, s.periodDefinitionId), s));
    return m;
  }, [schedules]);

  const handleCellClick = (subjectId: string | null, date: string, periodId: string | null) => {
    const sid = subjectId ?? armed;
    if (!sid) {
      toast.error("Select a subject from the left first");
      return;
    }
    setPending({ subjectId: sid, date, periodId });
  };

  const removeSchedule = async (id: string) => {
    setBusy(true);
    try {
      const sp = new URLSearchParams({ id });
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/academic/exam-schedule?${sp.toString()}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove");
      toast.success("Removed from datesheet");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-skeleton-in">
        <div className="h-32 w-full rounded-3xl bg-[#e8e0ec]/40 skeleton-shimmer" />
        <div className="h-64 w-full rounded-3xl bg-[#e8e0ec]/40 skeleton-shimmer" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
      {/* Subject sidebar */}
      <div className="rounded-3xl border border-[#cfc2d6]/15 bg-white p-4 shadow-sm">
        <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50">
          Exam Subjects
        </p>
        <p className="mb-3 text-[10px] font-semibold text-[#4d4354]/40">
          {armed ? "Tap a slot to schedule" : "Tap to select, then a slot"}
        </p>
        <div className="space-y-2">
          {subjects.map((s) => {
            const isScheduled = scheduledSubjectIds.has(s.id);
            const isArmed = armed === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={isScheduled}
                onClick={() => setArmed(isArmed ? null : s.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition-all cursor-pointer",
                  isScheduled
                    ? "border-[#cfc2d6]/15 bg-[#f3f4f9] text-[#4d4354]/40"
                    : isArmed
                    ? "border-[#8127cf] bg-[#fbf0fe] text-[#8127cf] shadow-sm"
                    : "border-[#cfc2d6]/15 bg-white text-[#1d1b20] hover:border-[#8127cf]/40"
                )}
              >
                <span className="text-sm font-bold">{s.name}</span>
                {isScheduled ? (
                  <span className="text-[9px] font-black uppercase text-emerald-600">done</span>
                ) : isArmed ? (
                  <Plus className="h-4 w-4" />
                ) : null}
              </button>
            );
          })}
          {subjects.length === 0 ? (
            <p className="rounded-2xl bg-[#f3f4f9] px-3 py-4 text-center text-[11px] font-semibold text-[#4d4354]/40">
              No subjects found
            </p>
          ) : null}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto rounded-3xl border border-[#cfc2d6]/15 bg-white p-4 shadow-sm custom-scrollbar">
        <div className="mb-3 flex items-center gap-2 text-[#4d4354]/60">
          <CalendarDays className="h-4 w-4 text-[#8127cf]" />
          <span className="text-xs font-bold">
            Datesheet · {days.length} working day{days.length !== 1 ? "s" : ""}
          </span>
          <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-600">
            <AlertTriangle className="mr-1 inline h-3 w-3" /> weekends hidden
          </span>
        </div>
        <div className="min-w-max">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `120px repeat(${periodCols.length}, minmax(140px, 1fr))` }}
          >
            <div />
            {periodCols.map((p) => (
              <div
                key={p.id || "none"}
                className="rounded-xl bg-[#fbf0fe] px-2 py-1.5 text-center text-[10px] font-black uppercase tracking-wider text-[#8127cf]"
              >
                {p.label}
              </div>
            ))}

            {days.map((date) => {
              const dt = new Date(date);
              const label = dt.toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
              });
              return (
                <React.Fragment key={date}>
                  <div className="flex items-center rounded-xl bg-[#f3f4f9] px-3 py-2 text-xs font-bold text-[#1d1b20]">
                    {label}
                  </div>
                  {periodCols.map((p) => {
                    const key = cellKey(date, p.id);
                    const sched = scheduleMap.get(key);
                    return (
                      <div
                        key={key}
                        onClick={() => handleCellClick(null, date, p.id)}
                        className={cn(
                          "min-h-[56px] rounded-xl border border-dashed p-1.5 transition-all cursor-pointer",
                          sched
                            ? "border-transparent"
                            : "border-[#cfc2d6]/30 hover:border-[#8127cf]/50 hover:bg-[#fbf0fe]/40"
                        )}
                      >
                        {sched ? (
                          <div className="group relative rounded-lg bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/10 p-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeSchedule(sched.id);
                              }}
                              disabled={busy}
                              className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-md bg-white/70 text-rose-500 hover:bg-rose-500 hover:text-white group-hover:flex cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                            <p className="pr-4 text-[11px] font-black text-[#1d1b20]">
                              {sched.subject.name}
                            </p>
                            {sched.room ? (
                              <p className="mt-0.5 flex items-center gap-1 text-[9px] font-bold text-[#0d9488]">
                                <DoorOpen className="h-3 w-3" />
                                {sched.room.roomNumber}
                              </p>
                            ) : (
                              <p className="mt-0.5 text-[9px] font-semibold text-[#4d4354]/40">
                                No room
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-[#cfc2d6]">
                            <Plus className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {pending ? (
        <AssignmentPopover
          examId={exam.id}
          campusId={campusId}
          subject={subjects.find((s) => s.id === pending.subjectId) || null}
          date={pending.date}
          periodId={pending.periodId}
          studentsCount={studentsCount}
          onClose={() => setPending(null)}
          onScheduled={async () => {
            setPending(null);
            setArmed(null);
            await load();
            onChanged?.();
          }}
        />
      ) : null}
    </div>
  );
}

function AssignmentPopover({
  examId,
  campusId,
  subject,
  date,
  periodId,
  studentsCount,
  onClose,
  onScheduled,
}: {
  examId: string;
  campusId?: string;
  subject: Subject | null;
  date: string;
  periodId: string | null;
  studentsCount: number;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [rooms, setRooms] = useState<any[]>([]);
  const [roomId, setRoomId] = useState<string>("");
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const sp = new URLSearchParams({
      context: "exam",
      date,
      examId,
    });
    if (periodId) sp.set("periodDefinitionId", periodId);
    if (campusId) sp.set("campusId", campusId);
    setRoomsLoading(true);
    setRoomsError(null);
    fetch(`/api/academic/availability?${sp.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) throw new Error(d?.error || "Could not load free rooms");
        const free = d.data?.rooms || [];
        setRooms(free);
        // Auto-assign the smallest free room whose capacity fits the class
        // (manual override still possible via the dropdown).
        const best =
          studentsCount > 0
            ? free
                .filter((r: any) => !r.capacity || r.capacity >= studentsCount)
                .sort((a: any, b: any) => (a.capacity || 0) - (b.capacity || 0))[0]
            : null;
        setRoomId(best?.id || "");
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return;
        setRoomsError(e?.message || "Could not load free rooms");
        setRooms([]);
      })
      .finally(() => setRoomsLoading(false));
    return () => controller.abort();
  }, [date, periodId, examId, campusId, studentsCount, reloadTick]);

  const submit = async () => {
    setBusy(true);
    try {
      const sp = new URLSearchParams();
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/academic/exam-schedule?${sp.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId,
          subjectId: subject?.id,
          date,
          periodDefinitionId: periodId || undefined,
          roomId: roomId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scheduling failed");
      toast.success(`${subject?.name} scheduled`);
      onScheduled();
    } catch (e: any) {
      toast.error(e?.message || "Scheduling failed");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-[#1f1a23]/45 p-4 backdrop-blur-md animate-backdrop-enter">
      <div className="w-full max-w-md overflow-hidden rounded-[34px] border border-[#cfc2d6]/15 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)] animate-modal-enter">
        <div className="flex items-center justify-between bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-white/70">Schedule</p>
            <h3 className="text-lg font-black">{subject?.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-2xl text-white/80 hover:bg-white/15 cursor-pointer transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-2 rounded-2xl bg-[#fbf0fe] px-4 py-3 text-sm font-bold text-[#1d1b20]">
            <CalendarDays className="h-4 w-4 text-[#8127cf]" />
            {new Date(date).toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50">
              Room (free rooms only)
            </span>
            <div className="relative">
              <select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full appearance-none rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 py-2.5 pr-9 text-sm font-semibold text-[#1d1b20] focus:outline-none focus:ring-4 focus:ring-[#8127cf]/20"
              >
                <option value="">No room assigned</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber}
                    {r.capacity ? ` (cap ${r.capacity})` : ""}
                  </option>
                ))}
              </select>
              <DoorOpen className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8127cf]" />
            </div>
            {roomsLoading ? (
              <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-[#4d4354]/40">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking room availability…
              </p>
            ) : roomsError ? (
              <div className="mt-1 flex items-center gap-2">
                <p className="text-[10px] font-semibold text-rose-500">{roomsError}</p>
                <button
                  type="button"
                  onClick={() => {
                    const reloadKey = Date.now();
                    setRoomsLoading(true);
                    setRoomsError(null);
                    setReloadTick(reloadKey);
                  }}
                  className="flex cursor-pointer items-center gap-1 rounded-lg bg-[#fbf0fe] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[#8127cf] hover:bg-[#fdf0fe]"
                >
                  <RefreshCw className="h-2.5 w-2.5" /> Retry
                </button>
              </div>
            ) : rooms.length === 0 ? (
              <p className="mt-1 text-[10px] font-semibold text-[#4d4354]/40">
                No free rooms for this slot.
              </p>
            ) : (
              <p className="mt-1 text-[10px] font-semibold text-[#0d9488]">
                Auto-picked the smallest free room fitting {studentsCount || "the class"} — you can change it above.
              </p>
            )}
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[#cfc2d6]/10 bg-[#faf7fc] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl px-5 py-2.5 text-sm font-black text-[#4d4354]/60 hover:bg-[#4d4354]/5 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <BrandButton variant="gradient" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Schedule
          </BrandButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
