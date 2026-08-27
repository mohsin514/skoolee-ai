"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArmchairIcon,
  Building2,
  Check,
  DoorOpen,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Modal, ModalActions } from "@/components/ui/modal";
import { BrandButton } from "@/components/role-dashboard";
import { ROOM_TYPES, floorLabel, roomCapacity } from "@/lib/academic/room-capacity";
import { Field, Panel, StepEmpty, inputClass, selectClass } from "@/components/academic/exams/shared";

/**
 * Rooms, with the two facts a seating plan needs (§79).
 *
 * A room used to be a number and a seat count. That is enough to draw a
 * timetable and not nearly enough to run an exam, for two reasons.
 *
 * The first is location. An invigilator handed "R-101" has to find R-101, and
 * on a campus with three blocks that is a question, not an answer. So rooms
 * now record their building, floor and wing.
 *
 * The second is the seat count itself. "Capacity 30" means thirty pupils in a
 * lesson — three to a bench, ten benches. On an exam day only one candidate
 * may sit per bench, so the same room holds ten. Recording the layout (rows ×
 * benches × seats per bench) makes both numbers derivable, and stops the exam
 * planner from confidently allocating three times as many candidates as the
 * room can actually invigilate.
 */

interface Room {
  id: string;
  roomNumber: string;
  capacity: number;
  note: string | null;
  building: string | null;
  floor: number;
  wing: string | null;
  roomType: string;
  rows: number;
  benchesPerRow: number;
  seatsPerBench: number;
  examSeatsPerBench: number;
  isExamHall: boolean;
  location: string;
  examCapacity: number;
  teachingCapacity: number;
  benches: number;
  spacingLoss: number;
  hasLayout: boolean;
  unmeasured: boolean;
  _count?: { slots: number; examSchedules: number; examRooms: number };
}

const BLANK = {
  roomNumber: "",
  building: "",
  floor: 0,
  wing: "",
  roomType: "CLASSROOM",
  rows: 5,
  benchesPerRow: 3,
  seatsPerBench: 2,
  examSeatsPerBench: 1,
  capacity: 0,
  isExamHall: false,
  note: "",
};

type Draft = typeof BLANK;

