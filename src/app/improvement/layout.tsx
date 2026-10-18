import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";

export default async function ImprovementLayout({ children }: { children: React.ReactNode }) {
  // SKO-450: the improvement evidence workspace for leaders, staff and granted reviewers; the API decides access.
  const user = await requirePageSession();
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
