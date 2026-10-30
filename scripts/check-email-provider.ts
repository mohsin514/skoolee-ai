// SKO-457: connect to the configured SMTP provider and authenticate, then QUIT. No message is
// sent and no credential is printed. Usage: npx tsx scripts/check-email-provider.ts
import { checkEmailProviderConnection } from "../src/lib/email";
import { emailProviderReadiness } from "../src/lib/email/readiness";

const readiness = emailProviderReadiness();
console.log(JSON.stringify({ mode: readiness.mode, state: readiness.state }));
if (readiness.mode !== "smtp" || readiness.state !== "configured-unverified") process.exit(2);
checkEmailProviderConnection()
  .then(result => { console.log(JSON.stringify({ ...result, checkedAt: new Date().toISOString() })); })
  .catch(error => { console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message.replace(/[A-Za-z0-9+/=]{24,}/g, "[redacted]") : "failed" })); process.exit(1); });
