// ─────────────────────────────────────────────────────────────────
// Chat service.
//
// Every route handler goes through here, so the invariants live in one place:
//   • membership is checked before a thread is read or written to;
//   • a DIRECT thread is re-authorised against the policy on every send, so a
//     relationship that lapses (a teacher losing the class, a pupil changing
//     section) closes the thread instead of leaving a standing back door;
//   • unread counters and the conversation's denormalised "last message" are
//     updated in the same transaction as the insert, so a crash cannot leave a
//     thread showing a preview of a message that does not exist.
// ─────────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { prisma, tenantTransaction, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import type { AuthUser } from "@/lib/auth";
import { ApiError, requireAuthUser } from "@/lib/api/scope";
import { roleLabel, type UserRole } from "@/lib/roles";
import { getDownloadUrl } from "@/lib/storage/s3";
import {
  canCreateAnnouncement,
  canCreateGroup,
  canDirectMessage,
  canModerate,
  getChatSettings,
  isWithinQuietHours,
  type ChatPeer,
  type ChatSettings,
} from "./policy";
import { publishToUsers, whoIsOnline, isOffline } from "./realtime";
import type {
  ChatMessageView,
  ConversationDetail,
  ConversationKind,
  ConversationMemberView,
  ConversationView,
} from "./types";

export const MAX_MESSAGE_LENGTH = 4000;
const PREVIEW_LENGTH = 140;
const DEFAULT_PAGE_SIZE = 30;

/**
 * Binds the tenant for a multi-statement write.
 *
 * Route handlers normally let the Prisma guard derive the school from the
 * session cookie, but `tenantTransaction` reads the context directly and
 * would find nothing. Binding it here keeps the guard's fail-closed behaviour
 * intact rather than working around it.
 */
function inTenant<T>(user: AuthUser, fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return runWithTenantContext({ schoolId: user.schoolId, userId: user.userId }, () =>
    tenantTransaction(fn)
  );
}

/**
 * Authenticates a chat request and refuses the platform owner.
 *
 * This is not only a product decision. An APP_OWNER session resolves to an
 * *unscoped* tenant context — the guard steps aside so they can administer
 * every school — which means a chat query on their behalf would run across
 * all tenants at once. They hold no membership anywhere, so nothing leaks
 * today, but the safe thing to rely on is the check, not the emptiness.
 */
export async function requireChatUser(): Promise<AuthUser> {
  const user = await requireAuthUser();
  if (user.role === "APP_OWNER") {
    throw new ApiError("Platform owner accounts are outside school messaging", 403);
  }
  return user;
}

/** DIRECT threads are keyed on the pair, sorted so either order finds the same row. */
export function pairKeyFor(a: string, b: string) {
  return [a, b].sort().join(":");
}

