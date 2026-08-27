"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArmchairIcon,
  Check,
  Download,
  DoorOpen,
  Info,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BrandButton } from "@/components/role-dashboard";
import { Modal, ModalActions } from "@/components/ui/modal";
import { roomCapacity } from "@/lib/academic/room-capacity";
import { Panel, ProgressStat, StepEmpty } from "@/components/academic/exams/shared";

/**
 * The seating planner (§79, §80).
 *
 * Two things were wrong before this screen existed. The first is arithmetic: a
 * room recorded as "capacity 30" was treated as thirty exam seats, when thirty
 * is how many pupils fit three-to-a-bench in a lesson. At one candidate per
 * bench that room seats ten. The second is that there was no screen at all —
 * rooms were picked one paper at a time inside the date sheet, with no view of
 * whether the campus could seat the day.
 *
 * So this screen leads with the number that matters (exam seats, not teaching
 * seats), shows the shortfall before the day rather than on it, and can fill
 * every room in one action.
 */

interface SeatStudent {
  studentId: string;
  fullName: string;
  rollNumber: string;
  seatNumber: number;
  rowNo: number;
  benchNo: number;
  seatOnBench: number;
  seatLabel: string;
}

interface PlanRoom {
  examRoomId: string;
  roomId: string;
  roomNumber: string;
  location: string;
  capacity: number;
  teachingCapacity: number;
  rows: number;
  benchesPerRow: number;
  seatsPerBench: number;
  examSeatsPerBench: number;
  isPrimary: boolean;
  seated: number;
  students: SeatStudent[];
}

interface SeatingPlan {
  scheduleId: string;
  totalStudents: number;
  totalCapacity: number;
  totalTeachingCapacity: number;
  rooms: PlanRoom[];
}

interface AvailableRoom {
  id: string;
  roomNumber: string;
  location: string;
  examCapacity: number;
  teachingCapacity: number;
  benches: number;
  hasLayout: boolean;
  unmeasured: boolean;
  isExamHall: boolean;
  busy: boolean;
  busyReason: string | null;
}

