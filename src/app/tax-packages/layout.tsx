import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";

export default async function TaxPackagesLayout({ children }: { children: React.ReactNode }) {
  // SKO-444: invoice tax packages for finance staff; the API decides access.
  const user = await requirePageSession();
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
