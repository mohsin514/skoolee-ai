import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { ApiError } from "@/lib/api/scope";
import { isCampusOperator, isInstitutionAuthority } from "@/lib/auth/institution";
import { protectSecret, revealSecret } from "@/lib/auth/mfa-crypto";
import { CONTRACTS, V1 } from "./contract";
import { checkDestination, validateShape } from "./destination";
import { Agent } from "undici";
import { isIP } from "node:net";

// SKO-445: scoped service connections, the public v1 contract and signed outbound webhooks.
// - A connection names its campuses and scopes; its key never carries the creator's own privileges. Keys are
//   shown once, stored as a hash, rotated with an overlap window and revoked at once. The signing secret is
//   encrypted at rest and also shown once; rotation signs with both during the overlap.
// - Every public request is authenticated, rate-limited per connection and per school, and every resource id is
//   resolved inside the connection's school and campuses — out of scope looks exactly like "not found".
// - Events have a stable id. Deliveries retry with backoff, honour Retry-After, re-check the destination before
//   every attempt (DNS changes included), never follow redirects and end FAILED after the last attempt. Replay
//   resets the same delivery with the same event id. Operators see redacted payloads.

export const SCOPES = ["roster.read", "roster.write"] as const;
export const TOPICS = Object.keys(V1.topics);
const MAX_ATTEMPTS = 6, REPLAY_WINDOW_DAYS = 7, SCHOOL_RATE_PER_MINUTE = 600;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const list = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(String))] : [];

// §7.3 G15: connections, keys, signing secrets and replays are institution-authority work (a principal can no
// longer rotate keys). A campus operator may read the delivery log of connections that cover only their campus.
function admin(user: AuthUser) {
  if (!isInstitutionAuthority(user)) throw new ApiError("Only the institution administrator manages integrations.", 403);
}
function reader(user: AuthUser) {
  if (!isInstitutionAuthority(user) && !isCampusOperator(user)) throw new ApiError("Integration access is required.", 403);
}
const ownCampuses = (user: AuthUser, ids: string[]) => isInstitutionAuthority(user) || ids.every(id => id === user.campusId);

// ─── Connections and credentials (administrators) ────────────────────────

function newKey() {
  const keyId = `skc_${randomBytes(6).toString("hex")}`, secret = randomBytes(24).toString("base64url");
  return { keyId, secret, token: `${keyId}.${secret}`, secretHash: sha(secret) };
}
const newSigningSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

export async function createConnection(user: AuthUser, body: Record<string, unknown>) {
  admin(user);
  const name = text(body.name, 120);
  if (name.length < 3) throw new ApiError("Name the connection after the system it connects.", 400);
  const campusIds = list(body.campusIds), scopes = list(body.scopes), topics = list(body.topics);
  if (!campusIds.length) throw new ApiError("Choose at least one campus this connection may see.", 400);
  if (!ownCampuses(user, campusIds)) throw new ApiError("You can only connect your own campus.", 403);
  if ((await prisma.campus.count({ where: { schoolId: user.schoolId, id: { in: campusIds }, archivedAt: null } })) !== campusIds.length) throw new ApiError("Choose campuses in this school.", 400);
  if (!scopes.length || scopes.some(s => !SCOPES.includes(s as never))) throw new ApiError(`Choose scopes from: ${SCOPES.join(", ")}.`, 400);
  if (topics.some(t => !TOPICS.includes(t))) throw new ApiError(`Choose topics from: ${TOPICS.join(", ")}.`, 400);
  const webhookUrl = text(body.webhookUrl, 500) || null;
  if (webhookUrl) { const c = validateShape(webhookUrl); if (!c.ok) throw new ApiError(c.reason, 400); }
  if (topics.length && !webhookUrl) throw new ApiError("Add a webhook URL to receive events.", 400);
  const key = newKey(), signing = webhookUrl ? newSigningSecret() : null;
  const rate = Number(body.rateLimitPerMinute ?? 60), quota = Number(body.dailyQuota ?? 10000);
  if (!Number.isInteger(rate) || rate < 1 || rate > 6000 || !Number.isInteger(quota) || quota < 1 || quota > 10_000_000) throw new ApiError("Set a rate limit (1–6000 per minute) and a daily quota.", 400);
  const conn = await prisma.integrationConnection.create({ data: { schoolId: user.schoolId, name, campusIds, scopes, topics, webhookUrl, signingSecret: signing ? protectSecret(signing) : null, rateLimitPerMinute: rate, dailyQuota: quota, createdById: user.userId } });
  await prisma.integrationCredential.create({ data: { schoolId: user.schoolId, connectionId: conn.id, keyId: key.keyId, secretHash: key.secretHash, createdById: user.userId } });
  // Shown once: neither value can be read back.
  return { id: conn.id, apiKey: key.token, signingSecret: signing };
}

