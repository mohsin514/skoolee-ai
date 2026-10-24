import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { assertSchoolAiAccess, assertWorkspacePermission, SchoolAiError } from "@/lib/school-ai/access";
import { AccessDenied } from "@/lib/auth/policy";
import { dashboardPathForRole } from "@/lib/roles";
import { SchoolAIWorkspace } from "@/components/school-ai/school-ai-workspace";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { prisma } from "@/lib/db/prisma";
import { AskWorkspace } from "@/components/ai-workflows/ask-workspace";
import { aiWorkflowsV2Enabled } from "@/lib/ai-workflows/flag";
import { practiceModeApplies } from "@/lib/ai-workflows/practice";
import { definitionForRole } from "@/lib/ai-workflows/questionnaire/service";
import { isDemoSchool } from "@/lib/ai-workflows/demo";
import { DemoSchoolBadge } from "@/components/ai-workflows/demo-school-badge";
import { AskHero } from "@/components/ai-workflows/ask-hero";
import { entriesForRole } from "@/lib/ai-workflows/registry";
import { getDisplayLocale } from "@/lib/locale/display";
import type { UserRole } from "@/lib/roles";

const HERO_ID = "ai-ask-hero-title";

/** Up to four "Try asking" examples for the role, taken from the registry and spread across A/B/C. */
function askExamplesFor(role: string, language: "en" | "ar" | "ur") {
  const byClass = new Map<string, string[]>();
  for (const entry of entriesForRole(role as UserRole)) {
    const example = entry.copy.examples[language]?.[0] ?? entry.copy.examples.en?.[0];
    if (!example) continue;
    byClass.set(entry.class, [...(byClass.get(entry.class) ?? []), example]);
  }
  const lanes = [...byClass.values()];
  const picked: string[] = [];
  for (let round = 0; picked.length < 4 && lanes.some(lane => lane.length > round); round++) {
    for (const lane of lanes) if (lane[round] && picked.length < 4 && !picked.includes(lane[round])) picked.push(lane[round]);
  }
  return picked;
}

export const metadata = { title: "AI Workflows" };

/** The automatic workspace is scoped to the signed-in role and its current permissions. */
export default async function SchoolAiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageSession();
  let allowed = true;
  const personalWorkspace = ["APP_OWNER", "STUDENT", "PARENT"].includes(user.role);
  try { if (!personalWorkspace) await assertSchoolAiAccess(user, "view"); else if (user.role !== "APP_OWNER") await assertWorkspacePermission(user, "ai", "view"); }
  catch (error) {
    if (error instanceof AccessDenied || error instanceof SchoolAiError && error.status === 403) allowed = false;
    else throw error;
  }
  if (!allowed) redirect(dashboardPathForRole(user.role));
  // Campus logo, else school logo: what the console's own sidebar shows (dashboard.ts). Read on the server so
  // the first paint has it (the session's `logoUrl` arrives only after the client's read); a failed read only costs the image.
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { slug: true, logoUrl: true, aiWorkflowsLiveAt: true, campuses: { where: { id: user.campusId ?? "" }, select: { logoUrl: true } } } }).catch(() => null);
  const workflowsV2 = aiWorkflowsV2Enabled(brand?.slug) ? { practiceMode: practiceModeApplies(brand?.slug, process.env, undefined, brand?.aiWorkflowsLiveAt) } : null;
  // First-login setup: with AI Workflows on, the typed per-role questionnaire replaces the old guided setup.
  const query = await searchParams;
  if (workflowsV2 && query.setup === "1" && definitionForRole(user.role)) redirect("/ai/setup");
  const personalCampus = user.role === "APP_OWNER" ? null : user.campusId;
  const { language } = await getDisplayLocale(user);
  const examples = workflowsV2 ? askExamplesFor(user.role, language) : [];
  // "Try it" from the catalogue: only a registry key travels in the URL; it must be one this role may use.
  const tryKey = typeof query.try === "string" ? query.try : null;
  const tried = tryKey && workflowsV2 ? entriesForRole(user.role as UserRole).find(entry => entry.key === tryKey) : undefined;
  const initialMessage = tried ? tried.copy.examples[language]?.[0] ?? tried.copy.examples.en?.[0] : undefined;
  const demo = isDemoSchool(brand?.slug);
  return (
    <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.campuses[0]?.logoUrl || brand?.logoUrl || null} chatDock={user.schoolStatus !== "SUSPENDED"}>
      {personalWorkspace ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col">
          <AskHero headingId={HERO_ID} badge={demo ? <DemoSchoolBadge /> : null} />
          <AskWorkspace campusId={personalCampus} practiceMode={workflowsV2?.practiceMode ?? false} enabled={Boolean(workflowsV2)}
            examples={examples} initialMessage={initialMessage} heading="none" labelledBy={HERO_ID} />
        </div>
      ) : (
        <>
          {demo ? <div className="flex px-4 pt-4 sm:px-6"><DemoSchoolBadge /></div> : null}
          <SchoolAIWorkspace role={user.role} campusId={user.campusId} workflowsV2={workflowsV2} askExamples={examples} askInitialMessage={initialMessage} />
        </>
      )}
    </RoleFrame>
  );
}
