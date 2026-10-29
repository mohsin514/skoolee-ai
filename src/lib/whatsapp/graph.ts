// SKAI-1045 (D3-01): every Meta Graph call goes through this adapter so tests and local QA never reach Meta.
//   WHATSAPP_GRAPH_MODE=live     real Graph API (needs META_APP_ID + META_APP_SECRET)
//   WHATSAPP_GRAPH_MODE=mock     deterministic fake responses (local QA; no network)
//   unset                        live when META_APP_ID and META_APP_SECRET are set, otherwise disabled
// Tests replace the adapter with setGraphAdapter().

export type GraphMode = "live" | "mock" | "disabled";
export interface SendResult { success: boolean; messageId?: string; error?: string }
export interface GraphAdapter {
  mode: GraphMode;
  /** Embedded Signup: exchange the short-lived code for a business integration system user token. */
  exchangeCode(code: string): Promise<{ accessToken: string; expiresIn?: number }>;
  /** Confirms the phone number is reachable with the token and returns its public details. */
  phoneNumber(phoneNumberId: string, token: string): Promise<{ displayPhoneNumber?: string; verifiedName?: string }>;
  /** Subscribes Skoolee's app to the WABA's webhooks (inbound messages, delivery status). */
  subscribeApp(wabaId: string, token: string): Promise<void>;
  sendMessage(phoneNumberId: string, token: string, payload: Record<string, unknown>): Promise<SendResult>;
}

export const graphBase = () => process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v18.0";

export function graphMode(env: NodeJS.ProcessEnv = process.env): GraphMode {
  const mode = env.WHATSAPP_GRAPH_MODE;
  if (mode === "live" || mode === "mock" || mode === "disabled") return mode;
  return env.META_APP_ID && env.META_APP_SECRET ? "live" : "disabled";
}

async function graph(path: string, init: RequestInit = {}) {
  const response = await fetch(`${graphBase()}/${path}`, { ...init, cache: "no-store" });
  const json = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message || `Meta Graph request failed (${response.status})`);
  return json;
}

const live: GraphAdapter = {
  mode: "live",
  async exchangeCode(code) {
    const query = new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "", code });
    const json = await graph(`oauth/access_token?${query}`);
    if (typeof json.access_token !== "string") throw new Error("Meta did not return an access token");
    return { accessToken: json.access_token, expiresIn: typeof json.expires_in === "number" ? json.expires_in : undefined };
  },
  async phoneNumber(id, token) {
    const json = await graph(`${encodeURIComponent(id)}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${token}` } });
    return { displayPhoneNumber: json.display_phone_number as string | undefined, verifiedName: json.verified_name as string | undefined };
  },
  async subscribeApp(wabaId, token) {
    await graph(`${encodeURIComponent(wabaId)}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  },
  async sendMessage(phoneNumberId, token, payload) {
    try {
      const json = await graph(`${encodeURIComponent(phoneNumberId)}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", ...payload }) });
      return { success: true, messageId: (json.messages as { id?: string }[] | undefined)?.[0]?.id };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Failed to send WhatsApp message" }; }
  },
};

let counter = 0;
export const mockGraph: GraphAdapter = {
  mode: "mock",
  async exchangeCode(code) { if (!code || code === "invalid") throw new Error("Invalid code"); return { accessToken: `mock-token-${code}`, expiresIn: 60 * 24 * 3600 }; },
  async phoneNumber(id) { return { displayPhoneNumber: `+92 300 ${id.slice(-7).padStart(7, "0")}`, verifiedName: "Mock School" }; },
  async subscribeApp() {},
  async sendMessage() { return { success: true, messageId: `wamid.mock.${++counter}` }; },
};

const disabled: GraphAdapter = {
  mode: "disabled",
  async exchangeCode() { throw new Error("WhatsApp Embedded Signup is not configured"); },
  async phoneNumber() { throw new Error("WhatsApp Embedded Signup is not configured"); },
  async subscribeApp() { throw new Error("WhatsApp Embedded Signup is not configured"); },
  async sendMessage() { return { success: false, error: "WhatsApp credentials are not configured" }; },
};

let override: GraphAdapter | null = null;
/** Test seam: replace the adapter (null restores the env-selected one). */
export function setGraphAdapter(adapter: GraphAdapter | null) { override = adapter; }
export function graphAdapter(): GraphAdapter {
  if (override) return override;
  const mode = graphMode();
  return mode === "live" ? live : mode === "mock" ? mockGraph : disabled;
}
/** Sending also serves the legacy platform number (WHATSAPP_ACCESS_TOKEN), so it is live unless mocked. */
export function sendingAdapter(): GraphAdapter { return override ?? (graphMode() === "mock" ? mockGraph : live); }
