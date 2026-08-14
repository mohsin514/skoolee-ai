/**
 * Turning a thrown value into something safe to show a user.
 *
 * Most `toast.error(error.message)` call sites are fine: the message came from
 * an API route via `errorResponse`, which only ever returns a deliberate,
 * human-readable string. The dangerous ones are the call sites that surface a
 * *server action* or a raw Prisma failure, where `error.message` is an
 * engine-generated blob — it carries the failing query, absolute paths from the
 * developer's machine (`/Users/.../.next/dev/server/chunks/...`) and the
 * database hostname. That went straight into a toast when the database dropped.
 *
 * `userMessage` keeps short, sentence-like messages (the intentional ones) and
 * replaces anything that looks machine-generated with a plain fallback, logging
 * the original so it is still debuggable.
 */

/** Markers that identify an engine/stack blob rather than an authored message. */
const INTERNAL_MARKERS = [
  "Invalid `",
  "prisma.",
  "PrismaClient",
  "__TURBOPACK__",
  "node_modules",
  ".next/",
  "\n    at ",
  "invocation in",
  "Raw query failed",
  "Can't reach database server",
];

const MAX_USER_MESSAGE_LENGTH = 200;

export function userMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  const looksInternal =
    !raw ||
    raw.length > MAX_USER_MESSAGE_LENGTH ||
    raw.includes("\n") ||
    INTERNAL_MARKERS.some((marker) => raw.includes(marker));

  if (looksInternal) {
    // Keep the real thing where an engineer can find it.
    console.error("[userMessage] suppressed internal error:", error);
    return fallback;
  }

  return raw;
}
