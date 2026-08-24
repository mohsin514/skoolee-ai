"use client";

// ─────────────────────────────────────────────────────────────────
// Client-side chat state.
//
// One provider holds the conversation list, the open thread, and the single
// EventSource that feeds both. Mounting a stream per component would open one
// connection per rendered widget — the dock and the /messages page both use
// this, and browsers cap concurrent SSE connections per origin at six.
// ─────────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ONLINE_RESTORED_EVENT } from "@/lib/network/connection";
import type {
  ChatMessageView,
  ConversationDetail,
  ConversationView,
  DirectoryContact,
  ChatStreamEvent,
} from "@/lib/chat/types";

export type ConversationFilter = "all" | "unread" | "archived";

export interface ChatViewer {
  id: string;
  fullName: string;
  role: string;
  roleLabel: string;
  canCreateGroup: boolean;
  canManageSettings: boolean;
}

interface TypingUser {
  userId: string;
  fullName: string;
  until: number;
}

interface ChatContextValue {
  /** The signed-in user, resolved once from the API — the shells that mount
   *  this provider are client components with no session of their own. */
  viewer: ChatViewer | null;
  conversations: ConversationView[];
  unreadTotal: number;
  isConnected: boolean;
  isLoadingList: boolean;

  filter: ConversationFilter;
  setFilter: (filter: ConversationFilter) => void;
  search: string;
  setSearch: (value: string) => void;

  activeId: string | null;
  detail: ConversationDetail | null;
  messages: ChatMessageView[];
  isLoadingThread: boolean;
  hasOlder: boolean;

  openConversation: (id: string) => void;
  closeConversation: () => void;
  loadOlder: () => Promise<void>;

