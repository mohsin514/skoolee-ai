import { requirePageSession } from "@/lib/auth/require-page-session";
import { prisma } from "@/lib/db/prisma";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { HandoffInbox } from "@/components/ai-workflows/handoff-inbox";

export const metadata = { title: "Prepared for you" };
export const dynamic = "force-dynamic";

export default async function AiWaitingPage() {
  const user = await requirePageSession();
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { logoUrl: true } }).catch(() => null);
  return (
    <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.logoUrl ?? null} chatDock={false}>
      <div className="mx-auto max-w-4xl p-6"><HandoffInbox /></div>
    </RoleFrame>
  );
}
