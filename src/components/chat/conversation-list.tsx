"use client";

import { motion, MotionConfig } from "framer-motion";
import { BellOff, Inbox, Pin, Search, SquarePen, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/roles";
import { useChat, type ConversationFilter } from "./chat-provider";
import { ChatAvatar } from "./chat-avatar";
import type { ConversationView } from "@/lib/chat/types";

const FILTERS: { value: ConversationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "archived", label: "Archived" },
];

/** "now", "3m", "2h", "Tue", "14 Aug" — enough to place a message without a date. */
function relativeTime(iso: string | null) {
  if (!iso) return "";
  const then = new Date(iso);
  const minutes = Math.round((Date.now() - then.getTime()) / 60_000);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h`;
  if (minutes < 7 * 24 * 60) return then.toLocaleDateString(undefined, { weekday: "short" });
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const KIND_BADGE: Record<string, { label: string; className: string }> = {
  GROUP: { label: "Group", className: "bg-[#fbf0fe] text-[#8127cf]" },
  CLASS: { label: "Class", className: "bg-emerald-50 text-emerald-700" },
  ANNOUNCEMENT: { label: "Notice", className: "bg-amber-50 text-amber-700" },
};

export function ConversationList({ onNewChat }: { onNewChat: () => void }) {
  const {
    viewer,
    conversations,
    filter,
    setFilter,
    search,
    setSearch,
    activeId,
    openConversation,
    isLoadingList,
    isConnected,
    unreadTotal,
  } = useChat();

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full min-h-0 flex-col">
        {/* ── Head ── */}
        <div className="relative shrink-0 space-y-3 overflow-hidden border-b border-[#cfc2d6]/25 bg-gradient-to-br from-white via-white to-[#fbf0fe]/60 p-4">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[#8127cf]/10 blur-2xl"
          />

          <div className="relative flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-sm font-black tracking-tight text-[#1f1a23]">Messages</h2>
              {unreadTotal > 0 && (
                <span className="rounded-full bg-gradient-to-br from-[#b10e6b] to-[#e0559a] px-1.5 py-0.5 text-[10px] font-black text-white shadow-[0_4px_12px_-4px_rgba(177,14,107,0.7)]">
                  {unreadTotal > 99 ? "99+" : unreadTotal}
                </span>
              )}
              <span
                className={cn(
                  "flex items-center",
                  isConnected ? "text-emerald-500" : "text-amber-500"
                )}
                title={isConnected ? "Live" : "Reconnecting"}
              >
                {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              </span>
              <span className="sr-only" role="status">
                {isConnected ? "Live updates connected" : "Reconnecting to live updates"}
              </span>
            </div>

            <button
              type="button"
              onClick={onNewChat}
              className="sk-sweep-trigger relative flex shrink-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] px-2.5 py-1.5 text-[11px] font-black text-white shadow-[0_8px_20px_-8px_rgba(129,39,207,0.7)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-10px_rgba(129,39,207,0.8)] active:scale-95"
            >
              <span
                aria-hidden
                className="sk-sweep bg-gradient-to-r from-transparent via-white/40 to-transparent"
              />
              <SquarePen className="relative h-3.5 w-3.5" />
              <span className="relative">New</span>
            </button>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              className="w-full rounded-xl border border-[#cfc2d6]/30 bg-white/80 py-2.5 pl-9 pr-3 text-xs font-semibold text-ink shadow-[inset_0_1px_2px_rgba(31,26,35,0.05)] transition-all placeholder:text-ink-faint focus:border-[#8127cf]/40 focus:bg-white focus:shadow-[0_0_0_4px_rgba(129,39,207,0.10)] focus:outline-none"
            />
          </div>

          <div
            className="relative flex gap-1 rounded-xl bg-[#f4ecf8]/70 p-1"
            role="tablist"
            aria-label="Filter conversations"
          >
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "relative flex-1 cursor-pointer rounded-lg px-2 py-1.5 text-[11px] font-black transition-colors",
                  filter === f.value ? "text-white" : "text-ink-muted hover:text-[#8127cf]"
                )}
              >
                {filter === f.value && (
                  <motion.span
                    layoutId="chat-filter-pill"
                    transition={{ type: "spring", stiffness: 520, damping: 36 }}
                    className="absolute inset-0 rounded-lg bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-[0_6px_16px_-6px_rgba(129,39,207,0.7)]"
                  />
                )}
                <span className="relative">{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Rows ── */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {isLoadingList ? (
            <ListSkeleton />
          ) : conversations.length === 0 ? (
            <EmptyList filter={filter} onNewChat={onNewChat} />
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <ConversationRow
                    conversation={c}
                    isActive={activeId === c.id}
                    viewerId={viewer?.id}
                    onOpen={() => openConversation(c.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}

function ConversationRow({
  conversation: c,
  isActive,
  viewerId,
  onOpen,
}: {
  conversation: ConversationView;
  isActive: boolean;
  viewerId?: string;
  onOpen: () => void;
}) {
  const badge = KIND_BADGE[c.kind];
  const unread = c.unreadCount > 0;
  const sentByMe = Boolean(viewerId) && c.lastMessageSenderId === viewerId;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "group relative isolate flex w-full cursor-pointer items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-all duration-200",
        isActive
          ? "text-[#1f1a23]"
          : "hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_8px_22px_-12px_rgba(31,26,35,0.28)]"
      )}
    >
      {isActive && (
        <motion.span
          layoutId="chat-active-conversation"
          transition={{ type: "spring", stiffness: 520, damping: 38 }}
          className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-r from-[#fbf0fe] to-white shadow-[0_8px_24px_-10px_rgba(129,39,207,0.4)] ring-1 ring-[#8127cf]/15"
        >
          <span className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-[#8127cf] to-[#b10e6b]" />
        </motion.span>
      )}

      <ChatAvatar
        name={c.title}
        seed={c.counterpart?.id ?? c.id}
        imageUrl={c.avatarUrl}
        size="md"
        online={c.kind === "DIRECT" ? c.isOnline : undefined}
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs tracking-tight",
              unread ? "font-black text-[#1f1a23]" : "font-bold text-ink"
            )}
          >
            {c.title}
          </span>
          {c.isPinned && <Pin className="h-3 w-3 shrink-0 self-center text-[#8127cf]" aria-label="Pinned" />}
          {c.isMuted && <BellOff className="h-3 w-3 shrink-0 self-center text-ink-faint" aria-label="Muted" />}
          <span
            className={cn(
              "shrink-0 text-[10px] font-bold",
              unread ? "text-[#b10e6b]" : "text-ink-faint"
            )}
          >
            {relativeTime(c.lastMessageAt)}
          </span>
        </span>

        <span className="mt-1 flex items-center gap-1.5">
          {badge && (
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider",
                badge.className
              )}
            >
              {badge.label}
            </span>
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[11px]",
              unread ? "font-bold text-ink" : "font-semibold text-ink-muted"
            )}
          >
            {sentByMe && <span className="text-ink-faint">You: </span>}
            {c.lastMessagePreview || c.subtitle || "No messages yet"}
          </span>

          {unread && (
            <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#b10e6b] to-[#e0559a] px-1.5 text-[10px] font-black text-white shadow-[0_4px_12px_-3px_rgba(177,14,107,0.7)]">
              {c.unreadCount > 99 ? "99+" : c.unreadCount}
            </span>
          )}
        </span>

        {c.kind === "DIRECT" && c.counterpart && (
          <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wide text-ink-faint">
            {roleLabel(c.counterpart.role)}
          </span>
        )}
      </span>
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 p-1" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl px-2 py-2.5">
          <div className="skeleton-shimmer h-10 w-10 shrink-0 rounded-2xl bg-[#eadfed]" />
          <div className="flex-1 space-y-2">
            <div className="skeleton-shimmer h-2.5 w-2/3 rounded-full bg-[#eadfed]" />
            <div className="skeleton-shimmer h-2.5 w-full rounded-full bg-[#eadfed]/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyList({
  filter,
  onNewChat,
}: {
  filter: ConversationFilter;
  onNewChat: () => void;
}) {
  const copy =
    filter === "unread"
      ? { title: "Nothing unread", body: "You are all caught up." }
      : filter === "archived"
        ? { title: "No archived chats", body: "Archived conversations land here." }
        : {
            title: "No conversations yet",
            body: "Start one with a colleague, a teacher, or the office.",
          };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="sk-float grid h-16 w-16 place-items-center rounded-[22px] bg-gradient-to-br from-[#8127cf] to-[#b10e6b] text-white shadow-[0_16px_36px_-14px_rgba(129,39,207,0.75)]">
        <Inbox className="h-7 w-7" />
      </span>
      <div>
        <p className="text-xs font-black text-[#1f1a23]">{copy.title}</p>
        <p className="mt-1 text-[11px] font-semibold leading-relaxed text-ink-muted">{copy.body}</p>
      </div>
      {filter === "all" && (
        <button
          type="button"
          onClick={onNewChat}
          className="cursor-pointer rounded-xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] px-3.5 py-2 text-[11px] font-black text-white shadow-[0_10px_24px_-8px_rgba(129,39,207,0.7)] transition-all hover:-translate-y-0.5 active:scale-95"
        >
          Start a conversation
        </button>
      )}
    </div>
  );
}