function preview(body: string, kind: string) {
  if (kind === "IMAGE") return "📷 Photo";
  if (kind === "FILE") return "📎 Attachment";
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…` : flat;
}

// ─── Serialisation ───────────────────────────────────────────────

const messageInclude = {
  sender: { select: { id: true, fullName: true, role: true, profileImageUrl: true } },
  replyTo: {
    select: { id: true, body: true, deletedAt: true, sender: { select: { fullName: true } } },
  },
  attachments: true,
} satisfies Prisma.ChatMessageInclude;

type MessageRow = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>;

async function serialiseMessage(row: MessageRow): Promise<ChatMessageView> {
  const isDeleted = row.deletedAt !== null;

  // A withdrawn message keeps its place in the thread so replies still make
  // sense, but its text is never sent to a client again.
  const attachments = isDeleted
    ? []
    : await Promise.all(
        row.attachments.map(async (a) => ({
          id: a.id,
          fileName: a.fileName,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          url: await getDownloadUrl(a.storageKey, 3600).catch(() => null),
        }))
      );

  return {
    id: row.id,
    conversationId: row.conversationId,
    kind: row.kind,
    body: isDeleted ? "" : row.body,
    sender: row.sender
      ? {
          id: row.sender.id,
          fullName: row.sender.fullName,
          role: row.sender.role as UserRole,
          profileImageUrl: row.sender.profileImageUrl,
        }
      : null,
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          body: row.replyTo.deletedAt ? "" : preview(row.replyTo.body, "TEXT"),
          senderName: row.replyTo.sender?.fullName ?? null,
        }
      : null,
    attachments,
    isEdited: row.editedAt !== null,
    isDeleted,
    createdAt: row.createdAt.toISOString(),
    clientKey: row.clientKey,
  };
}

const conversationInclude = {
  members: {
    where: { leftAt: null },
    select: {
      userId: true,
      memberRole: true,
      unreadCount: true,
      lastReadAt: true,
      isMuted: true,
      isPinned: true,
      isArchived: true,
      user: { select: { id: true, fullName: true, role: true, profileImageUrl: true } },
    },
  },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

function memberOf(row: ConversationRow, userId: string) {
  return row.members.find((m) => m.userId === userId);
}

/**
 * A member may post unless the thread is locked, or it is an announcement
 * channel and they are only in the audience.
 */
function canPostIn(row: ConversationRow, memberRole: string) {
  if (row.isLocked) return false;
  if (row.kind === "ANNOUNCEMENT") return memberRole === "OWNER" || memberRole === "MODERATOR";
  return true;
}

function serialiseConversation(
  row: ConversationRow,
  viewerId: string,
  viewerRole: UserRole,
  online: Set<string>
): ConversationView {
  const me = memberOf(row, viewerId);
  const others = row.members.filter((m) => m.userId !== viewerId);
  const counterpart = row.kind === "DIRECT" ? others[0] : undefined;

  const title =
    row.kind === "DIRECT"
      ? (counterpart?.user.fullName ?? "Unknown member")
      : (row.title ?? "Conversation");

  const subtitle =
    row.kind === "DIRECT"
      ? counterpart
        ? roleLabel(counterpart.user.role)
        : null
      : `${row.members.length} member${row.members.length === 1 ? "" : "s"}`;

  const memberRole = me?.memberRole ?? "MEMBER";

  return {
    id: row.id,
    kind: row.kind as ConversationKind,
    title,
    subtitle,
    avatarUrl: counterpart?.user.profileImageUrl ?? null,
    counterpart: counterpart
      ? {
          id: counterpart.user.id,
          fullName: counterpart.user.fullName,
          role: counterpart.user.role as UserRole,
          profileImageUrl: counterpart.user.profileImageUrl,
        }
      : null,
    memberCount: row.members.length,
    unreadCount: me?.unreadCount ?? 0,
    isMuted: me?.isMuted ?? false,
    isPinned: me?.isPinned ?? false,
    isArchived: me?.isArchived ?? false,
    isLocked: row.isLocked,
    canPost: canPostIn(row, memberRole),
    canModerate: memberRole === "OWNER" || memberRole === "MODERATOR" || canModerate(viewerRole),
    isOnline: counterpart ? online.has(counterpart.userId) : false,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageSenderId: row.lastMessageSenderId,
    classId: row.classId,
  };
}

// ─── Access ──────────────────────────────────────────────────────

/**
 * Loads a conversation the caller is actually in. Anything else — a thread in
 * their school they were never added to, or one they have left — is a 404
 * rather than a 403, so the endpoint cannot be used to probe which
 * conversations exist.
 */
async function requireMembership(user: AuthUser, conversationId: string) {
  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: conversationInclude,
  });

  if (!row) throw new ApiError("Conversation not found", 404);

  const me = memberOf(row, user.userId);
  if (!me) {
    // Leadership can moderate any thread in their school, but they still have
    // to be a member to read one — a principal browsing arbitrary private
    // conversations is surveillance, not moderation.
    throw new ApiError("Conversation not found", 404);
  }

  return { row, me };
}

/** The people a message should be delivered to. */
function recipientIds(row: ConversationRow, excludeUserId?: string) {
  return row.members.map((m) => m.userId).filter((id) => id !== excludeUserId);
}

// ─── Reads ───────────────────────────────────────────────────────

export interface ListOptions {
  filter?: "all" | "unread" | "archived";
  query?: string;
  limit?: number;
}

export async function listConversations(
  user: AuthUser,
  options: ListOptions = {}
): Promise<ConversationView[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const archived = options.filter === "archived";

  const memberships = await prisma.conversationMember.findMany({
    where: {
      userId: user.userId,
      leftAt: null,
      isArchived: archived,
      ...(options.filter === "unread" ? { unreadCount: { gt: 0 } } : {}),
      ...(options.query?.trim()
        ? {
            conversation: {
              OR: [
                { title: { contains: options.query.trim(), mode: "insensitive" } },
                {
                  members: {
                    some: {
                      userId: { not: user.userId },
                      user: { fullName: { contains: options.query.trim(), mode: "insensitive" } },
                    },
                  },
                },
              ],
            },
          }
        : {}),
    },
    select: { conversationId: true },
    orderBy: [{ isPinned: "desc" }, { conversation: { lastMessageAt: "desc" } }],
    take: limit,
  });

  if (memberships.length === 0) return [];

  const ids = memberships.map((m) => m.conversationId);
  const rows = await prisma.conversation.findMany({
    where: { id: { in: ids } },
    include: conversationInclude,
  });

  // findMany does not preserve the ordering of an `in` list, so restore the
  // pinned-then-recent order the membership query established.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is ConversationRow => Boolean(r));

  const online = await whoIsOnline(
    ordered.flatMap((r) => r.members.map((m) => m.userId)).filter((id) => id !== user.userId)
  );

  return ordered.map((r) => serialiseConversation(r, user.userId, user.role, online));
}

export async function getConversation(
  user: AuthUser,
  conversationId: string
): Promise<ConversationDetail> {
  const { row } = await requireMembership(user, conversationId);
  const online = await whoIsOnline(row.members.map((m) => m.userId));

  const members: ConversationMemberView[] = row.members.map((m) => ({
    userId: m.userId,
    fullName: m.user.fullName,
    role: m.user.role as UserRole,
    memberRole: m.memberRole,
    profileImageUrl: m.user.profileImageUrl,
    isOnline: online.has(m.userId),
    lastReadAt: m.lastReadAt?.toISOString() ?? null,
  }));

  return {
    ...serialiseConversation(row, user.userId, user.role, online),
    members,
    topic: row.topic,
  };
}

export async function listMessages(
  user: AuthUser,
  conversationId: string,
  options: { cursor?: string; limit?: number } = {}
): Promise<{ messages: ChatMessageView[]; nextCursor: string | null }> {
  await requireMembership(user, conversationId);

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), 100);

  const rows = await prisma.chatMessage.findMany({
    where: { conversationId },
    include: messageInclude,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const messages = await Promise.all(page.map(serialiseMessage));

  return {
    // Oldest-first for rendering; the cursor still walks backwards in time.
    messages: messages.reverse(),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export async function totalUnread(user: AuthUser): Promise<number> {
  const result = await prisma.conversationMember.aggregate({
    where: { userId: user.userId, leftAt: null, isArchived: false, isMuted: false },
    _sum: { unreadCount: true },
  });
  return result._sum.unreadCount ?? 0;
}

// ─── Creating conversations ──────────────────────────────────────

/** Loads a peer and confirms they are in the caller's school. */
async function loadPeer(userId: string): Promise<ChatPeer> {
  const peer = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, campusId: true, isActive: true },
  });

  // The tenant guard has already scoped this query to the caller's school, so
  // a miss means "not in your school" as much as "does not exist".
  if (!peer) throw new ApiError("That person is not part of your school", 404);

  return { id: peer.id, role: peer.role as UserRole, campusId: peer.campusId, isActive: peer.isActive };
}

/**
 * Opens the thread between two people, or returns the one that already exists.
 * The unique index on (schoolId, pairKey) is what makes this safe under
 * concurrent taps — two simultaneous "Message" clicks cannot fork the thread.
 */
export async function getOrCreateDirect(
  user: AuthUser,
  targetUserId: string
): Promise<ConversationDetail> {
  const settings = await getChatSettings(user.schoolId);
  const peer = await loadPeer(targetUserId);

  const decision = await canDirectMessage(user, peer, settings);
  if (!decision.allowed) throw new ApiError(decision.reason ?? "You cannot message this person", 403);

  const pairKey = pairKeyFor(user.userId, peer.id);

  const existing = await prisma.conversation.findFirst({
    where: { pairKey },
    select: { id: true },
  });

  if (existing) {
    // Rejoin silently if they had previously left their own thread.
    await prisma.conversationMember.updateMany({
      where: { conversationId: existing.id, userId: user.userId, leftAt: { not: null } },
      data: { leftAt: null, isArchived: false },
    });
    return getConversation(user, existing.id);
  }

  try {
    const created = await prisma.conversation.create({
      data: {
        kind: "DIRECT",
        pairKey,
        campusId: user.campusId ?? peer.campusId,
        createdById: user.userId,
        members: {
          create: [
            { userId: user.userId, memberRole: "MEMBER", schoolId: user.schoolId },
            { userId: peer.id, memberRole: "MEMBER", schoolId: user.schoolId },
          ],
        },
      },
      select: { id: true },
    });
    return getConversation(user, created.id);
  } catch (error) {
    // Lost the race: the other side created the same thread first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const row = await prisma.conversation.findFirst({ where: { pairKey }, select: { id: true } });
      if (row) return getConversation(user, row.id);
    }
    throw error;
  }
}

export interface CreateGroupInput {
  kind: Exclude<ConversationKind, "DIRECT">;
  title: string;
  topic?: string;
  memberIds: string[];
  classId?: string;
  /** CLASS channels only: pull in the guardians alongside the pupils. */
  includeGuardians?: boolean;
}

/**
 * Creates a group, class channel, or announcement.
 *
 * Every member is checked against the same rule that governs a direct
 * message. A group is not a way around the directory: if the creator could
 * not message someone one-to-one, they cannot add them to a room either.
 */
export async function createGroupConversation(
  user: AuthUser,
  input: CreateGroupInput
): Promise<ConversationDetail> {
  if (!canCreateGroup(user.role)) {
    throw new ApiError("Only staff can create group conversations", 403);
  }
  if (input.kind === "ANNOUNCEMENT" && !canCreateAnnouncement(user.role)) {
    throw new ApiError("Only school leadership can create announcement channels", 403);
  }

  const title = input.title.trim();
  if (!title) throw new ApiError("A title is required", 400);

  const settings = await getChatSettings(user.schoolId);
  const memberIds = new Set(input.memberIds.filter((id) => id !== user.userId));

  if (input.kind === "CLASS") {
    if (!input.classId) throw new ApiError("classId is required for a class channel", 400);
    for (const id of await classAudience(input.classId, Boolean(input.includeGuardians))) {
      memberIds.add(id);
    }
  }

  if (memberIds.size === 0) throw new ApiError("Add at least one other person", 400);
  if (memberIds.size > 500) throw new ApiError("A conversation is limited to 500 members", 400);

  await assertReachable(user, [...memberIds], settings);

  const created = await inTenant(user, async (tx) => {
    const conversation = await tx.conversation.create({
      data: {
        kind: input.kind,
        title,
        topic: input.topic?.trim() || null,
        classId: input.classId ?? null,
        campusId: user.campusId,
        createdById: user.userId,
      },
      select: { id: true },
    });

    await tx.conversationMember.createMany({
      data: [
        { conversationId: conversation.id, userId: user.userId, memberRole: "OWNER", schoolId: user.schoolId },
        ...[...memberIds].map((id) => ({
          conversationId: conversation.id,
          userId: id,
          memberRole: "MEMBER" as const,
          schoolId: user.schoolId,
        })),
      ],
    });

    return conversation;
  });

  await systemMessage(user, created.id, `${user.fullName ?? "A member"} created this conversation`);

  const detail = await getConversation(user, created.id);
  await publishToUsers([...memberIds], {
    type: "conversation",
    conversationId: created.id,
    payload: detail,
  });

  return detail;
}

/** Everyone who belongs in a class channel: its teachers, its pupils, and
 *  optionally their guardians. */
async function classAudience(classId: string, includeGuardians: boolean): Promise<string[]> {
  const [cls, subjects, roster] = await Promise.all([
    prisma.class.findUnique({ where: { id: classId }, select: { classTeacherId: true } }),
    prisma.subject.findMany({ where: { classId, teacherId: { not: null } }, select: { teacherId: true } }),
    prisma.student.findMany({
      where: { classId, status: "active" },
      select: { studentUserId: true, parentUserId: true },
    }),
  ]);

  if (!cls) throw new ApiError("Class not found", 404);

  const ids = new Set<string>();
  if (cls.classTeacherId) ids.add(cls.classTeacherId);
  for (const s of subjects) if (s.teacherId) ids.add(s.teacherId);
  for (const s of roster) {
    if (s.studentUserId) ids.add(s.studentUserId);
    if (includeGuardians && s.parentUserId) ids.add(s.parentUserId);
  }
  return [...ids];
}

/** Refuses the whole request if any one member is out of reach, naming them. */
async function assertReachable(user: AuthUser, ids: string[], settings: ChatSettings) {
  const peers = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, role: true, campusId: true, isActive: true },
  });

  if (peers.length !== ids.length) {
    throw new ApiError("One or more people are not part of your school", 404);
  }

  for (const peer of peers) {
    const decision = await canDirectMessage(
      user,
      { id: peer.id, role: peer.role as UserRole, campusId: peer.campusId, isActive: peer.isActive },
      settings
    );
    if (!decision.allowed) {
      throw new ApiError(`${peer.fullName}: ${decision.reason}`, 403);
    }
  }
}

// ─── Sending ─────────────────────────────────────────────────────

export interface SendMessageInput {
  body: string;
  kind?: "TEXT" | "FILE" | "IMAGE";
  replyToId?: string;
  clientKey?: string;
  attachments?: {
    storageKey: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }[];
}

export async function sendMessage(
  user: AuthUser,
  conversationId: string,
  input: SendMessageInput
): Promise<ChatMessageView> {
  const { row, me } = await requireMembership(user, conversationId);

  if (!canPostIn(row, me.memberRole)) {
    throw new ApiError(
      row.isLocked ? "This conversation is closed" : "Only moderators can post here",
      403
    );
  }

  const body = input.body.trim();
  const attachments = input.attachments ?? [];

  if (!body && attachments.length === 0) throw new ApiError("Message is empty", 400);
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new ApiError(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters`, 400);
  }

  const settings = await getChatSettings(user.schoolId);

  if (attachments.length > 0 && !settings.attachmentsEnabled) {
    throw new ApiError("Your school has disabled file sharing in messages", 403);
  }

  // Re-authorise a one-to-one thread on every send. Membership was granted
  // when the relationship existed; this is what closes it when it ends.
  if (row.kind === "DIRECT") {
    const other = row.members.find((m) => m.userId !== user.userId);
    if (!other) throw new ApiError("The other participant has left this conversation", 409);

    const peer = await loadPeer(other.userId);
    const decision = await canDirectMessage(user, peer, settings);
    if (!decision.allowed) {
      throw new ApiError(decision.reason ?? "You can no longer message this person", 403);
    }
  }

  if (input.replyToId) {
    const parent = await prisma.chatMessage.findFirst({
      where: { id: input.replyToId, conversationId },
      select: { id: true },
    });
    if (!parent) throw new ApiError("The message being replied to is not in this conversation", 400);
  }

  const kind = input.kind ?? (attachments.length > 0 ? inferKind(attachments) : "TEXT");
  const others = recipientIds(row, user.userId);

  let created: MessageRow;
  try {
    created = await inTenant(user, async (tx) => {
      const message = await tx.chatMessage.create({
        data: {
          conversationId,
          senderId: user.userId,
          kind,
          body,
          replyToId: input.replyToId ?? null,
          clientKey: input.clientKey ?? null,
          ...(attachments.length
            ? { attachments: { create: attachments.map((a) => ({ ...a, schoolId: user.schoolId })) } }
            : {}),
        },
        include: messageInclude,
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: message.createdAt,
          lastMessagePreview: preview(body, kind),
          lastMessageSenderId: user.userId,
        },
      });

      // One statement for the whole room, rather than a write per member.
      // Un-archives too: a reply should pull the thread back into view.
      if (others.length > 0) {
        await tx.conversationMember.updateMany({
          where: { conversationId, userId: { in: others }, leftAt: null },
          data: { unreadCount: { increment: 1 }, isArchived: false },
        });
      }

      return message;
    });
  } catch (error) {
    // A retried send (flaky network, double tap) resolves to the message the
    // first attempt already stored instead of posting it twice.
    if (
      input.clientKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.chatMessage.findFirst({
        where: { conversationId, clientKey: input.clientKey },
        include: messageInclude,
      });
      if (existing) return serialiseMessage(existing);
    }
    throw error;
  }

  const view = await serialiseMessage(created);

  await publishToUsers(recipientIds(row), {
    type: "message",
    conversationId,
    payload: view,
  });

  await notifyAbsentMembers(user, row, view, settings);

  return view;
}

