"use client";
import { chatUnreadBadge } from "./chat-styles";
import { EmptyState } from "@/components/ui/empty-state";
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
import { Tooltip } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";

type Ui = ReturnType<typeof useUiText>;

/** The server's stand-in previews for media messages are interface copy; message text is not. */
const MEDIA_PREVIEWS = new Set(["📷 Photo", "📎 Attachment", "Attachment"]);


const FILTERS: { value: ConversationFilter; label: (ui: Ui) => string }[] = [
  { value: "all", label: (ui) => ui("All") },
  { value: "unread", label: (ui) => ui("Unread") },
  { value: "archived", label: (ui) => ui("Archived") },
];

/** "now", "3m", "2h", "Tue", "14 Aug" — enough to place a message without a date. */
function relativeTime(iso: string | null, ui: Ui, tag: string) {
  if (!iso) return "";
  const then = new Date(iso);
  const minutes = Math.round((Date.now() - then.getTime()) / 60_000);

  if (minutes < 1) return ui("now");
  if (minutes < 60) return ui("{0}m", [minutes]);
  if (minutes < 24 * 60) return ui("{0}h", [Math.round(minutes / 60)]);
  if (minutes < 7 * 24 * 60) return then.toLocaleDateString(tag, { weekday: "short" });
  return then.toLocaleDateString(tag, { day: "numeric", month: "short" });
}

const KIND_BADGE: Record<string, { label: (ui: Ui) => string; variant: "default" | "success" | "warning" }> = {
  GROUP: { label: (ui) => ui("Group"), variant: "default" },
  CLASS: { label: (ui) => ui("Class"), variant: "success" },
  ANNOUNCEMENT: { label: (ui) => ui("Notice"), variant: "warning" },
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
  const ui = useUiText();

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full min-h-0 flex-col">
        {/* ── Head ── */}
        <div className="relative shrink-0 space-y-3 border-b border-border bg-card p-4">

          <div className="relative flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-foreground">{ui("Inbox")}</h2>
              {unreadTotal > 0 && (
                <span className={chatUnreadBadge}>
                  {unreadTotal > 99 ? "99+" : unreadTotal}
                </span>
              )}
              <Tooltip content={isConnected ? ui("Live") : ui("Reconnecting")} describe={false}>
                <span
                  tabIndex={0}
                  className={cn(
                    "flex items-center rounded-full",
                    isConnected ? "text-emerald-500" : "text-amber-500"
                  )}
                >
                  {isConnected ? <Wifi className="h-3 w-3" aria-hidden="true" /> : <WifiOff className="h-3 w-3" aria-hidden="true" />}
                </span>
              </Tooltip>
              <span className="sr-only" role="status">
                {isConnected ? ui("Live updates connected") : ui("Reconnecting to live updates")}
              </span>
            </div>

            {/* The empty "All" list carries its own call to action; the head never repeats it. */}
            {isLoadingList || conversations.length > 0 || filter !== "all" ? (
              <Button variant="default" size="sm"
                type="button"
                onClick={onNewChat}
                className="shrink-0"
              >
                <SquarePen className="relative h-3.5 w-3.5" aria-hidden="true" />
                <span className="relative">{ui("New message")}</span>
              </Button>
            ) : null}
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
              placeholder={ui("Search conversations")}
              aria-label={ui("Search conversations")}
              className="w-full py-2.5 ps-9 pe-3"
            />
          </InputGroup>

          <div
            className="relative flex gap-1 rounded-2xl bg-muted p-1"
            role="tablist"
            aria-label={ui("Filter conversations")}
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

                <span className="relative">{f.label(ui)}</span>
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
  const ui = useUiText();
  const locale = useLocale();
  const badge = KIND_BADGE[c.kind];
  const unread = c.unreadCount > 0;
  const sentByMe = Boolean(viewerId) && c.lastMessageSenderId === viewerId;

  return (
    <Button variant="ghost"
      type="button"
      onClick={onOpen}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "sk-row-interactive group relative isolate flex h-auto w-full items-start justify-start gap-3 rounded-2xl px-3 py-3 text-start",
        isActive && "text-foreground"
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
            <bdi>{c.title}</bdi>
          </span>
          {c.isPinned && <Pin className="h-3 w-3 shrink-0 self-center text-primary" aria-label={ui("Pinned")} />}
          {c.isMuted && <BellOff className="h-3 w-3 shrink-0 self-center text-ink-faint" aria-label={ui("Muted")} />}
          <span
            className={cn(
              "shrink-0 text-2xs font-semibold tabular-nums",
              unread ? "text-berry" : "text-ink-faint"
            )}
          >
            {relativeTime(c.lastMessageAt, ui, localeTag(locale))}
          </span>
        </span>

        <span className="mt-1 flex items-center gap-1.5">
          {badge && (
            <Badge size="sm" variant={badge.variant} className="shrink-0">
              {badge.label(ui)}
            </Badge>
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs",
              unread ? "font-semibold text-ink" : "font-normal text-ink-muted"
            )}
          >
            {sentByMe && <span className="text-ink-subtle">{ui("You:")} </span>}
            {c.lastMessagePreview && MEDIA_PREVIEWS.has(c.lastMessagePreview)
              ? ui(c.lastMessagePreview)
              : c.lastMessagePreview || c.subtitle ? <bdi>{c.lastMessagePreview || c.subtitle}</bdi> : ui("No messages yet")}
          </span>

          {unread && (
            <span className={cn(chatUnreadBadge, "shrink-0")}>
              {c.unreadCount > 99 ? "99+" : c.unreadCount}
            </span>
          )}
        </span>

        {c.kind === "DIRECT" && c.counterpart && (
          <span className="mt-1 block truncate text-2xs font-medium text-ink-subtle">
            {roleLabel(c.counterpart.role, locale.language)}
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
          <div className="skeleton-shimmer h-10 w-10 shrink-0 rounded-2xl bg-border-subtle" />
          <div className="flex-1 space-y-2">
            <div className="skeleton-shimmer h-2.5 w-2/3 rounded-full bg-border-subtle" />
            <div className="skeleton-shimmer h-2.5 w-full rounded-full bg-border-subtle/70" />
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
  const ui = useUiText();
  const copy =
    filter === "unread"
      ? { title: ui("Nothing unread"), body: ui("You are all caught up.") }
      : filter === "archived"
        ? { title: ui("No archived chats"), body: ui("Archived conversations land here.") }
        : {
            title: ui("No conversations yet"),
            body: ui("Start one with a colleague, a teacher, or the office."),
          };

  return (
    <div className="flex h-full items-center justify-center px-2 py-8">
      <EmptyState
        size="sm"
        icon={Inbox}
        title={copy.title}
        description={copy.body}
        action={
          filter === "all" ? (
            <Button variant="default" size="sm" type="button" onClick={onNewChat}>
              <SquarePen className="h-3.5 w-3.5" aria-hidden="true" />
              {ui("New message")}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
