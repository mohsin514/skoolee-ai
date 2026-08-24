"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  CornerUpLeft,
  Download,
  FileText,
  Lock,
  MessageSquareDashed,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/roles";
import { useChat } from "./chat-provider";
import { ChatAvatar } from "./chat-avatar";
import { Composer } from "./composer";
import type { ChatMessageView } from "@/lib/chat/types";

interface MessageThreadProps {
  /**
   * Returns to the conversation list. `always` is not cosmetic: in the docked
   * panel the list and thread share one column at every width, so a
   * mobile-only back control left desktop users with no way out of a thread.
   */
  onBack?: () => void;
  backVisibility?: "always" | "mobile";
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageThread({ onBack, backVisibility = "mobile" }: MessageThreadProps) {
  const {
    viewer,
    detail,
    messages,
    isLoadingThread,
    hasOlder,
    loadOlder,
    deleteMessage,
    editMessage,
    setPreference,
    leaveConversation,
    typingUsers,
    closeConversation,
  } = useChat();

  const [replyTo, setReplyTo] = useState<ChatMessageView | null>(null);
  const [editing, setEditing] = useState<ChatMessageView | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageId = messages[messages.length - 1]?.id;

  // Follow the conversation down as it grows, but only when the reader is
  // already near the bottom — yanking them away from history they are scrolled
  // back reading is worse than a missed scroll.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 220) {
      bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [lastMessageId]);

  // A newly opened thread always starts at the newest message, without motion.
  useEffect(() => {
    if (!isLoadingThread && detail) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.id, isLoadingThread, detail]);

  if (!detail) return <ThreadPlaceholder />;

  // Identity comes from the provider rather than a prop. Passed down, it
  // arrived a beat after the first paint, and every message — including the
  // reader's own — briefly rendered as though it had come from someone else.
  const viewerId = viewer?.id;
  const others = typingUsers.filter((t) => t.userId !== viewerId);

  // Read receipts only mean something one-to-one; in a room of thirty,
  // "seen by someone" tells the sender nothing.
  const counterpartRead =
    detail.kind === "DIRECT"
      ? detail.members.find((m) => m.userId !== viewerId)?.lastReadAt
      : null;

  const showBack = Boolean(onBack);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full min-h-0 flex-col">
        {/* ── Header ── */}
        <header className="relative z-20 flex shrink-0 items-center gap-2.5 border-b border-[#cfc2d6]/25 bg-white/80 px-3 py-2.5 shadow-[0_4px_20px_-12px_rgba(129,39,207,0.35)] backdrop-blur-xl md:px-4">
          {showBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to conversations"
              className={cn(
                "-ml-1 shrink-0 cursor-pointer rounded-xl p-2 text-ink-muted transition-all",
                "hover:-translate-x-0.5 hover:bg-[#fbf0fe] hover:text-[#8127cf] active:scale-90",
                backVisibility === "mobile" && "md:hidden"
              )}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}

