// ─────────────────────────────────────────────────────────────────
// Auth helper — decode JWT from cookie
// ─────────────────────────────────────────────────────────────────
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { normalizeUserRole, type UserRole } from "@/lib/roles";

import { JWT_SECRET } from "@/lib/auth/secret";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session-cookie";
import { isSessionRevoked } from "@/lib/auth/session-revocation";

export interface AuthUser {
  userId: string;
  email: string;
  fullName?: string;
  role: UserRole;
  schoolId: string;
  campusId: string | null;
  schoolSlug?: string;
  schoolStatus?: string;
  onboardingComplete?: boolean;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = normalizeUserRole(payload.role);
    const userId = typeof payload.userId === "string" ? payload.userId : null;
    const schoolId = typeof payload.schoolId === "string" ? payload.schoolId : null;

    if (!role || !userId || !schoolId) return null;

    // A valid signature says this server issued the token. It says nothing
    // about whether the session still exists — the cookie is a bearer
    // credential good for 7 or 30 days, so a copy taken before sign-out stayed
    // fully usable for the remainder of that window. Signing out has to mean
    // the token stops working, not merely that one browser forgot it.
    //
    // This lives here rather than in requireAuthUser() alone so that server
    // components and layouts calling getAuthUser() directly are covered too;
    // API routes were never the only way in. The lookup is memoised per
    // request, so the repeated calls a single render makes cost one query.
    if (await isSessionRevoked(hashSessionToken(token))) return null;

    const campusId = typeof payload.campusId === "string" && payload.campusId.length > 0
      ? payload.campusId
      : null;

    // Deliberately does NOT bind tenant context here. enterWith() inside a
    // function the caller awaits does not propagate back to that caller, so
    // this silently bound nothing — and could surface a store left over from
    // unrelated work. The Prisma guard derives the tenant from this same
    // session cookie instead (resolveTenantFromRequest), which is reliable.
    return {
      userId,
      email: String(payload.email || ""),
      fullName: typeof payload.fullName === "string" ? payload.fullName : undefined,
      role,
      schoolId,
      campusId,
      schoolSlug: typeof payload.schoolSlug === "string" ? payload.schoolSlug : undefined,
      schoolStatus: typeof payload.schoolStatus === "string" ? payload.schoolStatus : undefined,
      onboardingComplete: Boolean(payload.onboardingComplete),
    };
  } catch {
    return null;
  }
}

export function calculateGrade(obtained: number, total: number): string {
  const pct = (obtained / total) * 100;
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}
