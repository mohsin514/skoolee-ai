"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="py-16 px-6 text-center flex flex-col items-center justify-center">
      <div className="sk-rise" style={{ animationDelay: "0ms" }}>
        <div className="h-16 w-16 rounded-[24px] bg-[#fbf0fe] text-[#8127cf] flex items-center justify-center mb-5 shadow-[inset_0_2px_6px_rgba(31,26,35,0.06),0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] sk-float">
          <Icon className="w-8 h-8" />
        </div>
      </div>
      <h3 className="sk-rise text-lg font-black text-[#1f1a23] tracking-wider" style={{ animationDelay: "80ms" }}>{title}</h3>
      {description && (
        <p className="sk-rise mt-2 text-sm font-semibold text-ink-muted max-w-sm leading-relaxed" style={{ animationDelay: "140ms" }}>
          {description}
        </p>
      )}
      {action && <div className="sk-rise mt-6" style={{ animationDelay: "200ms" }}>{action}</div>}
    </div>
  );
}
