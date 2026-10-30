import { parseImportCsv } from "@/lib/imports/csv";
import type { SchoolSetupAction } from "./school-setup";
import { CURRENCIES, parseMoney } from "@/lib/locale/package";
export const setupFields = {
  ROOMS: ["roomNumber", "roomType", "rows", "benchesPerRow", "seatsPerBench", "examSeatsPerBench", "building"],
  PERIODS: ["timeType", "periodNumber", "startTime", "endTime"],
  STAFF: ["fullName", "email", "phone", "role"],
  GUARDIANS: ["studentId", "fullName", "email", "phone", "relationship", "effectiveFrom", "learningRecords", "attendance", "finances", "communication", "pickup", "medicalTreatment", "fieldTrips", "mediaPublication", "offsiteTravel"],
  TRANSFERS: ["studentId", "targetClassId", "effectiveFrom", "rollNo", "verifiedCapacity"],
  WITHDRAWALS: ["studentId", "effectiveFrom"],
  SUBJECTS: ["classId", "subjectName", "totalMarks"],
  TEACHER_ALLOCATIONS: ["allocationType", "classId", "subjectId", "expectedTeacherId", "teacherId"],
  HOLIDAYS: ["calendarAction", "academicYear", "holidayId", "holidayName", "fromDate", "toDate"],
  WEEKENDS: ["mondayClosed", "tuesdayClosed", "wednesdayClosed", "thursdayClosed", "fridayClosed", "saturdayClosed", "sundayClosed"],
  MIGRATION_CUTOVER: ["dataset", "expectedCount", "currency", "expectedBalance", "academicYear"],
} as const;
export type SetupField = typeof setupFields[SchoolSetupAction][number];
export type SetupInputRow = Partial<Record<SetupField, string | boolean>>;
export const setupNumbers: readonly SetupField[] = ["rows", "benchesPerRow", "seatsPerBench", "examSeatsPerBench", "periodNumber", "verifiedCapacity", "expectedCount", "academicYear", "totalMarks"];
export const setupBooleans: readonly SetupField[] = ["learningRecords", "attendance", "finances", "communication", "pickup", "medicalTreatment", "fieldTrips", "mediaPublication", "offsiteTravel", "mondayClosed", "tuesdayClosed", "wednesdayClosed", "thursdayClosed", "fridayClosed", "saturdayClosed", "sundayClosed"];
export const setupChoices: Partial<Record<SetupField, readonly string[]>> = { allocationType: ["SUBJECT", "CLASS"], calendarAction: ["CREATE", "UPDATE", "DELETE"], roomType: ["CLASSROOM", "HALL", "LAB", "LIBRARY", "AUDITORIUM"], timeType: ["CLASS", "EXAM"], role: ["TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"], relationship: ["mother", "father", "step-parent", "grandparent", "legal guardian", "aunt", "uncle", "sibling", "other"], dataset: ["STUDENTS", "STAFF_ACTIVE", "STAFF_PENDING", "GUARDIANS", "ROOMS", "PERIODS", "INVOICES_OPEN", "OPENING_BALANCES", "LEDGER"], currency: CURRENCIES };
export function emptySetupRow(action: SchoolSetupAction): SetupInputRow { return Object.fromEntries(setupFields[action].map(key => [key, setupBooleans.includes(key) ? false : setupChoices[key]?.[0] || ""])); }
export function visibleSetupFields(action: SchoolSetupAction, row: SetupInputRow): readonly SetupField[] { return action === "TEACHER_ALLOCATIONS" ? ["allocationType", row.allocationType === "CLASS" ? "classId" : "subjectId", "expectedTeacherId", "teacherId"] : action === "HOLIDAYS" ? ["calendarAction", "academicYear", ...(row.calendarAction !== "CREATE" ? ["holidayId"] as SetupField[] : []), ...(row.calendarAction !== "DELETE" ? ["holidayName", "fromDate", "toDate"] as SetupField[] : [])] : action !== "MIGRATION_CUTOVER" ? setupFields[action] : ["dataset", "expectedCount", ...(["INVOICES_OPEN", "OPENING_BALANCES", "LEDGER"].includes(String(row.dataset)) ? ["currency", "expectedBalance"] as SetupField[] : []), ...(row.dataset === "OPENING_BALANCES" ? ["academicYear"] as SetupField[] : [])]; }
export function initialSetupRows(action: SchoolSetupAction) { return action === "MIGRATION_CUTOVER" ? ["STUDENTS", "STAFF_ACTIVE", "STAFF_PENDING", "GUARDIANS", "ROOMS", "PERIODS"].map(dataset => ({ ...emptySetupRow(action), dataset })) : [emptySetupRow(action)]; }
export function setupProposalRows(action: SchoolSetupAction, rows: SetupInputRow[]) { return rows.map(row => Object.fromEntries(visibleSetupFields(action, row).map(key => [key, ["teacherId", "expectedTeacherId"].includes(key) && !row[key] ? null : key === "expectedBalance" ? parseMoney(String(row[key]), String(row.currency)).minor : setupNumbers.includes(key) ? row[key] === "" || row[key] === undefined ? NaN : Number(row[key]) : row[key]]))); }
export function readSetupCsv(text: string) {
  if (new TextEncoder().encode(text).length > 131072) throw new Error("CSV_SIZE");
  const [headers, ...rows] = parseImportCsv(text);
  if (!headers?.length || headers.length > 40 || headers.some(header => !header || header.length > 120) || !rows.length || rows.length > 30 || rows.some(row => row.length !== headers.length)) throw new Error("CSV_ROWS");
  return { headers, rows };
}
/** Mapping is explicit; data never acquires permissions from truthy text. */
export function mapSetupCsv(action: SchoolSetupAction, rows: string[][], mapping: Partial<Record<SetupField, number>>): SetupInputRow[] {
  return rows.map(cells => Object.fromEntries(setupFields[action].map(key => {
    const column = mapping[key], value = column === undefined ? "" : cells[column];
    if (value === undefined) throw new Error("CSV_MAPPING");
    if (setupBooleans.includes(key)) {
      if (column === undefined) return [key, false];
      if (!["true", "false", "1", "0"].includes(value.toLowerCase())) throw new Error("CSV_BOOLEAN");
      return [key, ["true", "1"].includes(value.toLowerCase())];
    }
    return [key, value];
  })));
}
