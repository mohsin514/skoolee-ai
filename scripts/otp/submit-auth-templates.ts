// SKAI-1061: submit the Skoolee authentication templates (EN/UR/AR copy-code) to the
// Skoolee-owned WABA. Dry run by default — prints the exact payloads and sends nothing.
//
//   npx tsx scripts/otp/submit-auth-templates.ts             # dry run
//   OTP_WABA_ID=… OTP_WHATSAPP_ACCESS_TOKEN=… npx tsx scripts/otp/submit-auth-templates.ts --submit
//
// Meta reviews each language separately; check status in WhatsApp Manager → Message templates.
import { authTemplateDefinitions, AUTH_TEMPLATE_NAME } from "../../src/lib/auth/otp/templates";

async function main() {
  const submit = process.argv.includes("--submit");
  const name = process.env.OTP_WHATSAPP_TEMPLATE_NAME || AUTH_TEMPLATE_NAME;
  const defs = authTemplateDefinitions(name);
  if (!submit) {
    console.log(JSON.stringify(defs, null, 2));
    console.log(`\nDry run: ${defs.length} template(s). Re-run with --submit to send them to Meta.`);
    return;
  }
  const waba = process.env.OTP_WABA_ID, token = process.env.OTP_WHATSAPP_ACCESS_TOKEN;
  if (!waba || !token) throw new Error("OTP_WABA_ID and OTP_WHATSAPP_ACCESS_TOKEN are required with --submit");
  const base = process.env.OTP_WHATSAPP_API_URL || "https://graph.facebook.com/v21.0";
  for (const def of defs) {
    const res = await fetch(`${base}/${encodeURIComponent(waba)}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(def),
    });
    const json = await res.json().catch(() => ({}));
    console.log(`${def.language}: HTTP ${res.status} ${JSON.stringify(json)}`);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
