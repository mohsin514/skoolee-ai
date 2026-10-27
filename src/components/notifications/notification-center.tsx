"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, AtSign, Bell, CheckCircle2, ClipboardList, Eye, Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { checkedJson, readRequest, requestFailure, RequestFailure } from "@/lib/http/request-state";
import { Badge } from "@/components/ui/badge";
import { SkeletonList } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useUiText } from "@/components/locale/LocaleProvider";
import { NOTIFICATION_FIXED_MESSAGE_KINDS, NOTIFICATION_FIXED_TITLE_KINDS, NOTIFICATION_NOTICE_ONLY_KINDS } from "@/lib/notifications/links";

// SKO-416: All / Mentions / Needs you. "Seen" is attention only; an assigned action stays open until its
// source workflow completes it, and every open rechecks access before navigating.

type Item = {
  id: string; type?: string; title: string; message: string; link: string | null; isRead: boolean; createdAt: string; actorName: string | null;
  category: "UPDATE" | "MENTION" | "ACTION"; state: "open" | "resolved" | "unavailable"; overdue: boolean; dueAt: string | null;
  resolution: string | null; reminderCount: number;
};
type Counts = { unread: number; mentionsUnread: number; openActions: number; overdueActions: number };
const TABS = [
  { key: "all", label: "All" },
  { key: "mentions", label: "Mentions" },
  { key: "actions", label: "Needs you" },
] as const;

