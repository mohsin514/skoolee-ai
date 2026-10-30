/**
 * Parent portal links (`/parent?token=…`) are retired (spec D14, §6.3).
 *
 * The parent layout already requires a signed-in session (`requirePageSession`),
 * so a token-only guardian could never open the portal. Minting a token only
 * handed a 30-day bearer credential to nobody, so the endpoint now answers
 * 410 Gone. Guardians reach the portal by accepting their invitation and
 * signing in; the office links guardians from Guardians & access.
 */
const GONE = {
  success: false,
  code: "PARENT_PORTAL_LINKS_RETIRED",
  error: "Portal links are no longer issued. Invite the guardian from Guardians & access so they can sign in.",
} as const;

function gone() {
  return Response.json(GONE, { status: 410, headers: { "Cache-Control": "no-store" } });
}

export const GET = gone;
export const POST = gone;
