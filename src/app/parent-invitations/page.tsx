import { ParentInvitations } from "@/components/ParentInvitations";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";

export const dynamic = "force-dynamic";

export default async function ParentInvitationsPage() {
  const user = await requirePageSession();
  if (user.role !== "PARENT") redirect("/");
  return <ParentInvitations />;
}
