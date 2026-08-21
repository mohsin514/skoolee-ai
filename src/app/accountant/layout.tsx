import type { Metadata } from "next";

// §7.3: this route segment had no layout, so it inherited the site-wide default
// <title>. A distinct title per route is what lets screen-reader users and
// anyone with several tabs open tell these dashboards apart. The root layout
// supplies the "%s | SkooleeAI" template.
export const metadata: Metadata = {
  title: "Accountant",
};

export default function AccountantLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
