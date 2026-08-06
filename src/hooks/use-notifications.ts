"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ONLINE_RESTORED_EVENT } from "@/lib/network/connection";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  icon: string | null;
  link: string | null;
  isRead: boolean;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

const CHANNEL_NAME = "skoolee-notif";

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  // Bumped to force a fresh EventSource after an outage. The browser
  // retries a dropped stream on its own, but once it gives up and lands
  // in CLOSED it never reopens — so live notifications would stay dead
  // for the rest of the session without this.
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=30");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setNotifications(json.notifications);
        setUnreadCount(json.unreadCount);
      }
    } catch {}
  }, []);

  const markAsRead = useCallback(async (ids: string[]) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) return;
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - ids.length));
      channelRef.current?.postMessage({ type: "mark-read", ids });
    } catch {}
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) return;
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      channelRef.current?.postMessage({ type: "mark-all-read" });
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();

    const es = new EventSource("/api/notifications/sse");
    eventSourceRef.current = es;

    es.addEventListener("open", () => setIsConnected(true));

    es.addEventListener("init", (e) => {
      try {
        const data = JSON.parse(e.data);
        setUnreadCount(data.unreadCount);
      } catch {}
    });

    es.addEventListener("notification", (e) => {
      try {
        const notif: AppNotification = JSON.parse(e.data);
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notif.id)) return prev;
          return [notif, ...prev].slice(0, 50);
        });
        setUnreadCount((prev) => prev + 1);
      } catch {}
    });

    es.addEventListener("error", () => setIsConnected(false));

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = bc;
      bc.onmessage = (e) => {
        if (e.data?.type === "mark-read" && Array.isArray(e.data.ids)) {
          const ids: string[] = e.data.ids;
          setNotifications((prev) =>
            prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n))
          );
          setUnreadCount((prev) => Math.max(0, prev - ids.length));
        }
        if (e.data?.type === "mark-all-read") {
          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
          setUnreadCount(0);
        }
        if (e.data?.type === "new-notification") {
          fetchNotifications();
        }
      };
    } catch {}

    return () => {
      es.close();
      eventSourceRef.current = null;
      bc?.close();
      channelRef.current = null;
    };
  }, [fetchNotifications, connectionEpoch]);

  // On reconnect, reopen the stream if the browser abandoned it, and
  // backfill anything that arrived while we were dark.
  useEffect(() => {
    const onRestored = () => {
      fetchNotifications();
      if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
        setConnectionEpoch((n) => n + 1);
      }
    };
    window.addEventListener(ONLINE_RESTORED_EVENT, onRestored);
    return () => window.removeEventListener(ONLINE_RESTORED_EVENT, onRestored);
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
  };
}
