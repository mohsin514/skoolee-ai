import type { Metadata } from "next";
import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";

export const metadata: Metadata = { title: "Search records" };

export default async function SearchLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}>{children}</LocaleProvider>;
}
