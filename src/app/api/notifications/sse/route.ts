import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import IORedis from "ioredis";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

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
        try {
          controller.close();
        } catch {}
      }

      send("retry: 5000\n\n");

      prisma.notification
        .count({ where: { userId, isRead: false } })
        .then((count) => {
          send(`event: init\ndata: ${JSON.stringify({ unreadCount: count })}\n\n`);
        })
        .catch(() => {});

      subscriber = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      });

      subscriber
        .connect()
        .then(() => subscriber!.subscribe(`notif:${userId}`))
        .catch((err) => {
          console.error("[SSE] Redis subscribe error:", err);
          cleanup();
        });

      subscriber.on("message", (_channel: string, message: string) => {
        try {
          const parsed = JSON.parse(message);
          send(`id: ${parsed.id}\nevent: notification\ndata: ${message}\n\n`);
        } catch {
          send(`event: notification\ndata: ${message}\n\n`);
        }
      });

      subscriber.on("error", (err) => {
        console.error("[SSE] Redis error:", err);
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
