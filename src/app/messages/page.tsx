import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { dashboardPathForRole } from "@/lib/roles";
import { ChatProvider } from "@/components/chat";
import { MessagesWorkspace } from "./messages-workspace";

export const dynamic = "force-dynamic";

/**
 * The full-page messenger, shared by all ten roles.
 *
 * One route rather than a copy inside each dashboard: the conversation model
 * is identical for a principal and a pupil, and only the directory behind it
 * differs — which the policy already decides server-side.
 */
export default async function MessagesPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  // The platform owner administers schools from outside; they hold no place
  // in any one school's conversations.
  if (user.role === "APP_OWNER") redirect("/owner");

  return (
    <ChatProvider>
      <MessagesWorkspace dashboardHref={dashboardPathForRole(user.role)} />
    </ChatProvider>
  );
}
