"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat } from "./chat-provider";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { NewConversationDialog } from "./new-conversation-dialog";

interface ChatWorkspaceProps {
  /**
   * "split" shows list and thread side by side (the /messages page);
   * "stacked" shows one at a time (the docked panel, at every width).
   */
  layout?: "split" | "stacked";
  className?: string;
}

export function ChatWorkspace({ layout = "split", className }: ChatWorkspaceProps) {
  const { activeId, closeConversation, error, clearError } = useChat();
  const [isNewOpen, setIsNewOpen] = useState(false);

  const stacked = layout === "stacked";

  return (
    <div className={cn("relative flex h-full min-h-0 overflow-hidden", className)}>
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            role="alert"
            className="absolute inset-x-3 top-3 z-40 flex items-start gap-2.5 rounded-2xl border border-rose-200/80 bg-rose-50/95 px-3.5 py-3 shadow-[0_16px_40px_-14px_rgba(190,18,60,0.4)] backdrop-blur-xl"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
            <p className="flex-1 text-[11px] font-bold leading-relaxed text-rose-700">{error}</p>
            <button
              type="button"
              onClick={clearError}
              aria-label="Dismiss"
              className="cursor-pointer rounded-lg p-0.5 text-rose-500 transition-colors hover:bg-rose-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Below md there is only room for one pane, so an open thread takes the
          screen and the list steps aside. The docked panel is stacked at every
          width for the same reason. */}
      <aside
        className={cn(
          "min-h-0 w-full shrink-0 border-r border-[#cfc2d6]/25 bg-white/70 backdrop-blur-xl",
          stacked
            ? activeId
              ? "hidden"
              : "block"
            : cn("md:w-[340px]", activeId ? "hidden md:block" : "block")
        )}
      >
        <ConversationList onNewChat={() => setIsNewOpen(true)} />
      </aside>

      <div
        className={cn(
          "min-h-0 flex-1",
          stacked ? (activeId ? "block" : "hidden") : activeId ? "block" : "hidden md:block"
        )}
      >
        {/* In the stacked panel the list is not on screen beside the thread, so
            the back control is the only way out of a conversation and must be
            offered at every width — not just below md, as it once was. */}
        <MessageThread
          onBack={closeConversation}
          backVisibility={stacked ? "always" : "mobile"}
        />
      </div>

      <NewConversationDialog open={isNewOpen} onClose={() => setIsNewOpen(false)} />
    </div>
  );
}
