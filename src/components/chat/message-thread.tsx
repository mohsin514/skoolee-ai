"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  AlertTriangle,
  Clock,
  RotateCcw,
  CornerUpLeft,
  Download,
  FileText,
  Lock,
  MessageSquareDashed,
  MoreVertical,
  Pencil,
  Pin,
  Sparkles,
  PinOff,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { chatHeader, chatEmptyIcon } from "./chat-styles";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/roles";
import { useChat, type SendState } from "./chat-provider";
import { ChatAvatar } from "./chat-avatar";
import { Composer } from "./composer";
import type { ChatMessageView } from "@/lib/chat/types";
import { Button } from "@/components/ui/button";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { fill } from "./chat-text";

type Ui = ReturnType<typeof useUiText>;


interface MessageThreadProps {
  /**
   * Returns to the conversation list. `always` is not cosmetic: in the docked
   * panel the list and thread share one column at every width, so a
   * mobile-only back control left desktop users with no way out of a thread.
   */
  onBack?: () => void;
  backVisibility?: "always" | "mobile";
}

function dayLabel(iso: string, ui: Ui, tag: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return ui("Today");
  if (sameDay(date, yesterday)) return ui("Yesterday");
  return date.toLocaleDateString(tag, { day: "numeric", month: "long", year: "numeric" });
}

