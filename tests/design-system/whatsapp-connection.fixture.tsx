import { createRoot } from "react-dom/client";
import { WhatsAppConnectionPanel } from "../../src/components/whatsapp/whatsapp-connection-panel";

// SKAI-1045 evidence fixture: the panel against a synthetic /api/whatsapp/connection (mock mode, no Meta).
declare global { interface Window { __waStatus: unknown; __waPosts: unknown[] } }
window.__waPosts = [];
const connected = { status: "CONNECTED", wabaId: "100000000000001", phoneNumberId: "100000000000002", displayPhoneNumber: "+92 300 0000002", verifiedName: "Synthetic School", connectedAt: "2026-10-29T08:00:00.000Z", tokenExpiresAt: null };
window.fetch = async (input, init) => {
  const method = init?.method ?? "GET";
  if (method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    window.__waPosts.push(body);
    window.__waStatus = { ...(window.__waStatus as object), connection: body.action === "connect" ? connected : { ...connected, status: "DISCONNECTED" } };
  }
  return new Response(JSON.stringify({ success: true, data: window.__waStatus }), { headers: { "Content-Type": "application/json" } });
};
createRoot(document.getElementById("fixture-root")!).render(<main className="mx-auto max-w-3xl p-4"><WhatsAppConnectionPanel /></main>);
