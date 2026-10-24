"use client";

import type { ReactNode } from "react";
import { ListPlus } from "lucide-react";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";

/**
 * "More details (optional)" on phones: optional fields fold into a compact
 * disclosure row. Controlled, so the caller can force it open whenever it
 * holds a field with an error (open = hasError || userOpen), and error jumps
 * and server errors always find the field.
 */
export type MoreDetailsProps = { title: string; open: boolean; onOpenChange(open: boolean): void; children: ReactNode };

export function MoreDetails({ title, open, onOpenChange, children }: MoreDetailsProps) {
  return (
    <CollapsiblePanel className="sk-disclosure bg-surface-subtle shadow-none" icon={ListPlus} title={title} open={open} onOpenChange={onOpenChange}>
      {children}
    </CollapsiblePanel>
  );
}
