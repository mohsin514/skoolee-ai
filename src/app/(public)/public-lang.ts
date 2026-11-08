import { cookies } from "next/headers";
import { LANGUAGE_COOKIE, parseLanguage } from "@/lib/locale/language-cookie";
import type { Language } from "@/lib/locale/package";
import { publicLanguage } from "@/lib/legal/public-locale";

export type LangSearchParams = Promise<{ lang?: string | string[] }>;

/** SKAI-1002: ?lang, then the skoolee-lang cookie, then English. */
export async function readPublicLanguage(searchParams: LangSearchParams): Promise<{ lang: Language; carry: Language | null }> {
  const param = (await searchParams).lang;
  const lang = publicLanguage(param, (await cookies()).get(LANGUAGE_COOKIE)?.value);
  return { lang, carry: parseLanguage(param) };
}
