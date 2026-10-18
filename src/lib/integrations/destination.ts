import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// SKO-445: outbound webhook destinations. HTTPS only (plain HTTP only for explicitly allowed test hosts), no
// credentials in the URL, and every resolved address must be public — checked again at each delivery, so a DNS
// change to an internal address is caught. Redirects are never followed.

const v4Private = (ip: string) => {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
};
const v6Private = (ip: string) => {
  const x = ip.toLowerCase();
  if (x === "::" || x === "::1") return true;
  if (x.startsWith("::ffff:")) return v4Private(x.slice(7));
  return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");
};
export const isPrivateAddress = (ip: string) => (isIP(ip) === 6 ? v6Private(ip) : v4Private(ip));

/** Hosts the isolated test environment may deliver to over plain HTTP (never set in production). */
const allowed = () => process.env.NODE_ENV === "production" ? [] : (process.env.INTEGRATION_TEST_ALLOWED_HOSTS ?? "").split(",").map(s => s.trim()).filter(Boolean);

export type Check = { ok: true; url: URL; address: string } | { ok: false; reason: string };

export function validateShape(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: "Enter a full URL, for example https://example.org/hooks/skoolee." }; }
  if (url.username || url.password) return { ok: false, reason: "Do not put credentials in the webhook URL." };
  const testHost = allowed().includes(url.host);
  if (url.protocol !== "https:" && !(testHost && url.protocol === "http:")) return { ok: false, reason: "Webhook destinations must use HTTPS." };
  if (url.hash) return { ok: false, reason: "Remove the # fragment from the webhook URL." };
  return { ok: true, url };
}

/** Resolves now and refuses internal, loopback, link-local and metadata addresses. */
export async function checkDestination(raw: string): Promise<Check> {
  const shape = validateShape(raw);
  if (!shape.ok) return shape;
  const host = shape.url.hostname.replace(/^\[|\]$/g, "");
  const testHost = allowed().includes(shape.url.host);
  let addresses: string[];
  try { addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map(a => a.address); }
  catch { return { ok: false, reason: `The destination host ${host} could not be resolved.` }; }
  if (!addresses.length) return { ok: false, reason: `The destination host ${host} has no address.` };
  if (!testHost) for (const a of addresses) if (isPrivateAddress(a)) return { ok: false, reason: `The destination resolves to an internal or private address (${a}). Use a public endpoint.` };
  return { ok: true, url: shape.url, address: addresses[0] };
}
