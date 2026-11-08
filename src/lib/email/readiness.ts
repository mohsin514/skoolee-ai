export type EmailReadiness = {
  mode: "disabled" | "development" | "smtp";
  configured: boolean;
  state: "disabled" | "development-bypass" | "missing" | "incomplete" | "invalid" | "configured-unverified";
  connectivity: "not-tested";
};

/** Configuration only. Never opens a socket or includes credentials in its result. */
export function emailProviderReadiness(env: Record<string, string | undefined> = process.env): EmailReadiness {
  const result = (mode: EmailReadiness["mode"], state: EmailReadiness["state"]): EmailReadiness => ({ mode, state, configured: state === "configured-unverified", connectivity: "not-tested" });
  if (env.DISABLE_OUTBOUND_MESSAGES === "true") return result("disabled", "disabled");
  if (env.EMAIL_DEV_MODE === "true") return result("development", "development-bypass");
  const user = env.SMTP_USER || env.EMAIL_SERVER_USER;
  const password = env.SMTP_PASS || env.EMAIL_SERVER_PASSWORD;
  const port = Number(env.SMTP_PORT || "465");
  const booleanKeys = ["EMAIL_DEV_MODE", "DISABLE_OUTBOUND_MESSAGES", "SMTP_AUTH", "SMTP_SECURE", "SMTP_STARTTLS", "SMTP_TLS_REJECT_UNAUTHORIZED"];
  if (!Number.isInteger(port) || port < 1 || port > 65535 || booleanKeys.some(key => env[key] !== undefined && !["true", "false"].includes(env[key]!)) || (env.SMTP_HOST && /[\s/\\:@]/.test(env.SMTP_HOST))) return result("smtp", "invalid");
  if (env.SMTP_AUTH === "false") return result("smtp", env.SMTP_HOST?.trim() ? "configured-unverified" : "incomplete");
  if (!env.SMTP_HOST && !user && !password) return result("smtp", "missing");
  return result("smtp", user?.trim() && password?.trim() ? "configured-unverified" : "incomplete");
}
