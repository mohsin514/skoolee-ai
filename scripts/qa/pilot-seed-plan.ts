/**
 * SKAI-999 / SKAI-1066: pure plan for the synthetic QA pilot seed (no DB access),
 * so the tenant shapes can be unit-tested against the institution predicates.
 *
 * GROUP tenants mirror a "school_group" registration: SUPER_ADMIN owner, campus admins.
 * The STANDALONE tenant mirrors a "single school" registration (src/lib/auth/register.ts):
 * School.registrationKind = "STANDALONE" and the registering ADMIN carries
 * isInstitutionOwner / canPurchaseSubscription / canManageMemberships, no campus.
 */
import type { UserRole } from "@prisma/client";

export type SeedKind = "GROUP" | "STANDALONE";
export type RoleDef = {
  role: UserRole;
  key: string;
  fullName: string;
  /** Pinned to the first campus. */
  scoped: boolean;
  /** Institution owner flags, as registration sets them. */
  owner?: boolean;
};
export type CampusDef = { regId: string; name: string; city: string; board: string };
export type SchoolDef = { slug: string; name: string; city: string; kind: SeedKind; campuses: CampusDef[] };

const STAFF: RoleDef[] = [
  { role: "PRINCIPAL", key: "principal", fullName: "QA Principal مدیر المدرسة الطويل الاسم", scoped: true },
  { role: "TEACHER", key: "teacher", fullName: "QA Teacher محمد استاد", scoped: true },
  { role: "ACCOUNTANT", key: "accountant", fullName: "QA Accountant محاسب", scoped: true },
  { role: "PARENT", key: "guardian", fullName: "QA Guardian ولی أمر الطفلين", scoped: true },
  { role: "STUDENT", key: "student", fullName: "QA Student طالب علم", scoped: true },
  // A real role that is given NO campus/scope, for denied-role tests.
  { role: "RECEPTIONIST", key: "noaccess", fullName: "QA No-Access بدون صلاحية", scoped: false },
];

const GROUP_ROLES: RoleDef[] = [
  { role: "SUPER_ADMIN", key: "owner", fullName: "QA Owner / مالک الحساب", scoped: false },
  { role: "CAMPUS_ADMIN", key: "admin", fullName: "QA Admin عبد الرحمٰن الإداري", scoped: true },
  ...STAFF,
];

const STANDALONE_ROLES: RoleDef[] = [
  { role: "ADMIN", key: "admin", fullName: "QA Standalone Admin / مدير المدرسة المستقلة", scoped: false, owner: true },
  ...STAFF,
];

export function rolesFor(kind: SeedKind): RoleDef[] {
  return kind === "STANDALONE" ? STANDALONE_ROLES : GROUP_ROLES;
}

export const SCHOOLS: SchoolDef[] = [
  { slug: "qa-alpha", name: "QA Alpha School / مدرسة ألفا", city: "Lahore", kind: "GROUP",
    campuses: [{ regId: "QA-A-C1", name: "Alpha Main / الحرم الرئيسي", city: "Lahore", board: "Lahore Board" },
               { regId: "QA-A-C2", name: "Alpha North / الحرم الشمالي", city: "Lahore", board: "Lahore Board" }] },
  { slug: "qa-beta", name: "QA Beta School / مدرسة بيتا", city: "Karachi", kind: "GROUP",
    campuses: [{ regId: "QA-B-C1", name: "Beta Main / بيتا الرئيسي", city: "Karachi", board: "Sindh Board" },
               { regId: "QA-B-C2", name: "Beta South / بيتا الجنوبي", city: "Karachi", board: "Sindh Board" }] },
  { slug: "qa-solo", name: "QA Solo School / مدرسة سولو المستقلة", city: "Islamabad", kind: "STANDALONE",
    campuses: [{ regId: "QA-S-C1", name: "Solo Campus / الحرم الوحيد", city: "Islamabad", board: "FBISE" }] },
];
