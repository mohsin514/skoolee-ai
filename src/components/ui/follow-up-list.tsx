import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Work that is deliberately left for later (setup's optional tasks, a
 * readiness checklist): each item carries its own tone and icon so the list
 * reads at a glance instead of as one grey block. Not a status list: nothing
 * here is an error or a requirement. Tones map to the shared status tokens in
 * globals.css (`.sk-follow-up [data-tone]`).
 */
export type FollowUpTone = "brand" | "info" | "success" | "warning" | "berry";

export type FollowUpItem = { key: string; label: string; icon: LucideIcon; tone: FollowUpTone };

export function FollowUpList({ id, items, label, className }: { id?: string; items: FollowUpItem[]; label?: string; className?: string }) {
  return (
    <ul id={id} aria-label={label} className={cn("sk-follow-up", className)}>
      {items.map(({ key, label: text, icon: Icon, tone }) => (
        <li key={key} data-tone={tone}>
          <span aria-hidden="true" className="sk-follow-up-icon"><Icon /></span>
          <span className="min-w-0">{text}</span>
        </li>
      ))}
    </ul>
  );
}
