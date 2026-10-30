import { requirePageSession } from "@/lib/auth/require-page-session";
import { prisma } from "@/lib/db/prisma";
import { isDemoSchool } from "@/lib/ai-workflows/demo";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { HandoffInbox } from "@/components/ai-workflows/handoff-inbox";
import { DemoSchoolBadge } from "@/components/ai-workflows/demo-school-badge";

export const metadata = { title: "Prepared for you" };
export const dynamic = "force-dynamic";

export default async function AiWaitingPage() {
  const user = await requirePageSession();
  // Campus logo first, then the school's: what the console's own sidebar shows (as /ai does).
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { slug: true, logoUrl: true, campuses: { where: { id: user.campusId ?? "" }, select: { logoUrl: true } } } }).catch(() => null);
  return (
    <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.campuses[0]?.logoUrl || brand?.logoUrl || null} chatDock={false}>
      <div className="mx-auto w-full max-w-4xl space-y-5 px-1 py-2 sm:p-6">
        {isDemoSchool(brand?.slug) ? <DemoSchoolBadge variant="band" /> : null}
        <HandoffInbox role={user.role} />
      </div>
    </RoleFrame>
  );
}
