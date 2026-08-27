'use server'

import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

import { JWT_SECRET } from "@/lib/auth/secret";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { enterTenantContext } from "@/lib/db/tenant-context";
import { DEFAULT_EXAM_BOARD } from "@/config/boards";
import {
  assertEmail,
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
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) throw new Error("Unauthorized");

  const { payload } = await jwtVerify(token, JWT_SECRET);
  const schoolId = String(payload.schoolId);

  // These actions read the JWT directly rather than going through
  // getAuthUser(), so they must bind tenant context themselves before any
  // query — otherwise the guard refuses it, correctly.
  enterTenantContext({ schoolId, userId: String(payload.userId || "") });
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

export interface InstitutionSettings {
  canEditSchool: boolean;
  editableCampusIds: string[];
  school: {
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
      ? campuses.map((c) => c.id)
      : (session.role === "CAMPUS_ADMIN" || session.role === "ADMIN") && session.campusId
      ? campuses.filter((c) => c.id === session.campusId).map((c) => c.id)
      : [];

  return {
    canEditSchool,
    editableCampusIds,
    school: {
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
    })),
  };
}

export interface SchoolDetailsInput {
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

  const school = await prisma.school.update({
    where: { id: session.schoolId },
    data: {
      name,
      city,
      tagline: optionalText(input.tagline),
      address: optionalText(input.address),
      phone: optionalText(input.phone),
      website: optionalText(input.website),
      logoUrl: parseLogo(input.logoUrl),
      establishedYear: parseEstablishedYear(input.establishedYear),
      ...(timezone ? { timezone } : {}),
    },
  });

  return { success: true, school: { id: school.id, name: school.name, timezone: school.timezone } };
}

export interface CampusDetailsInput {
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
  const email = assertEmail(optionalText(input.email), "campus email address");

  const campus = await prisma.campus.update({
    where: { id: campusId },
    data: {
      name,
      city,
      address: optionalText(input.address),
      phone: optionalText(input.phone),
      email,
      website: optionalText(input.website),
      principalName: optionalText(input.principalName),
      board: optionalText(input.board) || DEFAULT_EXAM_BOARD,
      logoUrl: parseLogo(input.logoUrl),
    },
  });

  return { success: true, campus: { id: campus.id, name: campus.name } };
}
