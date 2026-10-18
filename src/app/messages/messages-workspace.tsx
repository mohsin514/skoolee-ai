"use client";

import { chatHeader } from "@/components/chat/chat-styles";
import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Settings, MessageCircle } from "lucide-react";
import { ChatSettingsDialog, ChatWorkspace, useChat } from "@/components/chat";
import { useUiText } from "@/components/locale/LocaleProvider";

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
  const tr = useUiText();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col bg-background font-sans text-foreground">
      <header className={`${chatHeader} relative z-30 shadow-xs md:px-6`}>

        <Link
          href={dashboardHref}
          aria-label={tr("Back to dashboard")}
          className={buttonVariants({ variant: "ghost", size: "sm", className: "shrink-0" })}
        >
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          <span className="hidden sm:inline">{tr("Back to dashboard")}</span>
        </Link>

        <span className="relative flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-primary shadow-xs">
            <MessageCircle className="size-5" />
          </span>
          <h1 className="truncate text-base font-bold tracking-tight text-ink-strong sm:text-lg">{tr("Messages")}</h1>
        </span>

        <span className="flex-1" />

        {viewer?.canManageSettings && (
          <Button variant="outline"
            type="button"
            size="sm"
            onClick={() => setIsSettingsOpen(true)}
            // The text label is hidden on phones; the name must not be.
            aria-label={tr("Messaging policy")}
            className="relative shrink-0 items-center justify-start gap-1.5"
          >
            <Settings aria-hidden="true" />
            <span className="hidden sm:inline">{tr("Messaging policy")}</span>
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
        <ChatWorkspace layout="split" className="sk-fade-in h-full overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-md" />
      </main>
    </div>
  );
}
