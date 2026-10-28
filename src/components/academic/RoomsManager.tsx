"use client";
import { Button } from "@/components/ui/button";
import { InputGroup } from "@/components/ui/input-group";


import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { checkedListJson, readRequest, requestFailure, type RequestFailure } from "@/lib/http/request-state";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";
import { Modal, ModalActions } from "@/components/ui/modal";
import { ReviewedDeleteDialog } from "@/components/ui/reviewed-delete";
import { BrandButton } from "@/components/role-dashboard";
import { ROOM_TYPES, floorLabel, roomCapacity } from "@/lib/academic/room-capacity";
import { Field, Panel, StepEmpty, inputClass, selectClass } from "@/components/academic/exams/shared";
import { Input as SystemInput } from "@/components/ui/input";
import { Select as SystemSelect } from "@/components/ui/select";
import { Checkbox as SystemCheckbox } from "@/components/ui/checkbox";
import { useUiText } from "@/components/locale/LocaleProvider";

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
  campusId: string;
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
type Ui = (source: string, values?: unknown[]) => string;

/** "Ground floor", "2nd floor", "Basement 2" — translated (the shared helper is English-only). */
function floorText(floor: number, ui: Ui): string {
  if (floor < 0) return floor === -1 ? ui("Basement") : ui("Basement {0}", [Math.abs(floor)]);
  if (floor === 0) return ui("Ground floor");
  return ui("Floor {0}", [floor]);
}

/**
 * Rooms on a campus with their bench layout. `readOnly` (SPEC §10.11, K-m8) hides every write control —
 * rooms are campus operations (G23), so a read-only viewer sees the list and capacities only.
 */
