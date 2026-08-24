"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Settings, Sparkles } from "lucide-react";
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
    <div className="flex h-screen flex-col bg-[#fbf0fe] font-sans text-[#1f1a23]">
      <header className="relative z-30 flex shrink-0 items-center gap-3 overflow-hidden border-b border-[#cfc2d6]/25 bg-white/80 px-3 py-3 shadow-[0_4px_24px_-16px_rgba(129,39,207,0.5)] backdrop-blur-xl md:px-6">
        <span
          aria-hidden
          className="pointer-events-none absolute -left-16 -top-24 h-48 w-48 rounded-full bg-[#8127cf]/10 blur-3xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-48 w-48 rounded-full bg-[#b10e6b]/10 blur-3xl"
        />

        <Link
          href={dashboardHref}
          className="relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-bold text-ink-muted transition-all hover:-translate-x-0.5 hover:bg-[#fbf0fe] hover:text-[#8127cf]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Back to dashboard</span>
        </Link>

        <span className="relative flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#8127cf] to-[#b10e6b] text-white shadow-[0_8px_20px_-8px_rgba(129,39,207,0.75)]">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <h1 className="text-sm font-black tracking-tight">Messages</h1>
        </span>

        <span className="flex-1" />

        {viewer?.canManageSettings && (
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-ink-muted transition-all hover:-translate-y-0.5 hover:bg-[#fbf0fe] hover:text-[#8127cf]"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Messaging policy</span>
          </button>
        )}
      </header>

      <ChatSettingsDialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <main className="min-h-0 flex-1">
        {/* useSearchParams needs a boundary, or the tree above it is pushed
            into client-side rendering. Nothing to fall back to — DeepLink
            renders no markup, it only opens a thread. */}
        <Suspense fallback={null}>
          <DeepLink />
        </Suspense>
        <ChatWorkspace layout="split" className="h-full" />
      </main>
    </div>
  );
}
