import { createHash } from "node:crypto";
import { Prisma, type Campus } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { assertPlanCapacity } from "@/lib/billing/entitlements";
import { defaultBoardFor } from "@/config/boards";
import { schoolCountry } from "@/lib/school/country";
import { assertEmail, assertPhone, assertWebsite, optionalText, parseLogo, requiredText } from "@/lib/school/details";

/**
 * Campus create and campus-details commands, extracted from the server actions (src/app/actions/addCampus.ts,
 * src/app/actions/settings.ts) so the screens and AI Workflows run one implementation. The actions keep their
 * session, tenant binding and messages; these functions take an already resolved user.
 */

/** Trimmed, or null when the field was left blank. */
const optional = (value?: string) => optionalText(value);

export function recordRevision(record: unknown) { return createHash("sha256").update(JSON.stringify(record)).digest("hex"); }

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
export function patchText(value: string | null | undefined) {
  return value === undefined ? undefined : optionalText(value);
}

// SKO-402: updates are partial. A field that is omitted (undefined) keeps its stored value; an empty string
// clears it only where clearing is allowed (name and city never clear). Create and edit share one set of
// validators. Each save writes one audit entry holding only the fields that changed, before and after.
export type Diff = Record<string, { from: unknown; to: unknown }>;
export function diffOf(before: Record<string, unknown>, data: Record<string, unknown>): Diff {
  const out: Diff = {};
  for (const [key, value] of Object.entries(data)) if (value !== undefined && JSON.stringify(before[key] ?? null) !== JSON.stringify(value ?? null)) out[key] = { from: before[key] ?? null, to: value ?? null };
  return out;
}
export const AUDIT_FIELDS = (diff: Diff, side: "from" | "to") => Object.fromEntries(Object.entries(diff).map(([key, change]) => [key, key === "logoUrl" ? (change[side] ? "(logo)" : null) : change[side]]));

// ─── Create ──────────────────────────────────────────────────────────────

export interface CampusCreateFields {
  name: string;
  city: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  principalName?: string;
  board?: string;
  /** Omit to have one generated. */
  regId?: string;
}
// SKAI-113: the campus ID is printed on letters and used in links, so it keeps a plain, typeable shape.
const CAMPUS_REG_ID = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
export function normalizeCampusRegId(value?: string | null) {
  const id = optional(value ?? undefined)?.toUpperCase() ?? null;
  if (id && !CAMPUS_REG_ID.test(id)) throw new Error("Use 3 to 20 letters, digits or dashes for the campus ID, like BR-NORTH.");
  return id;
}

export type ValidCampusFields = ReturnType<typeof validateCampusInput>;

/** SKO-402: the same validators as editing a campus, so a campus can always be saved as it was created. */
export function validateCampusInput(input: CampusCreateFields) {
  const name = requiredText(input.name, "Campus name");
  const city = requiredText(input.city, "City");
  const email = assertEmail(optional(input.email), "campus email address");
  const phone = assertPhone(optional(input.phone), "Phone number");
  const website = assertWebsite(optional(input.website), "website");
  return { name, city, email, phone, website, address: optional(input.address), principalName: optional(input.principalName), board: optional(input.board), regId: normalizeCampusRegId(input.regId) };
}

/**
 * Creates a campus inside plan capacity and gives it an academic calendar. The caller has checked that the
 * user is the group admin and bound the tenant context.
 */
