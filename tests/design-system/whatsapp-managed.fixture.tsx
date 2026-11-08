import { createRoot } from "react-dom/client";
import { ManagedSendingPanel } from "../../src/components/whatsapp/managed-sending-panel";

// SKAI-1046 evidence fixture: the managed-sending panel against a synthetic /api/whatsapp/managed.
declare global { interface Window { __managed: unknown } }
window.fetch = async () => new Response(JSON.stringify({ success: true, data: window.__managed }), { headers: { "Content-Type": "application/json" } });
createRoot(document.getElementById("fixture-root")!).render(<main className="mx-auto max-w-3xl p-4"><ManagedSendingPanel /></main>);
