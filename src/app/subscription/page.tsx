import { redirect } from "next/navigation";

/**
 * The old stand-alone subscription page. Billing & plan now lives in the payer's own console, and `/billing`
 * resolves who that is (§6.3, G10). Kept on the suspended allow-list so old links still recover.
 */
export default function SubscriptionPage() {
  redirect("/billing");
}
