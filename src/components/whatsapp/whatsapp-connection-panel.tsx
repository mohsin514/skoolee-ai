"use client";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { useFetch } from "@/hooks";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKAI-1045 (D3-01): the school connects its own WhatsApp Business Account with Meta Embedded Signup. The browser
// only collects Meta's one-time code and the account ids; the server exchanges the code and stores the token encrypted.

type Status = {
  mode: "live" | "mock" | "disabled"; appId: string | null; configId: string | null;
  connection: { status: string; wabaId: string; phoneNumberId: string; displayPhoneNumber: string | null; verifiedName: string | null; connectedAt: string; tokenExpiresAt: string | null } | null;
};
type Signup = { code: string; wabaId: string; phoneNumberId: string; businessId?: string };
type FB = { init(o: Record<string, unknown>): void; login(cb: (r: { authResponse?: { code?: string } }) => void, o: Record<string, unknown>): void };
declare global { interface Window { FB?: FB; fbAsyncInit?: () => void } }

function loadSdk(appId: string): Promise<FB> {
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise((resolve, reject) => {
    window.fbAsyncInit = () => { window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v18.0" }); resolve(window.FB!); };
    const script = Object.assign(document.createElement("script"), { src: "https://connect.facebook.net/en_US/sdk.js", async: true, crossOrigin: "anonymous", onerror: () => reject(new Error("Meta sign-up could not load. Check your connection and try again.")) });
    document.body.appendChild(script);
  });
}

/** Runs Embedded Signup: the popup returns a code, and Meta posts the selected account ids to this window. */
async function embeddedSignup(appId: string, configId: string): Promise<Signup> {
  const fb = await loadSdk(appId);
  return new Promise((resolve, reject) => {
    let ids: { waba_id?: string; phone_number_id?: string; business_id?: string } | null = null, code: string | null = null;
    const finish = () => { if (ids && code) { window.removeEventListener("message", onMessage); resolve({ code, wabaId: String(ids.waba_id ?? ""), phoneNumberId: String(ids.phone_number_id ?? ""), businessId: ids.business_id ? String(ids.business_id) : undefined }); } };
    const onMessage = (event: MessageEvent) => {
      if (!/^https:\/\/([a-z0-9-]+\.)?facebook\.com$/.test(event.origin)) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "CANCEL" || data.event === "ERROR") { window.removeEventListener("message", onMessage); reject(new Error("Meta sign-up was not finished.")); return; }
        if (String(data.event).startsWith("FINISH")) { ids = data.data; finish(); }
      } catch { /* other frames' messages */ }
    };
    window.addEventListener("message", onMessage);
    fb.login(response => {
      code = response.authResponse?.code ?? null;
      if (!code) { window.removeEventListener("message", onMessage); reject(new Error("Meta sign-up was not finished.")); return; }
      finish();
    }, { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, sessionInfoVersion: "3" } });
  });
}

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/whatsapp/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
}

export function WhatsAppConnectionPanel() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const { data, failure, isLoading, refetch } = useFetch<Status>("/api/whatsapp/connection");
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  if (failure) return <ErrorState error={failure} onRetry={refetch} />;
  if (isLoading || !data) return <SkeletonList rows={2} />;
  const connection = data.connection?.status === "CONNECTED" ? data.connection : null;
  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try { await work(); toast.success(ui(done)); await refetch(); }
    catch (error) { toast.error(ui(error instanceof Error ? error.message : "The change was not saved.")); }
    finally { setBusy(false); setConfirm(false); }
  };
  const start = () => run(async () => {
    const signup = data.mode === "mock"
      ? { code: "mock-code", wabaId: "100000000000001", phoneNumberId: "100000000000002", businessId: "100000000000003" }
      : await embeddedSignup(data.appId ?? "", data.configId ?? "");
    await post({ action: "connect", ...signup });
  }, "WhatsApp connected");
  const ready = data.mode === "mock" || (data.mode === "live" && Boolean(data.appId && data.configId));

  return <Card data-whatsapp-connection>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><MessageCircle aria-hidden className="size-5" />{ui("WhatsApp Business")}</CardTitle>
      <CardDescription>{ui("Connect your school's own WhatsApp Business Account. Messages go out under your school's name and Meta bills your school directly.")}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {data.mode === "mock" ? <Alert tone="info" compact live="off">{ui("Test mode: no real Meta account is contacted.")}</Alert> : null}
      {!ready ? <Alert tone="warning" live="off">{ui("WhatsApp sign-up is not set up for this deployment yet. Ask Skoolee support.")}</Alert> : null}
      {connection ? <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-ink-muted">{ui("Status")}</dt><dd><Badge variant="success">{ui("Connected")}</Badge></dd></div>
        <div><dt className="text-ink-muted">{ui("Business name")}</dt><dd>{connection.verifiedName ?? "—"}</dd></div>
        <div><dt className="text-ink-muted">{ui("Phone number")}</dt><dd dir="ltr" className="text-start">{connection.displayPhoneNumber ?? "—"}</dd></div>
        <div><dt className="text-ink-muted">{ui("Connected on")}</dt><dd>{dateTime(connection.connectedAt)}</dd></div>
        <div><dt className="text-ink-muted">{ui("WhatsApp Business Account ID")}</dt><dd dir="ltr" className="text-start font-mono text-xs">{connection.wabaId}</dd></div>
      </dl> : <p className="text-sm"><Badge variant="neutral">{ui("Not connected")}</Badge></p>}
      <div className="flex flex-wrap gap-2">
        {connection
          ? <Button variant="outline" disabled={busy} onClick={() => setConfirm(true)}>{ui("Disconnect")}</Button>
          : <Button disabled={busy || !ready} onClick={() => void start()}>{busy ? ui("Connecting…") : ui("Connect with Facebook")}</Button>}
      </div>
    </CardContent>
    <ConfirmAction open={confirm} tone="danger" busy={busy}
      title={ui("Disconnect WhatsApp?")}
      description={ui("Messages will stop going out from your school's number. Your WhatsApp account at Meta is not deleted, and you can connect again later.")}
      confirmLabel={ui("Disconnect")}
      onConfirm={() => run(() => post({ action: "disconnect" }), "WhatsApp disconnected")} onCancel={() => setConfirm(false)} />
  </Card>;
}
