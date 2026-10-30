"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat } from "./chat-provider";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { NewConversationDialog } from "./new-conversation-dialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useUiText } from "@/components/locale/LocaleProvider";


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
  const ui = useUiText();

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
            className="absolute inset-x-3 top-3 z-40"
          >
            {/* SKAI-1277: the shared danger notice, floating over the panes. */}
            <Alert tone="danger" compact icon={AlertCircle} onDismiss={clearError} className="shadow-lg backdrop-blur-xl">{ui(error)}</Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Below md there is only room for one pane, so an open thread takes the
          screen and the list steps aside. The docked panel is stacked at every
          width for the same reason. */}
      <aside
        className={cn(
          "min-h-0 w-full shrink-0 border-e border-border bg-card",
          stacked
            ? activeId
              ? "hidden"
              : "block"
            : cn("md:w-[320px] lg:w-[360px]", activeId ? "hidden md:block" : "block")
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
