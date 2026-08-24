// Shapes shared between the chat API and the React client. Kept free of any
// Prisma or Node import so client components can use them without dragging
// the database client into the browser bundle.
import type { UserRole } from "@/lib/roles";

export type ConversationKind = "DIRECT" | "GROUP" | "CLASS" | "ANNOUNCEMENT";
export type ConversationMemberRole = "OWNER" | "MODERATOR" | "MEMBER";
export type ChatMessageKind = "TEXT" | "FILE" | "IMAGE" | "SYSTEM";

export interface ChatUserSummary {
  id: string;
  fullName: string;
  role: UserRole;
  profileImageUrl: string | null;
}

export interface ChatAttachmentView {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** Presigned and short-lived; re-fetch the message rather than caching it. */
  url: string | null;
}

export interface ChatMessageView {
  id: string;
  conversationId: string;
  kind: ChatMessageKind;
  body: string;
  sender: ChatUserSummary | null;
  replyTo: { id: string; body: string; senderName: string | null } | null;
  attachments: ChatAttachmentView[];
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  clientKey: string | null;
}

export interface ConversationMemberView {
  userId: string;
  fullName: string;
  role: UserRole;
  memberRole: ConversationMemberRole;
  profileImageUrl: string | null;
  isOnline: boolean;
  lastReadAt: string | null;
}

export interface ConversationView {
  id: string;
  kind: ConversationKind;
  /** Resolved for display: a DIRECT thread is titled by the other person. */
  title: string;
  subtitle: string | null;
  avatarUrl: string | null;
  /** The counterparty of a DIRECT thread; null for every other kind. */
  counterpart: ChatUserSummary | null;
  memberCount: number;
  unreadCount: number;
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;
  isLocked: boolean;
  /** Whether this member may post — false in a locked thread, and in an
   *  announcement channel they do not moderate. */
  canPost: boolean;
  canModerate: boolean;
  isOnline: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderId: string | null;
  classId: string | null;
}

export interface ConversationDetail extends ConversationView {
  members: ConversationMemberView[];
  topic: string | null;
}

export interface DirectoryContact {
  id: string;
  fullName: string;
  role: UserRole;
  campusId: string | null;
  campusName: string | null;
  /** Staff viewers only; null for families. */
  email: string | null;
  profileImageUrl: string | null;
  context: string | null;
}

/** Events pushed over /api/chat/stream. */
export type ChatStreamEvent =
  | { type: "message"; conversationId: string; payload: ChatMessageView }
  | { type: "message-updated"; conversationId: string; payload: ChatMessageView }
  | { type: "conversation"; conversationId: string; payload: ConversationView }
  | { type: "read"; conversationId: string; payload: { userId: string; readAt: string } }
  | {
      type: "typing";
      conversationId: string;
      payload: { userId: string; fullName: string; until: number };
    }
  | { type: "presence"; payload: { userId: string; online: boolean } };