export function RoomsManager({ campusId }: { campusId?: string }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Room | "new" | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/academic/rooms${campusId ? `?campusId=${campusId}` : ""}`,
      ).then((r) => r.json());
      if (!res.success) throw new Error(res.error || "Could not load rooms");
      setRooms(res.data as Room[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load rooms");
    } finally {
      setLoading(false);
    }
  }, [campusId]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const exam = rooms.reduce((n, r) => n + r.examCapacity, 0);
    const teaching = rooms.reduce((n, r) => n + r.teachingCapacity, 0);
    return {
      rooms: rooms.length,
      exam,
      teaching,
      unmeasured: rooms.filter((r) => r.unmeasured).length,
      halls: rooms.filter((r) => r.isExamHall).length,
    };
  }, [rooms]);

  /** Grouped by building then floor, which is how anyone walking the campus
   *  thinks about them. */
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q
      ? rooms.filter((r) =>
          `${r.roomNumber} ${r.building ?? ""} ${r.wing ?? ""} ${r.note ?? ""}`
            .toLowerCase()
            .includes(q),
        )
      : rooms;

    const map = new Map<string, Room[]>();
    visible.forEach((r) => {
      const key = r.building?.trim() || "Unassigned block";
      map.set(key, [...(map.get(key) ?? []), r]);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([building, list]) => ({
        building,
        rooms: list.sort(
          (a, b) => a.floor - b.floor || a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
        ),
      }));
  }, [rooms, query]);

  const remove = async (room: Room) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/academic/rooms?id=${room.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Could not remove the room");
      toast.success(`Room ${room.roomNumber} removed`);
      setDeleting(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the room");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sk-rise space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-[28px] border border-[#cfc2d6]/25 bg-gradient-to-br from-[#0f766e] via-[#115e59] to-[#134e4a] px-6 py-5 text-white shadow-[0_18px_48px_-24px_rgba(15,118,110,0.6)]">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/12">
            <DoorOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/55">
              Run the year
            </p>
            <h2 className="mt-0.5 text-2xl font-black tracking-tight">Rooms</h2>
            <p className="mt-1 text-xs font-semibold text-white/70">
              {totals.rooms} rooms · <span className="font-black">{totals.exam} exam seats</span> ·{" "}
              {totals.teaching} teaching seats
            </p>
          </div>
          <BrandButton
            variant="dark"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setEditing("new")}
            className="bg-white text-[#0f766e] hover:bg-white/90"
          >
            Add room
          </BrandButton>
        </div>
      </header>

      {/* ── The capacity explainer ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-[#cfc2d6]/20 bg-gradient-to-r from-[#f3eeff] to-[#faf7fc] px-4 py-3">
        <ArmchairIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#8127cf]" />
        <p className="min-w-0 flex-1 text-[11px] font-semibold leading-relaxed text-ink-muted">
          <span className="font-black text-[#1f1a23]">
            Record the bench layout, not just a seat count.
          </span>{" "}
          Rows × benches × seats-per-bench gives the teaching capacity; the same benches at one
          candidate each give the exam capacity. A room of 5 rows × 3 benches × 2 seats holds{" "}
          <span className="font-black">30</span> in a lesson and{" "}
          <span className="font-black text-[#8127cf]">15</span> in an exam.
        </p>
        {totals.unmeasured > 0 ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {totals.unmeasured} unmeasured
          </span>
        ) : null}
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      {rooms.length > 6 ? (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a room, block or wing…"
            className={cn(inputClass, "pl-9")}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-[24px] bg-[#e8e0ec]/40 skeleton-shimmer" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <StepEmpty
          icon={DoorOpen}
          title="No rooms yet"
          body="Add the rooms on this campus with their bench layout, and both the timetable and the exam seating planner can use them straight away."
          action={
            <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
              Add your first room
            </BrandButton>
          }
        />
      ) : grouped.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#cfc2d6]/35 p-10 text-center text-xs font-bold text-ink-muted">
          No room matches “{query}”.
        </p>
      ) : (
        grouped.map(({ building, rooms: list }) => (
          <Panel
            key={building}
            title={building}
            subtitle={`${list.length} room${list.length === 1 ? "" : "s"} · ${list.reduce((n, r) => n + r.examCapacity, 0)} exam seats`}
            icon={Building2}
            bodyClassName="p-3"
          >
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onEdit={() => setEditing(room)}
                  onDelete={() => setDeleting(room)}
                />
              ))}
            </div>
          </Panel>
        ))
      )}

      {editing ? (
        <RoomEditor
          room={editing === "new" ? null : editing}
          campusId={campusId}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}

      {deleting ? (
        <Modal
          title={`Remove room ${deleting.roomNumber}?`}
          subtitle={
            (deleting._count?.slots ?? 0) +
              (deleting._count?.examSchedules ?? 0) +
              (deleting._count?.examRooms ?? 0) >
            0
              ? "This room is still booked. Those bookings have to move elsewhere first — the removal will be refused until they do."
              : "Nothing is booked in this room, so it can go."
          }
          icon={Trash2}
          tone="rose"
          size="sm"
          role="alertdialog"
          onClose={() => setDeleting(null)}
          footer={
            <ModalActions
              busy={busy}
              busyLabel="Removing…"
              actionLabel="Remove room"
              cancelLabel="Keep it"
              tone="rose"
              onCancel={() => setDeleting(null)}
              onAction={() => remove(deleting)}
            />
          }
        >
          <p className="text-sm font-semibold text-ink-muted">
            {deleting.examCapacity} exam seats will leave the campus total.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function RoomCard({
  room,
  onEdit,
  onDelete,
}: {
  room: Room;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const bookings =
    (room._count?.slots ?? 0) + (room._count?.examSchedules ?? 0) + (room._count?.examRooms ?? 0);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[#cfc2d6]/25 bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8127cf]/30 hover:shadow-[0_14px_32px_-20px_rgba(129,39,207,0.5)]">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black",
            room.unmeasured
              ? "bg-amber-50 text-amber-600"
              : room.isExamHall
              ? "bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white"
              : "bg-[#f3eeff] text-[#8127cf]",
          )}
        >
          {room.roomNumber.slice(0, 3).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-black text-[#1f1a23]">{room.roomNumber}</p>
            {room.isExamHall ? (
              <span className="shrink-0 rounded bg-[#f3eeff] px-1 py-px text-[8px] font-black uppercase tracking-wider text-[#8127cf]">
                Hall
              </span>
            ) : null}
          </div>
          <p className="truncate text-[10px] font-bold text-ink-subtle">
            {ROOM_TYPES.find((t) => t.value === room.roomType)?.label ?? room.roomType}
            {room.location ? ` · ${floorLabel(room.floor)}` : ""}
            {room.wing ? ` · ${room.wing}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit room ${room.roomNumber}`}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[#f3eeff] hover:text-[#8127cf]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Remove room ${room.roomNumber}`}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* The two capacities, side by side — the whole point of the card. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-gradient-to-br from-[#faf5ff] to-white p-2 ring-1 ring-[#8127cf]/15">
          <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
            <ArmchairIcon className="h-2.5 w-2.5" />
            Exam
          </p>
          <p className="text-lg font-black leading-none tabular-nums text-[#8127cf]">
            {room.unmeasured ? "—" : room.examCapacity}
          </p>
        </div>
        <div className="rounded-xl bg-[#faf7fc] p-2">
          <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
            <Users className="h-2.5 w-2.5" />
            Teaching
          </p>
          <p className="text-lg font-black leading-none tabular-nums text-[#1f1a23]">
            {room.unmeasured ? "—" : room.teachingCapacity}
          </p>
        </div>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold text-ink-subtle">
        {room.hasLayout ? (
          <span className="flex items-center gap-1">
            <Layers className="h-2.5 w-2.5" />
            {room.rows} × {room.benchesPerRow} benches, {room.seatsPerBench} per bench
          </span>
        ) : room.unmeasured ? (
          <span className="font-black text-amber-600">No size recorded</span>
        ) : (
          <span>{room.benches} benches (inferred)</span>
        )}
        {bookings > 0 ? <span>· {bookings} booking{bookings === 1 ? "" : "s"}</span> : null}
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function RoomEditor({
  room,
  campusId,
  onClose,
  onSaved,
}: {
  room: Room | null;
  campusId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    room
      ? {
          roomNumber: room.roomNumber,
          building: room.building ?? "",
          floor: room.floor,
          wing: room.wing ?? "",
          roomType: room.roomType,
          rows: room.rows,
          benchesPerRow: room.benchesPerRow,
          seatsPerBench: room.seatsPerBench,
          examSeatsPerBench: room.examSeatsPerBench,
          capacity: room.capacity,
          isExamHall: room.isExamHall,
          note: room.note ?? "",
        }
      : BLANK,
  );
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // The same function the server and the seating planner use, so the preview
  // here is the number that will actually be allocated.
  const cap = roomCapacity(draft);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/academic/rooms", {
        method: room ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(room ? { id: room.id } : {}), campusId, ...draft }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Could not save the room");
      toast.success(room ? `Room ${draft.roomNumber} updated` : `Room ${draft.roomNumber} added`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the room");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={room ? `Room ${room.roomNumber}` : "Add a room"}
      eyebrow="Rooms"
      subtitle="Where it is, and how the benches are laid out. Both capacities follow from the layout."
      icon={DoorOpen}
      tone="violet"
      size="lg"
      dirty
      onClose={onClose}
      footer={
        <ModalActions
          busy={saving}
          busyLabel="Saving…"
          actionLabel={room ? "Save room" : "Add room"}
          onCancel={onClose}
          onAction={save}
          blockedReason={!draft.roomNumber.trim() ? "Give the room a number or name." : null}
        />
      }
    >
      <div className="space-y-5">
        {/* ── Identity and location ─────────────────────────────────────── */}
        <div>
          <p className="mb-2 pl-0.5 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
            Where it is
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Room number">
              <input
                className={inputClass}
                value={draft.roomNumber}
                onChange={(e) => set("roomNumber", e.target.value)}
                placeholder="R-101"
              />
            </Field>
            <Field label="Building / block" hint="Optional">
              <input
                className={inputClass}
                value={draft.building}
                onChange={(e) => set("building", e.target.value)}
                placeholder="Main Block"
              />
            </Field>
            <Field label="Floor">
              <select
                className={selectClass}
                value={String(draft.floor)}
                onChange={(e) => set("floor", Number(e.target.value))}
              >
                {[-2, -1, 0, 1, 2, 3, 4, 5, 6].map((f) => (
                  <option key={f} value={f}>
                    {floorLabel(f)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Wing" hint="Optional">
              <input
                className={inputClass}
                value={draft.wing}
                onChange={(e) => set("wing", e.target.value)}
                placeholder="East"
              />
            </Field>
            <Field label="Room type">
              <select
                className={selectClass}
                value={draft.roomType}
                onChange={(e) => {
                  set("roomType", e.target.value);
                  if (e.target.value === "HALL") set("isExamHall", true);
                }}
              >
                {ROOM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Note" hint="Optional">
              <input
                className={inputClass}
                value={draft.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder="Projector, no fans"
              />
            </Field>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-2xl border border-[#cfc2d6]/25 bg-[#faf7fc] px-3.5 py-2.5">
            <input
              type="checkbox"
              checked={draft.isExamHall}
              onChange={(e) => set("isExamHall", e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[#8127cf]"
            />
            <span className="min-w-0">
              <span className="block text-xs font-black text-[#1f1a23]">
                Prefer this room for exams
              </span>
              <span className="block text-[10px] font-semibold text-ink-muted">
                The seating planner fills preferred rooms first, so a class lands in one hall
                rather than three classrooms.
              </span>
            </span>
          </label>
        </div>

        {/* ── Layout ────────────────────────────────────────────────────── */}
        <div>
          <p className="mb-2 pl-0.5 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
            How the benches are laid out
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Rows of benches">
              <input
                type="number"
                min={0}
                max={60}
                className={inputClass}
                value={draft.rows}
                onChange={(e) => set("rows", Number(e.target.value))}
              />
            </Field>
            <Field label="Benches per row">
              <input
                type="number"
                min={0}
                max={60}
                className={inputClass}
                value={draft.benchesPerRow}
                onChange={(e) => set("benchesPerRow", Number(e.target.value))}
              />
            </Field>
            <Field label="Seats per bench" hint="In a normal lesson">
              <input
                type="number"
                min={1}
                max={10}
                className={inputClass}
                value={draft.seatsPerBench}
                onChange={(e) => set("seatsPerBench", Number(e.target.value))}
              />
            </Field>
            <Field label="Seats per bench in an exam" hint="Usually 1">
              <input
                type="number"
                min={1}
                max={draft.seatsPerBench}
                className={inputClass}
                value={draft.examSeatsPerBench}
                onChange={(e) => set("examSeatsPerBench", Number(e.target.value))}
              />
            </Field>
          </div>

          {cap.hasLayout ? null : (
            <div className="mt-3">
              <Field
                label="Total seats"
                hint="Used only when no bench layout is recorded. Fill in the layout above and this is worked out for you."
              >
                <input
                  type="number"
                  min={0}
                  className={cn(inputClass, "max-w-40")}
                  value={draft.capacity}
                  onChange={(e) => set("capacity", Number(e.target.value))}
                />
              </Field>
            </div>
          )}
        </div>

        {/* ── Live preview ──────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-[#cfc2d6]/20 bg-gradient-to-br from-[#faf5ff] to-white p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                Teaching capacity
              </p>
              <p className="text-2xl font-black leading-none tabular-nums text-[#1f1a23]">
                {cap.unmeasured ? "—" : cap.teaching}
              </p>
            </div>
            <span aria-hidden className="text-2xl font-black text-[#cfc2d6]">
              →
            </span>
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
                Exam capacity
              </p>
              <p className="text-2xl font-black leading-none tabular-nums text-[#8127cf]">
                {cap.unmeasured ? "—" : cap.exam}
              </p>
            </div>
            <p className="min-w-0 flex-1 text-[11px] font-semibold leading-snug text-ink-muted">
              {cap.unmeasured
                ? "Record the layout, or a total seat count, before this room can hold an exam."
                : cap.spacingLoss > 0
                ? `${cap.benches} benches. Exam spacing costs ${cap.spacingLoss} seat${cap.spacingLoss === 1 ? "" : "s"} — that is the whole point of it.`
                : `${cap.benches} benches, one candidate each. Nothing lost to spacing.`}
            </p>
          </div>

          {/* A picture of the room, so a wrong number is obvious. */}
          {cap.hasLayout && draft.rows <= 12 && draft.benchesPerRow <= 14 ? (
            <div className="mt-3 space-y-1">
              <p className="rounded-lg bg-[#f3f4f9] py-0.5 text-center text-[8px] font-black uppercase tracking-[0.2em] text-ink-subtle">
                Front
              </p>
              {Array.from({ length: draft.rows }).map((_, r) => (
                <div key={r} className="flex justify-center gap-1">
                  {Array.from({ length: draft.benchesPerRow }).map((__, b) => (
                    <span key={b} className="flex gap-px">
                      {Array.from({ length: draft.seatsPerBench }).map((___, s) => (
                        <span
                          key={s}
                          title={
                            s < draft.examSeatsPerBench
                              ? "Used in an exam"
                              : "Empty on an exam day"
                          }
                          className={cn(
                            "h-3 w-3 rounded-sm transition-colors",
                            s < draft.examSeatsPerBench
                              ? "bg-[#8127cf]"
                              : "bg-[#cfc2d6]/45",
                          )}
                        />
                      ))}
                    </span>
                  ))}
                </div>
              ))}
              <p className="pt-1 text-center text-[9px] font-semibold text-ink-subtle">
                <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#8127cf] align-middle" />
                seated in an exam
                <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-sm bg-[#cfc2d6]/45 align-middle" />
                left empty for spacing
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
