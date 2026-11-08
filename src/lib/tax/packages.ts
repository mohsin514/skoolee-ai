// SKO-444: versioned country invoice packages. Each version says exactly what it covers and what it does not.
// These are DEMONSTRATION configurations: none is certified, and none implies legal compliance until the school
// records a qualified review against its own situation. Rates live in the version, never in the UI, and a
// version never changes once released — a rule change is a new version.

export type Rounding = "LINE_HALF_UP" | "TOTAL_HALF_UP";
export type PackageVersion = {
  version: number;
  country: string;
  currencies: string[];
  entities: string[]; // legal entity types the package applies to
  transactions: string[]; // transaction types it covers
  standardRatePercent: number;
  rounding: Rounding;
  numbering: { prefix: string; pad: number };
  requiredFields: { key: "legalName" | "taxId"; label: string; pattern?: string; hint?: string }[];
  electronic: { adapter: "SANDBOX" | null; scope: string };
  ruleReviewDate: string | null; // when the source rules were last checked by the package maintainer
  verifiedScope: string;
  limitations: string[];
  invoiceLanguage: "en" | "ar" | "bilingual";
};
export type TaxPackage = { code: string; name: string; versions: PackageVersion[] };

export const PACKAGES: TaxPackage[] = [
  { code: "PK-DEMO", name: "Pakistan demonstration package", versions: [{
    version: 1, country: "PK", currencies: ["PKR"], entities: ["PRIVATE_SCHOOL"], transactions: ["TUITION_AND_FEES"],
    standardRatePercent: 0, rounding: "LINE_HALF_UP", numbering: { prefix: "PKD-", pad: 6 },
    requiredFields: [{ key: "legalName", label: "Registered legal name" }, { key: "taxId", label: "NTN", pattern: "^\\d{7}(-\\d)?$", hint: "7 digits, optionally -check digit" }],
    electronic: { adapter: null, scope: "No electronic invoicing integration." }, ruleReviewDate: null,
    verifiedScope: "Demonstration only: zero-rated tuition with optional taxable lines configured by the school.",
    limitations: ["Provincial sales tax on services is not modelled.", "FBR electronic invoicing is not supported; report outside this system."], invoiceLanguage: "en",
  }] },
  { code: "SA-DEMO", name: "Saudi Arabia demonstration VAT package", versions: [
    { version: 1, country: "SA", currencies: ["SAR"], entities: ["PRIVATE_SCHOOL"], transactions: ["TUITION_AND_FEES"],
      standardRatePercent: 15, rounding: "LINE_HALF_UP", numbering: { prefix: "SAD-", pad: 6 },
      requiredFields: [{ key: "legalName", label: "Registered legal name" }, { key: "taxId", label: "VAT registration number", pattern: "^3\\d{13}3$", hint: "15 digits starting and ending with 3" }],
      electronic: { adapter: "SANDBOX", scope: "Sandbox stand-in only; not connected to the tax authority and not certified." }, ruleReviewDate: "2026-09-30",
      verifiedScope: "Demonstration: standard-rated lines at 15% with school-configured exempt fee types.",
      limitations: ["Citizen education VAT relief is not modelled; configure exempt fee types only after qualified advice.", "Phase 2 e-invoicing integration is a sandbox stand-in."], invoiceLanguage: "bilingual" },
    { version: 2, country: "SA", currencies: ["SAR"], entities: ["PRIVATE_SCHOOL"], transactions: ["TUITION_AND_FEES"],
      standardRatePercent: 15, rounding: "TOTAL_HALF_UP", numbering: { prefix: "SAD-", pad: 6 },
      requiredFields: [{ key: "legalName", label: "Registered legal name" }, { key: "taxId", label: "VAT registration number", pattern: "^3\\d{13}3$", hint: "15 digits starting and ending with 3" }],
      electronic: { adapter: "SANDBOX", scope: "Sandbox stand-in only; not connected to the tax authority and not certified." }, ruleReviewDate: "2026-10-10",
      verifiedScope: "Demonstration: as v1, with VAT rounded once on the invoice total.",
      limitations: ["Citizen education VAT relief is not modelled; configure exempt fee types only after qualified advice.", "Phase 2 e-invoicing integration is a sandbox stand-in."], invoiceLanguage: "bilingual" },
  ] },
  { code: "AE-DEMO", name: "United Arab Emirates demonstration VAT package", versions: [{
    version: 1, country: "AE", currencies: ["AED"], entities: ["PRIVATE_SCHOOL"], transactions: ["TUITION_AND_FEES"],
    standardRatePercent: 5, rounding: "LINE_HALF_UP", numbering: { prefix: "AED-", pad: 6 },
    requiredFields: [{ key: "legalName", label: "Registered legal name" }, { key: "taxId", label: "TRN", pattern: "^\\d{15}$", hint: "15 digits" }],
    electronic: { adapter: null, scope: "No electronic invoicing integration." }, ruleReviewDate: "2026-09-15",
    verifiedScope: "Demonstration: standard-rated lines at 5% with school-configured zero-rated fee types.",
    limitations: ["Zero-rating of education services depends on the school's licence; configure only after qualified advice.", "Electronic invoicing is not supported."], invoiceLanguage: "bilingual",
  }] },
];

export function findVersion(code: string, version: number) {
  const pkg = PACKAGES.find(p => p.code === code);
  const v = pkg?.versions.find(x => x.version === version);
  return pkg && v ? { pkg, v } : null;
}

/** Countries with no package get an explicit limitation, never a compliant badge. */
export function limitationFor(country: string | null | undefined) {
  if (PACKAGES.some(p => p.versions.some(v => v.country === country))) return null;
  return `No invoice package exists for ${country || "this country"}. Invoices carry no tax treatment from this system; use your accountant's process.`;
}

export type Line = { code: string; name: string; amount: number };
export type Calc = { lines: (Line & { discount: number; taxable: number; ratePercent: number; category: "STANDARD" | "EXEMPT"; tax: number })[]; subtotal: number; discount: number; taxable: number; tax: number; total: number };

/** Integer minor units throughout. Discount spreads over lines by amount (largest remainder); half-up rounding. */
export function calculate(v: Pick<PackageVersion, "standardRatePercent" | "rounding">, lines: Line[], discount: number, exemptCodes: string[]): Calc {
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  if (discount > subtotal) throw new Error("Discount exceeds the lines.");
  const shares = lines.map(l => subtotal ? (l.amount * discount) / subtotal : 0);
  const floors = shares.map(Math.floor);
  let left = discount - floors.reduce((a, b) => a + b, 0);
  const order = shares.map((s, i) => [s - Math.floor(s), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (left <= 0) break; floors[i]++; left--; }
  const half = (n: number) => Math.floor(n + 0.5);
  const rows = lines.map((l, i) => {
    const exempt = exemptCodes.includes(l.code), taxable = l.amount - floors[i], ratePercent = exempt ? 0 : v.standardRatePercent;
    return { ...l, discount: floors[i], taxable, ratePercent, category: exempt ? "EXEMPT" as const : "STANDARD" as const, tax: v.rounding === "LINE_HALF_UP" ? half(taxable * ratePercent / 100) : 0 };
  });
  const taxableStandard = rows.filter(r => r.category === "STANDARD").reduce((s, r) => s + r.taxable, 0);
  const tax = v.rounding === "LINE_HALF_UP" ? rows.reduce((s, r) => s + r.tax, 0) : half(taxableStandard * v.standardRatePercent / 100);
  return { lines: rows, subtotal, discount, taxable: rows.reduce((s, r) => s + r.taxable, 0), tax, total: subtotal - discount + tax };
}