  sendMessage: (input: {
    body: string;
    replyToId?: string;
    attachments?: SendAttachment[];
  }) => Promise<void>;
  editMessage: (messageId: string, body: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;

  startDirect: (userId: string) => Promise<string | null>;
  createGroup: (input: {
    kind: "GROUP" | "CLASS" | "ANNOUNCEMENT";
    title: string;
    topic?: string;
    memberIds: string[];
    classId?: string;
    includeGuardians?: boolean;
  }) => Promise<string | null>;

  setPreference: (
    id: string,
    prefs: { isMuted?: boolean; isPinned?: boolean; isArchived?: boolean }
  ) => Promise<void>;
  leaveConversation: (id: string) => Promise<void>;

  typingUsers: TypingUser[];
  notifyTyping: () => void;

  searchDirectory: (query: string) => Promise<DirectoryContact[]>;
  refresh: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

export interface SendAttachment {
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}

/** Reads the API's error body so a refusal shows the policy's own words
 *  ("You can only message the families of students you teach") rather than a
 *  generic failure. */
async function readError(res: Response, fallback: string) {
  try {
    const json = await res.json();
    return typeof json?.error === "string" ? json.error : fallback;
  } catch {
    return fallback;
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<ChatViewer | null>(null);
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(true);

  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [search, setSearch] = useState("");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);

  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Bumped to force a fresh EventSource after an outage: the browser retries a
  // dropped stream itself, but once it gives up and lands in CLOSED it never
  // reopens on its own.
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Read inside the SSE handler, which is created once per connection and
  // would otherwise close over a stale activeId. Written from an effect, not
  // during render — the handler only ever reads it after a commit.
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const lastTypingSentRef = useRef(0);

  const clearError = useCallback(() => setError(null), []);

  // ─── Conversation list ─────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams({ filter });
      if (search.trim()) params.set("q", search.trim());

      const res = await fetch(`/api/chat/conversations?${params}`);
      if (!res.ok) return;

      const json = await res.json();
      if (json.success) setConversations(json.conversations);
    } catch {
      // Offline; the list on screen stays valid until the network returns.
    } finally {
      setIsLoadingList(false);
    }
  }, [filter, search]);

  const loadUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/unread");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setUnreadTotal(json.unreadCount);
        if (json.viewer) setViewer(json.viewer);
      }
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadConversations(), loadUnread()]);
  }, [loadConversations, loadUnread]);

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      loadConversations();
    }, search.trim() ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadConversations, search]);

  useEffect(() => {
    loadUnread();
  }, [loadUnread]);

  // ─── Open thread ───────────────────────────────────────────────

  const markRead = useCallback(async (id: string) => {
    try {
      await fetch(`/api/chat/conversations/${id}/read`, { method: "POST" });
    } catch {}

    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );
    setUnreadTotal((prev) => {
      const conversation = conversations.find((c) => c.id === id);
      return Math.max(0, prev - (conversation?.unreadCount ?? 0));
    });
  }, [conversations]);

  const openConversation = useCallback((id: string) => {
    setActiveId(id);
    setTypingUsers([]);
  }, []);

  const closeConversation = useCallback(() => {
    setActiveId(null);
    setDetail(null);
    setMessages([]);
    setOlderCursor(null);
  }, []);

  useEffect(() => {
    if (!activeId) return;

    let cancelled = false;
    setIsLoadingThread(true);
    setMessages([]);
    setDetail(null);

    (async () => {
      try {
        const [detailRes, messagesRes] = await Promise.all([
          fetch(`/api/chat/conversations/${activeId}`),
          fetch(`/api/chat/conversations/${activeId}/messages?limit=40`),
        ]);

        if (cancelled) return;

        if (!detailRes.ok) {
          setError(await readError(detailRes, "That conversation is no longer available"));
          setActiveId(null);
          return;
        }

        const detailJson = await detailRes.json();
        const messagesJson = messagesRes.ok ? await messagesRes.json() : { messages: [] };

        if (cancelled) return;

        setDetail(detailJson.conversation);
        setMessages(messagesJson.messages ?? []);
        setOlderCursor(messagesJson.nextCursor ?? null);
      } finally {
        if (!cancelled) setIsLoadingThread(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // Clearing the badge is a side effect of having the thread open, so it also
  // fires when a message arrives while the reader is already looking at it.
  const markReadRef = useRef(markRead);
  useEffect(() => {
    markReadRef.current = markRead;
  }, [markRead]);

  useEffect(() => {
    // Through a ref: markRead's identity changes whenever the conversation
    // list does, and depending on it directly would re-run this on every
    // incoming message rather than only when the thread or its length changes.
    if (activeId && messages.length > 0) markReadRef.current(activeId);
  }, [activeId, messages.length]);

  const loadOlder = useCallback(async () => {
    if (!activeId || !olderCursor) return;

    try {
      const res = await fetch(
        `/api/chat/conversations/${activeId}/messages?limit=40&cursor=${olderCursor}`
      );
      if (!res.ok) return;

      const json = await res.json();
      setMessages((prev) => [...(json.messages ?? []), ...prev]);
      setOlderCursor(json.nextCursor ?? null);
    } catch {}
  }, [activeId, olderCursor]);

  // ─── Live stream ───────────────────────────────────────────────

  const applyIncoming = useCallback((event: ChatStreamEvent) => {
    if (event.type === "message") {
      const message = event.payload;
      const isOpen = activeIdRef.current === event.conversationId;

      if (isOpen) {
        setMessages((prev) => {
          // Replace the optimistic copy rather than showing the message twice.
          const byKey = message.clientKey
            ? prev.findIndex((m) => m.clientKey === message.clientKey)
            : -1;
          if (byKey >= 0) {
            const next = [...prev];
            next[byKey] = message;
            return next;
          }
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
      }

      setConversations((prev) => {
        const index = prev.findIndex((c) => c.id === event.conversationId);
        if (index < 0) return prev;

        const updated: ConversationView = {
          ...prev[index],
          lastMessageAt: message.createdAt,
          lastMessagePreview: message.body || "Attachment",
          lastMessageSenderId: message.sender?.id ?? null,
          unreadCount: isOpen ? 0 : prev[index].unreadCount + 1,
          isArchived: false,
        };

        // Move it to the top, keeping pinned threads above the rest.
        const rest = prev.filter((_, i) => i !== index);
        const firstUnpinned = rest.findIndex((c) => !c.isPinned);
        const at = updated.isPinned ? 0 : firstUnpinned < 0 ? rest.length : firstUnpinned;
        return [...rest.slice(0, at), updated, ...rest.slice(at)];
      });

      if (!isOpen) setUnreadTotal((prev) => prev + 1);
      return;
    }

    if (event.type === "message-updated") {
      if (activeIdRef.current !== event.conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === event.payload.id ? event.payload : m))
      );
      return;
    }

    if (event.type === "read") {
      setDetail((prev) => {
        if (!prev || prev.id !== event.conversationId) return prev;
        return {
          ...prev,
          members: prev.members.map((m) =>
            m.userId === event.payload.userId ? { ...m, lastReadAt: event.payload.readAt } : m
          ),
        };
      });
      return;
    }

    if (event.type === "typing") {
      if (activeIdRef.current !== event.conversationId) return;
      setTypingUsers((prev) => [
        ...prev.filter((t) => t.userId !== event.payload.userId),
        event.payload,
      ]);
      return;
    }

    if (event.type === "conversation") {
      // Membership or settings changed; the list is cheap enough to re-read.
      loadConversations();
      loadUnread();
    }
  }, [loadConversations, loadUnread]);

  useEffect(() => {
    const source = new EventSource("/api/chat/stream");
    eventSourceRef.current = source;

    source.addEventListener("ready", () => setIsConnected(true));
    source.addEventListener("open", () => setIsConnected(true));
    source.addEventListener("error", () => setIsConnected(false));

    source.addEventListener("chat", (e) => {
      try {
        applyIncoming(JSON.parse((e as MessageEvent).data) as ChatStreamEvent);
      } catch {}
    });

    return () => {
      source.close();
      eventSourceRef.current = null;
    };
  }, [applyIncoming, connectionEpoch]);

  // Typing indicators expire by their own timestamp, so a closed tab cannot
  // leave someone permanently mid-sentence.
  useEffect(() => {
    if (typingUsers.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => prev.filter((t) => t.until > now));
    }, 1000);
    return () => clearInterval(timer);
  }, [typingUsers.length]);

  useEffect(() => {
    const onRestored = () => {
      refresh();
      if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
        setConnectionEpoch((n) => n + 1);
      }
    };
    window.addEventListener(ONLINE_RESTORED_EVENT, onRestored);
    return () => window.removeEventListener(ONLINE_RESTORED_EVENT, onRestored);
  }, [refresh]);

  // ─── Writes ────────────────────────────────────────────────────

  const sendMessage = useCallback<ChatContextValue["sendMessage"]>(
    async ({ body, replyToId, attachments }) => {
      if (!activeId) return;

      const clientKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      // Optimistic: the message appears immediately and is reconciled when the
      // server echoes it back over the stream, keyed on clientKey.
      const optimistic: ChatMessageView = {
        id: `pending-${clientKey}`,
        conversationId: activeId,
        kind: attachments?.length ? "FILE" : "TEXT",
        body,
        sender: null,
        replyTo: null,
        attachments: [],
        isEdited: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        clientKey,
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const res = await fetch(`/api/chat/conversations/${activeId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, replyToId, clientKey, attachments }),
        });

        if (!res.ok) {
          setMessages((prev) => prev.filter((m) => m.clientKey !== clientKey));
          setError(await readError(res, "Message could not be sent"));
          return;
        }

        const json = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.clientKey === clientKey ? json.message : m))
        );
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeId
              ? {
                  ...c,
                  lastMessageAt: json.message.createdAt,
                  lastMessagePreview: json.message.body || "Attachment",
                }
              : c
          )
        );
      } catch {
        setMessages((prev) => prev.filter((m) => m.clientKey !== clientKey));
        setError("Message could not be sent — check your connection");
      }
    },
    [activeId]
  );

  const editMessage = useCallback(async (messageId: string, body: string) => {
    const res = await fetch(`/api/chat/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      setError(await readError(res, "Could not edit that message"));
      return;
    }
    const json = await res.json();
    setMessages((prev) => prev.map((m) => (m.id === messageId ? json.message : m)));
  }, []);

  const deleteMessage = useCallback(async (messageId: string) => {
    const res = await fetch(`/api/chat/messages/${messageId}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await readError(res, "Could not withdraw that message"));
      return;
    }
    const json = await res.json();
    setMessages((prev) => prev.map((m) => (m.id === messageId ? json.message : m)));
  }, []);

  const startDirect = useCallback(
    async (userId: string) => {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "DIRECT", userId }),
      });

      if (!res.ok) {
        setError(await readError(res, "Could not open that conversation"));
        return null;
      }

      const json = await res.json();
      await loadConversations();
      setActiveId(json.conversation.id);
      return json.conversation.id as string;
    },
    [loadConversations]
  );

  const createGroup = useCallback<ChatContextValue["createGroup"]>(
    async (input) => {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        setError(await readError(res, "Could not create that conversation"));
        return null;
      }

      const json = await res.json();
      await loadConversations();
      setActiveId(json.conversation.id);
      return json.conversation.id as string;
    },
    [loadConversations]
  );

  const setPreference = useCallback(
    async (id: string, prefs: { isMuted?: boolean; isPinned?: boolean; isArchived?: boolean }) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...prefs } : c)));

      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });

      if (!res.ok) {
        setError(await readError(res, "Could not update that conversation"));
      }
      await loadConversations();
    },
    [loadConversations]
  );

  const leaveConversation = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readError(res, "Could not leave that conversation"));
        return;
      }
      if (activeId === id) closeConversation();
      await refresh();
    },
    [activeId, closeConversation, refresh]
  );

  const notifyTyping = useCallback(() => {
    if (!activeId) return;

    // At most one ping every three seconds; the indicator lasts six.
    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;

    fetch(`/api/chat/conversations/${activeId}/typing`, { method: "POST" }).catch(() => {});
  }, [activeId]);

  const searchDirectory = useCallback(async (query: string) => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (query.trim()) params.set("q", query.trim());

      const res = await fetch(`/api/chat/directory?${params}`);
      if (!res.ok) return [];

      const json = await res.json();
      return (json.contacts ?? []) as DirectoryContact[];
    } catch {
      return [];
    }
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({
      viewer,
      conversations,
      unreadTotal,
      isConnected,
      isLoadingList,
      filter,
      setFilter,
      search,
      setSearch,
      activeId,
      detail,
      messages,
      isLoadingThread,
      hasOlder: olderCursor !== null,
      openConversation,
      closeConversation,
      loadOlder,
      sendMessage,
      editMessage,
      deleteMessage,
      startDirect,
      createGroup,
      setPreference,
      leaveConversation,
      typingUsers,
      notifyTyping,
      searchDirectory,
      refresh,
      error,
      clearError,
    }),
    [
      viewer,
      conversations,
      unreadTotal,
      isConnected,
      isLoadingList,
      filter,
      search,
      activeId,
      detail,
      messages,
      isLoadingThread,
      olderCursor,
      openConversation,
      closeConversation,
      loadOlder,
      sendMessage,
      editMessage,
      deleteMessage,
      startDirect,
      createGroup,
      setPreference,
      leaveConversation,
      typingUsers,
      notifyTyping,
      searchDirectory,
      refresh,
      error,
      clearError,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
