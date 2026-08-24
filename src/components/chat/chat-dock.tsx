"use client";

// ─────────────────────────────────────────────────────────────────
// The floating messenger.
//
// Mounted once inside RoleShell, which every role dashboard renders, so all
// ten roles get messaging without each dashboard's navigation being rewired.
// The full-page workspace at /messages is the same components in a wider
// layout — this is the in-context version, for replying without leaving the
// screen you were working on.
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { Maximize2, MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat } from "./chat-provider";
import { ChatWorkspace } from "./chat-workspace";

export function ChatDock() {
  const { unreadTotal, viewer, closeConversation } = useChat();
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // The dedicated page already shows all of this; a floating copy on top of it
  // would be two live threads competing for the same scroll.
  const onMessagesPage = pathname?.startsWith("/messages") ?? false;

  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // Closing the panel also closes the thread, so reopening lands on the list
  // rather than in whatever conversation was last read.
  useEffect(() => {
    if (!isOpen) closeConversation();
  }, [isOpen, closeConversation]);

  // No viewer means no session, or a role with no place in school messaging
  // (which /api/chat/unread refuses) — nothing to open.
  if (onMessagesPage || !viewer) return null;

  const hasUnread = unreadTotal > 0;

  return (
    <MotionConfig reducedMotion="user">
      {/* Sits above the mobile tab bar, which occupies the bottom of the screen. */}
      <motion.button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={hasUnread ? `Messages, ${unreadTotal} unread` : "Messages"}
        aria-expanded={isOpen}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 520, damping: 26 }}
        className={cn(
          "group fixed bottom-24 right-4 z-[60] grid h-14 w-14 cursor-pointer place-items-center rounded-[20px]",
          "bg-gradient-to-br from-[#8127cf] via-[#9c48ea] to-[#b10e6b] text-white",
          "shadow-[0_16px_38px_-10px_rgba(129,39,207,0.65),0_4px_12px_-4px_rgba(31,26,35,0.3)]",
          "md:bottom-6 md:right-6"
        )}
      >
        {/* Soft halo, and an expanding ring while something is waiting. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[20px] bg-gradient-to-br from-white/25 to-transparent"
        />
        {hasUnread && !isOpen && (
          <span
            aria-hidden
            className="sk-ping pointer-events-none absolute inset-0 rounded-[20px] bg-[#8127cf]/40"
          />
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isOpen ? "close" : "open"}
            initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
            transition={{ duration: 0.18 }}
            className="relative"
          >
            {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
          </motion.span>
        </AnimatePresence>

        <AnimatePresence>
          {hasUnread && !isOpen && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 20 }}
              className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full border-[2.5px] border-white bg-gradient-to-br from-[#b10e6b] to-[#e0559a] px-1 text-[10px] font-black text-white shadow-[0_4px_12px_-2px_rgba(177,14,107,0.8)]"
            >
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[55] bg-[#1f1a23]/25 backdrop-blur-[3px] md:hidden"
              aria-hidden
              onClick={() => setIsOpen(false)}
            />

            <motion.section
              aria-label="Messages"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              style={{ transformOrigin: "bottom right" }}
              className={cn(
                "fixed z-[58] flex flex-col overflow-hidden rounded-[26px] bg-white/95 backdrop-blur-2xl",
                "ring-1 ring-[#cfc2d6]/40",
                "shadow-[0_32px_80px_-20px_rgba(31,26,35,0.45),0_0_0_1px_rgba(129,39,207,0.06)]",
                "inset-x-3 bottom-40 top-16",
                "md:inset-auto md:bottom-24 md:right-6 md:top-auto md:h-[600px] md:w-[400px]"
              )}
            >
              <header className="relative flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-[#cfc2d6]/25 bg-gradient-to-r from-[#8127cf] to-[#9c48ea] px-4 py-3">
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/15 blur-2xl"
                />
                <p className="relative text-xs font-black tracking-tight text-white">Messages</p>
                <div className="relative flex items-center gap-1">
                  <Link
                    href="/messages"
                    onClick={() => setIsOpen(false)}
                    aria-label="Open full messages page"
                    title="Open full page"
                    className="cursor-pointer rounded-xl p-1.5 text-white/80 transition-all hover:bg-white/20 hover:text-white active:scale-90"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close messages"
                    className="cursor-pointer rounded-xl p-1.5 text-white/80 transition-all hover:bg-white/20 hover:text-white active:scale-90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </header>

              <ChatWorkspace layout="stacked" className="flex-1" />
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
