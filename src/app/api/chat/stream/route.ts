import { getAuthUser } from "@/lib/auth";
import { chatChannel, clearPresence, markPresent } from "@/lib/chat/realtime";
import { resolveRedisUrl, warnRealtimeDisabledOnce } from "@/lib/queue/redis-config";
import { realtimeDisabledResponse } from "@/lib/queue/sse-fallback";
import { sharedSubscriber } from "@/lib/queue/shared-subscriber";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The live message stream.
 *
 * Deliberately the same shape as /api/notifications/sse — a channel on the
 * instance-wide Redis subscriber (SKAI-1878), a keepalive comment every 30s so proxies do not
 * reap an idle stream, and cleanup bound to the request's abort signal.
 * Server-sent events rather than a WebSocket because the traffic is one-way
 * (sends go over ordinary POSTs) and SSE reconnects on its own.
 *
 * Holding the connection open is also what marks the user present, which is
 * what tells the send path whether to fall back to a notification.
 */
export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // The platform owner sits outside school messaging, so there is nothing to
  // stream them — and no presence mark to set, which is what the send path
  // consults to decide between a live push and a notification.
  if (user.role === "APP_OWNER") return new Response("Forbidden", { status: 403 });

  const userId = user.userId;
  const redisUrl = resolveRedisUrl();
  if (!redisUrl) {
    // SKAI-1035: realtime disabled. Tell the client and close; threads still
    // load and sends still work over ordinary requests.
    warnRealtimeDisabledOnce();
    return realtimeDisabledResponse([`event: ready\ndata: ${JSON.stringify({ userId, realtime: false })}\n\n`]);
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
        clearPresence(userId).catch(() => {});
        try {
          controller.close();
        } catch {}
      }

      send("retry: 5000\n\n");
      send(`event: ready\ndata: ${JSON.stringify({ userId })}\n\n`);

      markPresent(userId).catch(() => {});

      sharedSubscriber(redisUrl)
        .subscribe(chatChannel(userId), (message: string) => {
          send(`event: chat\ndata: ${message}\n\n`);
        })
        .then((stop) => {
          if (closed) stop();
          else release = stop;
        })
        .catch((err) => {
          console.error("[chat/sse] subscribe failed:", err);
          cleanup();
        });

      // Doubles as the presence refresh: while the stream is alive the user is
      // online, and the key expires shortly after it is not.
      heartbeatTimer = setInterval(() => {
        markPresent(userId).catch(() => {});
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
