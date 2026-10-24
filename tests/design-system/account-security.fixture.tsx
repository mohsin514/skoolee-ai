import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "../../src/components/ui/button";
import { SettingsModal } from "../../src/components/settings/SettingsModal";
import type { SettingsSection } from "../../src/components/settings/settings-sections";

export type SecurityReply = { status?: number; body?: unknown; pending?: boolean; reject?: boolean };
/**
 * `status` and `sessions` replay their last entry once the queue is down to
 * one, so post-dialog refreshes keep working; `actions` (POST) and `deletes`
 * are consumed strictly so every mutation must be planned by the test.
 */
export type SecurityFixtureConfig = {
  status: SecurityReply[];
  sessions?: SecurityReply[];
  actions?: SecurityReply[];
  deletes?: SecurityReply[];
  /** Which Settings section opens on mount; `null` starts closed. Defaults to security. */
  section?: SettingsSection | null;
  /** GET /api/profile; PATCH echoes the saved fields onto it. */
  profile?: Record<string, unknown>;
  /** What the getPersonalLanguage server action resolves to. */
  personal?: { personal: "en" | "ar" | "ur" | null; inherited: "en" | "ar" | "ur" };
};
declare global {
  interface Window {
    __securityFixture: SecurityFixtureConfig;
    __securityRequests: { method: string; url: string; cache?: RequestCache; body: string | null }[];
    __securityClipboard: string[];
    __securityPrints: number;
    __languageSaves: (string | null)[];
    __localeChanges: number;
  }
}
const config = window.__securityFixture;
window.__securityRequests = [];
window.__securityClipboard = [];
window.__securityPrints = 0;
window.__languageSaves = [];
window.__localeChanges = 0;
window.addEventListener("skoolee:locale-change", () => { window.__localeChanges += 1; });
// The fixture origin is not a secure context, so record clipboard and print calls instead.
Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { window.__securityClipboard.push(text); } } });
window.print = () => { window.__securityPrints += 1; };

const defaultSessions: SecurityReply = { body: { sessions: [] } };
function sticky(queue: SecurityReply[] | undefined, fallback?: SecurityReply) {
  if (!queue || queue.length === 0) return fallback;
  return queue.length > 1 ? queue.shift() : queue[0];
}
async function answer(reply: SecurityReply | undefined) {
  if (!reply) throw new Error("Missing synthetic security response");
  if (reply.pending) await new Promise<void>(resolve => window.addEventListener("security:release", () => resolve(), { once: true }));
  if (reply.reject) throw new Error("Synthetic connection failure");
  return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { "Content-Type": "application/json" } });
}
let profile = config.profile ?? { fullName: "Synthetic Parent", phone: "", email: "parent@synthetic.invalid", roleLabel: "Parent", profileImageUrl: "" };
// No real account, session, secret or recovery code: every reply is synthetic.
window.fetch = async (input, init) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? init.body : null;
  window.__securityRequests.push({ method, url, cache: init?.cache, body });
  if (url === "/api/account/mfa") return answer(method === "GET" ? sticky(config.status) : config.actions?.shift());
  if (url === "/api/auth/sessions") return answer(method === "GET" ? sticky(config.sessions, defaultSessions) : config.deletes?.shift());
  if (url === "/api/profile") {
    if (method === "PATCH") profile = { ...profile, ...JSON.parse(body ?? "{}") };
    return answer({ body: { profile } });
  }
  throw new Error(`Unexpected fixture request ${method} ${url}`);
};

function Harness() {
  const [open, setOpen] = useState<SettingsSection | null>(config.section === undefined ? "security" : config.section);
  return (
    <main className="p-6">
      <Button type="button" onClick={() => setOpen("profile")}>Open settings</Button>
      {open ? <SettingsModal initialSection={open} onClose={() => setOpen(null)} /> : null}
    </main>
  );
}
createRoot(document.getElementById("fixture-root")!).render(<Harness />);