function inferKind(attachments: { contentType: string }[]): "IMAGE" | "FILE" {
  return attachments.every((a) => a.contentType.startsWith("image/")) ? "IMAGE" : "FILE";
}

/**
 * Falls back to the in-app notification bell for members who have no live
 * stream open, so a message is never silently missed.
 *
 * Skipped for anyone who muted the thread, and — when the school has set
 * quiet hours — for staff being messaged by a family late at night. The
 * message still lands either way; only the interruption is withheld.
 */
async function notifyAbsentMembers(
  user: AuthUser,
  row: ConversationRow,
  message: ChatMessageView,
  settings: ChatSettings
): Promise<void> {
  try {
    const candidates = row.members.filter((m) => m.userId !== user.userId && !m.isMuted);
    if (candidates.length === 0) return;

    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { timezone: true },
    });

    const quiet =
      (user.role === "PARENT" || user.role === "STUDENT") &&
      isWithinQuietHours(settings, new Date(), school?.timezone ?? "Asia/Karachi");
    if (quiet) return;

    const offline: string[] = [];
    await Promise.all(
      candidates.map(async (m) => {
        if (await isOffline(m.userId)) offline.push(m.userId);
      })
    );
    if (offline.length === 0) return;

    const title =
      row.kind === "DIRECT"
        ? `New message from ${user.fullName ?? "a colleague"}`
        : `${user.fullName ?? "A member"} posted in ${row.title ?? "a conversation"}`;

    const rows = await prisma.notification.createManyAndReturn({
      data: offline.map((userId) => ({
        schoolId: user.schoolId,
        campusId: row.campusId,
        userId,
        type: "CHAT_MESSAGE",
        title,
        message: message.body || "Sent an attachment",
        icon: "MessageCircle",
        link: `/messages?c=${row.id}`,
        actorId: user.userId,
        actorName: user.fullName ?? null,
      })),
      select: {
        id: true,
        userId: true,
        type: true,
        title: true,
        message: true,
        icon: true,
        link: true,
        actorId: true,
        actorName: true,
        isRead: true,
        createdAt: true,
      },
    });

    const { redis } = await import("@/lib/queue/connection");
    for (const notif of rows) {
      redis.publish(`notif:${notif.userId}`, JSON.stringify(notif)).catch(() => {});
    }
  } catch (error) {
    // The message is already committed and delivered live; a failed courtesy
    // notification must not turn a successful send into a 500.
    console.error("[chat] notification fallback failed:", error);
  }
}

