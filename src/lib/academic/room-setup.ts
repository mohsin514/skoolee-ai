import { ROOM_TYPES } from "@/lib/academic/room-capacity";

// SKAI-147 room setup rules shared by the rooms API and the bulk-add dialog,
// so the preview a user sees is exactly what the server will accept.

/** Trimmed, inner whitespace collapsed: "  R 101 " and "R  101" are one room. */
export function cleanRoomName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
}

/** Room names are unique per campus regardless of case: "lab-1" clashes with "LAB-1". */
export function roomNameKey(value: unknown): string {
  return cleanRoomName(value).toLocaleLowerCase("en");
}

export const BULK_ROOM_LIMIT = 200;

export interface BulkRoomRow { line: number; roomNumber: string; capacity: number; roomType: string; building: string | null; floor: number }
export interface BulkRoomError { line: number; code: "NAME_REQUIRED" | "DUPLICATE_IN_LIST" | "BAD_CAPACITY" | "BAD_TYPE" | "BAD_FLOOR"; value: string }

const TYPE_ALIASES: Record<string, string> = Object.fromEntries(
  ROOM_TYPES.flatMap(t => [[t.value.toLowerCase(), t.value], [t.label.toLowerCase(), t.value]]).concat([["lab", "LAB"], ["hall", "HALL"], ["class", "CLASSROOM"]]),
);

/**
 * One room per line: `name, capacity, type, building, floor` (comma or tab;
 * every column after the name optional). Pasting straight from a spreadsheet
 * works because tabs are accepted. A header row starting "name"/"room" is skipped.
 */
export function parseBulkRooms(input: string): { rows: BulkRoomRow[]; errors: BulkRoomError[] } {
  const rows: BulkRoomRow[] = [], errors: BulkRoomError[] = [], seen = new Set<string>();
  input.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    const [name = "", capacityText = "", typeText = "", buildingText = "", floorText = ""] = raw.split(/\t|,/).map(cell => cell.trim());
    if (index === 0 && /^(room|name)/i.test(name) && !/\d/.test(capacityText)) return;
    const roomNumber = cleanRoomName(name);
    if (!roomNumber) return void errors.push({ line, code: "NAME_REQUIRED", value: raw.trim() });
    const key = roomNameKey(roomNumber);
    if (seen.has(key)) return void errors.push({ line, code: "DUPLICATE_IN_LIST", value: roomNumber });
    const capacity = capacityText ? Number(capacityText) : 0;
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 2000) return void errors.push({ line, code: "BAD_CAPACITY", value: capacityText });
    const roomType = typeText ? TYPE_ALIASES[typeText.toLowerCase()] : "CLASSROOM";
    if (!roomType) return void errors.push({ line, code: "BAD_TYPE", value: typeText });
    const floor = floorText ? Number(floorText) : 0;
    if (!Number.isInteger(floor) || floor < -5 || floor > 60) return void errors.push({ line, code: "BAD_FLOOR", value: floorText });
    seen.add(key);
    rows.push({ line, roomNumber, capacity, roomType, building: buildingText.slice(0, 120) || null, floor });
  });
  return { rows, errors };
}
