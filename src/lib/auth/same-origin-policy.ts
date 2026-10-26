const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function requestHasSameOrigin(request: Request, development = process.env.NODE_ENV === "development"): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const target = new URL(request.url);
    if (origin === target.origin) return true;
    const source = new URL(origin);
    // NextURL canonicalizes loopback IPs to localhost. In development only, recover
    // the actual request host; do not widen production origins or trust forwarded headers.
    return development && origin === source.origin && loopback.has(target.hostname) && loopback.has(source.hostname)
      && source.protocol === target.protocol && source.port === target.port
      && request.headers.get("host") === source.host;
  } catch { return false; }
}