async function ownConnection(user: AuthUser, id: string, mode: "write" | "read" = "write") {
  if (mode === "write") admin(user); else reader(user);
  const c = await prisma.integrationConnection.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!c || !ownCampuses(user, c.campusIds)) throw new ApiError("Connection not found", 404);
  return c;
}

export async function rotateKey(user: AuthUser, body: Record<string, unknown>) {
  const c = await ownConnection(user, String(body.id ?? ""));
  if (c.status === "REVOKED") throw new ApiError("This connection is revoked.", 409);
  const overlap = Math.max(0, Math.min(1440, Number(body.overlapMinutes ?? 60)));
  const key = newKey(), until = new Date(Date.now() + overlap * 60_000);
  await prisma.$transaction([
    prisma.integrationCredential.updateMany({ where: { connectionId: c.id, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: until } }] }, data: overlap ? { expiresAt: until } : { status: "REVOKED", revokedAt: new Date() } }),
    prisma.integrationCredential.create({ data: { schoolId: user.schoolId, connectionId: c.id, keyId: key.keyId, secretHash: key.secretHash, createdById: user.userId } }),
  ]);
  return { id: c.id, apiKey: key.token, previousValidUntil: overlap ? until : null };
}

export async function rotateSigningSecret(user: AuthUser, body: Record<string, unknown>) {
  const c = await ownConnection(user, String(body.id ?? ""));
  if (!c.webhookUrl || !c.signingSecret) throw new ApiError("This connection has no webhook.", 409);
  const overlap = Math.max(0, Math.min(1440, Number(body.overlapMinutes ?? 60)));
  const secret = newSigningSecret();
  await prisma.integrationConnection.update({ where: { id: c.id }, data: { signingSecret: protectSecret(secret), previousSigningSecret: overlap ? c.signingSecret : null, previousSecretUntil: overlap ? new Date(Date.now() + overlap * 60_000) : null } });
  return { id: c.id, signingSecret: secret };
}

