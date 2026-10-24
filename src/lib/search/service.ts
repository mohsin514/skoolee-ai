import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, assertModuleRead, isFamilyRole } from "@/lib/api/scope";
import type { PermissionModule } from "@/lib/permissions";
import { roleLabelFor, type UserRole } from "@/lib/roles";
import { translateUi } from "@/lib/locale/ui-messages";

// SKO-401: record search for school staff. Each record type is searched only after the reader's permission
// for its module is confirmed, and inside the reader's school and campus (a teacher: only the classes they
// teach). Counts and results therefore never include, or hint at, anything the reader cannot open. Queries
// run against live tables, so an edit, archive or revoked permission is reflected on the next search.
//
// Semantics: record types are alternatives (OR); every other filter must match (AND). Exact identifiers
// (roll number, admission number, application reference, record id) rank before name matches. Names are
// compared with search_fold() — case-insensitive, Arabic/Urdu letter variants unified, diacritics ignored.

export const TYPES = ["student", "class", "staff", "application"] as const;
export type SearchType = (typeof TYPES)[number];
const MODULE: Record<SearchType, PermissionModule> = { student: "students", class: "students", staff: "staff", application: "admissions" };
/** Campus staff a campus operator can open (the group admin is not campus staff, G47). */
const STAFF_ROLES = ["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"];
/** The academic console opens teachers only (`/principal?view=teachers`), so the principal's staff search is teachers (F26). */
const STAFF_ROLES_FOR: Partial<Record<string, readonly string[]>> = { PRINCIPAL: ["TEACHER"] };
export type SearchLanguage = "en" | "ar" | "ur";
/** `language` (from `?lang=`) only shapes result labels (role names, statuses); it never changes what is searched. */
export type Filters = { q: string; types: SearchType[]; campusId: string | null; academicYear: number | null; classId: string | null; status: "active" | "archived" | "all"; page: number; language?: SearchLanguage };
export type Result = { type: SearchType; id: string; title: string; context: string[]; identifiers: string[]; exact: boolean; archived: boolean; note?: string; href: string };
const PAGE = 25;

/**
 * Record search belongs to the roles whose console has somewhere to open a record (C13, G47): campus operators,
 * the academic lead and the front desk. The group admin, the platform operator, teachers, accountants and
 * librarians have no "Search records" link and the API refuses them, so a result never points at a console the
 * reader cannot open.
 */
export const RECORD_SEARCH_ROLES = ["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "RECEPTIONIST"] as const;
export const canSearchRecords = (role: string) => (RECORD_SEARCH_ROLES as readonly string[]).includes(role);

/** Record types each search role can open in its own console. */
const TYPES_FOR_ROLE: Record<(typeof RECORD_SEARCH_ROLES)[number], readonly SearchType[]> = {
  CAMPUS_ADMIN: TYPES,
  ADMIN: TYPES,
  PRINCIPAL: ["student", "class", "staff"],
  RECEPTIONIST: ["application"],
};

const query = (params: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return search.toString();
};

/**
 * Where a result opens for this reader — always their own console (F26). Campus operators open the pupil record
 * page (framed in their console) and their own views; the principal opens the academic console's read-only views;
 * the front desk opens Admissions filtered to the reference.
 */
export function resultHref(role: string, type: SearchType, record: { id: string; reference?: string; isTeacher?: boolean }): string {
  if (role === "PRINCIPAL") {
    if (type === "student") return `/principal?${query({ view: "students", student: record.id })}`;
    if (type === "class") return `/principal?${query({ view: "classes", class: record.id })}`;
    return `/principal?${query({ view: "teachers" })}`;
  }
  if (role === "RECEPTIONIST") return `/receptionist?${query({ view: "admissions", tab: "applications", q: record.reference ?? record.id })}`;
  // CAMPUS_ADMIN / ADMIN
  if (type === "student") return `/pupils/${encodeURIComponent(record.id)}`;
  if (type === "class") return `/admin?${query({ view: "students", class: record.id })}`;
  if (type === "staff") return `/admin?${query({ view: record.isTeacher ? "teachers" : "staff-hierarchy" })}`;
  return `/admin?${query({ view: "admissions", tab: "applications", q: record.reference ?? record.id })}`;
}

/** The record types this reader may search; the others are not offered at all. */
export async function allowedTypes(user: AuthUser) {
  if (!canSearchRecords(user.role)) return [] as SearchType[];
  const openable = TYPES_FOR_ROLE[user.role as (typeof RECORD_SEARCH_ROLES)[number]];
  const allowed: SearchType[] = [];
  for (const type of TYPES) {
    if (!openable.includes(type)) continue;
    try { await assertModuleRead(user, MODULE[type]); allowed.push(type); } catch { /* not offered */ }
  }
  return allowed;
}

async function teacherClassIds(user: AuthUser) {
  const classes = await prisma.class.findMany({ where: { schoolId: user.schoolId, OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }] }, select: { id: true } });
  return classes.map(cls => cls.id);
}

