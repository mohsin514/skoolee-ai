import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";

// SKO-373: the suspended notice reads in the viewer's language and direction.
export default async function SubscriptionSuspendedLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
