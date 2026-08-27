/**
 * Teaching capacity and exam capacity are two different numbers (§79).
 *
 * A room recorded as "capacity 30" holds thirty pupils *in a lesson*, three to
 * a bench. On an exam day only one candidate may sit per bench, so the same
 * room holds ten. Every seating plan built before this file read the teaching
 * number, which is how a paper for thirty was cheerfully allocated to a room
 * that can invigilate ten — a failure that only shows up on the morning of the
 * exam, with the candidates already in the corridor.
 *
 * The layout is the source of truth:
 *
 *   teaching capacity = rows × benchesPerRow × seatsPerBench
 *   exam capacity     = rows × benchesPerRow × examSeatsPerBench
 *
 * Rooms recorded before the layout existed have only `capacity`. Rather than
 * treat those as unusable, the benches are inferred from the seats-per-bench
 * figure, which is the same arithmetic a head of exams does on paper.
 */

export type RoomShape = {
  capacity: number;
  rows: number;
  benchesPerRow: number;
  seatsPerBench: number;
  examSeatsPerBench: number;
};

export interface RoomCapacity {
  /** Benches physically in the room. */
  benches: number;
  /** Seats when teaching — what `capacity` has always meant. */
  teaching: number;
  /** Seats on an exam day, at the room's exam spacing. */
  exam: number;
  /** Candidates lost to exam spacing, i.e. teaching − exam. */
  spacingLoss: number;
  /** True when rows × benches were actually recorded, not inferred. */
  hasLayout: boolean;
  /** True when there is no usable figure at all — the room cannot be seated. */
  unmeasured: boolean;
}

const int = (n: unknown, fallback = 0) => {
  const v = Math.trunc(Number(n));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export function roomCapacity(room: Partial<RoomShape> | null | undefined): RoomCapacity {
  const rows = int(room?.rows);
  const benchesPerRow = int(room?.benchesPerRow);
  const seatsPerBench = int(room?.seatsPerBench, 1);
  const examSeatsPerBench = Math.min(int(room?.examSeatsPerBench, 1), seatsPerBench);
  const stored = int(room?.capacity);

  const hasLayout = rows > 0 && benchesPerRow > 0;

  // With a layout, the room describes itself completely.
  if (hasLayout) {
    const benches = rows * benchesPerRow;
    const teaching = benches * seatsPerBench;
    const exam = benches * examSeatsPerBench;
    return {
      benches,
      teaching,
      exam,
      spacingLoss: teaching - exam,
      hasLayout: true,
      unmeasured: false,
    };
  }

  // Without one, infer benches from the teaching figure. A 30-seat room at
  // three to a bench is ten benches, so ten candidates at exam spacing.
  if (stored > 0) {
    const benches = Math.floor(stored / seatsPerBench) || stored;
    const exam = Math.min(stored, benches * examSeatsPerBench);
    return {
      benches,
      teaching: stored,
      exam,
      spacingLoss: stored - exam,
      hasLayout: false,
      unmeasured: false,
    };
  }

  return { benches: 0, teaching: 0, exam: 0, spacingLoss: 0, hasLayout: false, unmeasured: true };
}

/** Just the number of candidates a room can invigilate. */
export function examSeats(room: Partial<RoomShape> | null | undefined): number {
  return roomCapacity(room).exam;
}

/** Human location, e.g. "Main Block · Floor 2 · East". */
export function roomLocation(room: {
  building?: string | null;
  floor?: number | null;
  wing?: string | null;
}): string {
  const parts: string[] = [];
  if (room.building) parts.push(room.building);
  if (room.floor !== null && room.floor !== undefined) parts.push(floorLabel(room.floor));
  if (room.wing) parts.push(`${room.wing} wing`);
  return parts.join(" · ");
}

export function floorLabel(floor: number): string {
  if (floor < 0) return floor === -1 ? "Basement" : `Basement ${Math.abs(floor)}`;
  if (floor === 0) return "Ground floor";
  const suffix = floor === 1 ? "st" : floor === 2 ? "nd" : floor === 3 ? "rd" : "th";
  return `${floor}${suffix} floor`;
}

export const ROOM_TYPES = [
  { value: "CLASSROOM", label: "Classroom" },
  { value: "HALL", label: "Exam hall" },
  { value: "LAB", label: "Laboratory" },
  { value: "LIBRARY", label: "Library" },
  { value: "AUDITORIUM", label: "Auditorium" },
] as const;

export interface SeatSlot {
  seatNumber: number;
  rowNo: number;
  benchNo: number;
  seatOnBench: number;
  /** "R3-B2-S1" — what goes on the desk card. */
  label: string;
}

/**
 * Every seatable position in a room, in the order an invigilator walks them:
 * front row first, left to right, and within a bench left seat first.
 *
 * Generated rather than stored because it is a pure function of the layout —
 * a stored copy is a second truth that goes stale the moment a bench is added.
 */
export function seatGrid(room: Partial<RoomShape> | null | undefined): SeatSlot[] {
  const cap = roomCapacity(room);
  if (cap.unmeasured) return [];

  const seatsPerBench = Math.min(
    int(room?.examSeatsPerBench, 1),
    int(room?.seatsPerBench, 1),
  );

  // Inferred layouts have no real rows, so lay the benches out in a single
  // notional row rather than inventing a shape the room may not have.
  const benchesPerRow = cap.hasLayout ? int(room?.benchesPerRow) : cap.benches;
  const rows = cap.hasLayout ? int(room?.rows) : 1;

  const slots: SeatSlot[] = [];
  let n = 0;
  for (let r = 1; r <= rows; r++) {
    for (let b = 1; b <= benchesPerRow; b++) {
      for (let s = 1; s <= seatsPerBench; s++) {
        n += 1;
        slots.push({
          seatNumber: n,
          rowNo: r,
          benchNo: b,
          seatOnBench: s,
          label: cap.hasLayout ? `R${r}-B${b}${seatsPerBench > 1 ? `-S${s}` : ""}` : `S${n}`,
        });
      }
    }
  }
  return slots.slice(0, cap.exam);
}