export async function revokeKey(user: AuthUser, body: Record<string, unknown>) {
  const c = await ownConnection(user, String(body.id ?? ""));
  const done = await prisma.integrationCredential.updateMany({ where: { connectionId: c.id, keyId: String(body.keyId ?? ""), status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
  if (!done.count) throw new ApiError("Key not found or already revoked", 404);
  return { id: c.id };
}

export async function setStatus(user: AuthUser, body: Record<string, unknown>) {
  const c = await ownConnection(user, String(body.id ?? ""));
  const status = String(body.status ?? "");
  if (!["ACTIVE", "PAUSED", "REVOKED"].includes(status)) throw new ApiError("Choose active, paused or revoked.", 400);
  if (c.status === "REVOKED") throw new ApiError("A revoked connection stays revoked. Create a new one.", 409);
  await prisma.$transaction([
    prisma.integrationConnection.update({ where: { id: c.id }, data: { status, ...(status === "REVOKED" ? { revokedAt: new Date() } : {}) } }),
    ...(status === "REVOKED" ? [prisma.integrationCredential.updateMany({ where: { connectionId: c.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } })] : []),
    // Paused or revoked connections hold their queue; resuming releases it.
    prisma.integrationDelivery.updateMany({ where: { connectionId: c.id, status: status === "ACTIVE" ? "PAUSED" : "PENDING" }, data: { status: status === "ACTIVE" ? "PENDING" : "PAUSED" } }),
  ]);
  return { id: c.id, status };
}

export async function updateWebhook(user: AuthUser, body: Record<string, unknown>) {
  const c = await ownConnection(user, String(body.id ?? ""));
  const webhookUrl = text(body.webhookUrl, 500);
  const shape = validateShape(webhookUrl);
  if (!shape.ok) throw new ApiError(shape.reason, 400);
  const topics = body.topics === undefined ? c.topics : list(body.topics);
  if (topics.some(t => !TOPICS.includes(t))) throw new ApiError(`Choose topics from: ${TOPICS.join(", ")}.`, 400);
  const signing = c.signingSecret ? null : newSigningSecret();
  await prisma.integrationConnection.update({ where: { id: c.id }, data: { webhookUrl, topics, ...(signing ? { signingSecret: protectSecret(signing) } : {}) } });
  return { id: c.id, signingSecret: signing };
}

/** Lists connections with recent delivery evidence. No key or secret ever appears. */
export async function connections(user: AuthUser) {
  reader(user);
  const rows = await prisma.integrationConnection.findMany({ where: { schoolId: user.schoolId }, orderBy: { createdAt: "desc" }, include: { credentials: { select: { keyId: true, status: true, expiresAt: true, lastUsedAt: true, createdAt: true }, orderBy: { createdAt: "desc" } } } });
  const visible = rows.filter(c => ownCampuses(user, c.campusIds));
  const since = new Date(Date.now() - 7 * 86_400_000);
  const stats = await prisma.integrationDelivery.groupBy({ by: ["connectionId", "status"], where: { schoolId: user.schoolId, connectionId: { in: visible.map(c => c.id) }, createdAt: { gte: since } }, _count: { _all: true } });
  const campuses = await prisma.campus.findMany({ where: { schoolId: user.schoolId, archivedAt: null }, select: { id: true, name: true } });
  return {
    campuses, scopes: SCOPES, topics: TOPICS, contract: { version: V1.version, status: V1.status },
    connections: visible.map(c => ({ id: c.id, name: c.name, campusIds: c.campusIds, scopes: c.scopes, topics: c.topics, contractVersion: c.contractVersion, status: c.status, webhookHost: c.webhookUrl ? new URL(c.webhookUrl).host : null, rateLimitPerMinute: c.rateLimitPerMinute, dailyQuota: c.dailyQuota, signingRotating: !!(c.previousSecretUntil && c.previousSecretUntil > new Date()), keys: c.credentials.map(k => ({ ...k, live: k.status === "ACTIVE" && (!k.expiresAt || k.expiresAt > new Date()) })), deliveries: Object.fromEntries(stats.filter(s => s.connectionId === c.id).map(s => [s.status, s._count._all])) })),
  };
}

const SENSITIVE = /secret|token|password|key|phone|email|cnic|nationalid|dob|birth|address/i;
function redact(value: unknown, revealNames: boolean): unknown {
  if (Array.isArray(value)) return value.map(v => redact(v, revealNames));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redacted]" : !revealNames && /name/i.test(k) && typeof v === "string" ? `${v.slice(0, 1)}…` : redact(v, revealNames)]));
  return value;
}

export async function deliveries(user: AuthUser, connectionId: string, status?: string | null) {
  const c = await ownConnection(user, connectionId, "read");
  const rows = await prisma.integrationDelivery.findMany({ where: { connectionId: c.id, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 100, include: { event: { select: { id: true, topic: true, occurredAt: true } } } });
  return rows.map(d => ({ id: d.id, eventId: d.eventId, topic: d.event.topic, occurredAt: d.event.occurredAt, status: d.status, attempts: d.attempts, lastStatusCode: d.lastStatusCode, lastError: d.lastError, deliveredAt: d.deliveredAt, replayCount: d.replayCount, nextAttemptAt: d.nextAttemptAt }));
}

/** One delivery with its attempt history and a redacted payload (names only for the institution authority). */
export async function deliveryDetail(user: AuthUser, id: string) {
  reader(user);
  const d = await prisma.integrationDelivery.findFirst({ where: { id, schoolId: user.schoolId }, include: { event: true, connection: true, attemptLog: { orderBy: { createdAt: "asc" } } } });
  if (!d || !ownCampuses(user, d.connection.campusIds)) throw new ApiError("Delivery not found", 404);
  const revealNames = isInstitutionAuthority(user);
  return { id: d.id, eventId: d.eventId, topic: d.event.topic, status: d.status, attempts: d.attempts, replayCount: d.replayCount, deliveredAt: d.deliveredAt, payload: redact(envelope(d.event), revealNames), attemptLog: d.attemptLog.map(a => ({ attempt: a.attempt, replay: a.replay, host: new URL(a.url).host, statusCode: a.statusCode, outcome: a.outcome, error: a.error, durationMs: a.durationMs, signedWith: a.signedWith, createdAt: a.createdAt })) };
}

/** Replays one delivery with the same event id, within the replay window. */
export async function replay(user: AuthUser, id: string) {
  admin(user);
  const d = await prisma.integrationDelivery.findFirst({ where: { id, schoolId: user.schoolId }, include: { event: { select: { createdAt: true } }, connection: { select: { campusIds: true, status: true } } } });
  if (!d || !ownCampuses(user, d.connection.campusIds)) throw new ApiError("Delivery not found", 404);
  if (d.connection.status !== "ACTIVE") throw new ApiError("Resume the connection before replaying.", 409);
  if (d.event.createdAt.getTime() < Date.now() - REPLAY_WINDOW_DAYS * 86_400_000) throw new ApiError(`Events older than ${REPLAY_WINDOW_DAYS} days cannot be replayed; reconcile from the API instead.`, 409);
  if (d.status === "DELIVERING") throw new ApiError("This delivery is in progress.", 409);
  await prisma.integrationDelivery.update({ where: { id: d.id }, data: { status: "PENDING", nextAttemptAt: new Date(), attempts: 0, replayCount: { increment: 1 }, lastError: null } });
  return { id: d.id, eventId: d.eventId, status: "PENDING" };
}

export async function testDestination(user: AuthUser, id: string) {
  const c = await ownConnection(user, id);
  if (!c.webhookUrl) throw new ApiError("This connection has no webhook.", 409);
  const check = await checkDestination(c.webhookUrl);
  if (!check.ok) return { ok: false, reason: check.reason };
  const ev = await emit(user.schoolId, "connection.test", c.campusIds[0], c.id, { connectionId: c.id, note: "Test event from Skoolee" }, [c.id]);
  return { ok: true, eventId: ev?.id ?? null };
}

// ─── Events and delivery ─────────────────────────────────────────────────

const envelope = (e: { id: string; topic: string; occurredAt: Date; payload: Prisma.JsonValue }) => ({ id: e.id, topic: e.topic, contractVersion: "v1", occurredAt: e.occurredAt.toISOString(), data: e.payload });

/** Records an event and queues it for every active connection subscribed to the topic and campus. */
export async function emit(schoolId: string, topic: string, campusId: string, resourceId: string, payload: Record<string, unknown>, only?: string[]) {
  const subs = await prisma.integrationConnection.findMany({ where: { schoolId, status: { in: ["ACTIVE", "PAUSED"] }, topics: { has: topic }, campusIds: { has: campusId }, webhookUrl: { not: null }, ...(only ? { id: { in: only } } : {}) }, select: { id: true, status: true } });
  if (!subs.length) return null;
  const ev = await prisma.integrationEvent.create({ data: { schoolId, topic, campusId, resourceId, payload: payload as Prisma.InputJsonValue, occurredAt: new Date() } });
  await prisma.integrationDelivery.createMany({ data: subs.map(s => ({ schoolId, connectionId: s.id, eventId: ev.id, status: s.status === "PAUSED" ? "PAUSED" : "PENDING" })) });
  return ev;
}

export function sign(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}
const backoff = (attempt: number) => Math.min(30_000 * 2 ** (attempt - 1), 3_600_000);

/** Sends due deliveries for one school. Each delivery is leased so two runners never send it at once. */
export async function deliverDue(schoolId: string, limit = 50) {
  const due = await prisma.integrationDelivery.findMany({ where: { schoolId, status: "PENDING", nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: "asc" }, take: limit, select: { id: true } });
  let sent = 0;
  for (const { id } of due) {
    const leased = await prisma.integrationDelivery.updateMany({ where: { id, status: "PENDING" }, data: { status: "DELIVERING", leaseUntil: new Date(Date.now() + 60_000) } });
    if (!leased.count) continue;
    sent++;
    await attempt(id);
  }
  // A lease that ran out (crash mid-send) is retried rather than lost.
  await prisma.integrationDelivery.updateMany({ where: { schoolId, status: "DELIVERING", leaseUntil: { lt: new Date() } }, data: { status: "PENDING", leaseUntil: null } });
  return sent;
}

async function attempt(id: string) {
  const d = await prisma.integrationDelivery.findUniqueOrThrow({ where: { id }, include: { event: true, connection: true } });
  const n = d.attempts + 1, c = d.connection;
  const finish = async (outcome: string, data: Prisma.IntegrationDeliveryUpdateInput, log: { statusCode?: number | null; error?: string | null; durationMs?: number | null; address?: string | null; signedWith?: number }) => {
    await prisma.integrationDeliveryAttempt.create({ data: { schoolId: d.schoolId, deliveryId: d.id, attempt: n, replay: d.replayCount, url: c.webhookUrl ?? "about:blank", resolvedAddress: log.address ?? null, statusCode: log.statusCode ?? null, outcome, error: log.error ?? null, durationMs: log.durationMs ?? null, signedWith: log.signedWith ?? 1 } });
    await prisma.integrationDelivery.update({ where: { id: d.id }, data: { attempts: n, leaseUntil: null, ...data } });
  };
  if (c.status !== "ACTIVE") return finish("BLOCKED_DESTINATION", { status: "PAUSED" }, { error: "The connection is not active." });
  if (!c.webhookUrl || !c.signingSecret) return finish("BLOCKED_DESTINATION", { status: "BLOCKED", lastError: "No webhook destination." }, { error: "No webhook destination." });
  const check = await checkDestination(c.webhookUrl);
  if (!check.ok) return finish("BLOCKED_DESTINATION", { status: "BLOCKED", lastError: check.reason }, { error: check.reason });
  const body = JSON.stringify(envelope(d.event)), ts = Math.floor(Date.now() / 1000);
  const secrets = [revealSecret(c.signingSecret), ...(c.previousSigningSecret && c.previousSecretUntil && c.previousSecretUntil > new Date() ? [revealSecret(c.previousSigningSecret)] : [])];
  const signature = `t=${ts},${secrets.map(s => `v1=${sign(s, ts, body)}`).join(",")}`;
  const started = Date.now();
  const retryOrFail = (statusCode: number | null, error: string, outcome: string, retryAfterMs?: number) => n >= MAX_ATTEMPTS
    ? finish(outcome, { status: "FAILED", lastStatusCode: statusCode, lastError: `${error} Delivery failed after ${n} attempts. Review the destination before replaying.` }, { statusCode, error, durationMs: Date.now() - started, address: check.address, signedWith: secrets.length })
    : finish(outcome, { status: "PENDING", lastStatusCode: statusCode, lastError: error, nextAttemptAt: new Date(Date.now() + Math.max(retryAfterMs ?? 0, backoff(n))) }, { statusCode, error, durationMs: Date.now() - started, address: check.address, signedWith: secrets.length });
  try {
    // Pin the connection to the address validated above while retaining the
    // original hostname for TLS SNI and the HTTP Host header. This closes the
    // DNS check/use gap without weakening certificate verification.
    const dispatcher = new Agent({ connect: { lookup: (_hostname, _options, callback) => callback(null, check.address, isIP(check.address) as 4 | 6) } });
    try {
      const response = await fetch(check.url, { dispatcher, method: "POST", redirect: "manual", signal: AbortSignal.timeout(Number(process.env.INTEGRATION_TIMEOUT_MS ?? 5000)), headers: { "Content-Type": "application/json", "User-Agent": "Skoolee-Webhooks/1", "Skoolee-Event-Id": d.event.id, "Skoolee-Topic": d.event.topic, "Skoolee-Delivery-Attempt": String(n), "Skoolee-Signature": signature }, body });
      if (response.status >= 300 && response.status < 400) return finish("REDIRECT_REFUSED", { status: "BLOCKED", lastStatusCode: response.status, lastError: "The destination redirected; redirects are not followed. Update the webhook URL." }, { statusCode: response.status, error: "Redirect refused.", durationMs: Date.now() - started, address: check.address, signedWith: secrets.length });
      if (response.ok) return finish("DELIVERED", { status: "DELIVERED", deliveredAt: new Date(), lastStatusCode: response.status, lastError: null }, { statusCode: response.status, durationMs: Date.now() - started, address: check.address, signedWith: secrets.length });
      if (response.status === 429) { const ra = Number(response.headers.get("retry-after")); return retryOrFail(429, "The destination asked us to slow down.", "RATE_LIMITED", Number.isFinite(ra) ? ra * 1000 : undefined); }
      return retryOrFail(response.status, `The destination answered ${response.status}.`, "HTTP_ERROR");
    } finally { await dispatcher.close(); }
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return retryOrFail(null, timeout ? "No response before the timeout." : "The destination could not be reached.", timeout ? "TIMEOUT" : "NETWORK_ERROR");
  }
}

// ─── Public API (service credentials) ────────────────────────────────────

export class PublicError extends Error { constructor(public status: number, public code: string, message: string, public headers: Record<string, string> = {}) { super(message); } }
export type Caller = { connectionId: string; schoolId: string; campusIds: string[]; scopes: string[]; keyId: string };

/** Authenticates a Bearer key, applies limits and logs the call. Never touches a user account. */
export async function authenticate(request: Request, scope: string, version: string): Promise<Caller> {
  if (!CONTRACTS[version]) throw new PublicError(404, "UNSUPPORTED_VERSION", `API version ${version} does not exist.`);
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const [keyId, secret] = token.split(".");
  if (!keyId || !secret) throw new PublicError(401, "UNAUTHENTICATED", "Send an API key as a Bearer token.");
  const cred = await runUnscoped("authenticate integration key", () => prisma.integrationCredential.findUnique({ where: { keyId }, include: { connection: true } }));
  const expected = cred ? Buffer.from(cred.secretHash, "hex") : Buffer.alloc(32), given = Buffer.from(sha(secret), "hex");
  const valid = !!cred && timingSafeEqual(expected, given) && cred.status === "ACTIVE" && (!cred.expiresAt || cred.expiresAt > new Date()) && cred.connection.status !== "REVOKED";
  if (!valid || !cred) throw new PublicError(401, "UNAUTHENTICATED", "This API key is not valid, has expired or was revoked.");
  const c = cred.connection;
  if (c.status === "PAUSED") throw new PublicError(403, "CONNECTION_PAUSED", "This connection is paused by the school.");
  if (!c.scopes.includes(scope)) throw new PublicError(403, "FORBIDDEN_SCOPE", `This key does not have the ${scope} scope.`);
  return runWithTenantContext({ schoolId: c.schoolId }, async () => {
    const minute = new Date(Date.now() - 60_000), day = new Date(Date.now() - 86_400_000);
    const [perMinute, perDay, school] = await Promise.all([
      prisma.integrationRequestLog.count({ where: { connectionId: c.id, createdAt: { gte: minute } } }),
      prisma.integrationRequestLog.count({ where: { connectionId: c.id, createdAt: { gte: day } } }),
      prisma.integrationRequestLog.count({ where: { schoolId: c.schoolId, createdAt: { gte: minute } } }),
    ]);
    if (perDay >= c.dailyQuota) throw new PublicError(429, "QUOTA_EXCEEDED", "The daily request quota for this connection is used up.", { "Retry-After": "3600" });
    if (perMinute >= c.rateLimitPerMinute || school >= SCHOOL_RATE_PER_MINUTE) throw new PublicError(429, "RATE_LIMITED", "Too many requests. Slow down and retry.", { "Retry-After": "60" });
    await prisma.integrationCredential.update({ where: { keyId }, data: { lastUsedAt: new Date() } });
    return { connectionId: c.id, schoolId: c.schoolId, campusIds: c.campusIds, scopes: c.scopes, keyId };
  });
}

export async function logRequest(caller: Caller | null, method: string, path: string, statusCode: number) {
  if (!caller) return;
  await runWithTenantContext({ schoolId: caller.schoolId }, () => prisma.integrationRequestLog.create({ data: { schoolId: caller.schoolId, connectionId: caller.connectionId, method, path: path.slice(0, 200), statusCode } })).catch(() => undefined);
}

const studentOut = (s: { id: string; admissionNo: string | null; fullName: string; campusId: string; classId: string; status: string | null; enrollmentDate: Date; class: { name: string; section: string | null } | null }) => ({
  id: s.id, admissionNo: s.admissionNo, fullName: s.fullName, campusId: s.campusId, classId: s.classId, className: s.class ? `${s.class.name}${s.class.section ? ` ${s.class.section}` : ""}` : "", status: String(s.status ?? "active").toLowerCase(), enrolledAt: s.enrollmentDate.toISOString(),
});
const studentSelect = { id: true, admissionNo: true, fullName: true, campusId: true, classId: true, status: true, enrollmentDate: true, class: { select: { name: true, section: true } } } as const;

export async function listStudents(caller: Caller, params: URLSearchParams) {
  return runWithTenantContext({ schoolId: caller.schoolId }, async () => {
    const limit = Math.min(Math.max(Number(params.get("limit") ?? V1.pagination.defaultLimit) || V1.pagination.defaultLimit, 1), V1.pagination.maxLimit);
    const campusId = params.get("campusId");
    if (campusId && !caller.campusIds.includes(campusId)) throw new PublicError(404, "NOT_FOUND", "Campus not found.");
    const cursor = params.get("cursor");
    const rows = await prisma.student.findMany({ where: { schoolId: caller.schoolId, campusId: campusId ? campusId : { in: caller.campusIds }, archivedAt: null, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: limit + 1, select: studentSelect });
    const page = rows.slice(0, limit);
    return { data: page.map(studentOut), nextCursor: rows.length > limit ? page[page.length - 1].id : null };
  });
}

export async function getStudent(caller: Caller, id: string) {
  return runWithTenantContext({ schoolId: caller.schoolId }, async () => {
    const s = await prisma.student.findFirst({ where: { id, schoolId: caller.schoolId, campusId: { in: caller.campusIds }, archivedAt: null }, select: studentSelect });
    if (!s) throw new PublicError(404, "NOT_FOUND", "Student not found.");
    return studentOut(s);
  });
}

/** Idempotent inbound command: link a student to the caller system's id. */
export async function linkExternalId(caller: Caller, idempotencyKey: string | null, body: Record<string, unknown>) {
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 120) throw new PublicError(400, "IDEMPOTENCY_KEY_REQUIRED", "Send an Idempotency-Key header (8–120 characters).");
  const studentId = text(body.studentId, 64), system = text(body.system, 60), externalId = text(body.externalId, 120);
  if (!studentId || !system || !externalId) throw new PublicError(400, "VALIDATION_FAILED", "studentId, system and externalId are required strings.");
  const requestHash = sha(JSON.stringify({ studentId, system, externalId }));
  return runWithTenantContext({ schoolId: caller.schoolId }, async () => {
    const prior = await prisma.integrationCommand.findUnique({ where: { connectionId_idempotencyKey: { connectionId: caller.connectionId, idempotencyKey } } });
    if (prior) {
      if (prior.requestHash !== requestHash) throw new PublicError(409, "IDEMPOTENCY_CONFLICT", "This Idempotency-Key was used with a different request.");
      return { status: prior.statusCode, body: prior.response as Record<string, unknown>, replayed: true };
    }
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: caller.schoolId, campusId: { in: caller.campusIds }, archivedAt: null }, select: { id: true, campusId: true } });
    if (!student) throw new PublicError(404, "NOT_FOUND", "Student not found.");
    try {
      const result = await prisma.$transaction(async tx => {
        const ref = await tx.integrationExternalRef.upsert({ where: { connectionId_studentId_system: { connectionId: caller.connectionId, studentId, system } }, create: { schoolId: caller.schoolId, connectionId: caller.connectionId, studentId, system, externalId }, update: { externalId } });
        const response = { data: { studentId: ref.studentId, system: ref.system, externalId: ref.externalId, updatedAt: ref.updatedAt.toISOString() } };
        await tx.integrationCommand.create({ data: { schoolId: caller.schoolId, connectionId: caller.connectionId, idempotencyKey, requestHash, statusCode: 200, response: response as Prisma.InputJsonValue } });
        return response;
      });
      await emit(caller.schoolId, "student.updated", student.campusId, studentId, { studentId, campusId: student.campusId, changed: "externalRef" });
      return { status: 200, body: result, replayed: false };
    } catch (error) {
      // Two concurrent requests with the same key: the loser returns the winner's stored response.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await prisma.integrationCommand.findUnique({ where: { connectionId_idempotencyKey: { connectionId: caller.connectionId, idempotencyKey } } });
        if (winner && winner.requestHash === requestHash) return { status: winner.statusCode, body: winner.response as Record<string, unknown>, replayed: true };
        throw new PublicError(409, "IDEMPOTENCY_CONFLICT", "This Idempotency-Key was used with a different request.");
      }
      throw error;
    }
  });
}
