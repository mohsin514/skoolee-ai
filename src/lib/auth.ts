// ─────────────────────────────────────────────────────────────────
// Auth helper — decode JWT from cookie
// ─────────────────────────────────────────────────────────────────
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { normalizeUserRole, type UserRole } from "@/lib/roles";

const JWT_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

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
    const token = cookieStore.get("skoolee_token")?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = normalizeUserRole(payload.role);
    const userId = typeof payload.userId === "string" ? payload.userId : null;
    const schoolId = typeof payload.schoolId === "string" ? payload.schoolId : null;

    if (!role || !userId || !schoolId) return null;

    const campusId = typeof payload.campusId === "string" && payload.campusId.length > 0
      ? payload.campusId
      : null;

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
