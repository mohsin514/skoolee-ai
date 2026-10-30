import * as React from "react";
import { cn } from "@/lib/utils";

/** One keycap (Enter, Shift, /), reusing the setup questionnaire's `.sk-kbd`. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("sk-kbd", className)}>{children}</kbd>;
}

/**
 * A keyboard hint line ("Enter to send"). Shown only for fine pointers (mouse,
 * trackpad) and hidden from assistive tech, since the keys are already the
 * native behaviour of the control it sits next to.
 */
export function KbdHint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span aria-hidden="true" className={cn("sk-ai-fine-only items-center gap-1 text-2xs text-ink-muted", className)}>{children}</span>;
}