/** Server-authored notice, e.g. "Ali added Sara". Never attributed to a person. */
async function systemMessage(user: AuthUser, conversationId: string, body: string): Promise<void> {
  await prisma.chatMessage.create({
    data: { conversationId, senderId: null, kind: "SYSTEM", body, schoolId: user.schoolId },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), lastMessagePreview: body, lastMessageSenderId: null },
  });
}

// ─── Read state ──────────────────────────────────────────────────

export async function markRead(user: AuthUser, conversationId: string): Promise<void> {
  const { row } = await requireMembership(user, conversationId);
  const readAt = new Date();

  await prisma.conversationMember.updateMany({
    where: { conversationId, userId: user.userId },
    data: { unreadCount: 0, lastReadAt: readAt },
  });

  // Tell the others their message has been seen; only meaningful in a thread
  // small enough for a read receipt to mean something.
  if (row.kind === "DIRECT" || row.members.length <= 20) {
    await publishToUsers(recipientIds(row, user.userId), {
      type: "read",
      conversationId,
      payload: { userId: user.userId, readAt: readAt.toISOString() },
    });
  }
}

// ─── Editing and moderation ──────────────────────────────────────

export async function editMessage(
  user: AuthUser,
  messageId: string,
  body: string
): Promise<ChatMessageView> {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, senderId: true, deletedAt: true },
  });
  if (!message) throw new ApiError("Message not found", 404);

  const { row } = await requireMembership(user, message.conversationId);

  // Editing is the author's alone. A moderator can withdraw a message, but
  // putting different words in someone else's mouth is not moderation.
  if (message.senderId !== user.userId) throw new ApiError("You can only edit your own messages", 403);
  if (message.deletedAt) throw new ApiError("That message was withdrawn", 409);

  const next = body.trim();
  if (!next) throw new ApiError("Message is empty", 400);
  if (next.length > MAX_MESSAGE_LENGTH) {
    throw new ApiError(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters`, 400);
  }

  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { body: next, editedAt: new Date() },
    include: messageInclude,
  });

  const view = await serialiseMessage(updated);
  await publishToUsers(recipientIds(row), {
    type: "message-updated",
    conversationId: row.id,
    payload: view,
  });

  return view;
}

export async function deleteMessage(user: AuthUser, messageId: string): Promise<ChatMessageView> {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, senderId: true, deletedAt: true },
  });
  if (!message) throw new ApiError("Message not found", 404);

  const { row, me } = await requireMembership(user, message.conversationId);

  const isAuthor = message.senderId === user.userId;
  const isModerator =
    me.memberRole === "OWNER" || me.memberRole === "MODERATOR" || canModerate(user.role);

  if (!isAuthor && !isModerator) {
    throw new ApiError("You can only withdraw your own messages", 403);
  }

  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    // Soft delete: the school keeps an auditable record of what was said and
    // who removed it. Only the body stops being served.
    data: { deletedAt: message.deletedAt ?? new Date(), deletedById: user.userId },
    include: messageInclude,
  });

  const view = await serialiseMessage(updated);
  await publishToUsers(recipientIds(row), {
    type: "message-updated",
    conversationId: row.id,
    payload: view,
  });

  return view;
}

// ─── Membership and preferences ──────────────────────────────────

export async function updateMemberPreferences(
  user: AuthUser,
  conversationId: string,
  prefs: { isMuted?: boolean; isPinned?: boolean; isArchived?: boolean }
): Promise<ConversationView> {
  await requireMembership(user, conversationId);

  await prisma.conversationMember.updateMany({
    where: { conversationId, userId: user.userId },
    data: prefs,
  });

  const { row } = await requireMembership(user, conversationId);
  const online = await whoIsOnline(row.members.map((m) => m.userId));
  return serialiseConversation(row, user.userId, user.role, online);
}

export async function updateConversation(
  user: AuthUser,
  conversationId: string,
  changes: { title?: string; topic?: string; isLocked?: boolean }
): Promise<ConversationDetail> {
  const { row, me } = await requireMembership(user, conversationId);

  if (row.kind === "DIRECT") throw new ApiError("A direct conversation has no settings", 400);
  if (me.memberRole === "MEMBER" && !canModerate(user.role)) {
    throw new ApiError("Only the owner or a moderator can change this conversation", 403);
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      ...(changes.title !== undefined ? { title: changes.title.trim() || row.title } : {}),
      ...(changes.topic !== undefined ? { topic: changes.topic.trim() || null } : {}),
      ...(changes.isLocked !== undefined ? { isLocked: changes.isLocked } : {}),
    },
  });

  const detail = await getConversation(user, conversationId);
  await publishToUsers(recipientIds(row), {
    type: "conversation",
    conversationId,
    payload: detail,
  });
  return detail;
}

export async function addMembers(
  user: AuthUser,
  conversationId: string,
  userIds: string[]
): Promise<ConversationDetail> {
  const { row, me } = await requireMembership(user, conversationId);

  if (row.kind === "DIRECT") throw new ApiError("A direct conversation is fixed at two people", 400);
  if (me.memberRole === "MEMBER") throw new ApiError("Only the owner or a moderator can add people", 403);

  const settings = await getChatSettings(user.schoolId);
  const existing = new Set(row.members.map((m) => m.userId));
  const toAdd = [...new Set(userIds)].filter((id) => !existing.has(id));

  if (toAdd.length === 0) return getConversation(user, conversationId);

  await assertReachable(user, toAdd, settings);

  // Anyone who left before is reinstated rather than duplicated — the unique
  // key on (conversationId, userId) means a plain create would fail.
  await prisma.conversationMember.updateMany({
    where: { conversationId, userId: { in: toAdd } },
    data: { leftAt: null, isArchived: false },
  });

  await prisma.conversationMember.createMany({
    data: toAdd.map((id) => ({
      conversationId,
      userId: id,
      memberRole: "MEMBER" as const,
      schoolId: user.schoolId,
    })),
    skipDuplicates: true,
  });

  const names = await prisma.user.findMany({
    where: { id: { in: toAdd } },
    select: { fullName: true },
  });
  await systemMessage(
    user,
    conversationId,
    `${user.fullName ?? "A member"} added ${names.map((n) => n.fullName).join(", ")}`
  );

  const detail = await getConversation(user, conversationId);
  await publishToUsers([...existing, ...toAdd], {
    type: "conversation",
    conversationId,
    payload: detail,
  });
  return detail;
}

export async function removeMember(
  user: AuthUser,
  conversationId: string,
  targetUserId: string
): Promise<void> {
  const { row, me } = await requireMembership(user, conversationId);

  const isSelf = targetUserId === user.userId;
  if (!isSelf && me.memberRole === "MEMBER" && !canModerate(user.role)) {
    throw new ApiError("Only the owner or a moderator can remove people", 403);
  }

  if (row.kind === "DIRECT" && !isSelf) {
    throw new ApiError("You cannot remove the other person from a direct conversation", 400);
  }

  await prisma.conversationMember.updateMany({
    where: { conversationId, userId: targetUserId, leftAt: null },
    data: { leftAt: new Date(), unreadCount: 0 },
  });

  if (row.kind !== "DIRECT") {
    const target = row.members.find((m) => m.userId === targetUserId);
    await systemMessage(
      user,
      conversationId,
      isSelf
        ? `${user.fullName ?? "A member"} left`
        : `${user.fullName ?? "A moderator"} removed ${target?.user.fullName ?? "a member"}`
    );
  }

  await publishToUsers(recipientIds(row), {
    type: "conversation",
    conversationId,
    payload: { id: conversationId, removed: targetUserId },
  });
}
