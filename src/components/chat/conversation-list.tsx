"use client";
import { chatUnreadBadge, chatEmptyIcon } from "./chat-styles";
import { InputGroup } from "@/components/ui/input-group";


import { MotionConfig } from "framer-motion";
import { BellOff, Inbox, Pin, Search, SquarePen, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/roles";
import { useChat, type ConversationFilter } from "./chat-provider";
import { ChatAvatar } from "./chat-avatar";
import type { ConversationView } from "@/lib/chat/types";
import { Input as SystemInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";


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
        <div className="relative shrink-0 space-y-3 border-b border-border bg-card p-4">

          <div className="relative flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Inbox</h2>
              {unreadTotal > 0 && (
                <span className={chatUnreadBadge}>
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

            <Button variant="default" size="sm"
              type="button"
              onClick={onNewChat}
              className="shrink-0"
            >
              <SquarePen className="relative h-3.5 w-3.5" />
              <span className="relative">New</span>
            </Button>
          </div>

          <InputGroup surfaceClassName="bg-card" className="relative">
            <Search data-field-affix="start"
              className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <SystemInput
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              className="w-full py-2.5 ps-9 pe-3"
            />
          </InputGroup>

          <div
            className="relative flex gap-1 rounded-2xl bg-muted p-1"
            role="tablist"
            aria-label="Filter conversations"
          >
            {FILTERS.map((f) => (
              <Button data-selected={filter === f.value} variant="choice" size="sm"
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className="relative flex-1 border-transparent data-[selected=true]:border-border data-[selected=true]:bg-card data-[selected=true]:text-primary data-[selected=true]:shadow-sm"
              >

                <span className="relative">{f.label}</span>
              </Button>
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
    <Button variant="ghost"
      type="button"
      onClick={onOpen}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "group relative isolate flex w-full justify-start items-start gap-3 rounded-2xl px-3 py-3 text-start",
        isActive ? "bg-accent text-foreground" : "hover:bg-muted"
      )}
    >

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
              "min-w-0 flex-1 truncate text-sm tracking-tight",
              unread ? "font-semibold text-foreground" : "font-medium text-ink"
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
              "min-w-0 flex-1 truncate text-xs",
              unread ? "font-bold text-ink" : "font-semibold text-ink-muted"
            )}
          >
            {sentByMe && <span className="text-ink-faint">You: </span>}
            {c.lastMessagePreview || c.subtitle || "No messages yet"}
          </span>

          {unread && (
            <span className={cn(chatUnreadBadge, "shrink-0")}>
              {c.unreadCount > 99 ? "99+" : c.unreadCount}
            </span>
          )}
        </span>

        {c.kind === "DIRECT" && c.counterpart && (
          <span className="mt-1 block truncate text-[11px] font-medium text-ink-faint">
            {roleLabel(c.counterpart.role)}
          </span>
        )}
      </span>
    </Button>
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
      <span className={chatEmptyIcon}>
        <Inbox className="h-7 w-7" />
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{copy.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{copy.body}</p>
      </div>
      {filter === "all" && (
        <Button variant="default" size="sm"
          type="button"
          onClick={onNewChat}
          className="hover:-translate-y-0.5"
        >
          Start a conversation
        </Button>
      )}
    </div>
  );
}
