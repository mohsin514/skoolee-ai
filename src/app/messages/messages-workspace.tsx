"use client";

import { chatHeader } from "@/components/chat/chat-styles";
import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Settings, MessageCircle } from "lucide-react";
import { ChatSettingsDialog, ChatWorkspace, useChat } from "@/components/chat";

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

export function MessagesWorkspace({ dashboardHref }: { dashboardHref: string }) {
  const { viewer } = useChat();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col bg-background font-sans text-foreground">
      <header className={`${chatHeader} relative z-30 md:px-6`}>

        <Link
          href={dashboardHref}
          aria-label="Back to dashboard"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "shrink-0" })}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Back to dashboard</span>
        </Link>

        <span className="relative flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-primary">
            <MessageCircle className="h-5 w-5" />
          </span>
          <h1 className="text-base font-semibold tracking-tight">Messages</h1>
        </span>

        <span className="flex-1" />

        {viewer?.canManageSettings && (
          <Button variant="outline"
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="relative shrink-0 items-center gap-1.5 justify-start"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Messaging policy</span>
          </Button>
        )}
      </header>

      <ChatSettingsDialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <main className="min-h-0 flex-1 p-2 md:p-5">
        {/* useSearchParams needs a boundary, or the tree above it is pushed
            into client-side rendering. Nothing to fall back to — DeepLink
            renders no markup, it only opens a thread. */}
        <Suspense fallback={null}>
          <DeepLink />
        </Suspense>
        <ChatWorkspace layout="split" className="h-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm" />
      </main>
    </div>
  );
}
