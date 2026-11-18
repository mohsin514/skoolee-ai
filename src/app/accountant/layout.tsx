import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
import { localizedTitle } from "@/lib/locale/page-title";

// §7.3: this route segment had no layout, so it inherited the site-wide default
// <title>. A distinct title per route is what lets screen-reader users and
// anyone with several tabs open tell these dashboards apart. The root layout
// supplies the "%s | SkooleeAI" template.
// §7.3 distinct <title>, in the viewer's language (SKAI-2250).
export const generateMetadata = () => localizedTitle("Finance desk");

export default async function AccountantLayout({ children }: { children: React.ReactNode }) {
  // The page below is a client component that fetches its own data, so this is
  // the only server-side check that a session still exists.
  const user = await requirePageSession();
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
