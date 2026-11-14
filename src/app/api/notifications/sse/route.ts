import { getAuthUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { resolveRedisUrl, warnRealtimeDisabledOnce } from "@/lib/queue/redis-config";
import { realtimeOffResponse } from "@/lib/queue/sse-fallback";
import { sharedSubscriber } from "@/lib/queue/shared-subscriber";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const redisUrl = resolveRedisUrl();
  if (!redisUrl) {
    // SKAI-1035 / SKAI-1952: realtime disabled. Nothing to stream; 204 stops EventSource for good, with no
    // database work. The page refreshes the unread count itself while the stream is closed.
    warnRealtimeDisabledOnce();
    return realtimeOffResponse();
  }

  const user = await getAuthUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = user.userId;
  // SKAI-1958: read the unread count before opening the stream. A staff member the tenant guard refuses (no campus
  // yet, SKAI-1895) gets the same 403 as /api/notifications, and EventSource stops reconnecting; an open stream that
  // never sends its first event would hold a function instance for nothing. Other failures keep the stream, without
  // the initial count.
  let unreadCount: number | null = null;
  try {
    unreadCount = await prisma.notification.count({ where: { userId, isRead: false } });
  } catch (error) {
    const status = (error as { status?: unknown })?.status;
    if (typeof status === "number" && status < 500) return errorResponse(error, "Notifications are not available");
    console.error("[SSE] unread count failed", error instanceof Error ? error.name : typeof error);
  }
  // SKAI-1878: this stream's slot on the instance-wide subscriber, not a Redis connection of its own.
  let release: (() => void) | null = null;
  let closed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(data: string) {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          cleanup();
        }
      }

      function cleanup() {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        closed = true;
        release?.();
        release = null;
        try {
          controller.close();
        } catch {}
      }

      send("retry: 5000\n\n");

      if (unreadCount !== null) send(`event: init\ndata: ${JSON.stringify({ unreadCount })}\n\n`);

      sharedSubscriber(redisUrl)
        .subscribe(`notif:${userId}`, (message: string) => {
          try {
            const parsed = JSON.parse(message);
            send(`id: ${parsed.id}\nevent: notification\ndata: ${message}\n\n`);
          } catch {
            send(`event: notification\ndata: ${message}\n\n`);
          }
        })
        .then((stop) => {
          if (closed) stop();
          else release = stop;
        })
        .catch((err) => {
          console.error("[SSE] Redis subscribe error:", err);
          cleanup();
        });

      heartbeatTimer = setInterval(() => {
        send(": keepalive\n\n");
      }, 30_000);

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
