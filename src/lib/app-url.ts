/**
 * The public origin used in links we send out (emails, notifications, payment
 * return URLs).
 *
 * Order:
 * 1. NEXT_PUBLIC_APP_URL — set it per Vercel project (https://dev.skooleeai.com,
 *    https://qa.skooleeai.com, …). A *.vercel.app value is skipped in favour of
 *    the project's custom domain, because those per-deployment URLs leak into
 *    customer emails.
 * 2. VERCEL_PROJECT_PRODUCTION_URL — the project's production domain, which is
 *    its custom domain once one is assigned (the dev project's is dev.skooleeai.com).
 * 3. VERCEL_URL — this one deployment's *.vercel.app address (last resort).
 * 4. localhost for local development.
 */
export function appUrl(): string {
  const configured = clean(process.env.NEXT_PUBLIC_APP_URL);
  const production = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (configured && !(isVercelApp(configured) && production && !isVercelApp(production))) return configured;
  if (production) return production;
  if (configured) return configured;
  const deployment = clean(process.env.VERCEL_URL);
  if (deployment) return deployment;
  return "http://localhost:3000";
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isVercelApp(url: string) {
  try { return new URL(url).hostname.endsWith(".vercel.app"); } catch { return false; }
}
