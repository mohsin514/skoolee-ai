"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type BrandButtonVariant = "gradient" | "dark" | "soft" | "danger";

interface BrandButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BrandButtonVariant;
  icon?: ReactNode;
}

export function BrandButton({
  variant = "gradient",
  icon,
  children,
  className,
  ...props
}: BrandButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-black transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        "min-h-10 px-5 text-sm",
        variant === "gradient" &&
          "bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-xl shadow-indigo-100 hover:scale-[1.02]",
        variant === "dark" && "bg-[#1f1a23] text-white shadow-xl hover:bg-black",
        variant === "soft" && "bg-[#fbf0fe] text-[#8127cf] border border-[#8127cf]/10 hover:bg-white",
        variant === "danger" && "bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