export function RoomsManager({ campusId, readOnly = false }: { campusId?: string; readOnly?: boolean }) {
  const ui = useUiText();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Room | "new" | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState<RequestFailure | null>(null);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const version = ++sequence.current;
    setLoading(true); setLoadFailed(null);
    try {
      const json = await checkedListJson(await readRequest(`/api/academic/rooms${campusId ? `?campusId=${campusId}` : ""}`));
      if (version !== sequence.current) return;
      setRooms(json.data);
    } catch (failure) { if (version === sequence.current) { setRooms([]); setLoadFailed(requestFailure(failure)); } }
    finally { if (version === sequence.current) setLoading(false); }
  }, [campusId]);

  useEffect(() => {
    void load();
    return () => { sequence.current++; };
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
      const key = r.building?.trim() || ui("Unassigned block");
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
  }, [rooms, query, ui]);


  return (
    <div className="sk-rise space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-[28px] border border-edge/25 sk-brand-surface px-6 py-5 text-primary-foreground shadow-xl">
        <span
          aria-hidden
          className="pointer-events-none absolute -end-16 -top-20 h-60 w-60 rounded-full bg-card/10 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-card/15">
            <DoorOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-tight">{ui("Rooms")}</h2>
            <p className="mt-1 text-xs font-semibold opacity-80">
              {[
                ui(totals.rooms === 1 ? "1 room" : "{0} rooms", [totals.rooms]),
                ui("{0} exam seats", [totals.exam]),
                ui("{0} teaching seats", [totals.teaching]),
              ].join(" · ")}
            </p>
          </div>
          {readOnly ? null : (
            <BrandButton
              variant="dark"
              icon={<Plus aria-hidden="true" className="h-4 w-4" />}
              onClick={() => setEditing("new")}
            >
              {ui("Add room")}
            </BrandButton>
          )}
        </div>
      </header>

      {/* ── The capacity explainer ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-edge/20 bg-gradient-to-r from-brand-100 to-surface-subtle px-4 py-3">
        <ArmchairIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-2xs font-semibold leading-relaxed text-ink-muted">
          <span className="font-bold text-ink-strong">
            {ui("Record the bench layout, not just a seat count.")}
          </span>{" "}
          {ui("Rows × benches × seats-per-bench gives the teaching capacity; the same benches at one candidate each give the exam capacity. A room of 5 rows × 3 benches × 2 seats holds 30 in a lesson and 15 in an exam.")}
        </p>
        {totals.unmeasured > 0 ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-status-warning-surface px-2.5 py-1.5 text-2xs font-semibold text-status-warning-text">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
            {ui(totals.unmeasured === 1 ? "{0} room unmeasured" : "{0} rooms unmeasured", [totals.unmeasured])}
          </span>
        ) : null}
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      {rooms.length > 6 ? (
        <InputGroup className="relative max-w-sm">
          <Search aria-hidden="true" data-field-affix="start" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <SystemInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={ui("Find a room")}
            placeholder={ui("Find a room, block or wing…")}
            className={cn(inputClass, "ps-9")}
          />
        </InputGroup>
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-[24px] bg-border-subtle/40 skeleton-shimmer" />
          ))}
        </div>
      ) : loadFailed ? (
        <ErrorState error={loadFailed} title={ui("Rooms could not be loaded")} description={ui("Check your connection and try again.")} onRetry={load} />
      ) : rooms.length === 0 ? (
        <StepEmpty
          icon={DoorOpen}
          title="No rooms yet"
          body="Add the rooms on this campus with their bench layout, and both the timetable and the exam seating planner can use them straight away."
          action={
            readOnly ? undefined : (
              <BrandButton icon={<Plus aria-hidden="true" className="h-4 w-4" />} onClick={() => setEditing("new")}>
                {ui("Add room")}
              </BrandButton>
            )
          }
        />
      ) : grouped.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-edge/35 p-10 text-center text-xs font-bold text-ink-muted">
          {ui("No room matches “{0}”.", [query])}
        </p>
      ) : (
        grouped.map(({ building, rooms: list }) => (
          <Panel
            key={building}
            title={building}
            subtitle={`${ui(list.length === 1 ? "1 room" : "{0} rooms", [list.length])} · ${ui("{0} exam seats", [list.reduce((n, r) => n + r.examCapacity, 0)])}`}
            icon={Building2}
            bodyClassName="p-3"
          >
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onEdit={readOnly ? undefined : () => setEditing(room)}
                  onDelete={readOnly ? undefined : () => setDeleting(room)}
                />
              ))}
            </div>
          </Panel>
        ))
      )}

      {editing && !readOnly ? (
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

      {deleting && !readOnly ? <ReviewedDeleteDialog endpoint="academic/rooms" record={{ id: deleting.id, campusId: deleting.campusId ?? campusId }} label={deleting.roomNumber}
        onCancel={() => setDeleting(null)} onDeleted={load}
        detail={<p>{ui("{0} exam seats will leave the campus total.", [deleting.examCapacity])}</p>} /> : null}
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
  /** Omitted for read-only viewers: the edit and remove controls are not rendered. */
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const ui = useUiText();
  const bookings =
    (room._count?.slots ?? 0) + (room._count?.examSchedules ?? 0) + (room._count?.examRooms ?? 0);

  return (
    <div className="sk-panel group relative overflow-hidden p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_32px_-20px_rgba(129,39,207,0.5)]">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
            room.unmeasured
              ? "bg-status-warning-surface text-status-warning-text"
              : room.isExamHall
              ? "bg-gradient-to-br from-primary to-brand-400 text-primary-foreground"
              : "bg-brand-100 text-primary",
          )}
          aria-hidden="true"
        >
          {room.roomNumber.slice(0, 3).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <bdi className="truncate text-sm font-bold text-ink-strong">{room.roomNumber}</bdi>
            {room.isExamHall ? (
              <span className="shrink-0 rounded bg-brand-100 px-1 py-px text-2xs font-semibold text-primary">
                {ui("Hall")}
              </span>
            ) : null}
          </div>
          <p className="truncate text-2xs font-bold text-ink-subtle">
            {ui(ROOM_TYPES.find((t) => t.value === room.roomType)?.label ?? room.roomType)}
            {room.location ? ` · ${floorText(room.floor, ui)}` : ""}
            {room.wing ? ` · ${room.wing}` : ""}
          </p>
        </div>

        {onEdit || onDelete ? (
          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {onEdit ? (
              <Button variant="secondary" size="icon"
                type="button"
                onClick={onEdit}
                aria-label={ui("Edit room {0}", [room.roomNumber])}
                className="flex items-center justify-center"
              >
                <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {onDelete ? (
              <Button variant="secondary" size="icon"
                type="button"
                onClick={onDelete}
                aria-label={ui("Remove room {0}", [room.roomNumber])}
                className="flex items-center justify-center"
              >
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* The two capacities, side by side — the whole point of the card. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-gradient-to-br from-brand-50 to-card p-2 ring-1 ring-primary/15">
          <p className="flex items-center gap-1 text-2xs font-semibold text-primary">
            <ArmchairIcon aria-hidden="true" className="h-2.5 w-2.5" />
            {ui("Exam")}
          </p>
          <p className="text-lg font-bold leading-none tabular-nums text-primary">
            {room.unmeasured ? "—" : room.examCapacity}
          </p>
        </div>
        <div className="rounded-xl bg-surface-subtle p-2">
          <p className="flex items-center gap-1 text-2xs font-semibold text-ink-subtle">
            <Users aria-hidden="true" className="h-2.5 w-2.5" />
            {ui("Teaching")}
          </p>
          <p className="text-lg font-bold leading-none tabular-nums text-ink-strong">
            {room.unmeasured ? "—" : room.teachingCapacity}
          </p>
        </div>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs font-semibold text-ink-subtle">
        {room.hasLayout ? (
          <span className="flex items-center gap-1">
            <Layers aria-hidden="true" className="h-2.5 w-2.5" />
            {ui("{0} × {1} benches, {2} per bench", [room.rows, room.benchesPerRow, room.seatsPerBench])}
          </span>
        ) : room.unmeasured ? (
          <span className="font-bold text-status-warning-text">{ui("No size recorded")}</span>
        ) : (
          <span>{ui("{0} benches (estimated)", [room.benches])}</span>
        )}
        {bookings > 0 ? <span>· {ui(bookings === 1 ? "1 booking" : "{0} bookings", [bookings])}</span> : null}
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
  const ui = useUiText();
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
      if (!res.ok || !json.success) throw new Error(json.error || "");
      toast.success(ui(room ? "Room {0} updated" : "Room {0} added", [draft.roomNumber]));
      onSaved();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, ui("Could not save the room")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={room ? ui("Room {0}", [room.roomNumber]) : ui("Add a room")}
      eyebrow={ui("Rooms")}
      subtitle={ui("Where it is, and how the benches are laid out. Both capacities follow from the layout.")}
      icon={DoorOpen}
      tone="violet"
      size="lg"
      dirty
      onClose={onClose}
      footer={
        <ModalActions
          busy={saving}
          busyLabel={ui("Saving…")}
          actionLabel={ui(room ? "Save room" : "Add room")}
          cancelLabel={ui("Cancel")}
          onCancel={onClose}
          onAction={save}
          blockedReason={!draft.roomNumber.trim() ? ui("Give the room a number or name.") : null}
        />
      }
    >
      <div className="space-y-5">
        {/* ── Identity and location ─────────────────────────────────────── */}
        <div>
          <p className="mb-2 ps-0.5 text-xs font-semibold text-ink-subtle">
            {ui("Where it is")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Room number">
              <SystemInput
                className={inputClass}
                value={draft.roomNumber}
                onChange={(e) => set("roomNumber", e.target.value)}
                placeholder="R-101"
              />
            </Field>
            <Field label="Building / block" hint="Optional">
              <SystemInput
                className={inputClass}
                value={draft.building}
                onChange={(e) => set("building", e.target.value)}
                placeholder={ui("Main block")}
              />
            </Field>
            <Field label="Floor">
              <SystemSelect
                className={selectClass}
                value={String(draft.floor)}
                onChange={(e) => set("floor", Number(e.target.value))}
              >
                {[-2, -1, 0, 1, 2, 3, 4, 5, 6].map((f) => (
                  <option key={f} value={f}>
                    {floorText(f, ui)}
                  </option>
                ))}
              </SystemSelect>
            </Field>
            <Field label="Wing" hint="Optional">
              <SystemInput
                className={inputClass}
                value={draft.wing}
                onChange={(e) => set("wing", e.target.value)}
                placeholder={ui("East")}
              />
            </Field>
            <Field label="Room type">
              <SystemSelect
                className={selectClass}
                value={draft.roomType}
                onChange={(e) => {
                  set("roomType", e.target.value);
                  if (e.target.value === "HALL") set("isExamHall", true);
                }}
              >
                {ROOM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {ui(t.label)}
                  </option>
                ))}
              </SystemSelect>
            </Field>
            <Field label="Note" hint="Optional">
              <SystemInput
                className={inputClass}
                value={draft.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder={ui("Projector, no fans")}
              />
            </Field>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-2xl border border-edge/25 bg-surface-subtle px-3.5 py-2.5">
            <SystemCheckbox

              checked={draft.isExamHall}
              onChange={(e) => set("isExamHall", e.target.checked)}
              className=""
            />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-ink-strong">
                {ui("Prefer this room for exams")}
              </span>
              <span className="block text-2xs font-semibold text-ink-muted">
                {ui("The seating planner fills preferred rooms first, so a class lands in one hall rather than three classrooms.")}
              </span>
            </span>
          </label>
        </div>

        {/* ── Layout ────────────────────────────────────────────────────── */}
        <div>
          <p className="mb-2 ps-0.5 text-xs font-semibold text-ink-subtle">
            {ui("How the benches are laid out")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Rows of benches">
              <SystemInput
                type="number"
                min={0}
                max={60}
                className={inputClass}
                value={draft.rows}
                onChange={(e) => set("rows", Number(e.target.value))}
              />
            </Field>
            <Field label="Benches per row">
              <SystemInput
                type="number"
                min={0}
                max={60}
                className={inputClass}
                value={draft.benchesPerRow}
                onChange={(e) => set("benchesPerRow", Number(e.target.value))}
              />
            </Field>
            <Field label="Seats per bench" hint="In a normal lesson">
              <SystemInput
                type="number"
                min={1}
                max={10}
                className={inputClass}
                value={draft.seatsPerBench}
                onChange={(e) => set("seatsPerBench", Number(e.target.value))}
              />
            </Field>
            <Field label="Seats per bench in an exam" hint="Usually 1">
              <SystemInput
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
                <SystemInput
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
        <div className="rounded-2xl border border-edge/20 bg-gradient-to-br from-brand-50 to-card p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <p className="text-xs font-semibold text-ink-subtle">
                {ui("Teaching capacity")}
              </p>
              <p className="text-2xl font-bold leading-none tabular-nums text-ink-strong">
                {cap.unmeasured ? "—" : cap.teaching}
              </p>
            </div>
            <span aria-hidden className="text-2xl font-bold text-edge rtl:-scale-x-100">
              →
            </span>
            <div>
              <p className="text-xs font-semibold text-primary">
                {ui("Exam capacity")}
              </p>
              <p className="text-2xl font-bold leading-none tabular-nums text-primary">
                {cap.unmeasured ? "—" : cap.exam}
              </p>
            </div>
            <p className="min-w-0 flex-1 text-2xs font-semibold leading-snug text-ink-muted">
              {cap.unmeasured
                ? ui("Record the layout, or a total seat count, before this room can hold an exam.")
                : cap.spacingLoss > 0
                ? ui(cap.spacingLoss === 1 ? "{0} benches. Exam spacing costs 1 seat — that is the whole point of it." : "{0} benches. Exam spacing costs {1} seats — that is the whole point of it.", [cap.benches, cap.spacingLoss])
                : ui("{0} benches, one candidate each. Nothing lost to spacing.", [cap.benches])}
            </p>
          </div>

          {/* A picture of the room, so a wrong number is obvious. */}
          {cap.hasLayout && draft.rows <= 12 && draft.benchesPerRow <= 14 ? (
            <div className="mt-3 space-y-1">
              <p className="rounded-lg bg-muted py-0.5 text-center text-2xs font-semibold text-ink-subtle">
                {ui("Front of room")}
              </p>
              {Array.from({ length: draft.rows }).map((_, r) => (
                <div key={r} className="flex justify-center gap-1">
                  {Array.from({ length: draft.benchesPerRow }).map((__, b) => (
                    <span key={b} className="flex gap-px">
                      {Array.from({ length: draft.seatsPerBench }).map((___, s) => (
                        <span
                          key={s}
                          role="img"
                          aria-label={ui(
                            s < draft.examSeatsPerBench
                              ? "Used in an exam"
                              : "Empty on an exam day",
                          )}
                          className={cn(
                            "h-3 w-3 rounded-sm transition-colors",
                            s < draft.examSeatsPerBench
                              ? "bg-primary"
                              : "bg-edge/45",
                          )}
                        />
                      ))}
                    </span>
                  ))}
                </div>
              ))}
              <p className="pt-1 text-center text-2xs font-semibold text-ink-subtle">
                <span aria-hidden="true" className="me-1 inline-block h-2 w-2 rounded-sm bg-primary align-middle" />
                {ui("seated in an exam")}
                <span aria-hidden="true" className="ms-3 me-1 inline-block h-2 w-2 rounded-sm bg-edge/45 align-middle" />
                {ui("left empty for spacing")}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
