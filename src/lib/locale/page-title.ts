import type { Metadata } from "next";
import { getAuthUser } from "@/lib/auth";
import { getDisplayLocale } from "@/lib/locale/display";
/**
 * SKAI-2250: a route's <title> in the viewer's display language (the root layout adds " | SkooleeAI").
 * Signed-out viewers and English readers get the English name without loading any catalog.
 */
export async function localizedTitle(name: string): Promise<Metadata> {
  const user = await getAuthUser().catch(() => null);
  if (!user) return { title: name };
  const locale = await getDisplayLocale({ userId: user.userId, schoolId: user.schoolId, campusId: user.campusId ?? null, role: user.role }).catch(() => null);
  const language = locale?.language === "ar" || locale?.language === "ur" ? locale.language : "en";
  if (language === "en") return { title: name };
  // Loaded only for ar/ur: the catalogs are several MB and English needs none of them.
  const { translateUi } = await import("@/lib/locale/ui-messages");
  return { title: translateUi(name, language) };
}
