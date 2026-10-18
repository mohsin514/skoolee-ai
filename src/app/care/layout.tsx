import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";

export default async function CareLayout({ children }: { children: React.ReactNode }) {
  // SKO-439: confidential care for staff; the API decides access to every workspace and record.
  const user = await requirePageSession();
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
