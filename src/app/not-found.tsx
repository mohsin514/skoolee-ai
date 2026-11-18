import { cookies } from "next/headers";
import { LazyNotFoundView } from "@/components/ui/lazy-boundaries";
import { getAuthUser } from "@/lib/auth";
import { getDisplayLocale } from "@/lib/locale/display";
import { LANGUAGE_COOKIE, parseLanguage } from "@/lib/locale/language-cookie";
import { dashboardPathForRole } from "@/lib/roles";
// SKAI-2226: resolve the reader's language (and home) on the server, as /403 does.
export default async function NotFound() {
  const user = await getAuthUser().catch(() => null);
  const language = user ? (await getDisplayLocale(user)).language : parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value) ?? "en";
  return <LazyNotFoundView language={language} homeHref={user ? dashboardPathForRole(user.role) : "/login"} />;
}
