"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Settings } from "lucide-react";
import { ChatSettingsDialog, ChatWorkspace, useChat } from "@/components/chat";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Opens the conversation named in `?c=` — the link a chat notification points
 * at, so tapping the bell lands in the thread rather than at the top of the
 * list.
 */
function DeepLink() {
  const params = useSearchParams();
  const { openConversation } = useChat();
  const conversationId = params.get("c");

  useEffect(() => {
    if (conversationId) openConversation(conversationId);
  }, [conversationId, openConversation]);

  return null;
}

/**
 * The full-page messenger, framed in the caller's own console (RoleFrame), so the sidebar is the way back —
 * no "Back to dashboard" link. The school-wide messaging policy stays beside what it governs and is offered
 * only to whoever the server says may change it (`canManageSettings`, the institution authority — G52).
 */
export function MessagesWorkspace() {
  const { viewer } = useChat();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 font-sans text-foreground">
      <PageHeader
        title="Messages"
        description={
          viewer?.role === "SUPER_ADMIN" || viewer?.role === "OWNER"
            ? "Conversations with campus leaders and colleagues stay on the school record."
            : viewer?.role === "PARENT" || viewer?.role === "STUDENT"
              ? "Conversations with teachers and the school office stay on the school record."
              : "Conversations with families and colleagues stay on the school record."
        }
        secondaryActions={viewer?.canManageSettings ? [{ id: "messaging-policy", label: "Messaging policy", icon: Settings, onClick: () => setIsSettingsOpen(true) }] : []}
      />

      <ChatSettingsDialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* useSearchParams needs a boundary, or the tree above it is pushed
          into client-side rendering. Nothing to fall back to — DeepLink
          renders no markup, it only opens a thread. */}
      <Suspense fallback={null}>
        <DeepLink />
      </Suspense>
      <ChatWorkspace layout="split" className="sk-fade-in min-h-[420px] flex-1 overflow-hidden rounded-2xl border border-border-subtle bg-card" />
    </div>
  );
}
