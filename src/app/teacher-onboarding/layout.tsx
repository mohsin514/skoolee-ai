import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";

// SKO-458: the first screen an invited teacher fills in reads in their
// language and direction from first paint.
export default async function TeacherOnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
