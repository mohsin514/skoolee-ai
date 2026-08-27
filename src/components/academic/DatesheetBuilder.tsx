"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Modal } from "@/components/ui/modal";
import { BrandButton } from "@/components/role-dashboard";
import type { ExamItem } from "@/components/academic/ExamCycleManager";

interface ScheduleRow {
  id: string;
  date: string;
  periodDefinitionId: string | null;
  subject: { id: string; name: string; totalMarks: number };
  periodDefinition?: { id: string; periodNumber: number; startTime: string; endTime: string } | null;
  room?: { id: string; roomNumber: string; capacity: number } | null;
  /** §58: every room hosting this paper, primary first. */
  rooms?: { id: string; isPrimary: boolean; room: { id: string; roomNumber: string; capacity: number } }[];
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
          rooms: s.rooms || [],
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
        <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-ink-muted">
          Exam Subjects
        </p>
        <p className="mb-3 text-[10px] font-semibold text-ink-subtle">
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
                    ? "border-[#cfc2d6]/15 bg-[#f3f4f9] text-ink-subtle"
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
            <p className="rounded-2xl bg-[#f3f4f9] px-3 py-4 text-center text-[11px] font-semibold text-ink-subtle">
              No subjects found
            </p>
          ) : null}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto rounded-3xl border border-[#cfc2d6]/15 bg-white p-4 shadow-sm custom-scrollbar">
        <div className="mb-3 flex items-center gap-2 text-ink-muted">
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
                            {sched.rooms && sched.rooms.length > 1 ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-[#fbf0fe] px-2 py-1 text-[10px] font-black text-[#8127cf]">
                                <DoorOpen className="h-3 w-3" />
                                {sched.rooms.map((r: any) => r.room.roomNumber).join(" + ")}
                              </span>
                            ) : sched.room ? (
                              <p className="mt-0.5 flex items-center gap-1 text-[9px] font-bold text-[#0d9488]">
                                <DoorOpen className="h-3 w-3" />
                                {sched.room.roomNumber}
                              </p>
                            ) : (
                              <p className="mt-0.5 text-[9px] font-semibold text-ink-subtle">
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
  // §58: a paper can be split across rooms, so this is a set rather than one
  // id. Order matters — it is the order students are seated in, and the first
  // room is the primary one the date sheet shows.
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const selectedRooms = roomIds
    .map((id) => rooms.find((r: any) => r.id === id))
    .filter(Boolean) as any[];

  // §79: the number that has to cover the class is the EXAM capacity, not the
  // teaching one. A 30-seat room three-to-a-bench invigilates ten, and reading
  // "30" here is how a paper for thirty was allocated a room that holds ten.
  const seatsAvailable = selectedRooms.reduce((n, r) => n + (r.examCapacity || 0), 0);

  // An unmeasured room is not a violation on the single-room path — but a room
  // of unknown size cannot be part of a split, so a multi-room selection
  // requires every room to be sized.
  const unsized = selectedRooms.filter((r) => r.unmeasured ?? !r.capacity);
  const shortBy =
    selectedRooms.length > 0 && unsized.length === 0 && studentsCount > seatsAvailable
      ? studentsCount - seatsAvailable
      : 0;
  const multiRoom = roomIds.length > 1;
  const blocked = shortBy > 0 || (multiRoom && unsized.length > 0);

  const toggleRoom = (id: string) =>
    setRoomIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
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
        // Auto-assign the smallest free room that fits the whole class. If no
        // single room does, fall back to filling the largest rooms until the
        // class is covered — that is the case multi-room exists for, and the
        // admin arrives at a workable plan instead of a dead end.
        const best =
          studentsCount > 0
            ? free
                .filter((r: any) => r.unmeasured || r.examCapacity >= studentsCount)
                .sort((a: any, b: any) => (a.examCapacity || 0) - (b.examCapacity || 0))[0]
            : null;
        if (best) {
          setRoomIds([best.id]);
        } else if (studentsCount > 0) {
          const sized = free
            .filter((r: any) => r.examCapacity > 0)
            .sort((a: any, b: any) => b.examCapacity - a.examCapacity);
          const picked: string[] = [];
          let seats = 0;
          for (const r of sized) {
            if (seats >= studentsCount) break;
            picked.push(r.id);
            seats += r.examCapacity;
          }
          setRoomIds(seats >= studentsCount ? picked : []);
        } else {
          setRoomIds([]);
        }
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
          // A split paper is created without a room and then allocated, so the
          // single-room capacity rule doesn't reject a plan that is only valid
          // once all its rooms are counted together.
          roomId: multiRoom ? undefined : roomIds[0] || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scheduling failed");

      if (multiRoom) {
        const alloc = await fetch(`/api/academic/exam-schedule/rooms?${sp.toString()}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduleId: data.data.id, roomIds }),
        });
        const allocData = await alloc.json();
        if (!alloc.ok) {
          // Don't leave a roomless paper on the date sheet because the seating
          // step failed — take the entry back out and report the real reason.
          await fetch(
            `/api/academic/exam-schedule?id=${data.data.id}&${sp.toString()}`,
            { method: "DELETE" },
          );
          throw new Error(allocData.error || "Room allocation failed");
        }
        toast.success(
          `${subject?.name} scheduled across ${roomIds.length} rooms — ${allocData.data.totalStudents} students seated`,
        );
      } else {
        toast.success(`${subject?.name} scheduled`);
      }
      onScheduled();
    } catch (e: any) {
      toast.error(e?.message || "Scheduling failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={subject?.name ?? "Schedule paper"}
      eyebrow="Schedule"
      icon={CalendarDays}
      size="xs"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl px-5 py-2.5 text-sm font-black text-ink-muted hover:bg-[#4d4354]/5 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <BrandButton
            variant="gradient"
            onClick={submit}
            disabled={busy || blocked}
            title={blocked ? "Seat the whole class before scheduling" : undefined}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Schedule
          </BrandButton>
        </div>
      }
    >
        <div className="space-y-4">
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
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">
              Rooms (free rooms only) — pick more than one to split the paper
            </span>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-2xl border border-[#cfc2d6]/20 bg-white p-1.5">
              {rooms.map((r) => {
                const order = roomIds.indexOf(r.id);
                const checked = order !== -1;
                return (
                  <label
                    key={r.id}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                      checked ? "bg-[#fbf0fe] text-[#1d1b20]" : "text-ink hover:bg-[#4d4354]/5"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRoom(r.id)}
                      className="h-4 w-4 shrink-0 accent-[#8127cf]"
                    />
                    <DoorOpen className="h-4 w-4 shrink-0 text-[#8127cf]" />
                    <span className="min-w-0 flex-1 truncate">{r.roomNumber}</span>
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
                      {r.unmeasured
                        ? "no size recorded"
                        : `${r.examCapacity} exam seats${r.teachingCapacity > r.examCapacity ? ` · ${r.teachingCapacity} teaching` : ""}`}
                    </span>
                    {checked && roomIds.length > 1 ? (
                      <span className="shrink-0 rounded-md bg-[#8127cf] px-1.5 py-0.5 text-[9px] font-black text-white">
                        {order === 0 ? "MAIN" : `#${order + 1}`}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            {selectedRooms.length > 0 ? (
              <p className="mt-1 text-[10px] font-bold text-ink-muted">
                {selectedRooms.length} room{selectedRooms.length === 1 ? "" : "s"} selected ·{" "}
                {seatsAvailable} seats for {studentsCount} students
                {multiRoom ? " · students are seated in roll-number order" : ""}
              </p>
            ) : null}
            {roomsLoading ? (
              <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-ink-subtle">
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
              <p className="mt-1 text-[10px] font-semibold text-ink-subtle">
                No free rooms for this slot.
              </p>
            ) : shortBy > 0 ? (
              <p
                role="alert"
                className="mt-1 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] font-bold leading-relaxed text-rose-600"
              >
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                <span>
                  Capacity conflict — {studentsCount} students sit this paper but the selected
                  room{selectedRooms.length === 1 ? "" : "s"} hold {seatsAvailable} ({shortBy} short).
                  Tick another room to seat the rest.
                </span>
              </p>
            ) : multiRoom && unsized.length > 0 ? (
              <p
                role="alert"
                className="mt-1 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] font-bold leading-relaxed text-rose-600"
              >
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                <span>
                  Room {unsized.map((r) => r.roomNumber).join(", ")} has no recorded size, so it
                  cannot be part of a split. Set its bench layout under Rooms, or pick another room.
                </span>
              </p>
            ) : multiRoom ? (
              <p className="mt-1 text-[10px] font-semibold text-[#0d9488]">
                Split across {roomIds.length} rooms — {studentsCount} students seated in roll-number
                order, {selectedRooms[0]?.roomNumber} first.
              </p>
            ) : (
              <p className="mt-1 text-[10px] font-semibold text-[#0d9488]">
                Auto-picked the smallest free room fitting {studentsCount || "the class"} — tick more
                rooms above to split the paper.
              </p>
            )}
          </label>
        </div>
    </Modal>
  );
}
