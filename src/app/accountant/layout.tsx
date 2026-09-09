import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/require-page-session";

// §7.3: this route segment had no layout, so it inherited the site-wide default
// <title>. A distinct title per route is what lets screen-reader users and
// anyone with several tabs open tell these dashboards apart. The root layout
// supplies the "%s | SkooleeAI" template.
export const metadata: Metadata = {
  title: "Accountant",
};

export default async function AccountantLayout({ children }: { children: React.ReactNode }) {
  // The page below is a client component that fetches its own data, so this is
  // the only server-side check that a session still exists.
  await requirePageSession();
  return <>{children}</>;
}
