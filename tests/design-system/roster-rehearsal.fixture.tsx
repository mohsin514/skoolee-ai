import { createRoot } from "react-dom/client";
import { BulkImportDialog } from "../../src/components/students/bulk-import-dialog";

/** SKAI-913: the roster import dialog against synthetic batches; every request is recorded, nothing leaves the page. */
export type RosterFixtureConfig = { list: unknown[]; stage?: unknown; reopen?: unknown };
declare global {
  interface Window { __rosterFixture: RosterFixtureConfig; __rosterRequests: { method: string; url: string; body: string | null }[]; __rosterDownloads: string[] }
}
const config = window.__rosterFixture;
window.__rosterRequests = [];
window.__rosterDownloads = [];
const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input), method = init?.method || "GET";
  window.__rosterRequests.push({ method, url, body: typeof init?.body === "string" ? init.body : null });
  if (method === "GET" && url.startsWith("/api/import-batches?")) return reply({ success: true, data: config.list });
  if (method === "GET" && url.startsWith("/api/import-batches/")) return reply({ success: true, data: config.reopen });
  if (method === "POST" && url === "/api/import-batches") return reply({ success: true, data: config.stage }, 201);
  return reply({ success: false, error: "Unexpected request" }, 500);
}) as typeof fetch;
URL.createObjectURL = (blob: Blob) => { void blob.text().then((text) => window.__rosterDownloads.push(text)); return "blob:fixture"; };
HTMLAnchorElement.prototype.click = function click() {};

const classes = [{ id: "c1", name: "Grade 4", section: "A", academicYear: 2026 }, { id: "c2", name: "Grade 5", section: null, academicYear: 2026 }];
createRoot(document.getElementById("fixture-root")!).render(<BulkImportDialog open onOpenChange={() => undefined} classes={classes} defaultClassId="c1" onSuccess={() => undefined} />);
