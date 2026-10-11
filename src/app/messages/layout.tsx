import type { Metadata } from "next";
import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
// §7.3: every route segment carries a distinct <title>; the root layout
// supplies the "%s | SkooleeAI" template.
export const metadata: Metadata = {
  title: "Messages",
};
export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  // Cross-role page: seeded the same way as the role shells so first paint has the right language.
  const user = await requirePageSession();
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
