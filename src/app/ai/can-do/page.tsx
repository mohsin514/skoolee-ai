import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDisplayLocale } from "@/lib/locale/display";
import { prisma } from "@/lib/db/prisma";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { Badge } from "@/components/ui/badge";
import { atlasFor } from "@/lib/ai-workflows/atlas";
import { capabilityContext, inTenant } from "@/lib/ai-workflows/jobs/actor";
import { UI, t } from "@/components/ai-workflows/run-copy";

export const metadata = { title: "What AI can do" };
export const dynamic = "force-dynamic";

/** The honest catalogue: connected capabilities by how they finish, and the real count against everything the role can do. */
export default async function AiCanDoPage() {
  const user = await requirePageSession();
  const { language } = await getDisplayLocale(user);
  const atlas = await inTenant(user, async () => atlasFor(user, await capabilityContext(user, user.campusId, language), language));
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { logoUrl: true } }).catch(() => null);
  const group = (title: string, items: Array<{ key: string; title: string; note?: string }>) => items.length > 0 && (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="grid gap-2 sm:grid-cols-2">{items.map(item => <li key={item.key} data-ai-capability={item.key} className="rounded-xl border border-border p-3"><span className="font-medium">{item.title}</span>{item.note && <p className="text-xs text-ink-muted">{item.note}</p>}</li>)}</ul>
    </section>
  );
  return (
    <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.logoUrl ?? null} chatDock={false}>
      <div className="mx-auto max-w-5xl space-y-6 p-6" dir={language === "en" ? "ltr" : "rtl"}>
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">{t(UI, "canDoTitle", language)}</h1>
          <Badge variant="info" data-ai-coverage={`${atlas.connected}/${atlas.total}`}>{t(UI, "canDoCount", language, atlas.connected, atlas.total)}</Badge>
        </header>
        {group(t(UI, "classA", language), atlas.runs)}
        {group(t(UI, "classB", language), atlas.confirm)}
        {group(t(UI, "classC", language), atlas.approval.map(item => ({ ...item, note: item.roles.join(", ") })))}
        {group(t({ x: { en: "Not available to you right now", ar: "غير متاح لك الآن", ur: "ابھی آپ کے لیے دستیاب نہیں" } }, "x", language), atlas.unavailable.map(item => ({ ...item, note: item.whoCan.join(", ") })))}
      </div>
    </RoleFrame>
  );
}
