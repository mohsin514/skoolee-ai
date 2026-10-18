import { ParentInvitations } from "@/components/ParentInvitations";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { getDisplayLocale } from "@/lib/locale/display";

export const dynamic = "force-dynamic";

export default async function ParentInvitationsPage() {
  const user = await requirePageSession();
  if (user.role !== "PARENT") redirect("/");
  // SKO-490: the account's saved language (server-resolved), never the browser's, from first paint onwards.
  return <LocaleProvider initialLocale={await getDisplayLocale(user)}><ParentInvitations /></LocaleProvider>;
}
