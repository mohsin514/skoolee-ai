import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
import { prisma } from "@/lib/db/prisma";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { atlasFor } from "@/lib/ai-workflows/atlas";
import { capabilityContext, inTenant } from "@/lib/ai-workflows/jobs/actor";
import { capability } from "@/lib/ai-workflows/registry";
import { aiWorkflowsV2Enabled } from "@/lib/ai-workflows/flag";
import { practiceModeApplies } from "@/lib/ai-workflows/practice";
import { isDemoSchool } from "@/lib/ai-workflows/demo";
import { CatalogExplorer } from "@/components/ai-workflows/catalog-explorer";
import type { CatalogItem } from "@/components/ai-workflows/catalog-card";
import type { StepClass } from "@/components/ai-workflows/workflow-marks";

export const metadata = { title: "What AI can do" };
export const dynamic = "force-dynamic";

/** The honest catalogue: connected capabilities by how they finish, and the real count against everything the role can do. */
export default async function AiCanDoPage() {
  const user = await requirePageSession();
  const { language } = await getDisplayLocale(user);
  const atlas = await inTenant(user, async () => atlasFor(user, await capabilityContext(user, user.campusId, language), language));
  // Campus logo first, then the school's: what the console's own sidebar shows (as /ai does).
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { slug: true, logoUrl: true, aiWorkflowsLiveAt: true, campuses: { where: { id: user.campusId ?? "" }, select: { logoUrl: true } } } }).catch(() => null);
  const enabled = aiWorkflowsV2Enabled(brand?.slug);
  const practice = enabled && practiceModeApplies(brand?.slug, process.env, undefined, brand?.aiWorkflowsLiveAt);

  // Read-only registry copy; only plain strings cross to the client.
  const item = (entry: { key: string; title: string }, cls: StepClass, handledBy: readonly string[] = []): CatalogItem => {
    const copy = capability(entry.key)?.copy;
    return { key: entry.key, title: entry.title, whenToUse: copy?.whenToUse[language] ?? "", example: copy?.examples[language]?.[0] ?? null, cls, handledBy: [...handledBy] };
  };
  const items: CatalogItem[] = [
    ...atlas.runs.map(entry => item(entry, "A")),
    ...atlas.confirm.map(entry => item(entry, "B")),
    // Class C: `roles` lists who may ask, not who decides, so it is not shown.
    ...atlas.approval.map(entry => item(entry, "C")),
    ...atlas.unavailable.map(entry => item(entry, "X", entry.whoCan)),
  ];

  return (
    <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.campuses[0]?.logoUrl || brand?.logoUrl || null} chatDock={false}>
      <CatalogExplorer
        items={items}
        connected={atlas.connected}
        total={atlas.total}
        language={language}
        enabled={enabled}
        practice={practice}
        demo={isDemoSchool(brand?.slug)}
      />
    </RoleFrame>
  );
}
