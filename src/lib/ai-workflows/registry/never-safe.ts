/**
 * Patterns no registry entry may use (architecture §3.3). check-capabilities.ts scans the registry
 * sources for them; a reviewed exception goes in ALLOWED_SYNTHETIC_REQUEST_CALLEES.
 *  - Never invoke a route handler: requireAuthUser() reads cookies() and would see the wrong principal.
 *  - Never forge an Origin header to pass assertSameOrigin.
 *  - Never depend on headers, IP-keyed limits, measured()/requestSchool() or the support-grant cookie.
 *  - No FormData uploads (SKO-460 owns them).
 *  - No model-chosen HTTP or SQL, and no raw SQL writes.
 *  - No runUnscoped or hand-built AuthUser outside jobs/actor.ts.
 */
export const NEVER_SAFE_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp; why: string }> = [
  { id: "route-handler", pattern: /from\s+["']@\/app\/api\//, why: "imports a route handler" },
  { id: "fetch", pattern: /\bfetch\s*\(/, why: "makes an HTTP call" },
  { id: "raw-sql-write", pattern: /\$executeRaw(Unsafe)?\b/, why: "writes raw SQL" },
  { id: "forged-origin", pattern: /["']origin["']\s*:/i, why: "sets an Origin header" },
  { id: "form-data", pattern: /\bnew\s+FormData\b/, why: "builds a FormData upload" },
  { id: "unscoped", pattern: /\brunUnscoped\s*\(/, why: "leaves the tenant guard" },
  { id: "next-request", pattern: /\bnew\s+NextRequest\b/, why: "synthesizes a request" },
];

/** Transitional callees that still need a synthesized request; each must move to a (user, input) core. */
export const ALLOWED_SYNTHETIC_REQUEST_CALLEES: readonly string[] = ["src/lib/ai-workflows/adapters/students.ts"];
