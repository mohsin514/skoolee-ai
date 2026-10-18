"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, AtSign, Bell, CheckCircle2, ClipboardList, Eye, Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SkeletonList } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useUiText } from "@/components/locale/LocaleProvider";

// SKO-416: All / Mentions / Needs you. "Seen" is attention only; an assigned action stays open until its
// source workflow completes it, and every open rechecks access before navigating.

type Item = {
  id: string; title: string; message: string; link: string | null; isRead: boolean; createdAt: string; actorName: string | null;
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
  const [error, setError] = useState(""), [notice, setNotice] = useState<Record<string, string>>({});

  // A slower response for a tab the user already left must never overwrite the current tab's list.
  const requestRef = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setError("");
    try {
      const params = new URLSearchParams({ view: tab, limit: "30", ...(tab === "actions" ? { status: "open" } : {}) });
      const response = await fetch(`/api/notifications?${params}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (requestId !== requestRef.current) return;
      if (!response.ok || !json.success) throw new Error();
      setItems(json.notifications); setCounts(json.counts);
    } catch { if (requestId === requestRef.current) setError(ui("Could not refresh notifications. Try again before acting on an old item.")); }
  }, [tab, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const seen = async (item: Item) => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [item.id] }) }).catch(() => undefined);
    setItems(prev => prev?.map(row => row.id === item.id ? { ...row, isRead: true } : row) ?? prev);
    if (item.category === "ACTION" && item.state === "open") setNotice(prev => ({ ...prev, [item.id]: ui("Marked seen. The task is still waiting for you.") }));
    onChanged();
  };
  const open = async (item: Item) => {
    const response = await fetch(`/api/notifications/${encodeURIComponent(item.id)}/open`, { method: "POST" }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    onChanged();
    if (!response || !json?.data) { setNotice(prev => ({ ...prev, [item.id]: ui("Could not open this item. Check your connection and try again.") })); return; }
    const fresh: Item = json.data;
    setItems(prev => prev?.map(row => row.id === item.id ? fresh : row) ?? prev);
    if (fresh.state === "unavailable" || !fresh.link) { setNotice(prev => ({ ...prev, [item.id]: ui("You no longer have access to this item.") })); return; }
    onClose();
    router.push(fresh.link);
  };
  const markUpdatesRead = async () => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true, view: tab === "all" ? undefined : tab }) }).catch(() => undefined);
    onChanged(); void load();
  };

  const badge = (key: string) => key === "mentions" ? counts?.mentionsUnread : key === "actions" ? counts?.openActions : counts?.unread;
  return <div data-notification-center>
    <div role="tablist" aria-label={ui("Notification views")} className="flex gap-1 border-b border-border px-3 pt-2">
      {TABS.map(item => <Button variant="ghost" key={item.key} role="tab" type="button" aria-selected={tab === item.key} onClick={() => { setItems(null); setTab(item.key); }}
        className={cn("flex items-center gap-1 rounded-t-lg px-3 py-2 text-xs font-semibold", tab === item.key ? "border-b-2 border-primary text-primary" : "text-ink-muted")} data-tab={item.key}>
        {ui(item.label)}{badge(item.key) ? <Badge size="sm" variant="neutral" className="tabular-nums" data-tab-count={badge(item.key)}>{badge(item.key)}</Badge> : null}
      </Button>)}
    </div>
    {tab === "actions" && counts?.overdueActions ? <div className="mx-3 mt-2"><Badge variant="danger" dot className="tabular-nums" data-overdue-actions={counts.overdueActions}>{ui("{0} overdue", [counts.overdueActions])}</Badge></div> : null}
    <div className="max-h-[360px] space-y-1 overflow-y-auto p-2" aria-live="polite">
      {error ? <Alert tone="danger" compact live="off" actions={<Button size="sm" variant="secondary" onClick={() => void load()}>{ui("Retry")}</Button>}>{error}</Alert>
        : items === null ? <SkeletonList rows={3} label={ui("Loading…")} />
        : items.length === 0 ? <EmptyState size="sm" icon={Bell} title={tab === "actions" ? ui("No assigned actions need your attention.") : tab === "mentions" ? ui("No one has messaged you directly.") : ui("No notifications yet")} />
        : items.map(item => {
          const Icon = item.category === "ACTION" ? ClipboardList : item.category === "MENTION" ? AtSign : Bell;
          return <article key={item.id} className={cn("rounded-xl p-2.5", !item.isRead && "bg-brand-50/50")} data-notification={item.id} data-category={item.category} data-state={item.state} data-read={item.isRead}>
            <div className="flex items-start gap-2.5">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", item.state === "unavailable" ? "bg-muted text-ink-subtle" : "bg-primary/10 text-primary")}><Icon className="h-4 w-4" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", !item.isRead ? "font-bold" : "font-semibold")}><bdi>{item.title}</bdi>{item.reminderCount > 0 ? <span className="ms-1 text-2xs font-bold text-ink-muted">· {ui("{0} more", [item.reminderCount])}</span> : null}</p>
                <p className="line-clamp-2 text-xs text-ink-muted"><bdi>{item.message}</bdi></p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs font-semibold text-ink-subtle">
                  <span>{formatTime(item.createdAt)}</span>
                  {item.category === "ACTION" ? (
                    item.state === "resolved" ? <span className="inline-flex items-center gap-0.5 text-emerald-700" data-action-state="resolved"><CheckCircle2 className="h-3 w-3" aria-hidden />{item.resolution === "CANCELLED" ? ui("Withdrawn") : ui("Done")}</span>
                    : item.state === "open" ? <span className={cn("rounded px-1", item.overdue ? "bg-rose-100 text-rose-800" : "bg-amber-50 text-amber-800")} data-action-state={item.overdue ? "overdue" : "open"}>{item.overdue ? ui("Overdue") : ui("Waiting for you")}</span> : null
                  ) : null}
                  {item.category === "ACTION" && item.state === "open" && item.isRead ? <span data-opened-pending>{ui("Opened, but still awaiting your action.")}</span> : null}
                </p>
                {notice[item.id] ? <p role="status" className="mt-1 text-2xs font-bold text-amber-800">{notice[item.id]}</p> : null}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.state !== "unavailable" ? <Button size="sm" variant={item.category === "ACTION" ? "default" : "secondary"} onClick={() => void open(item)} aria-label={ui("Open {0}", [item.title])}>
                    {item.category === "MENTION" ? <><Reply className="h-3 w-3" aria-hidden />{ui("Reply")}</> : item.category === "ACTION" && item.state === "open" ? ui("Open task") : ui("Open")}
                  </Button> : <span className="inline-flex items-center gap-1 text-2xs font-bold text-ink-muted"><AlertTriangle className="h-3 w-3" aria-hidden />{ui("You no longer have access to this item.")}</span>}
                  {!item.isRead ? <Button size="sm" variant="ghost" onClick={() => void seen(item)} aria-label={ui("Mark {0} as seen", [item.title])}><Eye className="h-3 w-3" aria-hidden />{ui("Seen")}</Button> : null}
                </div>
              </div>
            </div>
          </article>;
        })}
    </div>
    {tab !== "actions" && (counts?.unread ?? 0) > 0 ? <div className="border-t border-border px-4 py-2.5">
      <Button variant="secondary" size="sm" className="w-full" onClick={() => void markUpdatesRead()}>{tab === "mentions" ? ui("Mark mentions as seen") : ui("Mark all as seen")}</Button>
      <p className="mt-1 text-center text-2xs text-ink-subtle">{ui("Seen only clears the dot. Tasks stay open until they are done.")}</p>
    </div> : null}
  </div>;
}
