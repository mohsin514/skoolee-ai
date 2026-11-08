import { ROLE_DASHBOARD_PATHS, type UserRole } from "@/lib/roles";
import { authorityRoleFor, isInstitutionAuthority, kindFor, type InstitutionKind } from "@/lib/auth/institution";

export const INVITABLE_ROLES = ["CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "STUDENT", "PARENT"] as const;
export type InvitableRole = typeof INVITABLE_ROLES[number];
export const MEMBERSHIP_TASKS: Record<UserRole, string[]> = {
  APP_OWNER: ["Operate the vendor platform"],
  SUPER_ADMIN: ["Manage the institution and its campuses"],
  ADMIN: ["Run your school and its account"],
  CAMPUS_ADMIN: ["Manage the assigned campus"],
  PRINCIPAL: ["Lead academic operations in the assigned campus"],
  TEACHER: ["Teach assigned classes", "Record attendance and marks"],
  ACCOUNTANT: ["Keep the campus books; leaders approve refunds and payroll"],
  LIBRARIAN: ["Manage campus books and loans"],
  RECEPTIONIST: ["Manage campus front desk and visitors"],
  STUDENT: ["View your own linked student records"],
  PARENT: ["View records for your explicitly linked children"],
};
const AR_TASKS: Record<UserRole, string[]> = {
 APP_OWNER: ["إدارة منصة المورّد"], SUPER_ADMIN: ["إدارة المؤسسة وفروعها"], ADMIN: ["إدارة مدرستك وحسابها"], CAMPUS_ADMIN: ["إدارة الفرع المعيّن"], PRINCIPAL: ["قيادة العمليات الأكاديمية في الفرع المعيّن"], TEACHER: ["تدريس الفصول المعيّنة", "تسجيل الحضور والدرجات"], ACCOUNTANT: ["مسك دفاتر الفرع؛ ويعتمد القادة المبالغ المستردة والرواتب"], LIBRARIAN: ["إدارة الكتب والإعارات"], RECEPTIONIST: ["إدارة الاستقبال والزوار"], STUDENT: ["عرض سجلات الطالب المرتبط بحسابك فقط"], PARENT: ["عرض سجلات الأطفال المرتبطين بحسابك صراحةً"]
};
const UR_TASKS: Record<UserRole, string[]> = {
 APP_OWNER: ["وینڈر پلیٹ فارم چلائیں"], SUPER_ADMIN: ["ادارے اور اس کے کیمپس کا انتظام کریں"], ADMIN: ["اپنا اسکول اور اس کا اکاؤنٹ چلائیں"], CAMPUS_ADMIN: ["مقررہ کیمپس کا انتظام کریں"], PRINCIPAL: ["مقررہ کیمپس کے تعلیمی امور کی قیادت کریں"], TEACHER: ["مقررہ کلاسوں کو پڑھائیں", "حاضری اور نمبر درج کریں"], ACCOUNTANT: ["کیمپس کے کھاتے رکھیں؛ رقم کی واپسی اور تنخواہوں کی منظوری قیادت دیتی ہے"], LIBRARIAN: ["کیمپس کی کتابوں اور ادھار کا انتظام کریں"], RECEPTIONIST: ["کیمپس کے استقبالیہ اور آنے والوں کا انتظام کریں"], STUDENT: ["صرف اپنے منسلک طالب علم کے ریکارڈ دیکھیں"], PARENT: ["صرف واضح طور پر منسلک بچوں کے ریکارڈ دیکھیں"]
};
export function membershipPreview(role: UserRole, purchasing = false, management = false, language: "en" | "ar" | "ur" = "en") {
  if (language === "ar") return { tasks: AR_TASKS[role], landing: ROLE_DASHBOARD_PATHS[role], purchasing: purchasing ? "تم تفويض شراء الاشتراك صراحةً." : "لا تشمل الصلاحيات شراء الاشتراك.", management: management ? "تم تفويض إدارة العضويات ضمن هذا النطاق." : "لا تشمل الصلاحيات إدارة العضويات.", ownership: "لا تمنح هذه الدعوة ملكية المؤسسة.", rank: "لا تغيّر الرتبة الوظيفية والتبعية الإدارية صلاحيات التطبيق." };
  if (language === "ur") return { tasks: UR_TASKS[role], landing: ROLE_DASHBOARD_PATHS[role], purchasing: purchasing ? "سبسکرپشن خریدنے کی اجازت واضح طور پر دی گئی ہے۔" : "اس کردار میں سبسکرپشن خریدنے کی اجازت شامل نہیں۔", management: management ? "اس دائرہ کار میں رکنیت کے انتظام کی اجازت واضح طور پر دی گئی ہے۔" : "اس کردار میں رکنیت کے انتظام کی اجازت شامل نہیں۔", ownership: "یہ دعوت ادارے کی ملکیت نہیں دیتی۔", rank: "ملازمت کا عہدہ یا رپورٹنگ لائن ایپ کی اجازتیں تبدیل نہیں کرتی۔" };
  return { tasks: MEMBERSHIP_TASKS[role], landing: ROLE_DASHBOARD_PATHS[role],
    purchasing: purchasing ? "Subscription purchasing is explicitly delegated." : "Subscription purchasing is not included.",
    management: management ? "Membership management is explicitly delegated within this scope." : "Membership management is not included.",
    ownership: "This invitation does not grant institution ownership.",
    rank: "Employment rank and reporting appointments do not change application permissions." };
}

// ─────────────────────────────────────────────────────────────────
// Membership authority (§7.2 G7, G7b). Pure decisions shared by the invite action, the invitation writer and
// PUT /api/memberships, so the three paths cannot drift and the rules are unit-tested without a database.
//
// - The institution authority (GROUP: super admin; STANDALONE: school admin) manages memberships school-wide,
//   appoints campus leaders and delegates membership management. It is decided by role and kind, not by the
//   owner flag, so a flagless group admin can staff the school and an ADMIN carrying the flag inside a group
//   (an anomaly) cannot.
// - A delegate (canManageMemberships) invites and manages teachers and office staff on its own campus only.
// - Subscription purchasing is delegated only to another holder of the authority role, from People & access (a group
//   admin to another group admin; a single school's admin has nobody to share it with).
// - Turning a delegation flag on needs a verified second factor; plain invites, resends and role changes do not.
// ─────────────────────────────────────────────────────────────────

export type MembershipActor = {
  role: UserRole;
  institutionKind?: InstitutionKind;
  isInstitutionOwner?: boolean;
  canManageMemberships?: boolean;
  campusId: string | null;
  mfaVerified?: boolean | "deferred";
};
export type MembershipDecision = { ok: true } | { ok: false; status: 400 | 403; error: string; code?: "MFA_REQUIRED" };

const allow: MembershipDecision = { ok: true };
const deny = (status: 400 | 403, error: string, code?: "MFA_REQUIRED"): MembershipDecision => ({ ok: false, status, error, ...(code ? { code } : {}) });
const LEADER_ROLES = new Set<string>(["CAMPUS_ADMIN", "PRINCIPAL"]);
/** Kind-aware refusal (R-I11): a group can share purchasing with another group admin; a single school has nobody to
 *  share it with (matrix #2), so its admin keeps it. */
const purchaseRefusal = (actor: MembershipActor) => kindFor(actor) === "GROUP"
  ? "Subscription purchasing can only be shared with another group admin, from People & access."
  : "Subscription purchasing stays with the school admin.";

export function membershipAuthority(actor: MembershipActor) {
  const authority = isInstitutionAuthority(actor);
  const delegate = !authority && actor.canManageMemberships === true && actor.role !== "PARENT" && actor.role !== "STUDENT" && actor.role !== "APP_OWNER";
  return { authority, delegate, canManage: authority || delegate };
}

/** Who may create an invitation, to which campus, with which delegations. */
export function inviteDecision(actor: MembershipActor, input: { role: string; campusId: string | null; canPurchaseSubscription?: boolean; canManageMemberships?: boolean }): MembershipDecision {
  const { authority, canManage } = membershipAuthority(actor);
  if (!canManage) return deny(403, "Membership management is not delegated to this account.");
  if (!authority && input.campusId !== actor.campusId) return deny(403, "You can only invite staff to your own campus");
  if (["PARENT", "STUDENT"].includes(input.role) && (input.canPurchaseSubscription || input.canManageMemberships)) return deny(400, "Family memberships cannot receive administrative delegations");
  // Invitations only ever target INVITABLE_ROLES, none of which is an authority role.
  if (input.canPurchaseSubscription) return deny(400, purchaseRefusal(actor));
  if (input.canManageMemberships && !authority) return deny(403, "Only the institution administrator can delegate membership management.");
  if (LEADER_ROLES.has(input.role) && !authority) return deny(403, "Only the institution administrator appoints campus leaders.");
  if (input.canManageMemberships && actor.mfaVerified !== true) return deny(403, "Turn on two-step sign-in before you delegate membership management.", "MFA_REQUIRED");
  return allow;
}

/** Who may change an existing membership (role, campus, delegations, active). */
export function membershipChangeDecision(
  actor: MembershipActor & { userId: string },
  target: { id: string; role: string; campusId: string | null; isInstitutionOwner: boolean; canPurchaseSubscription: boolean; canManageMemberships: boolean },
  input: { role: string; campusId: string | null; canPurchaseSubscription: boolean; canManageMemberships: boolean },
): MembershipDecision {
  const { authority, canManage } = membershipAuthority(actor);
  if (!canManage) return deny(403, "Membership management is not delegated to this account.");
  if (target.isInstitutionOwner || target.role === "APP_OWNER" || target.id === actor.userId) return deny(403, "This membership cannot be changed here");
  const kind = kindFor(actor);
  const authorityTarget = kind !== null && target.role === authorityRoleFor(kind);
  if (authorityTarget) {
    // Another authority-role user (e.g. a second group admin): only the purchase and membership flags may change.
    // The request repeats the stored role and campus exactly — a group admin's campus is null, and null it stays.
    if (!authority) return deny(403, "Only the institution administrator can change another administrator.");
    if (input.role !== target.role || input.campusId !== target.campusId) return deny(403, "Another administrator's role and campus cannot be changed here.");
  } else {
    if (!(INVITABLE_ROLES as readonly string[]).includes(input.role)) return deny(400, "Review the role, campus and access change before confirming");
    // Every invitable role works on one campus.
    if (!input.campusId) return deny(400, "Review the role, campus and access change before confirming");
    if (input.canPurchaseSubscription) return deny(400, purchaseRefusal(actor));
  }
  if (["PARENT", "STUDENT"].includes(input.role) && (input.canPurchaseSubscription || input.canManageMemberships)) return deny(400, "Family memberships cannot receive administrative delegations");
  if (!authority && (target.campusId !== actor.campusId || input.campusId !== actor.campusId || input.canPurchaseSubscription || input.canManageMemberships || target.canPurchaseSubscription || target.canManageMemberships || LEADER_ROLES.has(input.role) || LEADER_ROLES.has(target.role))) {
    return deny(403, "The institution administrator must review this authority change");
  }
  const turningOn = (input.canPurchaseSubscription && !target.canPurchaseSubscription) || (input.canManageMemberships && !target.canManageMemberships);
  if (turningOn && actor.mfaVerified !== true) return deny(403, "Turn on two-step sign-in before you delegate purchasing or membership management.", "MFA_REQUIRED");
  return allow;
}