async function scope(user: AuthUser, requestedCampus: string | null) {
  if (user.role === "SUPER_ADMIN") {
    if (!requestedCampus) return { campusIds: null as string[] | null };
    const campus = await prisma.campus.findFirst({ where: { id: requestedCampus, schoolId: user.schoolId }, select: { id: true } });
    if (!campus) throw new ApiError("Campus not found", 404);
    return { campusIds: [campus.id] };
  }
  if (!user.campusId) throw new ApiError("Your account is not linked to a campus.", 403);
  return { campusIds: [user.campusId] };
}

const say = (filters: Filters, source: string, ...values: Array<string | number>) =>
  translateUi(source, filters.language ?? "en").replace(/\{(\d+)\}/g, (match, index) => (index in values ? String(values[Number(index)]) : match));
/** Application statuses in words (R7: never a raw enum). */
const APPLICATION_STATUS: Record<string, string> = {
  SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", INFO_REQUESTED: "Information requested", OFFERED: "Offer made",
  WAITLISTED: "Waitlisted", ACCEPTED: "Accepted", ENROLLED: "Enrolled", DECLINED: "Declined", REJECTED: "Rejected", WITHDRAWN: "Withdrawn",
};

const like = (q: string) => `%${q.replace(/[\\%_]/g, char => `\\${char}`)}%`;
const campusSql = (column: string, campusIds: string[] | null) => campusIds ? Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(campusIds)})` : Prisma.empty;

async function searchStudents(user: AuthUser, filters: Filters, campusIds: string[] | null, limit: number, offset: number) {
  const q = filters.q.trim();
  const teacherClasses = user.role === "TEACHER" ? await teacherClassIds(user) : null;
  if (teacherClasses && !teacherClasses.length) return { rows: [] as Result[], total: 0 };
  const where = Prisma.sql`s.school_id = ${user.schoolId} ${campusSql("s.campus_id", campusIds)}
    ${teacherClasses ? Prisma.sql`AND s.class_id IN (${Prisma.join(teacherClasses)})` : Prisma.empty}
    ${filters.status === "active" ? Prisma.sql`AND s.archived_at IS NULL` : filters.status === "archived" ? Prisma.sql`AND s.archived_at IS NOT NULL` : Prisma.empty}
    ${filters.classId ? Prisma.sql`AND s.class_id = ${filters.classId}` : Prisma.empty}
    ${filters.academicYear ? Prisma.sql`AND c.academic_year = ${filters.academicYear}` : Prisma.empty}
    ${q ? Prisma.sql`AND (lower(s.roll_no) = lower(${q}) OR lower(coalesce(s.admission_no, '')) = lower(${q}) OR s.id = ${q} OR search_fold(s.full_name) LIKE search_fold(${like(q)}) OR search_fold(coalesce(s.name_ur, '')) LIKE search_fold(${like(q)}))` : Prisma.empty}`;
  const exact = q ? Prisma.sql`(lower(s.roll_no) = lower(${q}) OR lower(coalesce(s.admission_no, '')) = lower(${q}) OR s.id = ${q})` : Prisma.sql`false`;
  const [rows, [{ total }]] = await Promise.all([
    prisma.$queryRaw<{ id: string; full_name: string; name_ur: string | null; roll_no: string; admission_no: string | null; archived_at: Date | null; consolidated_into_id: string | null; class_name: string; section: string | null; academic_year: number; campus_name: string; exact: boolean }[]>`
      SELECT s.id, s.full_name, s.name_ur, s.roll_no, s.admission_no, s.archived_at, s.consolidated_into_id, c.name AS class_name, c.section, c.academic_year, cp.name AS campus_name, ${exact} AS exact
      FROM students s JOIN classes c ON c.id = s.class_id JOIN campuses cp ON cp.id = s.campus_id
      WHERE ${where}
      ORDER BY ${exact} DESC, s.archived_at IS NOT NULL, search_fold(s.full_name), s.roll_no, s.id
      LIMIT ${limit} OFFSET ${offset}`,
    prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM students s JOIN classes c ON c.id = s.class_id WHERE ${where}`,
  ]);
  // A merged (consolidated) record is found by its old identifiers but opens the surviving pupil.
  const survivors = rows.filter(row => row.consolidated_into_id).map(row => row.consolidated_into_id!);
  const survivorNames = new Map((survivors.length ? await prisma.student.findMany({ where: { id: { in: survivors }, schoolId: user.schoolId }, select: { id: true, fullName: true } }) : []).map(row => [row.id, row.fullName]));
  return {
    total: Number(total),
    rows: rows.map(row => ({
      type: "student" as const, id: row.consolidated_into_id ?? row.id, title: row.full_name, exact: row.exact, archived: Boolean(row.archived_at),
      context: [[row.class_name, row.section].filter(Boolean).join(" "), row.campus_name, String(row.academic_year)],
      identifiers: [row.roll_no, ...(row.admission_no ? [row.admission_no] : [])],
      ...(row.consolidated_into_id ? { note: `merged into ${survivorNames.get(row.consolidated_into_id) ?? "another record"}` } : {}),
      href: resultHref(user.role, "student", { id: row.consolidated_into_id ?? row.id }),
    })),
  };
}

