import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { schoolAiTransaction } from "./transaction";
import { assertAnnouncementAccess } from "./announcements-service";
import { SchoolAiError, resolveWorkspaceCampus } from "./access";
import { announcementChannelSchema, contactForChannel, validChannelContact } from "./announcement-channel-contract";
import { channelPreferenceInputSchema, type ChannelPreferenceView } from "./announcement-preferences";
const denied = (): never => { throw new SchoolAiError("Guardian communication access is unavailable.", 403, "PERMISSION_DENIED"); };
async function actor(user: AuthUser, tx: TxClient) { const current = await tx.user.findFirst({ where: { schoolId: user.schoolId, id: user.userId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } }); if (!current || current.role !== user.role || current.campusId !== user.campusId || user.accessVersion !== undefined && user.accessVersion !== current.accessVersion) denied(); if (user.role !== "PARENT") await assertAnnouncementAccess(user, tx); }
async function relationships(user: AuthUser, tx: TxClient, campusId?: string | null, guardianUserId?: string) {
  await actor(user, tx); const now = new Date();
  if (user.role !== "PARENT") { if (!campusId) throw new SchoolAiError("Choose a campus.", 400); await resolveWorkspaceCampus(user, campusId, tx); }
  const rows = await tx.guardianRelationship.findMany({ where: { schoolId: user.schoolId, ...(campusId ? { campusId } : {}), ...(user.role === "PARENT" ? { guardianUserId: user.userId } : guardianUserId ? { guardianUserId } : {}), status: "ACTIVE", verifiedAt: { not: null }, validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }], guardian: { isActive: true, role: "PARENT" }, student: { archivedAt: null, status: "active" }, campus: { archivedAt: null } }, select: { campusId: true, campus: { select: { name: true } }, guardianUserId: true, fullName: true, email: true, phone: true, accessVersions: { where: { effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 1, select: { permissions: true } } }, orderBy: { id: "asc" }, take: 501 });
  if (rows.length > 500) throw new SchoolAiError("Narrow the guardian scope.", 422, "ANNOUNCEMENT_SCOPE_LIMIT");
  return rows.filter(row => (row.accessVersions[0]?.permissions as { communication?: unknown })?.communication === true);
}
export async function listChannelPreferences(user: AuthUser, campusId?: string | null): Promise<ChannelPreferenceView[]> {
  return schoolAiTransaction(user, async tx => {
    const rows = await relationships(user, tx, campusId), prefs = await tx.guardianChannelPreference.findMany({ where: { schoolId: user.schoolId, guardianUserId: { in: rows.flatMap(row => row.guardianUserId ? [row.guardianUserId] : []) }, campusId: { in: rows.map(row => row.campusId) } }, orderBy: { id: "asc" } });
    const groups = new Map<string, ChannelPreferenceView>();
    for (const row of rows) { if (!row.guardianUserId) continue; const key = `${row.campusId}:${row.guardianUserId}`; let group = groups.get(key); if (!group) { group = { campusId: row.campusId, campusName: row.campus.name, guardianUserId: row.guardianUserId, guardianName: row.fullName, contacts: { email: [], phone: [] }, canVerify: user.role !== "PARENT", preferences: prefs.filter(pref => pref.campusId === row.campusId && pref.guardianUserId === row.guardianUserId && announcementChannelSchema.safeParse(pref.channel).success).map(pref => ({ channel: announcementChannelSchema.parse(pref.channel), recipient: pref.recipient, enabled: pref.enabled, verified: Boolean(pref.verifiedAt), consent: Boolean(pref.consentAt), version: pref.version, updatedAt: pref.updatedAt.toISOString() })) }; groups.set(key, group); } for (const [type, contact] of [["email", contactForChannel("EMAIL", row.email)], ["phone", contactForChannel("SMS", row.phone)]] as const) if (contact && !group.contacts[type].includes(contact)) group.contacts[type].push(contact); }
    return [...groups.values()];
  });
}
export async function saveChannelPreference(user: AuthUser, raw: unknown) {
  const input = channelPreferenceInputSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    await actor(user, tx); if (user.role === "PARENT" && (input.guardianUserId !== user.userId || input.enabled)) denied();
    const rows = await relationships(user, tx, input.campusId, input.guardianUserId); if (!rows.length) denied();
    // Serialize preference creation and updates across managers and guardian opt-outs.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${user.schoolId}:${input.campusId}:${input.guardianUserId}:${input.channel}`}))`;
    const existing = await tx.guardianChannelPreference.findUnique({ where: { schoolId_campusId_guardianUserId_channel: { schoolId: user.schoolId, campusId: input.campusId, guardianUserId: input.guardianUserId, channel: input.channel } } });
    if ((existing?.version ?? 0) !== input.expectedVersion) throw new SchoolAiError("Preferences changed. Refresh and review again.", 409, "STALE_WORKSPACE_VERSION");
    const recipient = contactForChannel(input.channel, input.recipient), matches = rows.some(row => contactForChannel(input.channel, input.channel === "EMAIL" ? row.email : row.phone) === recipient);
    if (input.enabled && (!matches || !validChannelContact(input.channel, recipient) || !input.verified || !input.consent)) throw new SchoolAiError("Confirm the guardian's current contact and explicit channel consent.", 422, "ANNOUNCEMENT_PREFERENCE_EVIDENCE");
    const now = new Date(), data = { recipient: input.enabled ? recipient : existing?.recipient ?? recipient, enabled: input.enabled, verifiedAt: input.enabled ? now : existing?.verifiedAt ?? null, consentAt: input.enabled ? now : null, evidence: input.evidence, updatedById: user.userId };
    const result = await tx.guardianChannelPreference.upsert({ where: { schoolId_campusId_guardianUserId_channel: { schoolId: user.schoolId, campusId: input.campusId, guardianUserId: input.guardianUserId, channel: input.channel } }, create: { schoolId: user.schoolId, campusId: input.campusId, guardianUserId: input.guardianUserId, channel: input.channel, ...data }, update: { ...data, version: { increment: 1 } } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "guardian_channel_preferences", recordId: result.id, userId: user.userId, oldValue: { version: existing?.version ?? 0, enabled: existing?.enabled ?? null }, newValue: { version: result.version, enabled: result.enabled, channel: input.channel, guardianUserId: input.guardianUserId, campusId: input.campusId, evidence: input.evidence } } });
    return { id: result.id, version: result.version };
  });
}
