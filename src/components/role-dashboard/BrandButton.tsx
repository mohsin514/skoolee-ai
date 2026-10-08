"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "@/components/ui/button";

type BrandButtonVariant = "gradient" | "dark" | "soft" | "danger";
interface BrandButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BrandButtonVariant;
  icon?: ReactNode;
}
const variants = { gradient: "default", dark: "dark", soft: "secondary", danger: "destructive" } as const;

export function BrandButton({ variant = "gradient", icon, children, ...props }: BrandButtonProps) {
  return <Button variant={variants[variant]} {...props}>{icon}{children}</Button>;
}