          <ChatAvatar
            name={detail.title}
            seed={detail.counterpart?.id ?? detail.id}
            imageUrl={detail.avatarUrl}
            size="lg"
            online={detail.kind === "DIRECT" ? detail.isOnline : undefined}
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-black tracking-tight text-[#1f1a23]">
              {detail.title}
            </p>
            <div className="mt-0.5 h-3.5">
              <AnimatePresence mode="wait" initial={false}>
                {others.length > 0 ? (
                  <motion.p
                    key="typing"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-[#8127cf]"
                  >
                    <TypingDots />
                    {others.map((t) => t.fullName.split(" ")[0]).join(", ")} typing
                  </motion.p>
                ) : (
                  <motion.p
                    key="status"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    className="truncate text-[10px] font-bold text-ink-muted"
                  >
                    {detail.kind === "DIRECT" ? (
                      detail.isOnline ? (
                        <span className="text-emerald-600">Online now</span>
                      ) : (
                        (detail.subtitle ?? "")
                      )
                    ) : (
                      (detail.topic ?? detail.subtitle ?? "")
                    )}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          {detail.isLocked && (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700 ring-1 ring-amber-200/70"
              title="Closed to new messages"
            >
              <Lock className="h-3 w-3" />
              <span className="hidden sm:inline">Closed</span>
            </span>
          )}

          {detail.kind !== "DIRECT" && (
            <button
              type="button"
              onClick={() => setShowMembers((v) => !v)}
              aria-expanded={showMembers}
              aria-label={`${detail.memberCount} members`}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-black transition-all active:scale-95",
                showMembers
                  ? "bg-[#8127cf] text-white shadow-[0_6px_16px_-6px_rgba(129,39,207,0.6)]"
                  : "text-ink-muted hover:bg-[#fbf0fe] hover:text-[#8127cf]"
              )}
            >
              <Users className="h-3.5 w-3.5" />
              {detail.memberCount}
            </button>
          )}

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Conversation options"
              aria-expanded={menuOpen}
              className="cursor-pointer rounded-xl p-2 text-ink-muted transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] active:scale-90"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -4 }}
                    transition={{ type: "spring", stiffness: 460, damping: 30 }}
                    className="absolute right-0 top-full z-20 mt-1.5 w-48 origin-top-right overflow-hidden rounded-2xl border border-[#cfc2d6]/30 bg-white/95 p-1 shadow-[0_20px_50px_-14px_rgba(31,26,35,0.35)] backdrop-blur-xl"
                  >
                    <MenuItem
                      icon={detail.isMuted ? Bell : BellOff}
                      label={detail.isMuted ? "Unmute" : "Mute notifications"}
                      onClick={() => {
                        setPreference(detail.id, { isMuted: !detail.isMuted });
                        setMenuOpen(false);
                      }}
                    />
                    <MenuItem
                      icon={detail.isPinned ? PinOff : Pin}
                      label={detail.isPinned ? "Unpin" : "Pin to top"}
                      onClick={() => {
                        setPreference(detail.id, { isPinned: !detail.isPinned });
                        setMenuOpen(false);
                      }}
                    />
                    <MenuItem
                      icon={MessageSquareDashed}
                      label={detail.isArchived ? "Unarchive" : "Archive"}
                      onClick={() => {
                        setPreference(detail.id, { isArchived: !detail.isArchived });
                        setMenuOpen(false);
                        closeConversation();
                      }}
                    />
                    {detail.kind !== "DIRECT" && (
                      <>
                        <span className="my-1 block h-px bg-[#cfc2d6]/30" aria-hidden />
                        <MenuItem
                          icon={Trash2}
                          label="Leave conversation"
                          destructive
                          onClick={() => {
                            leaveConversation(detail.id);
                            setMenuOpen(false);
                          }}
                        />
                      </>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* ── Member strip ── */}
        <AnimatePresence initial={false}>
          {showMembers && detail.kind !== "DIRECT" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.3, 1] }}
              className="shrink-0 overflow-hidden border-b border-[#cfc2d6]/25 bg-gradient-to-b from-[#fbf0fe]/80 to-white/40"
            >
              <ul className="flex flex-wrap gap-1.5 px-4 py-3">
                {detail.members.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-2.5 text-[10px] font-bold text-ink shadow-[0_2px_8px_-2px_rgba(31,26,35,0.12)] ring-1 ring-[#cfc2d6]/25"
                  >
                    <ChatAvatar name={m.fullName} seed={m.userId} imageUrl={m.profileImageUrl} size="sm" online={m.isOnline} />
                    <span className="max-w-[120px] truncate">{m.fullName}</span>
                    <span className="text-ink-faint">{roleLabel(m.role)}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Messages ── */}
        <div
          ref={scrollRef}
          className="custom-scrollbar sk-chat-canvas relative min-h-0 flex-1 overflow-y-auto bg-[#fdfaff] px-3 py-4 md:px-5"
        >
          {hasOlder && (
            <div className="mb-5 flex justify-center">
              <button
                type="button"
                onClick={loadOlder}
                className="cursor-pointer rounded-full bg-white/90 px-3.5 py-1.5 text-[11px] font-black text-[#8127cf] shadow-[0_6px_18px_-6px_rgba(129,39,207,0.4)] ring-1 ring-[#cfc2d6]/30 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(129,39,207,0.5)] active:scale-95"
              >
                Load earlier messages
              </button>
            </div>
          )}

          {isLoadingThread ? (
            <ThreadSkeleton />
          ) : messages.length === 0 ? (
            <EmptyThread title={detail.title} />
          ) : (
            <ol className="space-y-0.5">
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const showDay =
                  !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);

                // A pending message has no sender echoed back yet, so it is
                // identified by its optimistic id instead.
                const isMine = message.id.startsWith("pending-")
                  ? true
                  : Boolean(viewerId) && message.sender?.id === viewerId;

                const grouped =
                  previous?.sender?.id === message.sender?.id &&
                  message.kind !== "SYSTEM" &&
                  previous?.kind !== "SYSTEM" &&
                  !showDay;

                return (
                  <li key={message.id}>
                    {showDay && <DaySeparator label={dayLabel(message.createdAt)} />}

                    {message.kind === "SYSTEM" ? (
                      <p className="py-2 text-center text-[10px] font-bold text-ink-faint">
                        <span className="rounded-full bg-white/70 px-2.5 py-1 ring-1 ring-[#cfc2d6]/25">
                          {message.body}
                        </span>
                      </p>
                    ) : (
                      <MessageBubble
                        message={message}
                        isMine={isMine}
                        grouped={grouped}
                        showSender={detail.kind !== "DIRECT" && !isMine && !grouped}
                        showAvatar={detail.kind !== "DIRECT" && !isMine}
                        onReply={() => setReplyTo(message)}
                        onEdit={() => setEditing(message)}
                        onDelete={() => deleteMessage(message.id)}
                        canModerate={detail.canModerate}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {others.length > 0 && (
            <div className="mt-2 flex justify-start pl-1">
              <span className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-white px-3 py-2.5 shadow-[0_4px_14px_-6px_rgba(31,26,35,0.2)] ring-1 ring-[#cfc2d6]/25">
                <TypingDots />
              </span>
            </div>
          )}

          {detail.kind === "DIRECT" && counterpartRead && messages.length > 0 && (
            <p className="mt-2 flex items-center justify-end gap-1 pr-1 text-[10px] font-bold text-ink-faint">
              <CheckCheck className="h-3 w-3 text-[#8127cf]" />
              Seen {clockTime(counterpartRead)}
            </p>
          )}

          <div ref={bottomRef} className="h-1" />
        </div>

        <Composer
          conversationId={detail.id}
          canPost={detail.canPost}
          lockedReason={
            detail.isLocked
              ? "This conversation is closed to new messages."
              : "Only moderators can post in this channel."
          }
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          editing={editing}
          onClearEditing={() => setEditing(null)}
          onSubmitEdit={async (body) => {
            if (editing) await editMessage(editing.id, body);
            setEditing(null);
          }}
        />
      </div>
    </MotionConfig>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-label="Typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="sk-typing-dot h-1.5 w-1.5 rounded-full bg-[#8127cf]" />
      ))}
    </span>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#cfc2d6]/50" aria-hidden />
      <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-ink-subtle shadow-[0_2px_10px_-4px_rgba(31,26,35,0.18)] ring-1 ring-[#cfc2d6]/25">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#cfc2d6]/50" aria-hidden />
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Pin;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[11px] font-bold transition-colors",
        destructive
          ? "text-rose-600 hover:bg-rose-50"
          : "text-ink hover:bg-[#fbf0fe] hover:text-[#8127cf]"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </button>
  );
}

function MessageBubble({
  message,
  isMine,
  grouped,
  showSender,
  showAvatar,
  onReply,
  onEdit,
  onDelete,
  canModerate,
}: {
  message: ChatMessageView;
  isMine: boolean;
  grouped: boolean;
  showSender: boolean;
  showAvatar: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canModerate: boolean;
}) {
  const isPending = message.id.startsWith("pending-");

  return (
    <div
      className={cn(
        "sk-bubble-in group flex items-end gap-2",
        isMine ? "justify-end" : "justify-start",
        grouped ? "mt-0.5" : "mt-2.5"
      )}
    >
      {showAvatar && (
        <span className={cn("shrink-0", grouped && "invisible")}>
          <ChatAvatar
            name={message.sender?.fullName ?? "?"}
            seed={message.sender?.id}
            imageUrl={message.sender?.profileImageUrl}
            size="sm"
          />
        </span>
      )}

      <div className={cn("max-w-[85%] sm:max-w-[68%]", isMine && "order-2")}>
        {showSender && message.sender && (
          <p className="mb-1 px-1 text-[10px] font-black text-[#8127cf]">
            {message.sender.fullName}
            <span className="ml-1.5 font-bold text-ink-faint">{roleLabel(message.sender.role)}</span>
          </p>
        )}

        <div
          className={cn(
            "relative overflow-hidden px-3.5 py-2.5 transition-shadow",
            isMine
              ? [
                  "bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white",
                  "shadow-[0_8px_22px_-10px_rgba(129,39,207,0.75)]",
                  grouped ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-br-sm",
                ]
              : [
                  "bg-white text-ink ring-1 ring-[#cfc2d6]/30",
                  "shadow-[0_6px_18px_-10px_rgba(31,26,35,0.28)]",
                  grouped ? "rounded-2xl rounded-bl-md" : "rounded-2xl rounded-bl-sm",
                ],
            isPending && "opacity-70"
          )}
        >
          {/* A one-pixel highlight along the top edge, so the gradient reads as
              a lit surface rather than a flat fill. */}
          {isMine && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/30"
            />
          )}

          {message.replyTo && (
            <div
              className={cn(
                "mb-2 rounded-lg border-l-2 py-1 pl-2 pr-1",
                isMine ? "border-white/50 bg-white/10" : "border-[#8127cf]/50 bg-[#fbf0fe]"
              )}
            >
              <p className={cn("text-[9px] font-black", isMine ? "text-white/90" : "text-[#8127cf]")}>
                {message.replyTo.senderName ?? "Message"}
              </p>
              <p
                className={cn(
                  "truncate text-[10px] font-semibold",
                  isMine ? "text-white/75" : "text-ink-muted"
                )}
              >
                {message.replyTo.body || "withdrawn"}
              </p>
            </div>
          )}

          {message.isDeleted ? (
            <p
              className={cn(
                "flex items-center gap-1.5 text-xs font-semibold italic",
                isMine ? "text-white/70" : "text-ink-faint"
              )}
            >
              <Trash2 className="h-3 w-3" />
              This message was withdrawn
            </p>
          ) : (
            <>
              {message.body && (
                <p className="whitespace-pre-wrap break-words text-[13px] font-semibold leading-relaxed">
                  {message.body}
                </p>
              )}

              {message.attachments.length > 0 && (
                <ul className={cn("space-y-1.5", message.body && "mt-2")}>
                  {message.attachments.map((a) =>
                    a.contentType.startsWith("image/") && a.url ? (
                      <li key={a.id}>
                        {/* Presigned S3 URLs are not a configured next/image
                            host, and they expire — a plain img avoids both. */}
                        <img
                          src={a.url}
                          alt={a.fileName}
                          loading="lazy"
                          className="max-h-72 w-auto rounded-xl shadow-[0_6px_18px_-8px_rgba(31,26,35,0.4)]"
                        />
                      </li>
                    ) : (
                      <li key={a.id}>
                        <a
                          href={a.url ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            "group/file flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] font-bold transition-all",
                            isMine
                              ? "bg-white/15 text-white hover:bg-white/25"
                              : "bg-[#fbf0fe] text-[#8127cf] hover:bg-[#f0e2f8]"
                          )}
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{a.fileName}</span>
                          <span className="shrink-0 text-[10px] opacity-70">{formatSize(a.sizeBytes)}</span>
                          <Download className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/file:opacity-100" />
                        </a>
                      </li>
                    )
                  )}
                </ul>
              )}
            </>
          )}

          <p
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-[9px] font-bold",
              isMine ? "text-white/70" : "text-ink-faint"
            )}
          >
            {message.isEdited && !message.isDeleted && <span>edited</span>}
            {clockTime(message.createdAt)}
            {isMine &&
              (isPending ? (
                <Check className="h-2.5 w-2.5" />
              ) : (
                <CheckCheck className="h-2.5 w-2.5" />
              ))}
          </p>
        </div>
      </div>

      {!message.isDeleted && !isPending && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5 self-center rounded-full bg-white/90 p-0.5 opacity-0 shadow-[0_4px_14px_-6px_rgba(31,26,35,0.3)] ring-1 ring-[#cfc2d6]/25 backdrop-blur transition-all",
            "focus-within:opacity-100 group-hover:opacity-100",
            isMine && "order-1"
          )}
        >
          <IconAction icon={CornerUpLeft} label="Reply" onClick={onReply} />
          {isMine && <IconAction icon={Pencil} label="Edit" onClick={onEdit} />}
          {(isMine || canModerate) && (
            <IconAction icon={Trash2} label="Withdraw" onClick={onDelete} destructive />
          )}
        </div>
      )}
    </div>
  );
}

