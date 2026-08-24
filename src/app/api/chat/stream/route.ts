import IORedis from "ioredis";
import { getAuthUser } from "@/lib/auth";
import { chatChannel, clearPresence, markPresent } from "@/lib/chat/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The live message stream.
 *
 * Deliberately the same shape as /api/notifications/sse — a dedicated Redis
 * subscriber per connection, a keepalive comment every 30s so proxies do not
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
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  let subscriber: IORedis | null = null;
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
        if (subscriber) {
          subscriber.unsubscribe().catch(() => {});
          subscriber.quit().catch(() => {});
          subscriber = null;
        }
        clearPresence(userId).catch(() => {});
        try {
          controller.close();
        } catch {}
      }

      send("retry: 5000\n\n");
      send(`event: ready\ndata: ${JSON.stringify({ userId })}\n\n`);

      markPresent(userId).catch(() => {});

      subscriber = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      });

      subscriber
        .connect()
        .then(() => subscriber!.subscribe(chatChannel(userId)))
        .catch((err) => {
          console.error("[chat/sse] subscribe failed:", err);
          cleanup();
        });

      subscriber.on("message", (_channel: string, message: string) => {
        send(`event: chat\ndata: ${message}\n\n`);
      });

      subscriber.on("error", (err) => {
        console.error("[chat/sse] redis error:", err);
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
