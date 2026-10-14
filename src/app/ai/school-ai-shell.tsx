"use client";

import type { ReactNode } from "react";
import { Home, Sparkles } from "lucide-react";
import { RoleShell } from "@/components/role-dashboard/RoleShell";
import { useLocale } from "@/components/locale/LocaleProvider";

export function SchoolAiShell({ children, dashboardHref, userName, userRole }: { children: ReactNode; dashboardHref: string; userName?: string; userRole: string }) {
  const { language } = useLocale();
  const title = language === "ar" ? "مساحة المدرسة الذكية" : language === "ur" ? "اسکول اے آئی ورک اسپیس" : "School AI workspace";
  const home = language === "ar" ? "لوحة المدرسة" : language === "ur" ? "اسکول ڈیش بورڈ" : "School dashboard";
  return <RoleShell userName={userName} userRole={userRole} dashboardHref={dashboardHref} eyebrow={title} navItems={[
    { label: home, href: dashboardHref, icon: Home },
    { label: title, href: "/ai", icon: Sparkles, module: "ai", active: true },
  ]}><div className="min-h-0 flex-1 overflow-y-auto">{children}</div></RoleShell>;
}
