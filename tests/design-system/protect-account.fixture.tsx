import { createRoot } from "react-dom/client";
import ProtectAccount from "../../src/app/(auth)/protect-account/page";

export type MfaFixtureReply = { status?: number; body?: unknown; pending?: boolean; reject?: boolean };
export type MfaFixtureConfig = { statusReplies: MfaFixtureReply[]; actionReplies?: MfaFixtureReply[] };
declare global {
  interface Window {
    __mfaFixture: MfaFixtureConfig;
    __mfaRequests: { method: string; cache?: RequestCache; body: string | null }[];
    __mfaNavigation: string[];
  }
}
const config = window.__mfaFixture;
window.__mfaRequests = [];
window.__mfaNavigation = [];
// No real MFA service, valid secret, credential, challenge, or acknowledgement.
window.fetch = async (input, init) => {
  if (String(input) !== "/api/auth/mfa") throw new Error("Unexpected fixture request");
  const method = init?.method ?? "GET";
  window.__mfaRequests.push({ method, cache: init?.cache, body: typeof init?.body === "string" ? init.body : null });
  const reply = (method === "GET" ? config.statusReplies : config.actionReplies)?.shift();
  if (!reply) throw new Error("Missing synthetic MFA response");
  if (reply.pending) await new Promise<void>(resolve => window.addEventListener("mfa:release", () => resolve(), { once: true }));
  if (reply.reject) throw new Error("Synthetic connection failure");
  return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { "Content-Type": "application/json" } });
};
createRoot(document.getElementById("fixture-root")!).render(<ProtectAccount />);
