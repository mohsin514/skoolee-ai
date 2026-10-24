import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { prisma } from "@/lib/db/prisma";
import { dashboardPathForRole } from "@/lib/roles";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { RoleSetup } from "@/components/ai-workflows/role-setup";
import { definitionForRole } from "@/lib/ai-workflows/questionnaire/service";
import { aiWorkflowsV2Enabled } from "@/lib/ai-workflows/flag";

export const metadata = { title: "Set up your workspace" };
export const dynamic = "force-dynamic";

/** The signed-in user's own first-login questionnaire; roles without one go to their home. */
export default async function AiSetupPage() {
  const user = await requirePageSession();
  const definition = definitionForRole(user.role);
  if (!definition) redirect(dashboardPathForRole(user.role));
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { slug: true, logoUrl: true } }).catch(() => null);
  // With AI Workflows off for this school, operators keep the earlier guided setup; others go home.
  if (!aiWorkflowsV2Enabled(brand?.slug)) redirect(definition.key === "teacher" ? dashboardPathForRole(user.role) : "/ai?workflow=schoolSetup");
  return (
    <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.logoUrl ?? null} chatDock={false}>
      <RoleSetup questionnaireKey={definition.key} />
    </RoleFrame>
  );
}