async function searchClasses(user: AuthUser, filters: Filters, campusIds: string[] | null, limit: number, offset: number) {
  const q = filters.q.trim();
  const teacherClasses = user.role === "TEACHER" ? await teacherClassIds(user) : null;
  if (teacherClasses && !teacherClasses.length) return { rows: [] as Result[], total: 0 };
  const where: Prisma.ClassWhereInput = {
    schoolId: user.schoolId, ...(campusIds ? { campusId: { in: campusIds } } : {}), ...(teacherClasses ? { id: { in: teacherClasses } } : {}),
    ...(filters.status === "active" ? { archivedAt: null } : filters.status === "archived" ? { archivedAt: { not: null } } : {}),
    ...(filters.academicYear ? { academicYear: filters.academicYear } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { section: { contains: q, mode: "insensitive" } }, { id: q }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.class.findMany({ where, orderBy: [{ academicYear: "desc" }, { name: "asc" }, { section: "asc" }], take: limit, skip: offset, select: { id: true, name: true, section: true, academicYear: true, archivedAt: true, campus: { select: { name: true } }, _count: { select: { students: { where: { archivedAt: null } } } } } }),
    prisma.class.count({ where }),
  ]);
  return { total, rows: rows.map(row => ({ type: "class" as const, id: row.id, title: [row.name, row.section].filter(Boolean).join(" "), exact: row.id === q, archived: Boolean(row.archivedAt), context: [row.campus.name, String(row.academicYear), say(filters, "{0} pupils", row._count.students)], identifiers: [], href: resultHref(user.role, "class", { id: row.id }) })) };
}

async function searchStaff(user: AuthUser, filters: Filters, campusIds: string[] | null, limit: number, offset: number) {
  const q = filters.q.trim();
  const where: Prisma.UserWhereInput = {
    schoolId: user.schoolId, role: { in: (STAFF_ROLES_FOR[user.role] ?? STAFF_ROLES) as never[] },
    ...(campusIds ? { campusId: { in: campusIds } } : {}),
    ...(filters.status === "active" ? { isActive: true } : filters.status === "archived" ? { isActive: false } : {}),
    ...(q ? { AND: [{ OR: [{ fullName: { contains: q, mode: "insensitive" } }, { email: { equals: q, mode: "insensitive" } }, { id: q }] }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: [{ fullName: "asc" }, { id: "asc" }], take: limit, skip: offset, select: { id: true, fullName: true, role: true, email: true, isActive: true, campus: { select: { name: true } } } }),
    prisma.user.count({ where }),
  ]);
  return { total, rows: rows.map(row => ({ type: "staff" as const, id: row.id, title: row.fullName, exact: row.id === q || row.email.toLowerCase() === q.toLowerCase(), archived: !row.isActive, context: [roleLabelFor({ role: row.role as UserRole, institutionKind: user.institutionKind }, filters.language ?? "en"), row.campus?.name ?? say(filters, "All campuses")], identifiers: [row.email], href: resultHref(user.role, "staff", { id: row.id, isTeacher: row.role === "TEACHER" }) })) };
}

