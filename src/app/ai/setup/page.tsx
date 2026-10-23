import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { prisma } from "@/lib/db/prisma";
import { dashboardPathForRole } from "@/lib/roles";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { RoleSetup } from "@/components/ai-workflows/role-setup";
import { definitionForRole } from "@/lib/ai-workflows/questionnaire/service";

export const metadata = { title: "Set up your workspace" };
export const dynamic = "force-dynamic";

/** The signed-in user's own first-login questionnaire; roles without one go to their home. */
export default async function AiSetupPage() {
  const user = await requirePageSession();
  const definition = definitionForRole(user.role);
  if (!definition) redirect(dashboardPathForRole(user.role));
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { logoUrl: true } }).catch(() => null);
  return (
    <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.logoUrl ?? null} chatDock={false}>
      <RoleSetup questionnaireKey={definition.key} />
    </RoleFrame>
  );
}
