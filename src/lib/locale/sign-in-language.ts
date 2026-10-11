import { z } from "zod";
import type { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { LANGUAGES, type Language } from "./package";
import { LANGUAGE_COOKIE, languageCookieAttributes, parseLanguage } from "./language-cookie";

export type LanguageSource = "explicit" | "cookie";
export type SignInLanguageInput = { language?: Language; languageSource?: LanguageSource };

/** Bad values are dropped, never rejected: a preference must not fail sign-in. */
export const signInLanguageSchema = z.object({
  language: z.enum(LANGUAGES).optional().catch(undefined),
  languageSource: z.enum(["explicit", "cookie"]).optional().catch(undefined),
});

/**
 * Sign-in precedence (design §B.1.3), rows evaluated in order:
 * 1. explicit choice in this tab → save it (no write when unchanged), cookie = it
 * 2. a saved preference         → no write, cookie = saved
 * 3. otherwise                  → no write, cookie left alone (school/campus default renders)
 * Only an explicit source ever writes `preferredLanguage`.
 */
export function decideSignInLanguage(saved: Language | null, input: SignInLanguageInput): { save: Language | null; cookie: Language | null } {
  if (input.languageSource === "explicit" && input.language) {
    return { save: input.language === saved ? null : input.language, cookie: input.language };
  }
  if (saved !== null) return { save: null, cookie: saved };
  return { save: null, cookie: null };
}

export async function applySignInLanguage(
  user: Pick<User, "id" | "schoolId"> & { preferredLanguage?: string | null },
  body: unknown,
  response: NextResponse,
): Promise<void> {
  const parsed = signInLanguageSchema.safeParse(body && typeof body === "object" ? body : {});
  const input: SignInLanguageInput = parsed.success ? parsed.data : {};
  const decision = decideSignInLanguage(parseLanguage(user.preferredLanguage), input);
  if (decision.save) {
    try {
      await prisma.user.updateMany({ where: { id: user.id, schoolId: user.schoolId }, data: { preferredLanguage: decision.save } });
    } catch {
      console.warn("[auth/language]", { userId: user.id, reason: "save_failed" });
    }
  }
  if (decision.cookie) response.cookies.set(LANGUAGE_COOKIE, decision.cookie, languageCookieAttributes());
}
