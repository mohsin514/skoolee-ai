import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// role-ux P4 (§7.3 G22, §5.7 M109–M111): source contracts for the platform console's server routes. These run
// without a database; the database-backed provisioning journey lives in the commercial database suite.
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const code = (path: string) => read(path).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("provisioning requires an explicit institution kind before touching the database (G22)", () => {
  const route = code("src/app/api/owner/schools/route.ts");
  const post = route.slice(route.indexOf("export async function POST"));
  const kindCheck = post.indexOf('throw new ApiError("Choose whether this is a school group or a single school", 400)');
  assert.ok(kindCheck > 0, "a missing or unknown kind is a 400");
  assert.ok(kindCheck < post.indexOf("prisma.$transaction"), "the kind is validated before the transaction");
  assert.match(post, /body\.kind === "GROUP" \|\| body\.kind === "STANDALONE"/, "only GROUP or STANDALONE are accepted");
  assert.match(post, /registrationKind: kind/, "the kind is stored as registrationKind");
});

test("a provisioned owner is the institution authority with the owner and purchase flags (G22, R-B1)", () => {
  const post = code("src/app/api/owner/schools/route.ts");
  assert.match(post, /campusId: kind === "GROUP" \? null : campus\.id/, "a group admin is not pinned to a campus; a single school's admin runs its one campus");
  assert.match(post, /role: kind === "GROUP" \? "SUPER_ADMIN" : "ADMIN"/);
  assert.match(post, /isInstitutionOwner: true/);
  assert.match(post, /canPurchaseSubscription: true/);
});

test("platform statistics never total tenant tuition (M109)", () => {
  const stats = code("src/app/api/owner/stats/route.ts");
  assert.doesNotMatch(stats, /prisma\.payment\b/);
  assert.doesNotMatch(stats, /prisma\.invoice\b/);
  assert.doesNotMatch(stats, /FROM payments/);
  for (const field of ["totalRevenue", "totalPaymentCount", "pendingInvoices", "invoicesByStatus", "revenueByMonth"]) {
    assert.doesNotMatch(stats, new RegExp(`\\b${field}\\b`), `${field} is not returned`);
  }
  const overview = code("src/components/insights/PlatformOverview.tsx");
  assert.doesNotMatch(overview, /totalRevenue|pendingInvoices|invoicesByStatus|revenueByMonth|PKR/);
});

test("Stripe Connect returns to the Payment gateways view (M111)", () => {
  const route = code("src/app/api/owner/payment-settings/route.ts");
  assert.match(route, /view: "payments", connect: state/);
  assert.doesNotMatch(route, /tab=pricing/);
  const page = code("src/app/owner/page.tsx");
  assert.match(page, /params\.get\("connect"\)/, "the console reads the return and strips it");
});

test("the platform console takes its identity from the session and its nav from the registry (M110)", () => {
  const page = code("src/app/owner/page.tsx");
  assert.doesNotMatch(page, /Mohsin|mohsin@/i, "no hard-coded operator identity");
  assert.match(page, /console="owner"/);
  assert.match(page, /useConsoleView\("owner"\)/);
  assert.match(page, /data-tour="owner\.schools\.table"/);
  assert.doesNotMatch(page, /window\.(confirm|prompt|alert)\s*\(/);
});
