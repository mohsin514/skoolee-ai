// ─────────────────────────────────────────────────────────────────
// Owner provisioning helpers
// Shared by POST /api/owner/schools and POST /api/owner/users.
// Self-serve registration is disabled — the APP_OWNER creates every
// school and every account, so these helpers are the single place
// where new credentials come into existence.
// ─────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { PLANS } from "@/config/plans";
import type { PlanType } from "@/types";
import type { UserRole } from "@/lib/roles";

// Roles the owner may create directly. PARENT and STUDENT are excluded —
// those are created through admission, tied to a Student record.
export const OWNER_CREATABLE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "CAMPUS_ADMIN",
  "ADMIN",
  "PRINCIPAL",
  "TEACHER",
];

// Omits look-alike characters (0/O, 1/l/I) so a password read off a
// screen and typed by hand does not fail for ambiguous glyphs.
const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generatePassword(length = 14): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += PW_ALPHABET[bytes[i] % PW_ALPHABET.length];
  // Guarantee at least one digit so the result always satisfies
  // downstream strength checks.
  return out.slice(0, -1) + "23456789"[Math.floor(Math.random() * 8)];
}

export function genRegId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

export function slugify(input: string): string {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Finds a slug that is not taken, appending -2, -3 … as needed. */
export async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "school";
  let candidate = root;
  let n = 1;
  // Bounded loop — a school with 50 name collisions is a data problem,
  // not something to spin on.
  while (n < 50) {
    const taken = await prisma.school.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
  return `${root}-${Date.now()}`;
}

export function isValidEmail(email: unknown): boolean {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Rejects an email that already belongs to a user or is a school contact. */
export async function assertEmailAvailable(email: string) {
  const [userExists, schoolExists] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.school.findUnique({ where: { contactEmail: email }, select: { id: true } }),
  ]);
  if (userExists) throw new ApiError("That email already has an account", 409);
  if (schoolExists) throw new ApiError("That email is already a school contact address", 409);
}

export function normalizePlan(plan: unknown): PlanType {
  const value = String(plan || "FREE").toUpperCase();
  return (["FREE", "BASIC", "PRO", "ENTERPRISE"] as const).includes(value as PlanType)
    ? (value as PlanType)
    : "FREE";
}

/**
 * Seat check for staff roles. Mirrors billing/entitlements.ts but counts
 * only what this endpoint can add, and treats ENTERPRISE (-1) as unlimited.
 */
export async function assertSeatAvailable(schoolId: string, role: UserRole) {
  if (role !== "TEACHER") return; // only teacher seats are metered

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { plan: true },
  });
  if (!school) throw new ApiError("School not found", 404);

  const limit = PLANS[normalizePlan(school.plan)].maxTeachers;
  if (limit < 0) return; // unlimited

  const [active, pending] = await Promise.all([
    prisma.user.count({ where: { schoolId, role: "TEACHER", isActive: true } }),
    prisma.staffInvitation.count({
      where: { role: "TEACHER", status: "pending", campus: { schoolId } },
    }),
  ]);

  if (active + pending >= limit) {
    throw new ApiError(
      `Teacher limit reached for the ${school.plan} plan (${limit}). Upgrade the plan to add more.`,
      402
    );
  }
}
