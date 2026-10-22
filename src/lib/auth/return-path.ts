import { dashboardPathForRole, normalizeUserRole, type UserRole } from "@/lib/roles";

// SKO-457: after sign-in, return to the page that asked for it — but only to an internal page the signed-in
// role can open: its own console, or one of the framed module routes that role uses (§7.7 G46). Anything else
// (another origin, a protocol-relative or backslash path, an auth or API route, another role's console, the
// retired /dashboard console) falls back to the role's home. The query and hash are kept.

// Per role, the framed module routes §6.3 and the §2 matrix give it (a duty-only route included when the role can hold
// that duty). A route the matrix marks "—" for a role is not restored: sign-in lands on the role's home instead.
// Every staff role: messages, raise a service request (Help › Report a problem), record a concern (Help › Record a
// concern → /care?tab=report, offered to every staff role except the platform operator, §4.2), jobs, setup tasks,
// school capture, account.
const STAFF = ["/messages", "/service-desk", "/care", "/jobs", "/setup", "/school-capture", "/account"];
/** Academic-office routes (§6.3): curriculum, resources, access plans, secure exam delivery. */
const ACADEMIC_OFFICE = ["/accommodations", "/curriculum", "/resources", "/exam-delivery"];
/** Campus operators (CA, and ADMIN in either kind of school): every framed campus route. */
const OPERATORS = [...STAFF, "/corrections", "/search", "/pupils", "/ai", "/transport", "/activities", "/improvement", ...ACADEMIC_OFFICE];

const FRAMED_AREAS: Record<UserRole, string[]> = {
  APP_OWNER: ["/account"],
  // Group admin: governance only — no trips (#37), no activities (#46), no corrections queue (§6.3). AI Workflows (/ai) is a
  // flagship it may use (addendum 2026-10-22); Exam Studio under /ai/studio is not (that page sends it to /super).
  SUPER_ADMIN: [...STAFF, "/pupils", "/billing", "/improvement", "/ai"],
  ADMIN: [...OPERATORS, "/billing"],
  CAMPUS_ADMIN: OPERATORS,
  // Academic lead: no trips (#37 "—").
  PRINCIPAL: [...STAFF, "/corrections", "/search", "/pupils", "/ai", "/activities", "/improvement", ...ACADEMIC_OFFICE],
  // Trips and activities when on duty (#37, #46 "O†"); improvement evidence when asked (#47 "Rq", notification link).
  TEACHER: [...STAFF, "/corrections", "/pupils", "/ai", "/transport", "/activities", "/improvement"],
  // Payment corrections (#85), trip duty (#37), activity refunds (#46).
  ACCOUNTANT: [...STAFF, "/corrections", "/transport", "/activities"],
  // Record search (C13) and trip duty (#37); no activities (#46 "—") and no corrections (§6.3).
  RECEPTIONIST: [...STAFF, "/search", "/transport"],
  // Trip duty (#37); no activities (#46 "—") and no corrections (§6.3).
  LIBRARIAN: [...STAFF, "/transport"],
  PARENT: ["/messages", "/corrections", "/parent-invitations", "/account", "/school-capture"],
  STUDENT: ["/messages", "/corrections", "/ai/exams", "/account", "/school-capture"],
};

const within = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

/** The validated internal destination for `role`, or null when `raw` is not one. */
export function safeReturnPath(raw: unknown, role: unknown): string | null {
  const normalized = normalizeUserRole(role);
  if (!normalized || typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  // Only a single leading slash; no backslashes or control characters that browsers reinterpret.
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  let parsed: URL;
  try { parsed = new URL(raw, "https://return.invalid"); } catch { return null; }
  if (parsed.origin !== "https://return.invalid") return null;
  const roots = [dashboardPathForRole(normalized), ...FRAMED_AREAS[normalized]];
  if (!roots.some(root => within(parsed.pathname, root))) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