async function searchApplications(user: AuthUser, filters: Filters, campusIds: string[] | null, limit: number, offset: number) {
  const q = filters.q.trim();
  const where: Prisma.AdmissionApplicationWhereInput = {
    schoolId: user.schoolId, ...(campusIds ? { campusId: { in: campusIds } } : {}),
    status: filters.status === "active" ? { notIn: ["DRAFT", "WITHDRAWN", "REJECTED", "DECLINED", "ENROLLED"] } : filters.status === "archived" ? { in: ["WITHDRAWN", "REJECTED", "DECLINED", "ENROLLED"] } : { not: "DRAFT" },
    ...(q ? { OR: [{ reference: { equals: q, mode: "insensitive" } }, { childName: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.admissionApplication.findMany({ where, orderBy: [{ submittedAt: "desc" }, { id: "asc" }], take: limit, skip: offset, select: { id: true, reference: true, childName: true, status: true, submittedAt: true, formVersion: { select: { form: { select: { name: true } } } } } }),
    prisma.admissionApplication.count({ where }),
  ]);
  return { total, rows: rows.map(row => ({ type: "application" as const, id: row.id, title: row.childName || row.reference, exact: row.reference.toLowerCase() === q.toLowerCase(), archived: ["WITHDRAWN", "REJECTED", "DECLINED", "ENROLLED"].includes(row.status), context: [row.formVersion.form.name, say(filters, APPLICATION_STATUS[row.status] ?? "Submitted")], identifiers: [row.reference], href: resultHref(user.role, "application", { id: row.id, reference: row.reference }) })) };
}

const SEARCHERS = { student: searchStudents, class: searchClasses, staff: searchStaff, application: searchApplications };

/** Search the reader's authorized scope. A failing source is reported as partial, not as "nothing found". */
export async function searchRecords(user: AuthUser, filters: Filters) {
  if (isFamilyRole(user)) throw new ApiError("Search covers school records for staff. Families find their children's information in their own portal.", 403);
  if (!canSearchRecords(user.role)) throw new ApiError("Record search is not part of your workspace.", 403);
  const allowed = await allowedTypes(user);
  if (!allowed.length) throw new ApiError("Your role has no searchable records.", 403);
  const types = filters.types.length ? filters.types.filter(type => allowed.includes(type)) : allowed;
  const { campusIds } = await scope(user, filters.campusId);
  const single = types.length === 1;
  const limit = single ? PAGE : 8;
  const offset = single ? Math.max(0, filters.page - 1) * PAGE : 0;
  const sources: Record<string, "ok" | "failed"> = {};
  const groups = await Promise.all(types.map(async type => {
    try { const result = await SEARCHERS[type](user, filters, campusIds, limit, offset); sources[type] = "ok"; return { type, ...result }; }
    catch (error) { console.error(`[search] ${type} failed`, error); sources[type] = "failed"; return { type, rows: [] as Result[], total: 0 }; }
  }));
  const [school, campus] = await Promise.all([prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true } }), campusIds?.length === 1 ? prisma.campus.findUnique({ where: { id: campusIds[0] }, select: { name: true } }) : null]);
  return {
    scope: { school: school?.name ?? "", campus: campus?.name ?? null, allCampuses: !campusIds },
    allowedTypes: allowed, types, groups, sources, partial: Object.values(sources).includes("failed"),
    page: single ? filters.page : 1, pageSize: single ? PAGE : limit,
  };
}

export function parseFilters(params: URLSearchParams): Filters {
  const types = (params.get("types") ?? "").split(",").filter((type): type is SearchType => (TYPES as readonly string[]).includes(type));
  const status = params.get("status");
  const year = Number(params.get("year"));
  const page = Number(params.get("page"));
  const lang = params.get("lang");
  return {
    q: (params.get("q") ?? "").slice(0, 100), types, campusId: params.get("campus") || null,
    academicYear: Number.isInteger(year) && year > 1900 && year < 3000 ? year : null, classId: params.get("class") || null,
    status: status === "archived" || status === "all" ? status : "active", page: Number.isInteger(page) && page > 0 ? Math.min(page, 400) : 1,
    language: lang === "ar" || lang === "ur" ? lang : "en",
  };
}
