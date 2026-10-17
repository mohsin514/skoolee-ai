import { dashboardPathForRole, normalizeUserRole, type UserRole } from "@/lib/roles";

// SKO-457: after sign-in, return to the page that asked for it — but only to an internal page in
// the signed-in role's own area. Anything else (another origin, a protocol-relative or backslash
// path, an auth or API route, another role's console) falls back to the role's home.

const SHARED_STAFF_AREAS: Partial<Record<UserRole, string[]>> = {
  SUPER_ADMIN: ["/dashboard"],
  ADMIN: ["/dashboard"],
  CAMPUS_ADMIN: ["/dashboard"],
  PRINCIPAL: ["/dashboard"],
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
  const roots = [dashboardPathForRole(normalized), ...(SHARED_STAFF_AREAS[normalized] ?? [])];
  if (!roots.some(root => within(parsed.pathname, root))) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
