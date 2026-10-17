'use server'

import { getAuthUser } from "@/lib/auth";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { enterTenantContext } from "@/lib/db/tenant-context";
import { DEFAULT_EXAM_BOARD } from "@/config/boards";
import {
  assertEmail,
  assertPhone,
  optionalText,
  parseEstablishedYear,
  parseLogo,
  requiredText,
  safeTimezone,
} from "@/lib/school/details";

// ─────────────────────────────────────────────────────────────────
// Who may edit what
//
// School details are the identity of the whole institution — the name and
// logo print on every campus's report cards — so they belong to whoever owns
// the institution:
//
//   SUPER_ADMIN   the group owner                      → yes
//   ADMIN         a standalone school's owner          → yes, but only while
//                 the school really is a single campus; an ADMIN sitting in a
//                 multi-campus group is a branch admin, not the group owner
//   everyone else                                      → no
//
// Campus details belong to whoever administers that campus:
//
//   SUPER_ADMIN            → any campus inside their own school
//   CAMPUS_ADMIN / ADMIN   → their own campus only, never a sibling's
//   everyone else          → no
//
// PRINCIPAL is deliberately excluded from both. It is an academic authority,
// and this is account administration — a principal editing the campus record
// could also rewrite who the recorded head of campus is.
//
// regId is not editable anywhere. It prints on report cards, invoices and
// receipts, and signup states it cannot be changed; editing it would leave
// already-issued documents disagreeing with the record.
// ─────────────────────────────────────────────────────────────────

interface Session {
  userId: string;
  schoolId: string;
  campusId: string | null;
  role: string;
}

async function requireSession(): Promise<Session> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) throw new Error("Unauthorized");

  const payload = await getAuthUser();
  if (!payload) throw new Error("Unauthorized");
  const schoolId = String(payload.schoolId);

  // Carry the current principal into transactional tenant work.
  enterTenantContext({ schoolId, userId: payload.userId, campusId: payload.campusId, role: payload.role });
  await assertSchoolOperational(schoolId);

  return {
    userId: String(payload.userId),
    schoolId,
    campusId: payload.campusId ? String(payload.campusId) : null,
    role: String(payload.role),
  };
}

/**
 * Institution records name campuses, their heads and their contact details.
 * That is staff-facing administrative data, not something a pupil or a
 * guardian account has any reason to enumerate.
 */
function assertStaffViewer(session: Session) {
  if (session.role === "STUDENT" || session.role === "PARENT") {
    throw new Error("Institution settings are not available to student or guardian accounts.");
  }
}

/** School-identity edits: the group owner, or a genuine standalone owner. */
async function assertCanEditSchool(session: Session) {
  if (session.role === "SUPER_ADMIN") return;
  if (session.role === "ADMIN") {
    const campusCount = await prisma.campus.count({ where: { schoolId: session.schoolId } });
    if (campusCount <= 1) return;
  }
  throw new Error("Only the institution owner can change school details.");
}

/** Campus edits: the group owner for any campus, an admin for their own. */
async function assertCanEditCampus(session: Session, campusId: string) {
  // Scoped read, so a campus id from another school simply is not found.
  const campus = await prisma.campus.findFirst({
    where: { id: campusId, schoolId: session.schoolId },
    select: { id: true },
  });
  if (!campus) throw new Error("Campus not found.");

  if (session.role === "SUPER_ADMIN") return;
  if ((session.role === "CAMPUS_ADMIN" || session.role === "ADMIN") && session.campusId === campusId) return;

  throw new Error("You can only edit the campus you administer.");
}

function recordRevision(record: unknown) { return createHash("sha256").update(JSON.stringify(record)).digest("hex"); }

