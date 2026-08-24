// ─────────────────────────────────────────────────────────────────
// Live delivery.
//
// Same shape as the notification stream already in this codebase: the server
// publishes to a per-user Redis channel and an SSE route subscribes to it.
// Redis rather than an in-process emitter because the app runs on more than
// one Node instance — an in-memory bus would deliver only to whichever
// instance happened to handle the send.
//
// Presence and typing are deliberately Redis-only, with a TTL and no database
// row. They are worth nothing thirty seconds later, and writing them to
// Postgres would mean a row per keystroke.
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

/** Fan an event out to a set of users. Failures are logged, never thrown: a
 *  dropped live update is a cosmetic problem, and the message is already
 *  committed by the time this runs. */
export async function publishToUsers(userIds: string[], event: ChatEvent): Promise<void> {
  if (userIds.length === 0) return;

  const body = JSON.stringify(event);
  await Promise.all(
    userIds.map((id) =>
      redis.publish(chatChannel(id), body).catch((err) => {
        console.error(`[chat] publish to ${id} failed:`, err);
      })
    )
  );
}

/** Marks a user online. Called when their stream opens and on every heartbeat. */
export async function markPresent(userId: string): Promise<void> {
  try {
    await redis.set(PRESENCE_KEY(userId), "1", "EX", PRESENCE_TTL_SECONDS);
  } catch {
    // Presence is decoration; never let it break the stream.
  }
}

/** Clears presence when a stream closes, rather than waiting out the TTL. */
export async function clearPresence(userId: string): Promise<void> {
  try {
    await redis.del(PRESENCE_KEY(userId));
  } catch {}
}

/** Which of these users currently have a live stream open. */
export async function whoIsOnline(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  try {
    const values = await redis.mget(userIds.map(PRESENCE_KEY));
    const online = new Set<string>();
    userIds.forEach((id, i) => {
      if (values[i]) online.add(id);
    });
    return online;
  } catch {
    return new Set();
  }
}

/** True when the user has no stream open — the cue to fall back to a
 *  notification so the message is not silently missed. */
export async function isOffline(userId: string): Promise<boolean> {
  const online = await whoIsOnline([userId]);
  return !online.has(userId);
}
