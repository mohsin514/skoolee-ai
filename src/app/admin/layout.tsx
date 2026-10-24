import type { Metadata } from "next";
import OperationalLayout from "@/app/operational-layout";
import { getAuthUser } from "@/lib/auth";
import { isStandaloneOwner } from "@/lib/auth/institution";
import { getDisplayLocale } from "@/lib/locale/display";
import { translateUi } from "@/lib/locale/ui-messages";

/**
 * §7.3: every route needs a distinct <title>; the root layout supplies the "%s | SkooleeAI" template.
 * The console name follows the institution model (§1.5): the ADMIN of a single school runs the
 * "School console", everyone else here runs the "Campus console". Never derived from campus counts.
 * The title is in the viewer's display language (§1.5 names: لوحة المدرسة / لوحة الفرع, اسکول کنسول / کیمپس کنسول).
 */
export async function generateMetadata(): Promise<Metadata> {
  const user = await getAuthUser().catch(() => null);
  const name = user && isStandaloneOwner(user) ? "School console" : "Campus console";
  if (!user) return { title: name };
  const locale = await getDisplayLocale({ userId: user.userId, schoolId: user.schoolId, campusId: user.campusId ?? null, role: user.role }).catch(() => null);
  const language = locale?.language === "ar" || locale?.language === "ur" ? locale.language : "en";
  return { title: translateUi(name, language) };
}

export default OperationalLayout;
