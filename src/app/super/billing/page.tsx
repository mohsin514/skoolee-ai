import { redirect } from "next/navigation";

/**
 * SPEC §6.3 — `/super/billing` is an old address for the group console's Billing & plan view. A server
 * redirect replaces the client skeleton that used to flash the console before `router.replace` ran. Return
 * parameters from an older checkout link (`success`, `canceled`, `session_id`, `safepay_status`) are kept so
 * the billing workspace can still report the outcome. The console's own fence (registry `billing` key)
 * decides what a non-payer sees there.
 */
const KEPT = ["success", "canceled", "session_id", "safepay_status"] as const;

export default async function SuperBillingRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const target = new URLSearchParams({ view: "billing" });
  for (const key of KEPT) {
    const value = query[key];
    if (typeof value === "string" && value) target.set(key, value);
  }
  redirect(`/super?${target.toString()}`); // outside try/catch: redirect() throws by design
}
