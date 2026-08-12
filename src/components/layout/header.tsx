"use client";

import Link from "next/link";
import { AvatarImage } from "@/components/ui/avatar-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Award,
  Bell,
  BookOpen,
  Calendar,
  CalendarCheck,
  ChevronDown,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Mail,
  Receipt,
  Settings,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import SkooleeLogo from "@/components/SkooleeLogo";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";

const NOTIF_ICON_MAP: Record<string, LucideIcon> = {
  Award, Bell, BookOpen, Calendar, CalendarCheck, FileText,
  GraduationCap, LayoutGrid, Mail, Receipt, UserCheck,
};

function resolveNotifIcon(name: string | null): LucideIcon {
  return (name && NOTIF_ICON_MAP[name]) || Bell;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface HeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

interface HeaderUser {
  email: string;
  fullName: string;
  profileImageUrl?: string;
  roleLabel: string;
  dashboardPath: string;
}

interface ActiveCycle {
  id: string;
  label: string;
  academicYear: number;
  status: string;
}

export function Header({ title, description, actions }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [cycle, setCycle] = useState<ActiveCycle | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const { notifications: liveNotifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [sessionRes, cycleRes] = await Promise.all([
          fetch("/api/auth/session"),
          fetch("/api/academic-cycle"),
        ]);
        if (!cancelled) {
          if (sessionRes.ok) {
            const data = await sessionRes.json();
            if (data?.user) setUser(data.user);
          }
          if (cycleRes.ok) {
            const data = await cycleRes.json();
            if (data?.active) setCycle(data.active);
          }
        }
      } catch { toast.error("Failed to load notifications"); }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen && !notifOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      if (notifRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
      setNotifOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setNotifOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen, notifOpen]);

  const initials = useMemo(() => {
    const name = user?.fullName || "User";
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";
  }, [user?.fullName]);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };
  const billingHref = user?.dashboardPath === "/super" ? "/super?view=billing" : "/dashboard/billing";
  const avatarSrc = user?.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user?.fullName || "Account")}`;

  return (
    <header className="sticky top-0 z-30 border-b border-[#cfc2d6]/25 bg-[#fbf0fe]/90 px-4 py-3 backdrop-blur-xl shadow-[0_1px_2px_rgba(31,26,35,0.06),0_10px_36px_-8px_rgba(129,39,207,0.18)] md:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="shrink-0 -rotate-2 md:hidden">
            <SkooleeLogo size="1.25rem" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-[#b10e6b]/70 tracking-wide">
                Skoolee Console
              </span>
              {cycle && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#8127cf]/15 bg-[#8127cf]/5 px-2 py-0.5 text-[8px] font-semibold text-[#8127cf]">
                  <Calendar className="h-2.5 w-2.5" />
                  {cycle.label}
                </span>
              )}
            </div>
            <h1 className="truncate text-xl font-black leading-tight text-[#1f1a23]">
              {title}
            </h1>
            {description && (
              <p className="mt-0.5 max-w-2xl text-xs font-medium text-[#4d4354]/65">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div ref={notifRef} className="relative">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="relative shrink-0 rounded-xl bg-white/80 hover:-translate-y-0.5 h-10 w-10"
              title="Notifications"
              onClick={() => {
                setNotifOpen((open) => !open);
                setMenuOpen(false);
              }}
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="sk-glow absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#8127cf] px-1 text-[10px] font-black text-white ring-2 ring-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>

            {notifOpen && (
              <div className="animate-dropdown-enter absolute right-0 z-[999] mt-3 w-80 overflow-hidden rounded-[28px] border border-[#cfc2d6]/15 bg-white shadow-[0_28px_80px_rgba(31,26,35,0.18)]">
                <div className="flex items-center justify-between border-b border-[#cfc2d6]/10 px-5 py-4">
                  <h3 className="text-sm font-bold text-[#1d1b20] tracking-tight">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-[#fbf0fe] px-2.5 py-1 text-[10px] font-semibold text-[#8127cf]">{unreadCount} new</span>
                  )}
                </div>
                <div className="max-h-[360px] space-y-0.5 overflow-y-auto p-1.5">
                  {liveNotifications.length === 0 ? (
                    <div className="py-10 text-center">
                      <Bell className="mx-auto mb-3 h-8 w-8 text-[#4d4354]/15" />
                      <p className="text-sm font-bold text-[#4d4354]/40">No notifications yet</p>
                      <p className="mt-1 text-xs font-medium text-[#4d4354]/30">You&#39;re all caught up</p>
                    </div>
                  ) : (
                    liveNotifications.map((n) => {
                      const Icon = resolveNotifIcon(n.icon);
                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (!n.isRead) markAsRead([n.id]);
                          }}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 transition-all hover:bg-[#fbf0fe]/60",
                            !n.isRead && "bg-[#fbf0fe]/30"
                          )}
                        >
                          <div className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                            !n.isRead ? "bg-[#8127cf]/10 text-[#8127cf]" : "bg-[#4d4354]/8 text-[#4d4354]/50"
                          )}>
                            <Icon className="h-[18px] w-[18px]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className={cn("truncate text-sm", !n.isRead ? "font-bold text-[#1d1b20]" : "font-semibold text-[#4d4354]/80")}>{n.title}</p>
                              {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-[#8127cf]" />}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug text-[#4d4354]/50">{n.message}</p>
                            <p className="mt-1 text-[10px] font-semibold text-[#4d4354]/35">{relativeTime(n.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {unreadCount > 0 && (
                  <div className="border-t border-[#cfc2d6]/10 px-5 py-3">
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="w-full cursor-pointer rounded-2xl bg-[#fbf0fe]/60 py-2.5 text-xs font-bold text-[#8127cf] transition-all hover:bg-[#fbf0fe] active:scale-[0.98]"
                    >
                      Mark all as read
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {actions}

          <div ref={menuRef} className="relative z-[80]">
            <button
              type="button"
              onClick={() => {
                setMenuOpen((open) => !open);
                setNotifOpen(false);
              }}
              className={cn(
                "flex h-10 items-center gap-2 rounded-xl border border-[#cfc2d6]/25 bg-white/85 px-2 pr-2.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#8127cf]/30 hover:bg-white hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] cursor-pointer",
                menuOpen && "border-[#8127cf]/35 bg-white shadow-lg ring-2 ring-[#8127cf]/15"
              )}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#8127cf] text-[10px] font-black text-white">
                {user?.profileImageUrl ? <AvatarImage src={avatarSrc} /> : initials}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="max-w-28 truncate text-xs font-semibold text-[#1f1a23]">
                  {(user?.fullName || "Account").split("@")[0].replace(/[._-]/g, " ")}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-[#4d4354]/50 transition-transform",
                  menuOpen && "rotate-180 text-[#8127cf]"
                )}
              />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="animate-dropdown-enter absolute right-0 z-[90] mt-2 w-64 overflow-hidden rounded-[22px] border border-[#cfc2d6]/20 bg-white shadow-[0_24px_70px_rgba(31,26,35,0.16)]"
              >
                <div className="border-b border-[#cfc2d6]/15 bg-[#fbf0fe]/70 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-[#8127cf] text-xs font-black text-white shadow-lg shadow-[#8127cf]/20">
                      {user?.profileImageUrl ? <AvatarImage src={avatarSrc} /> : initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-[#1f1a23]">
                        {(user?.fullName || "Skoolee User").split("@")[0].replace(/[._-]/g, " ")}
                      </p>
                      <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold text-[#8127cf]">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        {user?.roleLabel || "Active"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-1.5">
                  <AccountLink
                    href={user?.dashboardPath || "/dashboard"}
                    icon={LayoutDashboard}
                    label="Role dashboard"
                    onClick={() => setMenuOpen(false)}
                  />
                  <AccountLink
                    href="/dashboard/settings"
                    icon={Settings}
                    label="Account settings"
                    onClick={() => setMenuOpen(false)}
                  />
                  <AccountLink
                    href={billingHref}
                    icon={CreditCard}
                    label="Billing"
                    onClick={() => setMenuOpen(false)}
                  />
                  <button
                    type="button"
                    onClick={signOut}
                    className="mt-0.5 flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-semibold text-rose-600 transition-all hover:bg-rose-50"
                    role="menuitem"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function AccountLink({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-semibold text-[#4d4354] transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
      role="menuitem"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
