import { createHash, timingSafeEqual } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";

// SKO-449: Safe Exam Browser admission. SEB sends, per request,
//   X-SafeExamBrowser-RequestHash   = SHA-256(absolute URL without fragment + Browser Exam Key)
//   X-SafeExamBrowser-ConfigKeyHash = SHA-256(absolute URL without fragment + Config Key)
// The server compares these with the keys of the pinned, tested profile. A user agent or a
// fullscreen signal proves nothing and is never consulted. This is configuration verification,
// not hardware attestation, and it does not control other devices or the room.

export const SEB_REQUEST_HASH = "x-safeexambrowser-requesthash";
export const SEB_CONFIG_HASH = "x-safeexambrowser-configkeyhash";

export type SebEvidence = { url: string; requestHash: string | null; configKeyHash: string | null };
export type SebDecision = { admitted: true } | { admitted: false; reason: "MISSING_HEADERS" | "CONFIG_MISMATCH" | "CLIENT_MISMATCH" | "NO_EVIDENCE" };

const hex = /^[0-9a-f]{64}$/;
export const sebHash = (url: string, key: string) => createHash("sha256").update(url.split("#")[0] + key).digest("hex");
const matches = (presented: string | null, url: string, keys: string[]) => {
  if (!presented || !hex.test(presented.toLowerCase())) return false;
  const actual = Buffer.from(presented.toLowerCase(), "hex");
  // Compare against every key without short-circuiting on the first match.
  let found = false;
  for (const key of keys) { const expected = Buffer.from(sebHash(url, key), "hex"); if (timingSafeEqual(actual, expected)) found = true; }
  return found;
};

/** Every key list the profile names must be satisfied; a profile with no keys admits nobody. */
export function verifySeb(evidence: SebEvidence | null, profile: { configKeys: string[]; browserExamKeys: string[] }): SebDecision {
  if (!evidence) return { admitted: false, reason: "NO_EVIDENCE" };
  if (!evidence.requestHash && !evidence.configKeyHash) return { admitted: false, reason: "MISSING_HEADERS" };
  if (!profile.configKeys.length && !profile.browserExamKeys.length) return { admitted: false, reason: "CONFIG_MISMATCH" };
  if (profile.configKeys.length && !matches(evidence.configKeyHash, evidence.url, profile.configKeys)) return { admitted: false, reason: "CONFIG_MISMATCH" };
  if (profile.browserExamKeys.length && !matches(evidence.requestHash, evidence.url, profile.browserExamKeys)) return { admitted: false, reason: "CLIENT_MISMATCH" };
  return { admitted: true };
}

/** Builds the evidence from a request. SEB hashes the URL it requested; behind a proxy set SEB_PUBLIC_ORIGIN. */
export function sebEvidenceFrom(request: Request): SebEvidence {
  const url = new URL(request.url);
  const publicOrigin = process.env.SEB_PUBLIC_ORIGIN;
  const absolute = publicOrigin ? `${publicOrigin.replace(/\/$/, "")}${url.pathname}${url.search}` : `${url.origin}${url.pathname}${url.search}`;
  return { url: absolute, requestHash: request.headers.get(SEB_REQUEST_HASH), configKeyHash: request.headers.get(SEB_CONFIG_HASH) };
}

const store = new AsyncLocalStorage<SebEvidence>();
/** Route handlers run exam services inside the request's SEB evidence. */
export function withSebEvidence<T>(request: Request, fn: () => Promise<T>) { return store.run(sebEvidenceFrom(request), fn); }
export function runWithSebEvidence<T>(evidence: SebEvidence, fn: () => Promise<T>) { return store.run(evidence, fn); }
export const currentSebEvidence = () => store.getStore() ?? null;

// ─── Profiles ─────────────────────────────────────────────────────
const key = z.string().trim().regex(/^[0-9a-fA-F]{64}$/, "Keys are the 64-character hex values shown by the SEB Config Tool.").transform(value => value.toLowerCase());
export const testedDeviceSchema = z.object({
  platform: z.enum(["WINDOWS", "MACOS", "IPADOS"]), clientVersion: z.string().trim().min(1).max(40),
  testedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), result: z.enum(["PASS", "FAIL"]),
  assistiveTools: z.array(z.string().trim().min(1).max(80)).max(10).default([]), notes: z.string().trim().max(300).default(""),
}).strict();
export const profileInput = z.object({
  profileKey: z.string().trim().min(1).max(80).optional(), name: z.string().trim().min(3).max(120), minClientVersion: z.string().trim().regex(/^\d+(\.\d+){0,3}$/),
  configKeys: z.array(key).max(10), browserExamKeys: z.array(key).max(20),
  allowedResources: z.array(z.string().trim().url().refine(value => value.startsWith("https://"), "Allowed resources must be https links.")).max(20),
  testedDevices: z.array(testedDeviceSchema).max(30), expectedVersion: z.number().int().min(0),
}).strict();
export type ProfileInput = z.infer<typeof profileInput>;

/** Approval needs a key to verify and a passing real-device test within the last 180 days. */
export function approvalIssues(profile: { configKeys: string[]; browserExamKeys: string[]; testedDevices: unknown }, now: Date): string[] {
  const issues: string[] = [];
  if (!profile.configKeys.length && !profile.browserExamKeys.length) issues.push("Add the Config Key or Browser Exam Key reported by the tested client.");
  const devices = z.array(testedDeviceSchema).safeParse(profile.testedDevices);
  const recent = devices.success ? devices.data.filter(device => device.result === "PASS" && now.getTime() - new Date(`${device.testedOn}T00:00:00Z`).getTime() <= 180 * 86_400_000) : [];
  if (!recent.length) issues.push("Record at least one passing test on a real device within the last 180 days.");
  return issues;
}

const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/**
 * A starting SEB configuration (unencrypted XML plist): start URL, quit URL and an allow-list of
 * resources. Load it in the SEB Config Tool, test it on the target devices, then record the key the
 * tool reports in the profile; the server only trusts recorded keys.
 */
export function sebConfig(input: { startUrl: string; quitUrl: string; allowedResources: string[] }) {
  const origin = new URL(input.startUrl).origin;
  const rules = [origin, ...input.allowedResources].map(url => `<dict><key>action</key><integer>1</integer><key>active</key><true/><key>expression</key><string>${xml(url)}*</string><key>regex</key><false/></dict>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>startURL</key><string>${xml(input.startUrl)}</string>
<key>quitURL</key><string>${xml(input.quitUrl)}</string>
<key>sendBrowserExamKey</key><true/>
<key>URLFilterEnable</key><true/>
<key>URLFilterEnableContentFilter</key><false/>
<key>URLFilterRules</key><array>${rules}</array>
<key>allowQuit</key><true/>
<key>browserWindowAllowReload</key><true/>
</dict></plist>
`;
}
