import { NextRequest } from "next/server";
import { GET as authSession } from "../auth/session/route";
import { GET as authWelcome } from "../auth/welcome/route";
import { GET as authTour } from "../auth/tour/route";
import { GET as profile } from "../profile/route";
import { GET as notifications } from "../notifications/route";
import { GET as chatUnread } from "../chat/unread/route";
import { GET as chatConversations } from "../chat/conversations/route";
import { GET as navigationAccess } from "../navigation/access/route";
import { GET as navigationCounts } from "../navigation/counts/route";
import { GET as academicCycle } from "../academic-cycle/route";
import { GET as aiQuestionnaire } from "../ai-workflows/questionnaire/route";
import { SHELL_BATCH_MAX, SHELL_BATCH_PATHS } from "@/lib/network/shell-batch-paths";

/**
 * SKAI-1949: the workspace shell's read requests, answered in ONE function invocation.
 *
 * Opening any page fired ~10 separate GETs for the shared shell (session, profile, menu, badges, notifications, chat
 * unread, tour…). On Vercel each one runs as its own function and, under load, its own instance — and every instance
 * needs its own connection to the Supabase pooler, whose 200 client slots ran out at ~300 users (SKAI-1948) while
 * Postgres sat idle. The browser's fetch interceptor now groups these GETs into one call here.
 *
 * Every path is answered by the SAME route handler as before, with the same request headers and cookies, so each
 * response is byte-for-byte what that route returns on its own and each handler applies its own authorization. Only
 * the paths below are accepted. This route sits behind the proxy like any API: when the proxy would refuse the batch
 * (signed out, forced password change, suspended school, exam lockdown), the browser falls back to individual
 * requests, so every per-path proxy rule still applies.
 */
type Handler = (request: NextRequest) => Promise<Response> | Response;

const HANDLERS: Record<string, Handler> = {
  "/api/auth/session": () => authSession(),
  "/api/auth/welcome": () => authWelcome(),
  "/api/auth/tour": (request) => authTour(request),
  "/api/profile": () => profile(),
  "/api/notifications": (request) => notifications(request),
  "/api/chat/unread": () => chatUnread(),
  "/api/chat/conversations": (request) => chatConversations(request),
  "/api/navigation/access": () => navigationAccess(),
  "/api/navigation/counts": () => navigationCounts(),
  "/api/academic-cycle": (request) => academicCycle(request),
  "/api/ai-workflows/questionnaire": () => aiQuestionnaire(),
};

/** Response headers worth carrying back to the caller. */
const KEPT_HEADERS = ["content-type", "cache-control", "retry-after", "x-db-unavailable", "x-request-id"];

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const paths = request.nextUrl.searchParams.getAll("p");
  if (paths.length === 0 || paths.length > SHELL_BATCH_MAX) {
    return Response.json({ error: "Between 1 and 16 paths." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  const targets = paths.map((raw) => {
    let url: URL;
    try { url = new URL(raw, request.nextUrl.origin); } catch { return null; }
    if (url.origin !== request.nextUrl.origin) return null;
    const handler = SHELL_BATCH_PATHS.includes(url.pathname) ? HANDLERS[url.pathname] : undefined;
    return handler ? { url, handler } : null;
  });
  if (targets.some((t) => t === null)) {
    return Response.json({ error: "A path is not batchable." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const results = await Promise.all(targets.map(async (target) => {
    const { url, handler } = target!;
    try {
      const response = await handler(new NextRequest(url, { headers: request.headers }));
      const headers: Record<string, string> = {};
      for (const name of KEPT_HEADERS) {
        const value = response.headers.get(name);
        if (value !== null) headers[name] = value;
      }
      return { s: response.status, h: headers, b: await response.text() };
    } catch (error) {
      console.error("[api/shell] handler failed", { path: url.pathname, error: error instanceof Error ? error.name : typeof error });
      return { s: 500, h: { "content-type": "application/json" }, b: JSON.stringify({ error: "Request failed" }) };
    }
  }));

  return Response.json({ r: results }, { headers: { "Cache-Control": "private, no-store" } });
}
