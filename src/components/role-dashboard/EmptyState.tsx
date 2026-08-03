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
      <div className="h-16 w-16 rounded-[24px] bg-[#fbf0fe] text-[#8127cf] flex items-center justify-center mb-5 shadow-inner">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-black text-[#1f1a23] tracking-wider">{title}</h3>
      {description && (
        <p className="mt-2 text-sm font-semibold text-[#4d4354]/50 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
