import { Bot, Sparkles } from "lucide-react";

/** The existing assistant sparkle accompanies a friendly robot; brand tokens own its appearance. */
export function StudioAssistantMark({ className = "" }: { className?: string }) {
  return <span className={`relative inline-grid place-items-center ${className}`} aria-hidden="true">
    <Bot className="size-full" strokeWidth={1.5} />
    <Sparkles className="absolute -end-2 -top-2 size-[38%]" strokeWidth={1.8} />
  </span>;
}
