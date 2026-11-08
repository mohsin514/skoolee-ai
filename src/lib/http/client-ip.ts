// SKO-457: one rule for which client address rate limits and audit rows may trust.
//
// x-forwarded-for is a list the client can start, so only the entries added by a proxy we
// control are trustworthy. On Vercel (our deployment, see vercel.json) the platform overwrites
// x-forwarded-for / x-real-ip and sets x-vercel-forwarded-for, so those are authoritative.
// Elsewhere, TRUSTED_PROXY_HOPS says how many proxies we run in front of the app: the client is
// the entry that many places from the right. Without either, a production server trusts no
// header and every caller shares one bucket — fail closed rather than let a header pick its own.

type HeaderSource = { get(name: string): string | null };

const first = (value: string | null) => value?.split(",")[0]?.trim() || null;

export function clientIp(headers: HeaderSource, env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL) {
    return first(headers.get("x-vercel-forwarded-for")) || first(headers.get("x-real-ip")) || first(headers.get("x-forwarded-for")) || "unknown";
  }
  const hops = Number.parseInt(env.TRUSTED_PROXY_HOPS ?? "", 10);
  if (Number.isInteger(hops) && hops > 0) {
    const chain = (headers.get("x-forwarded-for") ?? "").split(",").map(part => part.trim()).filter(Boolean);
    return chain.length >= hops ? chain[chain.length - hops] : "unknown";
  }
  if (env.NODE_ENV !== "production") return first(headers.get("x-forwarded-for")) || first(headers.get("x-real-ip")) || "local";
  return "untrusted-proxy";
}
