import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { orphanRouteTarget } from "@/lib/navigation/legacy-redirects";

export const dynamic = "force-dynamic";

/** SPEC §6.3 — school language & region live in the authority's settings; a campus admin edits the delegated keys in Campus setup; everyone else changes their own language in Account settings. */
export default async function LocaleSettingsPage() {
  const user = await requirePageSession();
  redirect(orphanRouteTarget("settings-locale", user)); // outside try/catch
}
