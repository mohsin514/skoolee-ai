import type { UserRole } from "@/lib/roles";
import { SCHOOL_OPERATION_ENTRIES, SUBJECTS_BY_CLASS_ENTRY } from "./school-ops";
import { TOOL_ENTRIES } from "./domains/tools";
import { TEACHER_TEACHING_ENTRIES } from "./domains/teacher/teaching";
import { TEACHER_STAFF_ENTRIES } from "./domains/teacher/staff";
import { TEACHER_ATTENDANCE_ENTRIES } from "./domains/teacher/attendance";
import { TEACHER_ASSESSMENT_ENTRIES } from "./domains/teacher/assessment";
import { ADMIN_FEE_ENTRIES } from "./domains/admin/fees";
import { ADMIN_ROSTER_ENTRIES } from "./domains/admin/roster";
import { ADMIN_PEOPLE_ENTRIES } from "./domains/admin/people";
import { STUDENT_ENTRIES } from "./domains/family/student";
import { PARENT_ENTRIES } from "./domains/family/parent";
import { FINANCE_BOOKS_ENTRIES } from "./domains/finance/books";
import { FINANCE_MONEY_ENTRIES } from "./domains/finance/money";
import { FRONT_DESK_ENTRIES } from "./domains/desk/front-desk";
import { LIBRARY_ENTRIES } from "./domains/desk/library";
import type { CapabilityEntry } from "./types";

/** Every registry entry. Domain files add their arrays here as slices connect them. */
const ENTRIES: readonly CapabilityEntry[] = [...TOOL_ENTRIES, ...SCHOOL_OPERATION_ENTRIES, SUBJECTS_BY_CLASS_ENTRY, ...TEACHER_TEACHING_ENTRIES, ...TEACHER_STAFF_ENTRIES, ...TEACHER_ATTENDANCE_ENTRIES, ...TEACHER_ASSESSMENT_ENTRIES, ...ADMIN_FEE_ENTRIES, ...ADMIN_ROSTER_ENTRIES, ...ADMIN_PEOPLE_ENTRIES, ...STUDENT_ENTRIES, ...PARENT_ENTRIES, ...FINANCE_BOOKS_ENTRIES, ...FINANCE_MONEY_ENTRIES, ...FRONT_DESK_ENTRIES, ...LIBRARY_ENTRIES];

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