interface PaperRow {
  id: string;
  date: string;
  periodDefinitionId: string | null;
  periodDefinition: { periodNumber: number; startTime: string; endTime: string } | null;
  subject: { id: string; name: string };
  rooms: {
    id: string;
    isPrimary: boolean;
    room: {
      id: string;
      roomNumber: string;
      capacity: number;
      rows: number;
      benchesPerRow: number;
      seatsPerBench: number;
      examSeatsPerBench: number;
    };
    _count: { seats: number };
  }[];
  exam: {
    id: string;
    classId: string;
    class: { name: string; section: string | null };
  };
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function prettyDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAY[dt.getDay()]} ${String(d).padStart(2, "0")} ${dt.toLocaleString("en", { month: "short" })}`;
}

function classLabel(c: { name: string; section: string | null }) {
  return `${c.name}${c.section ? ` ${c.section}` : ""}`;
}

export function SeatingPlanner({
  sessionId,
  campusId,
  onChanged,
}: {
  sessionId: string;
  campusId?: string;
  onChanged?: () => void;
}) {
  const [papers, setPapers] = useState<PaperRow[]>([]);
  const [headcounts, setHeadcounts] = useState<Record<string, number>>({});
  const [capacity, setCapacity] = useState({
    rooms: 0,
    examSeats: 0,
    teachingSeats: 0,
    unmeasured: 0,
  });
  const [loading, setLoading] = useState(true);
  const [seating, setSeating] = useState(false);
  const [open, setOpen] = useState<PaperRow | null>(null);
  const [report, setReport] = useState<{
    total: number;
    seated: number;
    skipped: number;
    failed: { label: string; message: string }[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ sessionId });
      if (campusId) sp.set("campusId", campusId);

      const capSp = new URLSearchParams();
      if (campusId) capSp.set("campusId", campusId);

      const [schedRes, capRes, gridRes] = await Promise.all([
        fetch(`/api/academic/exam-schedule?${sp}`).then((r) => r.json()),
        fetch(`/api/academic/exam-sessions/seating?${capSp}`).then((r) => r.json()),
        fetch(`/api/academic/exam-schedule/bulk?${sp}`).then((r) => r.json()),
      ]);

      const rows: PaperRow[] = (schedRes.data ?? []).map((s: PaperRow & { date: string }) => ({
        ...s,
        date: String(s.date).slice(0, 10),
      }));
      setPapers(rows);
      if (capRes.success) setCapacity(capRes.data.capacity);

      // Headcount per class, taken from the date-sheet grid so it is one
      // request rather than one per paper.
      const counts: Record<string, number> = {};
      for (const row of gridRes.data?.rows ?? []) {
        counts[row.classId] = row.studentCount;
      }
      setHeadcounts(counts);
    } catch {
      toast.error("Could not load the seating plan");
    } finally {
      setLoading(false);
    }
  }, [sessionId, campusId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Group papers into the slots they actually run in — that is the unit of
   *  room contention, and it is where a shortfall shows up. */
  const slots = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        date: string;
        period: PaperRow["periodDefinition"];
        papers: PaperRow[];
        candidates: number;
        seated: number;
        seatsUsed: number;
      }
    >();

    for (const paper of papers) {
      const key = `${paper.date}|${paper.periodDefinitionId ?? "any"}`;
      const entry =
        map.get(key) ??
        {
          key,
          date: paper.date,
          period: paper.periodDefinition,
          papers: [] as PaperRow[],
          candidates: 0,
          seated: 0,
          seatsUsed: 0,
        };
      entry.papers.push(paper);
      entry.candidates += headcounts[paper.exam.classId] ?? 0;
      entry.seated += paper.rooms.reduce((n, r) => n + r._count.seats, 0);
      entry.seatsUsed += paper.rooms.reduce((n, r) => n + roomCapacity(r.room).exam, 0);
      map.set(key, entry);
    }

    return [...map.values()].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.period?.periodNumber ?? 99) - (b.period?.periodNumber ?? 99),
    );
  }, [papers, headcounts]);

  const totals = useMemo(() => {
    const candidates = papers.reduce((n, p) => n + (headcounts[p.exam.classId] ?? 0), 0);
    const seated = papers.reduce(
      (n, p) => n + p.rooms.reduce((m, r) => m + r._count.seats, 0),
      0,
    );
    const withRooms = papers.filter((p) => p.rooms.length > 0).length;
    // The busiest single slot is the real test of whether the campus fits.
    const peak = slots.reduce((max, s) => Math.max(max, s.candidates), 0);
    return { candidates, seated, withRooms, peak };
  }, [papers, headcounts, slots]);

  const autoSeat = async () => {
    setSeating(true);
    try {
      const res = await fetch("/api/academic/exam-sessions/seating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campusId, sessionId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Could not build the seating plan");

      setReport({
        total: json.data.total,
        seated: json.data.seated,
        skipped: json.data.skipped ?? 0,
        failed: json.data.failed.map((f: { label: string; message: string }) => ({
          label: f.label,
          message: f.message,
        })),
      });
      if (json.data.failed.length === 0) {
        toast.success(`Seated ${json.data.seated} paper${json.data.seated === 1 ? "" : "s"}`);
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the seating plan");
    } finally {
      setSeating(false);
    }
  };

  const download = () => {
    const sp = new URLSearchParams({ doc: "seating", sessionId });
    if (campusId) sp.set("campusId", campusId);
    window.open(`/api/academic/exam-documents?${sp}`, "_blank", "noopener");
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-[18px] bg-[#e8e0ec]/40 skeleton-shimmer" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-[24px] bg-[#e8e0ec]/40 skeleton-shimmer" />
        ))}
      </div>
    );
  }

  if (papers.length === 0) {
    return (
      <StepEmpty
        icon={ArmchairIcon}
        title="Nothing to seat yet"
        body="A seating plan needs papers with dates. Set the date sheet first, then come back here and every paper can be filled into rooms in one action."
      />
    );
  }

  const shortfall = totals.peak - capacity.examSeats;

  return (
    <div className="space-y-4">
      {/* ── Capacity headline ───────────────────────────────────────────── */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <ProgressStat
          icon={Users}
          label="Candidates seated"
          value={totals.seated}
          total={totals.candidates}
          tone={totals.seated >= totals.candidates && totals.candidates > 0 ? "emerald" : "violet"}
        />
        <ProgressStat
          icon={Layers}
          label="Papers with rooms"
          value={totals.withRooms}
          total={papers.length}
          tone={totals.withRooms === papers.length ? "emerald" : "amber"}
        />
        <ProgressStat
          icon={ArmchairIcon}
          label="Exam seats on campus"
          value={capacity.examSeats}
          total={0}
          suffix={`of ${capacity.teachingSeats} teaching`}
          tone={shortfall > 0 ? "rose" : "emerald"}
        />
        <ProgressStat
          icon={DoorOpen}
          label="Busiest slot"
          value={totals.peak}
          total={0}
          suffix="candidates at once"
          tone={shortfall > 0 ? "rose" : "violet"}
        />
      </div>

      {/* ── The capacity explainer ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-[#cfc2d6]/20 bg-gradient-to-r from-[#f3eeff] to-[#faf7fc] px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#8127cf]" />
        <p className="min-w-0 flex-1 text-[11px] font-semibold leading-relaxed text-ink-muted">
          <span className="font-black text-[#1f1a23]">Exam seats are not teaching seats.</span> A
          room that holds 30 pupils three to a bench has 10 benches — so on an exam day, at one
          candidate per bench, it seats <span className="font-black text-[#8127cf]">10</span>.
          Every number on this screen is the exam figure. Set each room&apos;s rows, benches and
          seats-per-bench under <span className="font-black">Rooms</span> and the arithmetic
          happens on its own.
        </p>
        {capacity.unmeasured > 0 ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {capacity.unmeasured} room{capacity.unmeasured === 1 ? "" : "s"} unmeasured
          </span>
        ) : null}
      </div>

      {shortfall > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/60 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
          <p className="min-w-0 flex-1 text-xs font-bold text-rose-700">
            The busiest slot needs {totals.peak} exam seats and the campus has {capacity.examSeats}.
            You are {shortfall} short — split that slot across two days, or record the bench layout
            of rooms that have none.
          </p>
        </div>
      ) : null}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-[#cfc2d6]/20 bg-white/85 px-4 py-3 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_8px_24px_-16px_rgba(31,26,35,0.35)] backdrop-blur-xl">
        <p className="text-xs font-black text-[#1f1a23]">
          {slots.length} exam slot{slots.length === 1 ? "" : "s"} across {papers.length} paper
          {papers.length === 1 ? "" : "s"}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            aria-label="Refresh"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-[#cfc2d6]/25 bg-white text-ink-muted transition-colors hover:border-[#8127cf]/35 hover:text-[#8127cf]"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <BrandButton
            variant="dark"
            icon={<Download className="h-4 w-4" />}
            onClick={download}
            disabled={totals.seated === 0}
          >
            Download plan
          </BrandButton>
          <BrandButton
            onClick={autoSeat}
            disabled={seating}
            icon={seating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          >
            {seating ? "Seating…" : "Fill rooms automatically"}
          </BrandButton>
        </div>
      </div>

      {/* ── Slots ───────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {slots.map((slot) => {
          const slotShort = slot.candidates - slot.seated;
          return (
            <Panel
              key={slot.key}
              title={prettyDate(slot.date)}
              subtitle={
                slot.period
                  ? `Period ${slot.period.periodNumber} · ${slot.period.startTime}–${slot.period.endTime} · ${slot.candidates} candidates`
                  : `No fixed time · ${slot.candidates} candidates`
              }
              icon={MapPin}
              actions={
                slotShort > 0 ? (
                  <span className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
                    {slotShort} unseated
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-600">
                    <Check className="h-3.5 w-3.5" />
                    All seated
                  </span>
                )
              }
              bodyClassName="p-3"
            >
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {slot.papers.map((paper) => {
                  const head = headcounts[paper.exam.classId] ?? 0;
                  const seated = paper.rooms.reduce((n, r) => n + r._count.seats, 0);
                  const seats = paper.rooms.reduce((n, r) => n + roomCapacity(r.room).exam, 0);
                  const done = head > 0 && seated >= head;
                  return (
                    <button
                      key={paper.id}
                      type="button"
                      onClick={() => setOpen(paper)}
                      className={cn(
                        "group cursor-pointer rounded-2xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5",
                        done
                          ? "border-emerald-200/70 bg-emerald-50/40 hover:border-emerald-300"
                          : paper.rooms.length > 0
                          ? "border-amber-200/70 bg-amber-50/40 hover:border-amber-300"
                          : "border-[#cfc2d6]/25 bg-white hover:border-[#8127cf]/35",
                      )}
                    >
                      <p className="truncate text-xs font-black text-[#1f1a23]">
                        {classLabel(paper.exam.class)}
                      </p>
                      <p className="truncate text-[11px] font-bold text-ink-muted">
                        {paper.subject.name}
                      </p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <Users className="h-3 w-3 shrink-0 text-ink-subtle" />
                        <span className="text-[10px] font-black tabular-nums text-[#1f1a23]">
                          {seated}/{head}
                        </span>
                        <span className="ml-auto truncate text-[10px] font-bold text-ink-subtle">
                          {paper.rooms.length === 0
                            ? "No room"
                            : `${paper.rooms.map((r) => r.room.roomNumber).join(", ")} · ${seats} seats`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Panel>
          );
        })}
      </div>

      {open ? (
        <RoomAssignModal
          paper={open}
          headcount={headcounts[open.exam.classId] ?? 0}
          campusId={campusId}
          onClose={() => setOpen(null)}
          onSaved={async () => {
            await load();
            onChanged?.();
          }}
        />
      ) : null}

      {report ? (
        <Modal
          title="Seating plan built"
          subtitle={
            `${report.seated} of ${report.total} papers were filled into rooms` +
            (report.skipped > 0
              ? `, and ${report.skipped} already had rooms and were left alone.`
              : ".")
          }
          icon={report.failed.length === 0 ? Check : AlertTriangle}
          tone={report.failed.length === 0 ? "emerald" : "amber"}
          size="md"
          onClose={() => setReport(null)}
          footer={
            <div className="flex justify-end">
              <BrandButton onClick={() => setReport(null)}>Done</BrandButton>
            </div>
          }
        >
          {report.failed.length === 0 ? (
            <p className="text-sm font-semibold text-ink-muted">
              Every paper has rooms and every candidate has a seat. Download the plan and hand it
              to the invigilators.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-bold text-ink-muted">
                These papers could not be seated. Each one says why.
              </p>
              <ul className="max-h-72 space-y-1.5 overflow-y-auto custom-scrollbar">
                {report.failed.map((f, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-amber-200/60 bg-amber-50/50 px-3 py-2"
                  >
                    <p className="text-[11px] font-black text-[#1f1a23]">{f.label}</p>
                    <p className="mt-0.5 text-[11px] font-semibold leading-snug text-amber-700">
                      {f.message}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Assigning rooms to one paper
 * ────────────────────────────────────────────────────────────────────────── */

function RoomAssignModal({
  paper,
  headcount,
  campusId,
  onClose,
  onSaved,
}: {
  paper: PaperRow;
  headcount: number;
  campusId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [available, setAvailable] = useState<AvailableRoom[]>([]);
  const [plan, setPlan] = useState<SeatingPlan | null>(null);
  const [chosen, setChosen] = useState<string[]>(paper.rooms.map((r) => r.room.id));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        date: paper.date,
        excludeScheduleId: paper.id,
      });
      if (paper.periodDefinitionId) sp.set("periodDefinitionId", paper.periodDefinitionId);
      if (campusId) sp.set("campusId", campusId);

      const planSp = new URLSearchParams({ scheduleId: paper.id });
      if (campusId) planSp.set("campusId", campusId);

      const [roomsRes, planRes] = await Promise.all([
        fetch(`/api/academic/exam-sessions/seating?${sp}`).then((r) => r.json()),
        fetch(`/api/academic/exam-schedule/rooms?${planSp}`).then((r) => r.json()),
      ]);
      if (roomsRes.success) setAvailable(roomsRes.data.rooms ?? []);
      if (planRes.success) setPlan(planRes.data as SeatingPlan);
    } catch {
      toast.error("Could not load rooms");
    } finally {
      setLoading(false);
    }
  }, [paper.id, paper.date, paper.periodDefinitionId, campusId]);

  useEffect(() => {
    load();
  }, [load]);

  const chosenRooms = chosen
    .map((id) => available.find((r) => r.id === id))
    .filter(Boolean) as AvailableRoom[];
  const chosenSeats = chosenRooms.reduce((n, r) => n + r.examCapacity, 0);
  const short = headcount - chosenSeats;

  const toggle = (id: string) => {
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
    if (chosen.length === 0) return toast.error("Pick at least one room");
    setSaving(true);
    try {
      const res = await fetch("/api/academic/exam-schedule/rooms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campusId, scheduleId: paper.id, roomIds: chosen }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Could not seat this paper");
      setPlan(json.data as SeatingPlan);
      toast.success(`Seated ${json.data.totalStudents} candidates`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not seat this paper");
    } finally {
      setSaving(false);
    }
  };

  const downloadOne = () => {
    const sp = new URLSearchParams({ doc: "seating", scheduleId: paper.id });
    if (campusId) sp.set("campusId", campusId);
    window.open(`/api/academic/exam-documents?${sp}`, "_blank", "noopener");
  };

  return (
    <Modal
      title={`${classLabel(paper.exam.class)} — ${paper.subject.name}`}
      eyebrow="Seating"
      subtitle={`${prettyDate(paper.date)}${paper.periodDefinition ? ` · ${paper.periodDefinition.startTime}–${paper.periodDefinition.endTime}` : ""} · ${headcount} candidates`}
      icon={ArmchairIcon}
      tone="violet"
      size="xl"
      onClose={onClose}
      headerActions={
        plan && plan.totalStudents > 0 ? (
          <button
            type="button"
            onClick={downloadOne}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-[#f3eeff] px-3 text-[11px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:bg-[#e9dcfb]"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
        ) : null
      }
      footer={
        <ModalActions
          busy={saving}
          busyLabel="Seating…"
          actionLabel={`Seat ${headcount} candidate${headcount === 1 ? "" : "s"}`}
          cancelLabel="Close"
          onCancel={onClose}
          onAction={save}
          blockedReason={
            chosen.length === 0
              ? "Pick at least one room."
              : short > 0
              ? `${short} more exam seat${short === 1 ? "" : "s"} needed — add another room.`
              : null
          }
          secondary={
            <span
              className={cn(
                "text-xs font-black",
                short > 0 ? "text-rose-600" : "text-emerald-600",
              )}
            >
              {chosenSeats} exam seats selected
              {short > 0 ? ` · ${short} short` : ` · ${-short} spare`}
            </span>
          }
        />
      }
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-2xl bg-[#e8e0ec]/40 skeleton-shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          {/* ── Pick rooms ────────────────────────────────────────────── */}
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
              Rooms free in this slot
            </p>
            <div className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
              {available.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[#cfc2d6]/35 p-6 text-center text-xs font-bold text-ink-muted">
                  No rooms on this campus yet.
                </p>
              ) : (
                available.map((room) => {
                  const on = chosen.includes(room.id);
                  const disabled = room.unmeasured || (room.busy && !on);
                  return (
                    <button
                      key={room.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(room.id)}
                      aria-pressed={on}
                      title={room.busyReason ?? undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-all",
                        on
                          ? "border-[#8127cf] bg-gradient-to-r from-[#faf5ff] to-white shadow-[0_0_0_1px_rgba(129,39,207,0.3)]"
                          : "border-[#cfc2d6]/25 bg-white",
                        disabled
                          ? "cursor-not-allowed opacity-45"
                          : "cursor-pointer hover:border-[#8127cf]/40",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black",
                          on ? "bg-[#8127cf] text-white" : "bg-[#f3eeff] text-[#8127cf]",
                        )}
                      >
                        {on ? <Check className="h-4 w-4" /> : room.examCapacity}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-black text-[#1f1a23]">
                            {room.roomNumber}
                          </span>
                          {room.isExamHall ? (
                            <span className="rounded bg-[#f3eeff] px-1 py-px text-[8px] font-black uppercase tracking-wider text-[#8127cf]">
                              Hall
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] font-semibold text-ink-subtle">
                          {room.unmeasured
                            ? "No size recorded — set it under Rooms"
                            : room.busy
                            ? room.busyReason
                            : `${room.examCapacity} exam seats · ${room.teachingCapacity} teaching${room.location ? ` · ${room.location}` : ""}`}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── The plan ──────────────────────────────────────────────── */}
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
              Seating plan
            </p>
            {!plan || plan.rooms.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#cfc2d6]/35 p-8 text-center">
                <ArmchairIcon className="mx-auto mb-2 h-8 w-8 text-[#8127cf]/30" />
                <p className="text-xs font-bold text-ink-muted">
                  Pick rooms and seat the candidates to see the plan.
                </p>
              </div>
            ) : (
              <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {plan.rooms.map((room) => (
                  <RoomSeatMap key={room.examRoomId} room={room} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * One room drawn as the room, not as a list.
 *
 * An invigilator matches a name to a chair, so the plan is laid out the way
 * they will walk it — front row at the top, benches left to right.
 */
function RoomSeatMap({ room }: { room: PlanRoom }) {
  const rows = useMemo(() => {
    const map = new Map<number, SeatStudent[]>();
    room.students.forEach((s, i) => {
      const key = s.rowNo > 0 ? s.rowNo : Math.floor(i / 5) + 1;
      map.set(key, [...(map.get(key) ?? []), s]);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [room.students]);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#cfc2d6]/25 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#cfc2d6]/15 bg-[#faf7fc] px-3 py-2">
        <DoorOpen className="h-3.5 w-3.5 shrink-0 text-[#8127cf]" />
        <span className="text-xs font-black text-[#1f1a23]">Room {room.roomNumber}</span>
        {room.isPrimary ? (
          <span className="rounded bg-[#f3eeff] px-1.5 py-px text-[8px] font-black uppercase tracking-wider text-[#8127cf]">
            Primary
          </span>
        ) : null}
        <span className="ml-auto text-[10px] font-bold tabular-nums text-ink-subtle">
          {room.seated} / {room.capacity} seats
          {room.teachingCapacity > room.capacity ? ` (${room.teachingCapacity} teaching)` : ""}
        </span>
      </div>

      <div className="p-2.5">
        <p className="mb-2 rounded-lg bg-[#f3f4f9] py-1 text-center text-[8px] font-black uppercase tracking-[0.2em] text-ink-subtle">
          Front of room
        </p>
        <div className="space-y-1">
          {rows.map(([rowNo, seats]) => (
            <div key={rowNo} className="flex items-center gap-1">
              <span className="w-5 shrink-0 text-[8px] font-black text-ink-subtle">R{rowNo}</span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {seats.map((s) => (
                  <span
                    key={s.studentId}
                    title={`${s.fullName} · Roll ${s.rollNumber} · ${s.seatLabel}`}
                    className="group flex min-w-0 flex-1 basis-16 cursor-default flex-col rounded-lg border border-[#cfc2d6]/25 bg-gradient-to-b from-white to-[#faf7fc] px-1.5 py-1 transition-colors hover:border-[#8127cf]/40 hover:from-[#faf5ff]"
                  >
                    <span className="truncate text-[8px] font-black leading-tight text-[#8127cf]">
                      {s.seatLabel}
                    </span>
                    <span className="truncate text-[9px] font-black leading-tight text-[#1f1a23]">
                      {s.fullName}
                    </span>
                    <span className="truncate text-[8px] font-semibold leading-tight text-ink-subtle">
                      {s.rollNumber}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
