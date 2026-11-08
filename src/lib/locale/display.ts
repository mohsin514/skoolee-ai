import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { defaultLocale, resolvePackage, type LocalePackage } from "./package";
import { getLocalePackage } from "./store";
import { LANGUAGE_COOKIE, parseLanguage } from "./language-cookie";

export type DisplayPrincipal = { userId: string; schoolId: string; campusId: string | null; role: string };

/**
 * The effective display locale for a signed-in user (personal → campus →
 * school → en), resolved on the server so a shell's first paint already has
 * the right language and direction.
 *
 * Deliberately does not call `assertSchoolOperational`: suspended schools still
 * render their billing views and need the right language there too. A DB
 * failure must not take the page down, so it falls back to the cookie.
 */
export async function getDisplayLocale(principal: DisplayPrincipal): Promise<LocalePackage> {
  const { userId, schoolId, campusId, role } = principal;
  try {
    return await runWithTenantContext({ schoolId, userId, campusId, role }, async () => {
      const user = await prisma.user.findFirst({ where: { id: userId, schoolId, isActive: true }, select: { preferredLanguage: true } });
      const personal = parseLanguage(user?.preferredLanguage);
      if (role === "APP_OWNER") return resolvePackage(defaultLocale, {}, personal);
      return getLocalePackage(schoolId, campusId, new Date(), personal);
    });
  } catch {
    console.warn("[locale] display locale unavailable", { userId });
    const cookie = parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
    return { ...defaultLocale, language: cookie ?? "en" };
  }
}
