// ─────────────────────────────────────────────────────────────────
// SKAI-1878: one Redis subscriber connection per server instance.
//
// The chat stream and the notification stream used to open a dedicated IORedis
// connection for every open tab, so the Redis client count grew with tabs (two
// per tab). A subscriber connection can listen on many channels at once, so the
// streams now share one: each channel is SUBSCRIBEd while at least one stream on
// this instance listens to it, and UNSUBSCRIBEd when the last one leaves.
// Messages are dispatched in process by channel name, so a stream only ever sees
// the channel it asked for (chat:<its user>, notif:<its user>).
// ─────────────────────────────────────────────────────────────────
import IORedis from "ioredis";

type Listener = (message: string) => void;

/** The slice of an IORedis client the hub uses (a fake in tests). */
export interface SubscriberClient {
  connect(): Promise<unknown>;
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  disconnect(): void;
  on(event: "message", handler: (channel: string, message: string) => void): unknown;
  on(event: "error", handler: (err: Error) => void): unknown;
}

export interface SubscriberHub {
  /** Starts delivering `channel` to `listener`. Resolves to an idempotent release; rejects if Redis cannot be reached. */
  subscribe(channel: string, listener: Listener): Promise<() => void>;
  /** Channels currently subscribed on the shared connection. */
  channelCount(): number;
}

export function createSubscriberHub(factory: () => SubscriberClient): SubscriberHub {
  const listeners = new Map<string, Set<Listener>>();
  const ready = new Map<string, Promise<unknown>>();
  let client: SubscriberClient | null = null;
  let connecting: Promise<unknown> | null = null;

  function connection(): { current: SubscriberClient; connected: Promise<unknown> } {
    if (!client || !connecting) {
      const current = factory();
      current.on("message", (channel, message) => {
        for (const listener of [...(listeners.get(channel) ?? [])]) {
          try {
            listener(message);
          } catch {}
        }
      });
      current.on("error", (err) => console.error("[realtime] shared subscriber error:", err?.message || err));
      client = current;
      // A failed first connect drops the client so the next stream tries again (the browser retries in 5s).
      connecting = current.connect().catch((err) => {
        if (client === current) {
          client = null;
          connecting = null;
          current.disconnect();
        }
        throw err;
      });
    }
    return { current: client, connected: connecting };
  }

  function release(channel: string, listener: Listener) {
    const set = listeners.get(channel);
    if (!set?.delete(listener) || set.size > 0) return;
    listeners.delete(channel);
    ready.delete(channel);
    client?.unsubscribe(channel).catch(() => {});
  }

  return {
    async subscribe(channel, listener) {
      const { current, connected } = connection();
      let set = listeners.get(channel);
      if (!set) listeners.set(channel, (set = new Set()));
      set.add(listener);
      let subscribed = ready.get(channel);
      if (!subscribed) {
        subscribed = connected.then(() => current.subscribe(channel));
        ready.set(channel, subscribed);
        subscribed.catch(() => {
          if (ready.get(channel) === subscribed) ready.delete(channel);
        });
      }
      try {
        await subscribed;
      } catch (err) {
        release(channel, listener);
        throw err;
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        release(channel, listener);
      };
    },
    channelCount: () => listeners.size,
  };
}

const globalForHub = globalThis as unknown as { skooleeSubscriberHub?: SubscriberHub };

/** The instance-wide hub, created on first use. Kept on globalThis so dev hot reloads do not leak connections. */
export function sharedSubscriber(redisUrl: string): SubscriberHub {
  globalForHub.skooleeSubscriberHub ??= createSubscriberHub(
    () => new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false, lazyConnect: true })
  );
  return globalForHub.skooleeSubscriberHub;
}
