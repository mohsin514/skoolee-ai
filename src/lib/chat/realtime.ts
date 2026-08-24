// ─────────────────────────────────────────────────────────────────
// Live delivery.
//
// Same shape as the notification stream already in this codebase: the server
// publishes to a per-user Redis channel and an SSE route subscribes to it.
// Redis rather than an in-process emitter because the app runs on more than
// one instance — an in-memory bus would deliver only to whichever instance
// happened to handle the send.
//
// Presence and typing are deliberately Redis-only, with a TTL and no database
// row. They are worth nothing thirty seconds later, and writing them to
// Postgres would mean a row per keystroke.
//
// EVERYTHING HERE IS OPTIONAL. Redis is a delivery accelerator, not a store:
// when it is unreachable, messages still send, threads still load, and the
// notification fallback still fires — only the live push is lost. That is why
// every call below is wrapped in a timeout rather than simply awaited. The
// shared client is built with `maxRetriesPerRequest: null` because BullMQ
// requires it, and that setting makes ioredis queue commands *forever* instead
// of rejecting them when the server is down — so an awaited `publish` against
// a missing Redis never settles and holds the request open until the platform
// kills it. A deployment with no REDIS_URL (the default falls back to
// localhost, which does not exist on a serverless host) would otherwise hang
// every send and every conversation list.
// ─────────────────────────────────────────────────────────────────
import { redis } from "@/lib/queue/connection";

export type ChatEventType =
  | "message"
  | "message-updated"
  | "conversation"
  | "read"
  | "typing"
  | "presence";

export interface ChatEvent {
  type: ChatEventType;
  conversationId?: string;
  payload: unknown;
}

/** Where a user's live events are published. */
export function chatChannel(userId: string) {
  return `chat:${userId}`;
}

const PRESENCE_KEY = (userId: string) => `chat:presence:${userId}`;

/**
 * How long a presence mark survives without a refresh. The SSE route
 * heartbeats every 30s, so 90s tolerates two missed beats before a user is
 * shown as away — better than flickering offline on a slow network.
 */
const PRESENCE_TTL_SECONDS = 90;

/**
 * Nothing live is worth making a user wait for. Long enough for a healthy
 * round trip, short enough that a dead Redis is invisible.
 */
const REDIS_TIMEOUT_MS = 1500;

/**
 * How long to stop calling Redis after it fails.
 *
 * Without this, a deployment with no Redis pays the full timeout on every
 * call — a single send costs one publish plus a presence lookup per recipient,
 * which measured over three seconds. The breaker turns the second and
 * subsequent calls into no-ops until it is worth trying again.
 */
const CIRCUIT_OPEN_MS = 30_000;

/** Timestamp until which Redis is presumed down. Module scope, so it is shared
 *  by every request this instance serves. */
let circuitOpenUntil = 0;

/** Sentinel so a timeout is distinguishable from a legitimate falsy result. */
const TIMED_OUT = Symbol("redis-timeout");

/**
 * Resolves to `fallback` if the Redis command fails or does not settle in
 * time, and trips a breaker so the next calls skip Redis entirely.
 * Never throws.
 */
async function settle<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  if (Date.now() < circuitOpenUntil) return fallback;

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      work(),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), REDIS_TIMEOUT_MS);
      }),
    ]);

    if (result === TIMED_OUT) {
      circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
      return fallback;
    }

    // A success closes the breaker again.
    circuitOpenUntil = 0;
    return result as T;
  } catch {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}


/**
 * Fans an event out to a set of users.
 *
 * Deliberately not awaited internally: by the time this runs the message is
 * already committed and the response can go back. A dropped live update is
 * cosmetic — the recipient still sees the message on their next load, and the
 * notification fallback still reaches them.
 */
export async function publishToUsers(userIds: string[], event: ChatEvent): Promise<void> {
  if (userIds.length === 0) return;

  const body = JSON.stringify(event);

  await Promise.all(
    userIds.map((id) =>
      settle(() => redis.publish(chatChannel(id), body).then(() => undefined), undefined)
    )
  );
}

/** Marks a user online. Called when their stream opens and on every heartbeat. */
export async function markPresent(userId: string): Promise<void> {
  await settle(
    () => redis.set(PRESENCE_KEY(userId), "1", "EX", PRESENCE_TTL_SECONDS).then(() => undefined),
    undefined
  );
}

/** Clears presence when a stream closes, rather than waiting out the TTL. */
export async function clearPresence(userId: string): Promise<void> {
  await settle(() => redis.del(PRESENCE_KEY(userId)).then(() => undefined), undefined);
}

/**
 * Which of these users currently have a live stream open.
 *
 * An empty set is the safe answer when Redis is unavailable: everyone shows as
 * offline, and the send path falls back to a notification for all of them.
 */
export async function whoIsOnline(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const values = await settle<(string | null)[] | null>(
    () => redis.mget(userIds.map(PRESENCE_KEY)),
    null
  );
  if (!values) return new Set();

  const online = new Set<string>();
  userIds.forEach((id, i) => {
    if (values[i]) online.add(id);
  });
  return online;
}

/** True when the user has no stream open — the cue to fall back to a
 *  notification so the message is not silently missed. */
export async function isOffline(userId: string): Promise<boolean> {
  const online = await whoIsOnline([userId]);
  return !online.has(userId);
}