function clockTime(iso: string, tag?: string) {
  return new Date(iso).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });
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
    sendStates,
    retryMessage,
    discardMessage,
    lastSyncedAt,
    isConnected,
  } = useChat();
  const ui = useUiText();
  const locale = useLocale();
  const tag = localeTag(locale);

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
        <header className={cn(chatHeader, "relative z-20")}>
          {showBack && (
            <Button variant="ghost" size="icon"
              type="button"
              onClick={onBack}
              aria-label={ui("Back to conversations")}
              className={cn(
                "-ms-1 shrink-0",
                "hover:-translate-x-0.5 rtl:hover:translate-x-0.5",
                backVisibility === "mobile" && "md:hidden"
              )}
            >
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
          )}

          <ChatAvatar
            name={detail.title}
            seed={detail.counterpart?.id ?? detail.id}
            imageUrl={detail.avatarUrl}
            size="lg"
            online={detail.kind === "DIRECT" ? detail.isOnline : undefined}
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">
              <bdi>{detail.title}</bdi>
            </p>
            <div className="mt-0.5 h-3.5">
              <AnimatePresence mode="wait" initial={false}>
                {others.length > 0 ? (
                  <motion.p
                    key="typing"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    className="flex items-center gap-1.5 text-2xs font-bold text-primary"
                  >
                    <TypingDots />
                    {fill(ui("{0} typing"), [others.map((t) => t.fullName.split(" ")[0]).join(", ")])}
                  </motion.p>
                ) : (
                  <motion.p
                    key="status"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    className="truncate text-xs font-medium text-ink-muted"
                  >
                    {detail.kind === "DIRECT" ? (
                      detail.isOnline ? (
                        <span className="text-emerald-600">{ui("Online now")}</span>
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
              className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-2xs font-bold text-amber-700 ring-1 ring-amber-200/70"
              title={ui("Closed to new messages")}
            >
              <Lock className="h-3 w-3" />
              <span className="hidden sm:inline">{ui("Closed")}</span>
            </span>
          )}

          {detail.kind !== "DIRECT" && (
            <Button variant="ghost" size="sm"
              type="button"
              onClick={() => setShowMembers((v) => !v)}
              aria-expanded={showMembers}
              aria-label={ui("{0} members", [detail.memberCount])}
              className={cn(
                "flex justify-start shrink-0 items-center gap-1",
                showMembers
                  ? "bg-primary text-white shadow-[0_6px_16px_-6px_rgba(129,39,207,0.6)]"
                  : "text-ink-muted hover:bg-brand-50"
              )}
            >
              <Users className="h-3.5 w-3.5" />
              {detail.memberCount}
            </Button>
          )}

          <div className="relative shrink-0">
            <Button variant="secondary"
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={ui("Conversation options")}
              aria-expanded={menuOpen}

            >
              <MoreVertical className="h-4 w-4" />
            </Button>

            <AnimatePresence>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -4 }}
                    transition={{ type: "spring", stiffness: 460, damping: 30 }}
                    className="absolute end-0 top-full z-20 mt-1.5 w-48 origin-top-right rtl:origin-top-left overflow-hidden rounded-2xl border border-edge/30 bg-white/95 p-1 shadow-[0_20px_50px_-14px_rgba(31,26,35,0.35)] backdrop-blur-xl"
                  >
                    <MenuItem
                      icon={detail.isMuted ? Bell : BellOff}
                      label={detail.isMuted ? ui("Unmute") : ui("Mute notifications")}
                      onClick={() => {
                        setPreference(detail.id, { isMuted: !detail.isMuted });
                        setMenuOpen(false);
                      }}
                    />
                    <MenuItem
                      icon={detail.isPinned ? PinOff : Pin}
                      label={detail.isPinned ? ui("Unpin") : ui("Pin to top")}
                      onClick={() => {
                        setPreference(detail.id, { isPinned: !detail.isPinned });
                        setMenuOpen(false);
                      }}
                    />
                    <MenuItem
                      icon={MessageSquareDashed}
                      label={detail.isArchived ? ui("Unarchive") : ui("Archive")}
                      onClick={() => {
                        setPreference(detail.id, { isArchived: !detail.isArchived });
                        setMenuOpen(false);
                        closeConversation();
                      }}
                    />
                    {detail.kind !== "DIRECT" && (
                      <>
                        <span className="my-1 block h-px bg-edge/30" aria-hidden />
                        <MenuItem
                          icon={Trash2}
                          label={ui("Leave conversation")}
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
              className="shrink-0 overflow-hidden border-b border-edge/25 bg-gradient-to-b from-brand-50/80 to-white/40"
            >
              <ul className="flex flex-wrap gap-1.5 px-4 py-3">
                {detail.members.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center gap-1.5 rounded-full bg-white py-1 ps-1 pe-2.5 text-2xs font-bold text-ink shadow-[0_2px_8px_-2px_rgba(31,26,35,0.12)] ring-1 ring-edge/25"
                  >
                    <ChatAvatar name={m.fullName} seed={m.userId} imageUrl={m.profileImageUrl} size="sm" online={m.isOnline} />
                    <bdi className="max-w-[120px] truncate">{m.fullName}</bdi>
                    <span className="text-ink-faint">{roleLabel(m.role, locale.language)}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Messages ── */}
        <div
          ref={scrollRef}
          className="custom-scrollbar relative min-h-0 flex-1 overflow-y-auto bg-background px-3 py-4 md:px-5"
        >
          {hasOlder && (
            <div className="mb-5 flex justify-center">
              <Button variant="outline" size="sm"
                type="button"
                onClick={loadOlder}
                className="backdrop-blur hover:-translate-y-0.5"
              >
                {ui("Load earlier messages")}
              </Button>
            </div>
          )}

          {!isConnected && lastSyncedAt && (
            <p role="status" className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-2xs font-bold text-amber-900" data-chat-offline>
              {fill(ui("Reconnecting. Showing messages up to {0}; anything sent meanwhile appears when the connection returns."), [clockTime(lastSyncedAt, tag)])}
            </p>
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
                  !previous || dayLabel(previous.createdAt, ui, tag) !== dayLabel(message.createdAt, ui, tag);

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
                    {showDay && <DaySeparator label={dayLabel(message.createdAt, ui, tag)} />}

                    {message.kind === "SYSTEM" ? (
                      <p className="py-2 text-center text-2xs font-bold text-ink-faint">
                        <span className="rounded-full bg-white/70 px-2.5 py-1 ring-1 ring-edge/25">
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
                        language={locale.language}
                        tag={tag}
                        sendState={message.clientKey && message.id.startsWith("pending-") ? sendStates[message.clientKey] : undefined}
                        seen={isMine && !message.id.startsWith("pending-") && detail.members.some((m) => m.userId !== viewerId && m.lastReadAt !== null && m.lastReadAt >= message.createdAt)}
                        onRetry={() => message.clientKey && void retryMessage(message.clientKey)}
                        onDiscard={() => message.clientKey && discardMessage(message.clientKey)}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {others.length > 0 && (
            <div className="mt-2 flex justify-start ps-1">
              <span className="flex items-center gap-1.5 rounded-2xl rounded-es-md bg-white px-3 py-2.5 shadow-[0_4px_14px_-6px_rgba(31,26,35,0.2)] ring-1 ring-edge/25">
                <TypingDots />
              </span>
            </div>
          )}

          {detail.kind === "DIRECT" && counterpartRead && messages.length > 0 && (
            <p className="mt-2 flex items-center justify-end gap-1 pe-1 text-2xs font-bold text-ink-faint">
              <CheckCheck className="h-3 w-3 text-primary" />
              {fill(ui("Seen {0}"), [clockTime(counterpartRead, tag)])}
            </p>
          )}

          <div ref={bottomRef} className="h-1" />
        </div>

        <Composer
          conversationId={detail.id}
          canPost={detail.canPost}
          lockedReason={
            detail.isLocked
              ? ui("This conversation is closed to new messages.")
              : ui("Only moderators can post in this channel.")
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
  const ui = useUiText();
  return (
    <span className="flex items-center gap-1" aria-label={ui("Typing")}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="sk-typing-dot h-1.5 w-1.5 rounded-full bg-primary" />
      ))}
    </span>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-edge/50" aria-hidden />
      <span className="rounded-full bg-white/90 px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-ink-subtle shadow-[0_2px_10px_-4px_rgba(31,26,35,0.18)] ring-1 ring-edge/25">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-edge/50" aria-hidden />
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
    <Button variant="ghost" size="sm"
      type="button"
      onClick={onClick}
      className={cn(
        "flex justify-start w-full items-center gap-2.5 text-start",
        destructive
          ? "text-rose-600 hover:bg-rose-50"
          : "text-ink hover:bg-brand-50"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </Button>
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
  sendState,
  seen,
  onRetry,
  onDiscard,
  language,
  tag,
}: {
  language: "en" | "ar" | "ur";
  tag: string;
  sendState?: SendState;
  seen: boolean;
  onRetry: () => void;
  onDiscard: () => void;
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
  const ui = useUiText();

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

      <div className={cn("min-w-0 max-w-[85%] sm:max-w-[72%]", isMine && "order-2")}>
        {showSender && message.sender && (
          <p className="mb-1 px-1 text-2xs font-bold text-primary">
            <bdi>{message.sender.fullName}</bdi>
            <span className="ms-1.5 font-bold text-ink-faint">{roleLabel(message.sender.role, language)}</span>
          </p>
        )}

        <div
          className={cn(
            "relative overflow-hidden px-3.5 py-2.5 transition-shadow",
            isMine
              ? [
                  "bg-primary text-primary-foreground",
                  "shadow-sm",
                  grouped ? "rounded-2xl rounded-ee-md" : "rounded-2xl rounded-ee-sm",
                ]
              : [
                  "bg-white text-ink ring-1 ring-edge/30",
                  "shadow-sm",
                  grouped ? "rounded-2xl rounded-es-md" : "rounded-2xl rounded-es-sm",
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
                "mb-2 rounded-lg border-s-2 py-1 ps-2 pe-1",
                isMine ? "border-white/50 bg-white/10" : "border-primary/50 bg-brand-50"
              )}
            >
              <p className={cn("text-2xs font-bold", isMine ? "text-white/90" : "text-primary")}>
                {message.replyTo.senderName ? <bdi>{message.replyTo.senderName}</bdi> : ui("Message")}
              </p>
              <p
                className={cn(
                  "truncate text-2xs font-semibold",
                  isMine ? "text-white/75" : "text-ink-muted"
                )}
              >
                {message.replyTo.body || ui("withdrawn")}
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
              {ui("This message was withdrawn")}
            </p>
          ) : (
            <>
              {message.body && (
                <p className="whitespace-pre-wrap break-words text-sm font-normal leading-relaxed">
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
                            "group/file flex items-center gap-2 rounded-xl px-2.5 py-2 text-2xs font-bold transition-all",
                            isMine
                              ? "bg-white/15 text-white hover:bg-white/25"
                              : "bg-brand-50 text-primary hover:bg-[#f0e2f8]"
                          )}
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          <bdi className="min-w-0 flex-1 truncate">{a.fileName}</bdi>
                          <span className="shrink-0 text-2xs opacity-70">{formatSize(a.sizeBytes)}</span>
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
              "mt-1 flex items-center justify-end gap-1 text-2xs font-bold",
              isMine ? "text-white/70" : "text-ink-faint"
            )}
          >
            {message.isUrgent && <span className="rounded bg-white/25 px-1 font-semibold uppercase" data-urgent>{ui("Urgent")}</span>}
            {message.isEdited && !message.isDeleted && <span>{ui("edited")}</span>}
            <bdi>{clockTime(message.createdAt, tag)}</bdi>
            {/* SKO-415: one tick only once the server has stored it; two only when a member has read it.
                Never a delivery tick for something still on this device. */}
            {isMine &&
              (isPending ? (
                sendState?.status === "sending" || !sendState ? <span className="inline-flex items-center gap-0.5" data-send-state="sending"><Clock className="h-2.5 w-2.5" aria-hidden />{ui("Sending…")}</span> : null
              ) : seen ? (
                <span className="inline-flex items-center" data-send-state="seen" title={ui("Seen")}><CheckCheck className="h-2.5 w-2.5" aria-hidden /><span className="sr-only">{ui("Seen")}</span></span>
              ) : (
                <span className="inline-flex items-center" data-send-state="sent" title={ui("Sent")}><Check className="h-2.5 w-2.5" aria-hidden /><span className="sr-only">{ui("Sent")}</span></span>
              ))}
          </p>
        </div>
        {isPending && sendState && sendState.status !== "sending" && (
          <div role="alert" className="mt-1 flex flex-wrap items-center justify-end gap-1.5 text-2xs font-bold text-rose-700" data-send-state={sendState.status}>
            <AlertTriangle className="h-3 w-3" aria-hidden />
            <span>{sendState.status === "unconfirmed" ? (sendState.error ? ui(sendState.error) : null) : ui("Not sent: {0}", [sendState.error ? ui(sendState.error) : ui("the server refused it")])}</span>
            <Button size="sm" variant="secondary" type="button" onClick={onRetry} aria-label={ui("Retry sending this message")}><RotateCcw className="h-3 w-3" aria-hidden />{ui("Retry")}</Button>
            <Button size="sm" variant="ghost" type="button" onClick={onDiscard} aria-label={ui("Discard this unsent message")}>{ui("Discard")}</Button>
          </div>
        )}
      </div>

      {!message.isDeleted && !isPending && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5 self-center rounded-full bg-white/90 p-0.5 opacity-0 shadow-[0_4px_14px_-6px_rgba(31,26,35,0.3)] ring-1 ring-edge/25 backdrop-blur transition-all",
            "focus-within:opacity-100 group-hover:opacity-100",
            isMine && "order-1"
          )}
        >
          <IconAction icon={CornerUpLeft} label={ui("Reply")} onClick={onReply} />
          {isMine && <IconAction icon={Pencil} label={ui("Edit")} onClick={onEdit} />}
          {(isMine || canModerate) && (
            <IconAction icon={Trash2} label={ui("Withdraw")} onClick={onDelete} destructive />
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
    <Button variant="ghost" size="icon"
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "",
        destructive
          ? "text-ink-faint hover:bg-rose-50 hover:text-rose-600"
          : "text-ink-faint hover:bg-brand-50"
      )}
    >
      <Icon className="h-3 w-3" />
    </Button>
  );
}

/** Shown in the thread pane before anything is selected. */
function ThreadPlaceholder() {
  const ui = useUiText();
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-4 overflow-hidden bg-background p-8 text-center">
      <span className={chatEmptyIcon}><Users className="h-7 w-7" /></span>

      <div className="max-w-xs">
        <p className="text-base font-semibold tracking-tight text-foreground">{ui("Select a conversation")}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          {ui("Pick someone from the list, or start a new conversation with anyone you are connected to at school.")}
        </p>
      </div>
    </div>
  );
}

function EmptyThread({ title }: { title: string }) {
  const ui = useUiText();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-3xl bg-white text-primary shadow-[0_10px_28px_-12px_rgba(129,39,207,0.5)] ring-1 ring-edge/25">
        <Sparkles className="h-6 w-6" />
      </span>
      <div>
        <p className="text-xs font-bold text-ink-strong">{ui("No messages yet")}</p>
        <p className="mt-1 text-2xs font-semibold text-ink-muted">
          {fill(ui("Say hello to {0}."), [title.split(" ")[0]])}
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
              row.mine ? "rounded-ee-sm bg-[#e6d6f5]" : "rounded-es-sm bg-border-subtle"
            )}
          />
        </div>
      ))}
    </div>
  );
}