export async function createCampusRecord(user: Pick<AuthUser, "schoolId">, valid: ValidCampusFields): Promise<Campus> {
  const schoolId = String(user.schoolId);
  await assertPlanCapacity({ schoolId, metric: "campuses" });

  const finalRegId = (valid.regId || `BR-${Math.random().toString(36).substring(2, 6).toUpperCase()}`).toUpperCase();

  // regId is unique platform-wide, so a clash is a user-facing problem, not a
  // 500. Check first for the common case; the create is still wrapped below
  // because two admins can race between this read and the write.
  const sameName = await prisma.campus.findFirst({ where: { schoolId, archivedAt: null, name: { equals: valid.name, mode: "insensitive" } }, select: { id: true } });
  if (sameName) throw new Error("Another active campus already uses this name.");
  const clash = await prisma.campus.findUnique({ where: { regId: finalRegId }, select: { id: true } });
  if (clash) throw new Error(`Campus ID ${finalRegId} is already in use. Choose another.`);

  let newCampus;
  try {
    newCampus = await prisma.campus.create({
      data: {
        name: valid.name,
        regId: finalRegId,
        schoolId,
        city: valid.city,
        // Previously city was written into address as well, so every campus
        // reported its address as just the city name on letters and receipts.
        address: valid.address,
        phone: valid.phone,
        email: valid.email,
        website: valid.website,
        principalName: valid.principalName,
        board: valid.board || defaultBoardFor(await schoolCountry(schoolId)),
      }
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      throw new Error(`Campus ID ${finalRegId} is already in use. Choose another.`);
    }
    throw error;
  }

  // A campus created after onboarding needs the same academic grounding the
  // wizard gives the first one, or the Academic Hub opens reporting the year
  // as unset, getActiveAcademicYear() falls back to the calendar year, and
  // exam scheduling will happily book a paper on the group's weekend.
  //
  // Inherit from a sibling campus so a new branch matches the group it joins,
  // rather than asking an admin to re-enter the session they already defined.
  await seedCampusCalendar(schoolId, newCampus.id);
  return newCampus;
}

/**
 * Gives a new campus an ACTIVE academic cycle and a working week, copied from
 * an existing campus in the same school when there is one.
 *
 * Best-effort: the campus itself is already created and usable, so a failure
 * here must not fail the whole action — the admin can still set the calendar
 * from Academic → Calendar.
 */
export async function seedCampusCalendar(schoolId: string, campusId: string) {
  try {
    const sibling = await prisma.campus.findFirst({
      where: { schoolId, id: { not: campusId } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const template = sibling
      ? await prisma.academicCycle.findFirst({
          where: { campusId: sibling.id, status: "ACTIVE" },
          select: { label: true, academicYear: true, startDate: true, endDate: true },
        })
      : null;

    const year = template?.academicYear ?? new Date().getFullYear();
    await prisma.academicCycle.create({
      data: {
        schoolId,
        campusId,
        label: template?.label ?? `${year}-${String((year + 1) % 100).padStart(2, "0")}`,
        academicYear: year,
        status: "ACTIVE",
        startDate: template?.startDate ?? new Date(),
        endDate: template?.endDate ?? null,
      },
    });

    const siblingWeekends = sibling
      ? await prisma.weekend.findMany({
          where: { campusId: sibling.id },
          select: { dayOfWeek: true },
        })
      : [];

    // Sunday is the sane default when there is no sibling to copy.
    const days = siblingWeekends.length > 0 ? siblingWeekends.map((w) => w.dayOfWeek) : [7];
    await prisma.weekend.createMany({
      data: days.map((dayOfWeek) => ({ schoolId, campusId, dayOfWeek })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.error("[addCampus] calendar seeding failed", error);
  }
}

// ─── Update details ──────────────────────────────────────────────────────

export interface CampusDetailsInput {
  expectedRevision?: string;
  campusId: string;
  name?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  principalName?: string;
  board?: string;
  logoUrl?: string;
}

/** Campus edits: the group owner for any campus, an admin for their own. */
export async function assertCanEditCampus(session: Pick<AuthUser, "schoolId" | "role" | "campusId">, campusId: string) {
  // Scoped read, so a campus id from another school simply is not found.
  const campus = await prisma.campus.findFirst({
    where: { id: campusId, schoolId: session.schoolId },
    select: { id: true, archivedAt: true },
  });
  if (!campus) throw new Error("Campus not found.");
  // SKAI-113: an archived campus is read-only until the group admin restores it.
  if (campus.archivedAt) throw new Error("Restore this campus before editing it.");

  if (session.role === "SUPER_ADMIN") return;
  if ((session.role === "CAMPUS_ADMIN" || session.role === "ADMIN") && session.campusId === campusId) return;

  throw new Error("You can only edit the campus you administer.");
}

/** The campus-details write behind Settings → Campus (updateCampusDetails) and campus.update_details. */
export async function updateCampusDetailsCommand(session: AuthUser, input: CampusDetailsInput) {
  const campusId = requiredText(input.campusId, "Campus");
  await assertCanEditCampus(session, campusId);

  const name = input.name === undefined ? undefined : requiredText(input.name, "Campus name");
  const city = input.city === undefined ? undefined : requiredText(input.city, "City");
  const email = input.email === undefined ? undefined : assertEmail(optionalText(input.email), "campus email address");
  const phone = input.phone === undefined ? undefined : assertPhone(optionalText(input.phone), "Phone number");
  const website = input.website === undefined ? undefined : assertWebsite(optionalText(input.website), "website");

  const newLogoUrl = input.logoUrl === undefined ? undefined : parseLogo(input.logoUrl, { schoolId: session.schoolId, campusId });
  // A board is never left blank: clearing it falls back to the first board for the school's country.
  const board = input.board === undefined ? undefined : optionalText(input.board) || defaultBoardFor(await schoolCountry(session.schoolId));
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.campus.findUnique({ where: { id: campusId } });
    if (!current || (input.expectedRevision && input.expectedRevision !== recordRevision(current))) throw new Error("This record changed. Review your draft against the current values before saving.");
    if (name && name.toLocaleLowerCase() !== current.name.toLocaleLowerCase()) {
      const clash = await tx.campus.findFirst({ where: { schoolId: session.schoolId, archivedAt: null, id: { not: campusId }, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
      if (clash) throw new Error("Another active campus already uses this name.");
    }
    const data = {
      name, city, phone, email, website,
      address: patchText(input.address),
      principalName: patchText(input.principalName),
      board,
      logoUrl: newLogoUrl,
    };
    const diff = diffOf(current as unknown as Record<string, unknown>, data);
    if (!Object.keys(diff).length) return { campus: current, changed: [] as string[] };
    const campus = await tx.campus.update({ where: { id: campusId }, data });
    await tx.auditLog.create({ data: { schoolId: session.schoolId, campusId, tableName: "campus", recordId: campusId, userId: session.userId, oldValue: { kind: "DETAILS", fields: AUDIT_FIELDS(diff, "from") } as Prisma.InputJsonValue, newValue: { kind: "DETAILS", fields: AUDIT_FIELDS(diff, "to") } as Prisma.InputJsonValue } });
    return { campus, changed: Object.keys(diff) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { success: true, changed: result.changed, campus: { id: result.campus.id, name: result.campus.name } };
}
