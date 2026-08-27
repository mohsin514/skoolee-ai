"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, MotionConfig } from "framer-motion";
import { cn } from "@/lib/utils";
import SkooleeLogo from "@/components/SkooleeLogo";
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MessagesSquare,
  Settings,
  Users,
  Network,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/students", label: "Students", icon: Users },
  { href: "/dashboard/classes", label: "Classes", icon: GraduationCap },
  { href: "/dashboard/staff-hierarchy", label: "Staff Hierarchy", icon: Network },
  { href: "/dashboard/marks", label: "Marks Entry", icon: ClipboardList },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/communications", label: "Communications", icon: MessageCircle },
  { href: "/messages", label: "Messages", icon: MessagesSquare },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-[#cfc2d6]/25 bg-white/72 p-5 shadow-[12px_0_40px_rgba(129,39,207,0.08)] backdrop-blur-xl md:flex">
        <Link href="/dashboard" className="mb-8 block cursor-pointer rounded-[22px] p-1 transition-all hover:bg-white/70">
          <SkooleeLogo size="1.35rem" />
          <span className="mt-1.5 block text-[10px] font-black text-[#b10e6b]/70">
            Campus Console
          </span>
        </Link>

        <nav className="custom-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
          <MotionConfig reducedMotion="user">
            {navItems.map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative isolate flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]",
                    isActive
                      ? "text-[#8127cf]"
                      : "text-ink hover:bg-white/75 hover:text-[#1f1a23] hover:shadow-sm"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="legacy-sidebar-active-pill"
                      transition={{ type: "spring", stiffness: 500, damping: 34, mass: 0.9 }}
                      className="absolute inset-0 z-0 rounded-2xl bg-gradient-to-r from-white to-[#fbf0fe] shadow-[0_8px_22px_-4px_rgba(129,39,207,0.32)]"
                    >
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-full bg-gradient-to-b from-[#8127cf] to-[#9c48ea] sk-glow" />
                    </motion.span>
                  )}
                  <item.icon
                    className={cn(
                      "relative z-10 h-4 w-4 shrink-0 transition-colors",
                      isActive
                        ? "text-[#8127cf]"
                        : "text-ink-muted group-hover:text-[#8127cf]"
                    )}
                  />
                  <span className="relative z-10 truncate">{item.label}</span>
                  {isActive && (
                    <span className="relative z-10 ml-auto h-2 w-2 rounded-full bg-[#8127cf] sk-glow" />
                  )}
                </Link>
              );
            })}
          </MotionConfig>
        </nav>

        <div className="mt-6 rounded-[24px] border border-[#cfc2d6]/25 bg-[#fbf0fe]/70 p-4 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#8127cf] shadow-[0_8px_22px_-4px_rgba(129,39,207,0.32)]">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-[#1f1a23]">
                Account
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-1 flex cursor-pointer items-center gap-1.5 rounded-lg text-xs font-bold text-ink-muted transition-colors hover:text-rose-500"
              >
                <LogOut className="h-3 w-3" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      <nav className="fixed bottom-3 left-3 right-3 z-50 flex gap-2 overflow-x-auto rounded-[24px] border border-[#cfc2d6]/25 bg-white/92 p-2 shadow-2xl backdrop-blur-xl md:hidden">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-w-[64px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-[10px] font-black transition-all active:scale-95",
                isActive
                  ? "bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-[0_10px_26px_-8px_rgba(129,39,207,0.45)]"
                  : "text-ink-muted hover:bg-[#fbf0fe] hover:text-[#8127cf]"
              )}
              title={item.label}
            >
              <item.icon className="h-4 w-4" />
              <span className="max-w-[54px] truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
