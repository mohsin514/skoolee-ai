import { LocaleProvider, UiText } from "@/components/locale/LocaleProvider";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { dashboardPathForRole } from "@/lib/roles";
import { LocaleSettingsPanel } from "@/components/settings/LocaleSettingsPanel";
export const metadata = { title: "Language and regional settings" };
export default async function LocaleSettingsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return <LocaleProvider><main className="mx-auto w-full max-w-5xl min-w-0 space-y-4 p-4 sm:p-6"><Link className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit print:hidden")} href={dashboardPathForRole(user.role)}><ArrowLeft aria-hidden="true" className="rtl:rotate-180" /><UiText>Dashboard</UiText></Link><LocaleSettingsPanel /></main></LocaleProvider>;
}
