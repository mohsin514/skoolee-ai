// SKAI-2013: a default Cache-Control for API responses.
//
// Page responses get Next's dynamic-page no-store; route handlers get nothing unless each one opts in, so tenant data
// and PII (rosters, staff emails and phones) could sit in a browser disk cache or an intermediary. The proxy stamps
// this default on /api responses instead of every route repeating it.
//
// Next copies the proxy's response headers onto the outgoing response BEFORE the route's own, and then skips any route
// header that is already present (send-response.js). So a proxy default would silently replace a route's deliberate
// policy. The routes below own a different policy and are left alone; every other route that sets its own value today
// already sets a no-store variant, so the default changes nothing for them.

export const API_DEFAULT_CACHE_CONTROL = "private, no-store";

const OWN_CACHE_POLICY = [
  "/api/public", // Unauthenticated platform reads; /api/public/v1/contract is deliberately `public, max-age=300`.
  "/api/media", // Logos are `public, max-age=86400`; a school's own profile images are `private, max-age=3600`.
  "/api/chat/stream", // Event streams need `no-transform` so intermediaries do not buffer them.
  "/api/notifications/sse",
  "/api/school-ai/generate-paper/stream",
];

/** The Cache-Control the proxy should add to this API path, or null when the route owns its policy (or it is not an API path). */
export function defaultApiCacheControl(pathname: string): string | null {
  if (pathname !== "/api" && !pathname.startsWith("/api/")) return null;
  if (OWN_CACHE_POLICY.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"))) return null;
  return API_DEFAULT_CACHE_CONTROL;
}
