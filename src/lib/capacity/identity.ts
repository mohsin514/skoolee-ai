import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { JWT_SECRET } from "@/lib/auth/secret";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

/**
 * SKO-451: the school a request is attributed to, from the signed session token alone. Admission only ever
 * refuses or measures work by it and never grants anything, so it skips the session lookups that the handler
 * still performs in full. Keeping refusals cheap is what stops a client ignoring Retry-After from becoming the
 * noise itself.
 */
export async function requestSchool(): Promise<string | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return typeof payload.schoolId === "string" ? payload.schoolId : null;
  } catch { return null; }
}
