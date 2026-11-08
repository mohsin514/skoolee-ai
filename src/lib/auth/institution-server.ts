// §1.1a: server only — a client import fails the build instead of bundling Prisma.
import "server-only";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { authorityRoleFor, canOwnSubscription, institutionKindOf, type InstitutionKind } from "@/lib/auth/institution";
import type { UserRole } from "@/lib/roles";

/**
 * Server-only institution helpers (§1.1a). The kind lookup lives here exactly once:
 * `resolveCurrentPrincipal` (principal.ts) selects `INSTITUTION_KIND_SCHOOL_SELECT` with the account and hands the
 * row to `resolveInstitutionKind`; `getInstitutionKind` reads the same row by school id. Nobody else re-implements it.
 */

/** The school columns the kind lookup reads. Spread into a `school: { select }` block. */
export const INSTITUTION_KIND_SCHOOL_SELECT = {
  registrationKind: true,
  institutionSetup: { select: { institutionType: true } },
} as const;

type KindRow = { registrationKind?: string | null; institutionSetup?: { institutionType: string | null } | null } | null | undefined;
type UserLookupClient = Pick<TxClient, "user">;

function settled(value: string | null | undefined) {
  return value === "GROUP" || value === "STANDALONE";
}

/**
 * registrationKind → InstitutionSetup.institutionType → owner role (fails toward GROUP). The owner-role query runs
 * only when both stored signals are unresolved (UNVERIFIED schools without a setup row), inside the same unscoped
 * purpose and filtered by the explicit school id. Internal: use `getInstitutionKind` or the resolved `AuthUser`.
 */
export async function resolveInstitutionKind(schoolId: string, school: KindRow, db: UserLookupClient = prisma): Promise<InstitutionKind> {
  const registrationKind = school?.registrationKind ?? null;
  const setupType = school?.institutionSetup?.institutionType ?? null;
  if (settled(registrationKind) || settled(setupType)) return institutionKindOf({ registrationKind, setupType });
  const owner = await runUnscoped("resolve institution kind", () => db.user.findFirst({
    where: { schoolId, isInstitutionOwner: true },
    orderBy: { createdAt: "asc" },
    select: { role: true },
  }));
  return institutionKindOf({ registrationKind, setupType, ownerRole: owner?.role ?? null });
}

/** Same select and fallback as principal.ts (registrationKind → setup type → owner role), inside runUnscoped("resolve institution kind"). */
export async function getInstitutionKind(schoolId: string, db?: TxClient): Promise<InstitutionKind> {
  const client = db ?? prisma;
  const school = await runUnscoped("resolve institution kind", () => client.school.findUnique({
    where: { id: schoolId },
    select: INSTITUTION_KIND_SCHOOL_SELECT,
  }));
  return resolveInstitutionKind(schoolId, school, client);
}

type AuthorityRow = { id: string; fullName: string; role: string; campusId: string | null; isInstitutionOwner: boolean; canPurchaseSubscription: boolean };

/** One read of the active authority-role users (owner first, then createdAt). `kind` skips the lookup when the caller
 *  already holds it (a resolved `AuthUser`). */
async function authorityRows(schoolId: string, db: TxClient | undefined, kind: InstitutionKind | undefined, purpose: string) {
  const client = db ?? prisma;
  const resolved = kind ?? await getInstitutionKind(schoolId, db);
  const rows: AuthorityRow[] = await runUnscoped(purpose, () => client.user.findMany({
    where: { schoolId, role: authorityRoleFor(resolved), isActive: true },
    orderBy: [{ isInstitutionOwner: "desc" }, { createdAt: "asc" }],
    select: { id: true, fullName: true, role: true, campusId: true, isInstitutionOwner: true, canPurchaseSubscription: true },
  }));
  return { kind: resolved, rows };
}

const payersAmong = (kind: InstitutionKind, rows: AuthorityRow[]) => rows
  .filter((row) => canOwnSubscription({ role: row.role as UserRole, institutionKind: kind, isInstitutionOwner: row.isInstitutionOwner, canPurchaseSubscription: row.canPurchaseSubscription }))
  .map((row) => ({ id: row.id, fullName: row.fullName }));

/** Active users whose role is authorityRoleFor(kind); owner first, then createdAt. Pass `kind` when it is known. */
export async function getInstitutionAuthorities(schoolId: string, db?: TxClient, kind?: InstitutionKind): Promise<Array<{ id: string; fullName: string; campusId: string | null; isInstitutionOwner: boolean }>> {
  const { rows } = await authorityRows(schoolId, db, kind, "list institution authorities");
  return rows.map(({ id, fullName, campusId, isInstitutionOwner }) => ({ id, fullName, campusId, isInstitutionOwner }));
}

/** Authorities for whom canOwnSubscription holds (owner flag or purchase delegate); owner first. Empty when the school has no payer. Pass `kind` when it is known. */
export async function getSubscriptionOwners(schoolId: string, db?: TxClient, kind?: InstitutionKind): Promise<Array<{ id: string; fullName: string }>> {
  const result = await authorityRows(schoolId, db, kind, "list subscription owners");
  return payersAmong(result.kind, result.rows);
}

/**
 * "Who leads and who pays" in one read, for callers that need both (the session route on every shell load): the
 * authorities and, among them, the subscription owners. With a known `kind` it costs one user query and no school read.
 */
export async function getInstitutionContacts(schoolId: string, options: { db?: TxClient; kind?: InstitutionKind } = {}) {
  const { kind, rows } = await authorityRows(schoolId, options.db, options.kind, "list institution contacts");
  return {
    authorities: rows.map(({ id, fullName, campusId, isInstitutionOwner }) => ({ id, fullName, campusId, isInstitutionOwner })),
    subscriptionOwners: payersAmong(kind, rows),
  };
}
