import type { AuthUser } from "@/lib/auth";

export type InstitutionKind = "GROUP" | "STANDALONE";

/** The only answer to "group or standalone": registrationKind → InstitutionSetup.institutionType → owner role.
 *  Never campus counts; never School.institutionType (an unrelated designation field). Fails toward GROUP. */
export function institutionKindOf(input: { registrationKind?: string | null; setupType?: string | null; ownerRole?: string | null }): InstitutionKind {
  if (input.registrationKind === "GROUP" || input.registrationKind === "STANDALONE") return input.registrationKind;
  if (input.setupType === "GROUP" || input.setupType === "STANDALONE") return input.setupType;
  return input.ownerRole === "ADMIN" ? "STANDALONE" : "GROUP";
}

type Who = Pick<AuthUser, "role"> & Partial<Pick<AuthUser, "institutionKind" | "isInstitutionOwner" | "canPurchaseSubscription">>;

/** Kind for a user object. resolveCurrentPrincipal always sets it. A hand-built AuthUser without it resolves only
 *  through the owner flag; otherwise null, and every predicate below fails closed (no authority, no billing). */
export function kindFor(u: Who): InstitutionKind | null {
  if (u.institutionKind) return u.institutionKind;
  if (u.isInstitutionOwner === true && u.role === "SUPER_ADMIN") return "GROUP";
  if (u.isInstitutionOwner === true && u.role === "ADMIN") return "STANDALONE";
  return null;
}
/** GROUP: the super admin. STANDALONE: the school admin (the registering owner; ADMIN is not invitable). Unknown kind: false. */
export function isInstitutionAuthority(u: Who): boolean {
  const kind = kindFor(u);
  return kind === "GROUP" ? u.role === "SUPER_ADMIN" : kind === "STANDALONE" ? u.role === "ADMIN" : false;
}
/** SaaS subscription: authority AND (owner OR an authority-role purchase delegate). The flag alone is never enough. */
export function canOwnSubscription(u: Who): boolean {
  return isInstitutionAuthority(u) && (u.isInstitutionOwner === true || u.canPurchaseSubscription === true);
}
export const isGroupConsole = (u: Who) => kindFor(u) === "GROUP" && u.role === "SUPER_ADMIN";
export const isStandaloneOwner = (u: Who) => kindFor(u) === "STANDALONE" && u.role === "ADMIN";
/** Campus operations seat. An ADMIN inside a GROUP (legacy rows) is a campus operator, nothing more. */
export const isCampusOperator = (u: Pick<AuthUser, "role">) => u.role === "CAMPUS_ADMIN" || u.role === "ADMIN";
/** The role that holds authority for a kind (used by delegation, notification and emergency-admin queries). */
export const authorityRoleFor = (kind: InstitutionKind) => (kind === "GROUP" ? "SUPER_ADMIN" : "ADMIN") as "SUPER_ADMIN" | "ADMIN";
