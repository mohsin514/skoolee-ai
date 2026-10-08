import { createRoot } from "react-dom/client";
import LoginPage from "../../src/app/(auth)/login/page";
import AcceptInvitePage from "../../src/app/(auth)/accept-invite/page";
import { AppToaster } from "../../src/components/ui/app-toaster";

type Reply = { status?: number; body?: unknown; headers?: Record<string, string>; pending?: boolean };
export type AuthFixtureConfig = {
  page: "login" | "invite";
  replies?: Reply[];
  inviteReply?: Reply;
  acceptError?: string;
  acceptPending?: boolean;
};
declare global {
  interface Window {
    __authFixture: AuthFixtureConfig;
    __authRequests: { url: string; method: string; body: string | null }[];
    __authNavigations: string[];
    __authAcceptCalls: unknown[][];
    __fixtureAcceptInvite: (...args: unknown[]) => Promise<void>;
  }
}

const config = window.__authFixture;
window.__authRequests = [];
window.__authNavigations = [];
window.__authAcceptCalls = [];
const release = () => new Promise<void>(resolve => window.addEventListener("auth:release", () => resolve(), { once: true }));

// This fixture never uses a real authentication endpoint or Server Action.
window.fetch = async (input, init) => {
  const url = String(input);
  window.__authRequests.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : null });
  const reply = url.startsWith("/api/auth/login") ? config.replies?.shift()
    : url.startsWith("/api/invite/status") ? config.inviteReply
      : url === "/api/invite/reissue" ? { body: { success: true } } : undefined;
  if (!reply) throw new Error(`Unmocked fixture request: ${url}`);
  if (reply.pending) await release();
  return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { "Content-Type": "application/json", ...reply.headers } });
};
window.__fixtureAcceptInvite = async (...args) => {
  window.__authAcceptCalls.push(args);
  if (config.acceptPending) await release();
  if (config.acceptError) throw new Error(config.acceptError);
};

createRoot(document.getElementById("fixture-root")!).render(<>
  {config.page === "login" ? <LoginPage /> : <AcceptInvitePage />}
  <AppToaster />
</>);
