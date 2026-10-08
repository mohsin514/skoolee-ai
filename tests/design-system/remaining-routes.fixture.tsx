import { useState } from "react";
import { createRoot } from "react-dom/client";
import CorrectionClient from "../../src/app/corrections/view";
import PackagePage from "../../src/app/onboarding/package/page";
import RouteError from "../../src/app/teacher/error";
import { BulkImportDialog } from "../../src/app/dashboard/students/bulk-import-dialog";
import { defaultLocale } from "../../src/lib/locale/package";
import { Button } from "../../src/components/ui/button";

export type RouteReply = { body: unknown; status?: number; pending?: boolean };
export type RouteFixtureConfig = { surface: "corrections" | "package" | "error" | "import"; language?: string; replies?: Record<string, RouteReply[]> };
declare global { interface Window {
  __routeFixture: RouteFixtureConfig;
  __routeRequests: { url: string; method: string; body: string | null }[];
  __routeNavigation: string[];
  __routeRetries: number;
} }
const config = window.__routeFixture;
window.__routeRequests = []; window.__routeNavigation = []; window.__routeRetries = 0;
window.fetch = async (input, init) => {
  const url = String(input), method = init?.method || "GET";
  window.__routeRequests.push({ url, method, body: typeof init?.body === "string" ? init.body : null });
  const queue = config.replies?.[`${method} ${url}`];
  if (!queue?.length) throw new Error(`Unexpected synthetic request: ${method} ${url}`);
  const reply = queue.shift()!;
  if (reply.pending) await new Promise<void>(resolve => window.addEventListener("routes:release", () => resolve(), { once: true }));
  return new Response(JSON.stringify(reply.body), { status: reply.status || 200, headers: { "Content-Type": "application/json" } });
};
function ImportFixture() {
  const [open, setOpen] = useState(false);
  return <><Button onClick={() => setOpen(true)}>Open synthetic import</Button><BulkImportDialog open={open} onOpenChange={setOpen} classes={[{ id: "fixture-class", name: "Synthetic Class", academicYear: 2026 }]} defaultClassId="fixture-class" onSuccess={() => {}} /></>;
}
createRoot(document.getElementById("fixture-root")!).render(config.surface === "corrections"
  ? <CorrectionClient actorId="fixture-actor" schoolId="fixture-school" initialKind="MARK" initialLanguage={config.language || "en"} initialLocale={defaultLocale} />
  : config.surface === "package" ? <PackagePage />
    : config.surface === "import" ? <ImportFixture />
      : <RouteError error={new Error("Synthetic route failure")} reset={() => { window.__routeRetries++; }} />);
