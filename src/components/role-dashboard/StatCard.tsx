"use client";

import type { LucideIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "purple" | "green" | "rose" | "dark";
  onClick?: () => void;
}

const toneClass = {
  purple: "bg-[#fbf0fe] text-[#8127cf]",
  green: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-[#b10e6b]",
  dark: "bg-[#1f1a23] text-white",
};

export function StatCard({ icon: Icon, label, value, sub, tone = "purple", onClick }: StatCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };
  const className = cn(
    "bg-white p-6 rounded-[28px] border border-[#cfc2d6]/10 shadow-lg transition-all",
    onClick && "w-full cursor-pointer text-left hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-[#8127cf]/10"
  );
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-wider mb-2">
            {label}
          </p>
          <p className="text-3xl font-black text-[#1f1a23] leading-none">{value}</p>
          {sub && <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase tracking-wider mt-2">{sub}</p>}
        </div>
        <div className={cn("h-11 w-11 rounded-2xl flex items-center justify-center shrink-0", toneClass[tone])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <div role="button" tabIndex={0} onClick={onClick} onKeyDown={handleKeyDown} className={className}>
        {content}
      </div>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
  );
}
