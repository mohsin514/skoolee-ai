import { rateLimit } from "@/lib/rate-limit";

// SKAI-529: the one public answer for a printed certificate, used by the JSON route (a signed-out page for the QR
// code is still to come). It carries only what is printed on the document's face plus its current state — never the
// pupil's record, the template or who issued it — and is the same for every viewer, signed in or not.

export const VERIFY_TOKEN = /^[A-Za-z0-9_-]{20,40}$/;
/** Lookups per client address per minute. Tokens are unguessable; this caps enumeration and scraping. */
export const VERIFY_LIMIT = 30;

export type VerifyRow = { serial: string; title: string; status: string; issuedAt: Date | null; revokedAt: Date | null; school: { name: string }; successors: { serial: string }[] };
export type Verdict = { serial: string; title: string; school: string; issuedOn: string; state: "VALID" | "REVOKED" | "SUPERSEDED"; revokedOn?: string; replacedBy?: string };
export type VerifyOutcome = { kind: "found"; data: Verdict } | { kind: "unknown" } | { kind: "limited" };

export const verifySelect = { serial: true, title: true, status: true, issuedAt: true, revokedAt: true, school: { select: { name: true } }, successors: { where: { status: "ISSUED" }, select: { serial: true } } } as const;

export function clientAddress(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}

export async function verifyCertificate(token: string, client: string, lookup: (token: string) => Promise<VerifyRow | null>): Promise<VerifyOutcome> {
  if (!(await rateLimit(`certificate-verify:${client}`, { limit: VERIFY_LIMIT, windowMs: 60_000 })).ok) return { kind: "limited" };
  if (!VERIFY_TOKEN.test(token)) return { kind: "unknown" };
  const issue = await lookup(token);
  // Requested, rejected and pending documents were never handed out, so they read as unknown.
  if (!issue || !issue.issuedAt || !["ISSUED", "REVOKED", "SUPERSEDED"].includes(issue.status)) return { kind: "unknown" };
  return {
    kind: "found",
    data: {
      serial: issue.serial, title: issue.title, school: issue.school.name, issuedOn: issue.issuedAt.toISOString().slice(0, 10),
      state: issue.status === "ISSUED" ? "VALID" : (issue.status as "REVOKED" | "SUPERSEDED"),
      ...(issue.status === "REVOKED" && issue.revokedAt ? { revokedOn: issue.revokedAt.toISOString().slice(0, 10) } : {}),
      ...(issue.status === "SUPERSEDED" && issue.successors[0] ? { replacedBy: issue.successors[0].serial } : {}),
    },
  };
}
