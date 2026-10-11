import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { dashboardPathForRole } from "@/lib/roles";
import { SETTINGS_PARAM } from "@/components/settings/settings-sections";

/**
 * Security & sign-in now lives in the Settings modal. Old links and bookmarks
 * land on the user's dashboard with the modal open on the Security section.
 */
export default async function AccountSecurity() {
  const user = await requirePageSession();
  redirect(`${dashboardPathForRole(user.role)}?${SETTINGS_PARAM}=security`);
}
