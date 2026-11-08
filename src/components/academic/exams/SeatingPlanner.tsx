"use client";

import { Button } from "@/components/ui/button";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArmchairIcon,
  Check,
  Download,
  DoorOpen,
  Info,
  Layers,
  MapPin,
  RefreshCw,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BrandButton } from "@/components/role-dashboard";
import { Modal, ModalActions } from "@/components/ui/modal";
import { roomCapacity } from "@/lib/academic/room-capacity";
import { Panel, ProgressStat, StepEmpty } from "@/components/academic/exams/shared";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";

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

/** "Mon 14 Oct" in the viewer's language (R7: dates through Intl). */
function prettyDate(ymd: string, language = "en") {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  try {
    return new Intl.DateTimeFormat(language, { weekday: "short", day: "2-digit", month: "short" }).format(dt);
  } catch {
    return dt.toDateString();
  }
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
  const ui = useUiText();
  const { language } = useLocale();
  const [papers, setPapers] = useState<PaperRow[]>([]);
  // R4: a failed load is an inline ErrorState with retry, never only a toast.
  const [loadFailed, setLoadFailed] = useState(false);
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
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
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
      if (!res.ok || !json.success) throw new Error(json.error || "");

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
        toast.success(json.data.seated === 1 ? ui("Seated 1 paper") : ui("Seated {0} papers", [json.data.seated]));
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not build the seating plan")));
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
            <div key={i} className="h-20 rounded-[18px] bg-border-subtle/40 skeleton-shimmer" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-[24px] bg-border-subtle/40 skeleton-shimmer" />
        ))}
      </div>
    );
  }

  if (loadFailed) {
    return <ErrorState title={ui("The seating plan could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void load()} />;
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
          suffix={ui("of {0} teaching", [capacity.teachingSeats])}
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
      <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-edge/20 bg-gradient-to-r from-brand-100 to-surface-subtle px-4 py-3">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-2xs font-semibold leading-relaxed text-ink-muted">
          <span className="font-bold text-ink-strong">{ui("Exam seats are not teaching seats.")}</span>{" "}
          {ui("A room that holds 30 pupils three to a bench has 10 benches — so on an exam day, at one candidate per bench, it seats 10. Every number on this screen is the exam figure. Set each room's rows, benches and seats-per-bench under Rooms and the arithmetic happens on its own.")}
        </p>
        {capacity.unmeasured > 0 ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-status-warning-surface px-2.5 py-1.5 text-2xs font-semibold text-status-warning-text">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
            {ui(capacity.unmeasured === 1 ? "{0} room unmeasured" : "{0} rooms unmeasured", [capacity.unmeasured])}
          </span>
        ) : null}
      </div>

      {shortfall > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-status-error-border bg-status-error-surface px-4 py-3">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-status-error-text" />
          <p className="min-w-0 flex-1 text-xs font-bold text-status-error-text">
            {ui("The busiest slot needs {0} exam seats and the campus has {1}. You are {2} short — split that slot across two days, or record the bench layout of rooms that have none.", [totals.peak, capacity.examSeats, shortfall])}
          </p>
        </div>
      ) : null}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-edge/20 bg-card/85 px-4 py-3 shadow-sm backdrop-blur-xl">
        <p className="text-xs font-bold text-ink-strong">
          {[
            ui(slots.length === 1 ? "{0} exam slot" : "{0} exam slots", [slots.length]),
            ui(papers.length === 1 ? "{0} paper" : "{0} papers", [papers.length]),
          ].join(" · ")}
        </p>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon"
            type="button"
            onClick={() => void load()}
            aria-label={ui("Refresh")}
            className="flex items-center justify-center"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          </Button>
          <BrandButton
            variant="dark"
            icon={<Download aria-hidden="true" className="h-4 w-4" />}
            onClick={download}
            disabled={totals.seated === 0}
          >
            {ui("Download plan")}
          </BrandButton>
          <BrandButton
            onClick={autoSeat}
            loading={seating}
            icon={seating ? null : <Wand2 className="h-4 w-4" aria-hidden="true" />}
          >
            {ui("Fill rooms automatically")}
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
              title={prettyDate(slot.date, language)}
              subtitle={
                slot.period
                  ? ui("Period {0} · {1}–{2} · {3} candidates", [slot.period.periodNumber, slot.period.startTime, slot.period.endTime, slot.candidates])
                  : ui("No fixed time · {0} candidates", [slot.candidates])
              }
              icon={MapPin}
              actions={
                slotShort > 0 ? (
                  <span className="flex items-center gap-1.5 rounded-xl bg-status-warning-surface px-2.5 py-1.5 text-2xs font-semibold text-status-warning-text">
                    {ui("{0} unseated", [slotShort])}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-xl bg-status-success-surface px-2.5 py-1.5 text-2xs font-semibold text-status-success-text">
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                    {ui("All seated")}
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
                    <Button variant="outline"
                      key={paper.id}
                      type="button"
                      onClick={() => setOpen(paper)}
                      className={"block " + (cn(
                        "group p-3 text-start hover:-translate-y-0.5",
                        done
                          ? ""
                          : "",
                      ))}
                    >
                      <bdi className="block truncate text-xs font-bold text-ink-strong">
                        {classLabel(paper.exam.class)}
                      </bdi>
                      <bdi className="block truncate text-2xs font-bold text-ink-muted">
                        {paper.subject.name}
                      </bdi>
                      <div className="mt-2 flex items-center gap-1.5">
                        <Users aria-hidden="true" className="h-3 w-3 shrink-0 text-ink-subtle" />
                        <bdi dir="ltr" className="text-2xs font-bold tabular-nums text-ink-strong">
                          {seated}/{head}
                        </bdi>
                        <span className="ms-auto truncate text-2xs font-bold text-ink-subtle">
                          {paper.rooms.length === 0
                            ? ui("No room")
                            : ui("{0} · {1} seats", [paper.rooms.map((r) => r.room.roomNumber).join(", "), seats])}
                        </span>
                      </div>
                    </Button>
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
          title={ui("Seating plan built")}
          subtitle={
            report.skipped > 0
              ? ui("{0} of {1} papers were filled into rooms, and {2} already had rooms and were left alone.", [report.seated, report.total, report.skipped])
              : ui("{0} of {1} papers were filled into rooms.", [report.seated, report.total])
          }
          icon={report.failed.length === 0 ? Check : AlertTriangle}
          tone={report.failed.length === 0 ? "emerald" : "amber"}
          size="md"
          onClose={() => setReport(null)}
          footer={
            <div className="flex justify-end">
              <BrandButton onClick={() => setReport(null)}>{ui("Done")}</BrandButton>
            </div>
          }
        >
          {report.failed.length === 0 ? (
            <p className="text-sm font-normal leading-relaxed text-ink-muted">
              {ui("Every paper has rooms and every candidate has a seat. Download the plan and hand it to the invigilators.")}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-bold text-ink-muted">
                {ui("These papers could not be seated. Each one says why.")}
              </p>
              <ul className="max-h-72 space-y-1.5 overflow-y-auto custom-scrollbar">
                {report.failed.map((f, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-status-warning-border bg-status-warning-surface px-3 py-2"
                  >
                    <bdi className="block text-2xs font-bold text-ink-strong">{f.label}</bdi>
                    <p className="mt-0.5 text-2xs font-semibold leading-snug text-status-warning-text">
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
  const ui = useUiText();
  const { language } = useLocale();
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
      toast.error(ui("Could not load rooms"));
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
    if (chosen.length === 0) return toast.error(ui("Pick at least one room"));
    setSaving(true);
    try {
      const res = await fetch("/api/academic/exam-schedule/rooms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campusId, scheduleId: paper.id, roomIds: chosen }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "");
      setPlan(json.data as SeatingPlan);
      toast.success(ui("Seated {0} candidates", [json.data.totalStudents]));
      onSaved();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not seat this paper")));
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
      eyebrow={ui("Seating")}
      subtitle={[prettyDate(paper.date, language), paper.periodDefinition ? `${paper.periodDefinition.startTime}–${paper.periodDefinition.endTime}` : null, ui("{0} candidates", [headcount])].filter(Boolean).join(" · ")}
      icon={ArmchairIcon}
      tone="violet"
      size="xl"
      onClose={onClose}
      headerActions={
        plan && plan.totalStudents > 0 ? (
          <Button variant="secondary"
            type="button"
            onClick={downloadOne}
            className="justify-start flex items-center gap-1.5 px-3"
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
            {ui("PDF")}
          </Button>
        ) : null
      }
      footer={
        <ModalActions
          busy={saving}
          busyLabel={ui("Seating…")}
          actionLabel={ui(headcount === 1 ? "Seat 1 candidate" : "Seat {0} candidates", [headcount])}
          cancelLabel={ui("Close")}
          onCancel={onClose}
          onAction={save}
          blockedReason={
            chosen.length === 0
              ? ui("Pick at least one room.")
              : short > 0
              ? ui(short === 1 ? "1 more exam seat needed — add another room." : "{0} more exam seats needed — add another room.", [short])
              : null
          }
          secondary={
            <span
              className={cn(
                "text-xs font-bold",
                short > 0 ? "text-status-error-text" : "text-status-success-text",
              )}
            >
              {ui(short > 0 ? "{0} exam seats selected · {1} short" : "{0} exam seats selected · {1} spare", [chosenSeats, Math.abs(short)])}
            </span>
          }
        />
      }
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-2xl bg-border-subtle/40 skeleton-shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          {/* ── Pick rooms ────────────────────────────────────────────── */}
          <div>
            <p className="mb-2 text-xs font-semibold text-ink-subtle">
              {ui("Rooms free in this slot")}
            </p>
            <div className="max-h-[26rem] space-y-1.5 overflow-y-auto pe-1 custom-scrollbar">
              {available.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={DoorOpen}
                  title={ui("No rooms on this campus yet")}
                  description={ui("Add rooms with a measured exam capacity to this campus first, then come back to seat this paper.")}
                />
              ) : (
                available.map((room) => {
                  const on = chosen.includes(room.id);
                  const disabled = room.unmeasured || (room.busy && !on);
                  const choice = (
                    <Button variant="choice"
                      key={room.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(room.id)}
                      aria-pressed={on}
                      className={"justify-start " + (cn(
                        "flex w-full items-center gap-3 p-2.5 text-start",
                        "",
                        "",
                      ))}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-2xs font-bold",
                          on ? "bg-primary text-primary-foreground" : "bg-brand-100 text-primary",
                        )}
                      >
                        {on ? <Check aria-hidden="true" className="h-4 w-4" /> : room.examCapacity}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <bdi className="truncate text-xs font-bold text-ink-strong">
                            {room.roomNumber}
                          </bdi>
                          {room.isExamHall ? (
                            <span className="rounded bg-brand-100 px-1 py-px text-2xs font-semibold text-primary">
                              {ui("Hall")}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-2xs font-semibold text-ink-subtle">
                          {room.unmeasured
                            ? ui("No size recorded — set it under Rooms")
                            : room.busy
                            ? room.busyReason
                            : [ui("{0} exam seats", [room.examCapacity]), ui("{0} teaching", [room.teachingCapacity]), room.location].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </Button>
                  );
                  return room.busy && room.busyReason ? (
                    <Tooltip key={room.id} content={room.busyReason}>
                      <span tabIndex={0} className="block rounded-xl">
                        {choice}
                      </span>
                    </Tooltip>
                  ) : (
                    choice
                  );
                })
              )}
            </div>
          </div>

          {/* ── The plan ──────────────────────────────────────────────── */}
          <div>
            <p className="mb-2 text-xs font-semibold text-ink-subtle">
              {ui("Seating plan")}
            </p>
            {!plan || plan.rooms.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-edge/35 p-8 text-center">
                <ArmchairIcon aria-hidden="true" className="mx-auto mb-2 h-8 w-8 text-primary/30" />
                <p className="text-xs font-bold text-ink-muted">
                  {ui("Pick rooms and seat the candidates to see the plan.")}
                </p>
              </div>
            ) : (
              <div className="max-h-[26rem] space-y-3 overflow-y-auto pe-1 custom-scrollbar">
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
  const ui = useUiText();
  const rows = useMemo(() => {
    const map = new Map<number, SeatStudent[]>();
    room.students.forEach((s, i) => {
      const key = s.rowNo > 0 ? s.rowNo : Math.floor(i / 5) + 1;
      map.set(key, [...(map.get(key) ?? []), s]);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [room.students]);

  return (
    <div className="sk-panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-edge/15 bg-surface-subtle px-3 py-2">
        <DoorOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="text-xs font-bold text-ink-strong">{ui("Room {0}", [room.roomNumber])}</span>
        {room.isPrimary ? (
          <span className="rounded bg-brand-100 px-1.5 py-px text-2xs font-semibold text-primary">
            {ui("Primary")}
          </span>
        ) : null}
        <span className="ms-auto text-2xs font-bold tabular-nums text-ink-subtle">
          {room.teachingCapacity > room.capacity
            ? ui("{0} / {1} seats ({2} teaching)", [room.seated, room.capacity, room.teachingCapacity])
            : ui("{0} / {1} seats", [room.seated, room.capacity])}
        </span>
      </div>

      <div className="p-2.5">
        <p className="mb-2 rounded-lg bg-muted py-1 text-center text-2xs font-semibold text-ink-subtle">
          {ui("Front of room")}
        </p>
        <div className="space-y-1">
          {rows.map(([rowNo, seats]) => (
            <div key={rowNo} className="flex items-center gap-1">
              <span className="w-7 shrink-0 text-3xs font-bold text-ink-subtle" title={ui("Row {0}", [rowNo])}>{ui("R{0}", [rowNo])}</span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {seats.map((s) => (
                  <Tooltip key={s.studentId} content={ui("{0} · Roll {1} · {2}", [s.fullName, s.rollNumber, s.seatLabel])}>
                  <span
                    tabIndex={0}
                    className="group flex min-w-0 flex-1 basis-16 cursor-default flex-col rounded-lg border border-edge/25 bg-gradient-to-b from-card to-surface-subtle px-1.5 py-1 transition-colors hover:border-primary/40 hover:from-brand-50"
                  >
                    <span className="truncate text-3xs font-bold leading-tight text-primary">
                      {s.seatLabel}
                    </span>
                    <bdi className="truncate text-2xs font-bold leading-tight text-ink-strong">
                      {s.fullName}
                    </bdi>
                    <span className="truncate text-3xs font-semibold leading-tight text-ink-subtle">
                      {s.rollNumber}
                    </span>
                  </span>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
