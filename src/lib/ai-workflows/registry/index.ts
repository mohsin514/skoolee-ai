import type { UserRole } from "@/lib/roles";
import { SCHOOL_OPERATION_ENTRIES } from "./school-ops";
import { TOOL_ENTRIES } from "./domains/tools";
import { TEACHER_TEACHING_ENTRIES } from "./domains/teacher/teaching";
import { TEACHER_STAFF_ENTRIES } from "./domains/teacher/staff";
import { TEACHER_ATTENDANCE_ENTRIES } from "./domains/teacher/attendance";
import { TEACHER_ASSESSMENT_ENTRIES } from "./domains/teacher/assessment";
import type { CapabilityEntry } from "./types";

/** Every registry entry. Domain files add their arrays here as slices connect them. */
const ENTRIES: readonly CapabilityEntry[] = [...TOOL_ENTRIES, ...SCHOOL_OPERATION_ENTRIES, ...TEACHER_TEACHING_ENTRIES, ...TEACHER_STAFF_ENTRIES, ...TEACHER_ATTENDANCE_ENTRIES, ...TEACHER_ASSESSMENT_ENTRIES];

const BY_KEY = new Map<string, CapabilityEntry>();
for (const entry of ENTRIES) {
  if (BY_KEY.has(entry.key)) throw new Error(`Duplicate capability key ${entry.key}`);
  BY_KEY.set(entry.key, entry);
}

export const REGISTRY: ReadonlyMap<string, CapabilityEntry> = BY_KEY;
export function capability(key: string): CapabilityEntry | undefined { return BY_KEY.get(key); }
/** Entries a role could ever hold; gates still decide for the actual user, campus and seat. */
export function entriesForRole(role: UserRole): CapabilityEntry[] { return ENTRIES.filter(entry => entry.roles.includes(role)); }
/** Inventory keys covered by an entry. */
export function coveredInventoryKeys(): Set<string> { return new Set(ENTRIES.flatMap(entry => [entry.key, ...entry.inventoryKeys])); }
