import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";

export default async function PickupLayout({ children }: { children: React.ReactNode }) {
  // SKO-438: the gate desk for reception and campus leaders; the API decides access.
  const user = await requirePageSession();
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