export interface InstitutionSettings {
  canEditSchool: boolean;
  /** SKO-389: only the institution owner archives or restores a campus. */
  canArchiveCampuses: boolean;
  editableCampusIds: string[];
  school: {
    revision: string;
    id: string;
    name: string;
    regId: string;
    contactEmail: string;
    tagline: string;
    city: string;
    address: string;
    phone: string;
    website: string;
    logoUrl: string;
    establishedYear: string;
    timezone: string;
  };
  campuses: {
    revision: string;
    id: string;
    name: string;
    regId: string;
    city: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    principalName: string;
    board: string;
    logoUrl: string;
    archivedAt: string | null;
    archiveReason: string;
  }[];
}

/**
 * Current institution details plus what this user is allowed to change, so the
 * UI can hide controls it would only be refused for. The server re-checks on
 * every write — this is for presentation, not enforcement.
 */
export async function getInstitutionSettings(): Promise<InstitutionSettings> {
  const session = await requireSession();
  assertStaffViewer(session);

  const [school, campuses] = await Promise.all([
    prisma.school.findUnique({ where: { id: session.schoolId } }),
    prisma.campus.findMany({ where: { schoolId: session.schoolId }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!school) throw new Error("School not found.");

  const canEditSchool =
    session.role === "SUPER_ADMIN" || (session.role === "ADMIN" && campuses.length <= 1);

  const editableCampusIds =
    session.role === "SUPER_ADMIN"
      ? campuses.filter((c) => !c.archivedAt).map((c) => c.id)
      : (session.role === "CAMPUS_ADMIN" || session.role === "ADMIN") && session.campusId
        ? campuses.filter((c) => c.id === session.campusId).map((c) => c.id)
        : [];

  return {
    canEditSchool,
    canArchiveCampuses: session.role === "SUPER_ADMIN",
    editableCampusIds,
    school: {
      revision: recordRevision(school),
      id: school.id,
      name: school.name,
      regId: school.regId,
      contactEmail: school.contactEmail,
      tagline: school.tagline || "",
      city: school.city || "",
      address: school.address || "",
      phone: school.phone || "",
      website: school.website || "",
      logoUrl: school.logoUrl || "",
      establishedYear: school.establishedYear ? String(school.establishedYear) : "",
      timezone: school.timezone,
    },
    campuses: campuses.map((c) => ({
      revision: recordRevision(c),
      id: c.id,
      name: c.name,
      regId: c.regId,
      city: c.city,
      address: c.address || "",
      phone: c.phone || "",
      email: c.email || "",
      website: c.website || "",
      principalName: c.principalName || "",
      board: c.board || DEFAULT_EXAM_BOARD,
      logoUrl: c.logoUrl || "",
      archivedAt: c.archivedAt?.toISOString() ?? null,
      archiveReason: c.archiveReason || "",
    })),
  };
}

/**
 * Prisma skips any `data` key whose value is `undefined`, which gives these
 * actions proper patch semantics:
 *
 *   field absent from the payload → left exactly as it is
 *   field present but empty       → cleared
 *
 * Without this an omitted key resolved to `null` and silently wiped a column,
 * so a caller sending only the two fields it meant to change would blank the
 * campus's board, address and phone as a side effect.
 */
function patchText(value: string | null | undefined) {
  return value === undefined ? undefined : optionalText(value);
}

export interface SchoolDetailsInput {
  expectedRevision?: string;
  name: string;
  tagline?: string;
  city: string;
  address?: string;
  phone?: string;
  website?: string;
  logoUrl?: string;
  establishedYear?: string;
  timezone?: string;
}

export async function updateSchoolDetails(input: SchoolDetailsInput) {
  const session = await requireSession();
  await assertCanEditSchool(session);

  const name = requiredText(input.name, "School name");
  const city = requiredText(input.city, "City");
  // An unrecognised zone keeps whatever is stored rather than failing the save
  // or silently resetting the tenant to the schema default.
  const timezone = safeTimezone(input.timezone);
  if (input.timezone !== undefined) {
    const current = await prisma.school.findUniqueOrThrow({ where: { id: session.schoolId }, select: { timezone: true } });
    if (!timezone || timezone !== current.timezone) throw new Error("Preview timezone changes in Language and regional settings before applying them.");
  }

  const newLogoUrl = input.logoUrl === undefined ? undefined : parseLogo(input.logoUrl);
  const school = await prisma.$transaction(async (tx) => {
    const current = await tx.school.findUnique({ where: { id: session.schoolId } });
    if (!current || (input.expectedRevision && input.expectedRevision !== recordRevision(current))) throw new Error("This record changed. Review your draft against the current values before saving.");
    return tx.school.update({
    where: { id: session.schoolId },
    data: {
      name,
      city,
      tagline: patchText(input.tagline),
      address: patchText(input.address),
      phone: patchText(input.phone),
      website: patchText(input.website),
      logoUrl: newLogoUrl,
      establishedYear:
        input.establishedYear === undefined ? undefined : parseEstablishedYear(input.establishedYear),
      ...(timezone ? { timezone } : {}),
    },
  });

  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { success: true, school: { id: school.id, name: school.name, timezone: school.timezone } };
}

export interface CampusDetailsInput {
  expectedRevision?: string;
  campusId: string;
  name: string;
  city: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  principalName?: string;
  board?: string;
  logoUrl?: string;
}

export async function updateCampusDetails(input: CampusDetailsInput) {
  const session = await requireSession();
  const campusId = requiredText(input.campusId, "Campus");
  await assertCanEditCampus(session, campusId);

  const name = requiredText(input.name, "Campus name");
  const city = requiredText(input.city, "City");
  const email = input.email === undefined
    ? undefined
    : assertEmail(optionalText(input.email), "campus email address");
  const phone = input.phone === undefined
    ? undefined
    : assertPhone(optionalText(input.phone), "Phone number");

  const newLogoUrl = input.logoUrl === undefined ? undefined : parseLogo(input.logoUrl);
  const campus = await prisma.$transaction(async (tx) => {
    const current = await tx.campus.findUnique({ where: { id: campusId } });
    if (!current || (input.expectedRevision && input.expectedRevision !== recordRevision(current))) throw new Error("This record changed. Review your draft against the current values before saving.");
    return tx.campus.update({
    where: { id: campusId },
    data: {
      name,
      city,
      address: patchText(input.address),
      phone,
      email,
      website: patchText(input.website),
      principalName: patchText(input.principalName),
      // A board is never left blank: clearing it falls back to the default
      // rather than leaving report cards with no affiliation printed.
      board: input.board === undefined ? undefined : optionalText(input.board) || DEFAULT_EXAM_BOARD,
      logoUrl: newLogoUrl,
    },
  });

  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { success: true, campus: { id: campus.id, name: campus.name } };
}

// ─────────────────────────────────────────────────────────────────
// SKO-389: campus archive and restore
//
// Archiving a campus is the institution owner's decision and never deletes anything: classes, pupils,
// invoices and reports stay with it. It is refused while the campus still runs active pupils, classes
// or unsettled online payments, or when it is the school's last active campus. The blockers are
// counted again inside a serializable transaction holding the campus row, so a pupil enrolled while
// the dialog was open stops the archive.

export interface CampusArchivePreview {
  campusId: string;
  name: string;
  counts: { activeStudents: number; activeClasses: number; staff: number; openInvoices: number; pendingOnlinePayments: number; queuedRuns: number };
  blockers: ("ACTIVE_STUDENTS" | "ACTIVE_CLASSES" | "PENDING_ONLINE_PAYMENTS" | "LAST_ACTIVE_CAMPUS")[];
}

async function campusArchiveImpact(db: TxClient, schoolId: string, campusId: string): Promise<CampusArchivePreview> {
  const campus = await db.campus.findFirst({ where: { id: campusId, schoolId }, select: { id: true, name: true, archivedAt: true } });
  if (!campus) throw new Error("Campus not found.");
  const [activeStudents, activeClasses, staff, openInvoices, pendingOnlinePayments, queuedRuns, otherActive] = await Promise.all([
    db.student.count({ where: { campusId, archivedAt: null } }),
    db.class.count({ where: { campusId, archivedAt: null } }),
    db.user.count({ where: { campusId, isActive: true } }),
    db.invoice.count({ where: { campusId, balanceDue: { gt: 0 }, status: { notIn: ["PAID", "CANCELLED"] } } }),
    db.onlinePaymentOrder.count({ where: { campusId, status: "PENDING" } }),
    db.schoolAiRun.count({ where: { campusId, status: { in: ["QUEUED", "PAUSED"] } } }),
    db.campus.count({ where: { schoolId, archivedAt: null, id: { not: campusId } } }),
  ]);
  const blockers: CampusArchivePreview["blockers"] = [];
  if (activeStudents) blockers.push("ACTIVE_STUDENTS");
  if (activeClasses) blockers.push("ACTIVE_CLASSES");
  if (pendingOnlinePayments) blockers.push("PENDING_ONLINE_PAYMENTS");
  if (!campus.archivedAt && otherActive === 0) blockers.push("LAST_ACTIVE_CAMPUS");
  return { campusId, name: campus.name, counts: { activeStudents, activeClasses, staff, openInvoices, pendingOnlinePayments, queuedRuns }, blockers };
}

function assertInstitutionOwner(session: Session) {
  if (session.role !== "SUPER_ADMIN") throw new Error("Only the institution owner can archive or restore a campus.");
}

export async function previewCampusArchive(campusId: string): Promise<CampusArchivePreview> {
  const session = await requireSession();
  assertInstitutionOwner(session);
  const id = requiredText(campusId, "Campus");
  return prisma.$transaction((tx) => campusArchiveImpact(tx, session.schoolId, id));
}

export async function archiveCampus(input: { campusId: string; reason: string }) {
  const session = await requireSession();
  assertInstitutionOwner(session);
  const campusId = requiredText(input.campusId, "Campus"), reason = requiredText(input.reason, "Reason").slice(0, 300);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM campuses WHERE id = ${campusId} AND school_id = ${session.schoolId} FOR UPDATE`;
    const current = await tx.campus.findFirst({ where: { id: campusId, schoolId: session.schoolId }, select: { archivedAt: true } });
    if (!current) throw new Error("Campus not found.");
    if (current.archivedAt) return { success: true, alreadyArchived: true };
    const impact = await campusArchiveImpact(tx, session.schoolId, campusId);
    if (impact.blockers.length) return { success: false, blockers: impact.blockers, counts: impact.counts };
    await tx.campus.update({ where: { id: campusId }, data: { archivedAt: new Date(), archiveReason: reason } });
    await tx.auditLog.create({ data: { schoolId: session.schoolId, tableName: "campus", recordId: campusId, userId: session.userId, oldValue: { archived: false }, newValue: { archived: true, reason, counts: impact.counts } } });
    return { success: true, alreadyArchived: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function restoreCampus(campusId: string) {
  const session = await requireSession();
  assertInstitutionOwner(session);
  const id = requiredText(campusId, "Campus");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM campuses WHERE id = ${id} AND school_id = ${session.schoolId} FOR UPDATE`;
    const campus = await tx.campus.findFirst({ where: { id, schoolId: session.schoolId }, select: { name: true, archivedAt: true } });
    if (!campus) throw new Error("Campus not found.");
    if (!campus.archivedAt) return { success: true, alreadyActive: true };
    const clash = await tx.campus.findFirst({ where: { schoolId: session.schoolId, archivedAt: null, id: { not: id }, name: { equals: campus.name, mode: "insensitive" } }, select: { id: true } });
    if (clash) throw new Error("An active campus already uses this name. Rename one of them before restoring.");
    await tx.campus.update({ where: { id }, data: { archivedAt: null, archiveReason: null } });
    await tx.auditLog.create({ data: { schoolId: session.schoolId, tableName: "campus", recordId: id, userId: session.userId, oldValue: { archived: true }, newValue: { archived: false } } });
    return { success: true, alreadyActive: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
