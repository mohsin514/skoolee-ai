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
import { chatHeader, chatUnreadBadge } from "./chat-styles";
import { Button, buttonVariants } from "@/components/ui/button";

const MotionButton = motion.create(Button);


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
      <MotionButton variant="default" size="icon"
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={hasUnread ? `Messages, ${unreadTotal} unread` : "Messages"}
        aria-expanded={isOpen}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 520, damping: 26 }}
        className={cn(
          "chat-launcher group fixed bottom-24 end-4 z-[60] grid h-14 w-14 place-items-center rounded-full",
          "md:bottom-6 md:end-6"
        )}
      >
        <span aria-hidden="true" className="chat-launcher-ring" />
        <span aria-hidden="true" className="chat-launcher-ring chat-launcher-ring-delayed" />
        <span aria-hidden="true" className="chat-launcher-background">
          <span className="chat-launcher-orb" />
          <span className="chat-launcher-orb" />
          <span className="chat-launcher-orb" />
        </span>

        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isOpen ? "close" : "open"}
            initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
            transition={{ duration: 0.18 }}
            className="relative z-10 text-white"
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
              className={cn(chatUnreadBadge, "absolute -end-1.5 -top-1.5 border-2 border-card")}
            >
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </motion.span>
          )}
        </AnimatePresence>
      </MotionButton>

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
                "fixed z-[58] flex flex-col overflow-hidden rounded-3xl border border-border bg-card",

                "shadow-[0_32px_80px_-20px_rgba(31,26,35,0.45),0_0_0_1px_rgba(129,39,207,0.06)]",
                "inset-x-3 bottom-40 top-3",
                "md:inset-auto md:bottom-24 md:end-6 md:top-auto md:h-[620px] md:max-h-[calc(100dvh-8rem)] md:w-[420px]"
              )}
            >
              <header className={cn(chatHeader, "justify-between")}>
                <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-primary"><MessageCircle className="h-5 w-5" /></span><p className="text-sm font-semibold text-foreground">School messaging</p></div>
                <div className="flex items-center gap-1">
                  <Link href="/messages" onClick={() => setIsOpen(false)} aria-label="Open full messages page" title="Open full page" className={buttonVariants({ variant: "ghost", size: "icon" })}><Maximize2 className="h-4 w-4" /></Link>
                  <Button variant="ghost" size="icon" type="button" onClick={() => setIsOpen(false)} aria-label="Close messages"><X className="h-4 w-4" /></Button>
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
