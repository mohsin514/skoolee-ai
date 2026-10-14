import { parseImportCsv } from "@/lib/imports/csv";

export const ROSTER_FIELDS = ["fullName", "rollNo", "guardianPhone", "address", "city", "medicalNotes", "guardianName", "gender", "dateOfBirth", "phone", "guardianRelationship"] as const;
export type RosterField = typeof ROSTER_FIELDS[number];
export type RosterMapping = Partial<Record<RosterField, number>>;
export const ROSTER_REQUIRED_FIELDS: readonly RosterField[] = ["fullName", "rollNo", "guardianPhone", "address", "city", "medicalNotes"];
export const MAX_ROSTER_BYTES = 5 * 1024 * 1024;
export interface RosterSource { headers: string[]; rows: string[][] }
export class RosterMappingError extends Error {
  constructor(readonly code: "size" | "encoding" | "format" | "rows" | "headers" | "mapping" | "required") { super(code); }
}
const aliases: Record<RosterField, readonly string[]> = {
  fullName: ["fullName", "studentName", "name", "اسم الطالب", "نام", "طالب علم کا نام"],
  rollNo: ["rollNo", "rollNumber", "registrationNo", "regNo", "رقم الطالب", "الرقم التسلسلي", "رول نمبر", "رجسٹریشن نمبر"],
  guardianPhone: ["guardianPhone", "parentPhone", "هاتف ولي الأمر", "هاتف ولي الامر", "سرپرست کا فون", "والدین کا فون"],
  address: ["address", "streetAddress", "العنوان", "پتہ"],
  city: ["city", "المدينة", "شہر"],
  medicalNotes: ["medicalNotes", "medical", "ملاحظات طبية", "طبی معلومات"],
  guardianName: ["guardianName", "parentName", "اسم ولي الأمر", "اسم ولي الامر", "سرپرست کا نام"],
  gender: ["gender", "الجنس", "جنس"],
  dateOfBirth: ["dateOfBirth", "dob", "تاريخ الميلاد", "تاریخ پیدائش"],
  phone: ["phone", "studentPhone", "هاتف الطالب", "طالب علم کا فون"],
  guardianRelationship: ["guardianRelationship", "relationship", "صلة القرابة", "رشتہ"],
};
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/[\s_\-.]/gu, "");

export function parseRosterSource(text: string): RosterSource {
  if (new TextEncoder().encode(text).length > MAX_ROSTER_BYTES) throw new RosterMappingError("size");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/u.test(text)) throw new RosterMappingError("encoding");
  let cells: string[][];
  try { cells = parseImportCsv(text); } catch { throw new RosterMappingError("format"); }
  if (cells.length < 2 || cells.length > 1001) throw new RosterMappingError("rows");
  const headers = cells[0];
  if (headers.length > 80 || headers.some(value => !value || value.length > 180) || new Set(headers.map(normalize)).size !== headers.length) throw new RosterMappingError("headers");
  if (cells.slice(1).some(row => row.length !== headers.length || row.some(value => value.length > 4000))) throw new RosterMappingError("format");
  return { headers, rows: cells.slice(1) };
}

/** Only exact, known multilingual aliases are suggested. Staff confirm every mapping. */
export function suggestRosterMapping(headers: string[]): RosterMapping {
  const result: RosterMapping = {};
  for (const field of ROSTER_FIELDS) {
    const matches = headers.flatMap((header, index) => aliases[field].some(alias => normalize(alias) === normalize(header)) ? [index] : []);
    if (matches.length === 1) result[field] = matches[0];
  }
  return result;
}

function normalizedValue(field: RosterField, value: string) {
  if (field !== "gender") return value;
  const key = value.trim().toLocaleLowerCase("en");
  if (["male", "m", "ذكر", "مرد", "لڑکا"].includes(key)) return "MALE";
  if (["female", "f", "أنثى", "انثى", "عورت", "لڑکی"].includes(key)) return "FEMALE";
  if (["other", "آخر", "اخرى", "دیگر"].includes(key)) return "OTHER";
  return value; // Unknown values remain visible and fail domain validation.
}

export function mapRosterCsv(source: RosterSource, mapping: RosterMapping): string {
  if (Object.keys(mapping).some(field => !(ROSTER_FIELDS as readonly string[]).includes(field))) throw new RosterMappingError("mapping");
  const fields = ROSTER_FIELDS.filter(field => mapping[field] !== undefined);
  const columns = fields.map(field => mapping[field]!);
  if (columns.some(index => !Number.isSafeInteger(index) || index < 0 || index >= source.headers.length) || new Set(columns).size !== columns.length) throw new RosterMappingError("mapping");
  if (ROSTER_REQUIRED_FIELDS.some(field => mapping[field] === undefined)) throw new RosterMappingError("required");
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [fields, ...source.rows.map(row => fields.map(field => normalizedValue(field, row[mapping[field]!])))].map(row => row.map(quote).join(",")).join("\r\n");
}
