// ─────────────────────────────────────────────────────────────────
// Connectivity probe.
//
// Deliberately does no database, auth or session work: this endpoint
// answers exactly one question — "can this browser reach the server?".
// Anything heavier would make a slow database look like a dead network.
//
// It lives under /api/public/* because proxy.ts early-exits that prefix
// before any JWT check, so an expired session can never be mistaken for
// lost connectivity.
// ─────────────────────────────────────────────────────────────────

// Never prerender or cache: a cached 200 would report "online" from disk
// while the network is actually down.
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
} as const;

export async function GET() {
  return Response.json({ ok: true, t: Date.now() }, { headers: NO_STORE });
}

// The client probes with HEAD — same round trip, no response body.
export async function HEAD() {
  return new Response(null, { status: 200, headers: NO_STORE });
}