export function NotificationCenter({ formatTime, onClose, onChanged }: { formatTime: (iso: string) => string; onClose: () => void; onChanged: () => void }) {
  const ui = useUiText();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [items, setItems] = useState<Item[] | null>(null), [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<RequestFailure | null>(null), [notice, setNotice] = useState<Record<string, string>>({});

  const mutation = useRef(false);
  const [busy, setBusy] = useState(false);

  // A slower response for a tab the user already left must never overwrite the current tab's list.
  const requestRef = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setError(null); setItems(null); setCounts(null);
    try {
      const params = new URLSearchParams({ view: tab, limit: "30", ...(tab === "actions" ? { status: "open" } : {}) });
      const json = await checkedJson(await readRequest(`/api/notifications?${params}`));
      if (requestId !== requestRef.current) return;
      if (!Array.isArray(json.notifications) || !json.counts) throw new RequestFailure("server");
      setItems(json.notifications); setCounts(json.counts);
    } catch (failure) { if (requestId === requestRef.current) { setItems(null); setCounts(null); setError(requestFailure(failure)); } }
  }, [tab]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); requestRef.current++; }; }, [load]);

  // Never announce a save or navigate until the server confirms it. No automatic mutation replay.
  const act = async (action: () => Promise<void>, itemId?: string) => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true);
    try { await action(); }
    catch (failure) {
      const classified = requestFailure(failure);
      if (!itemId || classified.kind === "denied" || classified.kind === "session") {
        requestRef.current++; setItems(null); setCounts(null); setError(classified);
      } else setNotice(prev => ({ ...prev, [itemId]: ui(classified.message) }));
    } finally { mutation.current = false; setBusy(false); }
  };
  const seen = (item: Item) => act(async () => {
    await checkedJson(await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [item.id] }) }));
    setItems(prev => prev?.map(row => row.id === item.id ? { ...row, isRead: true } : row) ?? prev);
    setNotice(prev => ({ ...prev, [item.id]: item.category === "ACTION" && item.state === "open" ? ui("Marked seen. The task is still waiting for you.") : "" }));
    onChanged();
  }, item.id);
  const open = (item: Item) => act(async () => {
    const json = await checkedJson(await fetch(`/api/notifications/${encodeURIComponent(item.id)}/open`, { method: "POST" }));
    if (!json.data || json.data.id !== item.id) throw new RequestFailure("server");
    const fresh: Item = json.data;
    onChanged();
    setItems(prev => prev?.map(row => row.id === item.id ? fresh : row) ?? prev);
    if (fresh.state === "unavailable" || !fresh.link) { setNotice(prev => ({ ...prev, [item.id]: ui("You no longer have access to this item.") })); return; }
    onClose(); router.push(fresh.link);
  }, item.id);
  const markUpdatesRead = () => act(async () => {
    await checkedJson(await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true, view: tab === "all" ? undefined : tab }) }));
    onChanged(); await load();
  });

  const badge = (key: string) => key === "mentions" ? counts?.mentionsUnread : key === "actions" ? counts?.openActions : counts?.unread;
  return <div data-notification-center>
    <div role="tablist" aria-label={ui("Notification views")} className="flex gap-1 border-b border-border px-3 pt-2">
      {TABS.map(item => <Button variant="ghost" key={item.key} role="tab" type="button" disabled={busy} aria-selected={tab === item.key} onClick={() => { setItems(null); setTab(item.key); }}
        className={cn("flex items-center gap-1 rounded-t-lg px-3 py-2 text-xs font-semibold", tab === item.key ? "border-b-2 border-primary text-primary" : "text-ink-muted")} data-tab={item.key}>
        {ui(item.label)}{badge(item.key) ? <Badge size="sm" variant="neutral" className="tabular-nums" data-tab-count={badge(item.key)}>{badge(item.key)}</Badge> : null}
      </Button>)}
    </div>
    {tab === "actions" && counts?.overdueActions ? <div className="mx-3 mt-2"><Badge variant="danger" dot className="tabular-nums" data-overdue-actions={counts.overdueActions}>{ui("{0} overdue", [counts.overdueActions])}</Badge></div> : null}
    <div className="max-h-[360px] space-y-1 overflow-y-auto p-2" aria-live="polite">
      {error ? <ErrorState error={error} onRetry={load} />
        : items === null ? <SkeletonList rows={3} label={ui("Loading…")} />
        : items.length === 0 ? <EmptyState size="sm" icon={Bell} title={tab === "actions" ? ui("No assigned actions need your attention.") : tab === "mentions" ? ui("No one has messaged you directly.") : ui("No notifications yet")} />
        : items.map(item => {
          const Icon = item.category === "ACTION" ? ClipboardList : item.category === "MENTION" ? AtSign : Bell;
          // Fixed sentences (and the "no longer available" placeholder) read in the viewer's language; titles and
          // messages that carry names, classes or amounts stay as written.
          const hidden = item.state === "unavailable";
          const title = hidden || (item.type && NOTIFICATION_FIXED_TITLE_KINDS.has(item.type)) ? ui(item.title) : item.title;
          const message = hidden || (item.type && NOTIFICATION_FIXED_MESSAGE_KINDS.has(item.type)) ? ui(item.message) : item.message;
          const openable = !hidden && !(item.type && NOTIFICATION_NOTICE_ONLY_KINDS.has(item.type));
          return <article key={item.id} className={cn("rounded-xl p-2.5", !item.isRead && "bg-brand-50/50")} data-notification={item.id} data-category={item.category} data-state={item.state} data-read={item.isRead}>
            <div className="flex items-start gap-2.5">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", item.state === "unavailable" ? "bg-muted text-ink-subtle" : "bg-primary/10 text-primary")}><Icon className="h-4 w-4" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", !item.isRead ? "font-bold" : "font-semibold")}><bdi>{title}</bdi>{item.reminderCount > 0 ? <span className="ms-1 text-2xs font-bold text-ink-muted">· {ui("{0} more", [item.reminderCount])}</span> : null}</p>
                <p className="line-clamp-2 text-xs text-ink-muted"><bdi>{message}</bdi></p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs font-semibold text-ink-subtle">
                  <span>{formatTime(item.createdAt)}</span>
                  {item.category === "ACTION" ? (
                    item.state === "resolved" ? <span className="inline-flex items-center gap-0.5 text-status-success-text" data-action-state="resolved"><CheckCircle2 className="h-3 w-3" aria-hidden />{item.resolution === "CANCELLED" ? ui("Withdrawn") : ui("Done")}</span>
                    : item.state === "open" ? <span className={cn("rounded px-1", item.overdue ? "bg-status-error-surface text-status-error-text" : "bg-status-warning-surface text-status-warning-text")} data-action-state={item.overdue ? "overdue" : "open"}>{item.overdue ? ui("Overdue") : ui("Waiting for you")}</span> : null
                  ) : null}
                  {item.category === "ACTION" && item.state === "open" && item.isRead ? <span data-opened-pending>{ui("Opened, but still awaiting your action.")}</span> : null}
                </p>
                {notice[item.id] ? <p role="status" className="mt-1 text-2xs font-bold text-status-warning-text">{notice[item.id]}</p> : null}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {openable ? <Button size="sm" variant={item.category === "ACTION" ? "default" : "secondary"} disabled={busy} onClick={() => void open(item)} aria-label={ui("Open {0}", [title])}>
                    {item.category === "MENTION" ? <><Reply className="h-3 w-3" aria-hidden />{ui("Reply")}</> : item.category === "ACTION" && item.state === "open" ? ui("Open task") : ui("Open")}
                  </Button> : item.state === "unavailable" ? <span className="inline-flex items-center gap-1 text-2xs font-bold text-ink-muted"><AlertTriangle className="h-3 w-3" aria-hidden />{ui("You no longer have access to this item.")}</span> : null}
                  {!item.isRead ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void seen(item)} aria-label={ui("Mark {0} as seen", [title])}><Eye className="h-3 w-3" aria-hidden />{ui("Seen")}</Button> : null}
                </div>
              </div>
            </div>
          </article>;
        })}
    </div>
    {tab !== "actions" && (counts?.unread ?? 0) > 0 ? <div className="border-t border-border px-4 py-2.5">
      <Button variant="secondary" size="sm" className="w-full" disabled={busy} onClick={() => void markUpdatesRead()}>{tab === "mentions" ? ui("Mark mentions as seen") : ui("Mark all as seen")}</Button>
      <p className="mt-1 text-center text-2xs text-ink-subtle">{ui("Seen only clears the dot. Tasks stay open until they are done.")}</p>
    </div> : null}
  </div>;
}