function IconAction({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Pin;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "cursor-pointer rounded-full p-1.5 transition-all active:scale-90",
        destructive
          ? "text-ink-faint hover:bg-rose-50 hover:text-rose-600"
          : "text-ink-faint hover:bg-[#fbf0fe] hover:text-[#8127cf]"
      )}
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}

/** Shown in the thread pane before anything is selected. */
function ThreadPlaceholder() {
  return (
    <div className="sk-chat-canvas relative flex h-full flex-col items-center justify-center gap-4 overflow-hidden bg-[#fdfaff] p-8 text-center">
      <div className="relative">
        <span className="sk-float grid h-20 w-20 place-items-center rounded-[28px] bg-gradient-to-br from-[#8127cf] to-[#b10e6b] text-white shadow-[0_20px_44px_-16px_rgba(129,39,207,0.75)]">
          <Users className="h-9 w-9" />
        </span>
        <span className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-2xl bg-white text-[#b10e6b] shadow-[0_8px_20px_-8px_rgba(177,14,107,0.6)]">
          <Sparkles className="h-4 w-4" />
        </span>
      </div>

      <div className="max-w-xs">
        <p className="text-base font-black tracking-tight text-[#1f1a23]">Select a conversation</p>
        <p className="mt-1.5 text-xs font-semibold leading-relaxed text-ink-muted">
          Pick someone from the list, or start a new conversation with anyone you are connected
          to at school.
        </p>
      </div>
    </div>
  );
}

function EmptyThread({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-3xl bg-white text-[#8127cf] shadow-[0_10px_28px_-12px_rgba(129,39,207,0.5)] ring-1 ring-[#cfc2d6]/25">
        <Sparkles className="h-6 w-6" />
      </span>
      <div>
        <p className="text-xs font-black text-[#1f1a23]">No messages yet</p>
        <p className="mt-1 text-[11px] font-semibold text-ink-muted">
          Say hello to {title.split(" ")[0]}.
        </p>
      </div>
    </div>
  );
}

function ThreadSkeleton() {
  const rows = [
    { mine: false, w: "w-52" },
    { mine: true, w: "w-40" },
    { mine: false, w: "w-60" },
    { mine: true, w: "w-32" },
  ];

  return (
    <div className="space-y-3" aria-hidden>
      {rows.map((row, i) => (
        <div key={i} className={cn("flex", row.mine ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "skeleton-shimmer h-11 rounded-2xl",
              row.w,
              row.mine ? "rounded-br-sm bg-[#e6d6f5]" : "rounded-bl-sm bg-[#eadfed]"
            )}
          />
        </div>
      ))}
    </div>
  );
}
