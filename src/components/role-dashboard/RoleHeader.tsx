"use client";

import { UiText, useUiText, useLocale } from "@/components/locale/LocaleProvider";

import { SettingsModalHost } from "@/components/settings/SettingsModalHost";
import { openSettings } from "@/components/settings/settings-sections";
import { clearDeviceDrafts } from "@/lib/drafts/store";


import Link from "next/link";
import { useRouter } from "next/navigation";
import { AvatarImage } from "@/components/ui/avatar-image";
import { useEffect, useRef, useState } from "react";
import {
  Award,
  Bell,
  BookOpen,
  Calendar,
  CalendarCheck,
  ChevronDown,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Mail,
  MessageCircle,
  Receipt,
  Settings,
  UserCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { EditableProfile } from "@/components/profile/editable-profile-card";
import { CycleBadge } from "@/components/academic-year/CycleBadge";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { playNotificationBell } from "@/lib/sounds/bell";
import { Button, buttonVariants } from "@/components/ui/button";


const accountMenuItemClass = "flex w-full justify-start items-center gap-3 text-start";

const NOTIF_ICON_MAP: Record<string, LucideIcon> = {
  Award, Bell, BookOpen, Calendar, CalendarCheck, FileText,
  GraduationCap, LayoutGrid, Mail, MessageCircle, Receipt, UserCheck,
};

function resolveNotifIcon(name: string | null): LucideIcon {
  return (name && NOTIF_ICON_MAP[name]) || Bell;
}

function relativeTime(dateStr: string, language: string, timeZone: string): string {
  const date = new Date(dateStr);
  if (!Number.isFinite(date.getTime())) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (seconds < 60) return formatter.format(0, "second");
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return formatter.format(-Math.floor(seconds / 3600), "hour");
  if (seconds < 604800) return formatter.format(-Math.floor(seconds / 86400), "day");
  return date.toLocaleDateString(language, { timeZone, month: "short", day: "numeric" });
}

interface RoleHeaderProps {
  eyebrow?: string;
  searchPlaceholder?: string;
  userName?: string;
  userRole?: string;
  avatarSeed?: string;
  dashboardHref?: string;
  compact?: boolean;
  actions?: ReactNode;
}

export function RoleHeader({
  eyebrow,
  searchPlaceholder,
  userName = "Skoolee User",
  userRole = "Dashboard",
  avatarSeed,
  dashboardHref = "/dashboard",
  compact = false,
  actions,
}: RoleHeaderProps) {
  const router = useRouter();
  const t = useUiText();
  const { language, timezone } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [bellShake, setBellShake] = useState(false);
  const [headerProfile, setHeaderProfile] = useState<EditableProfile | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const prevUnreadRef = useRef(0);
  const { notifications: liveNotifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const toastedNotifIds = useRef<Set<string>>(new Set());
  const displayName = (headerProfile?.fullName || userName || "").split("@")[0].replace(/[._-]/g, " ").replace(/\s+/g, " ").trim() || "User";
  const displayRole = headerProfile?.roleLabel || userRole;
  const displayAvatar = headerProfile?.profileImageUrl;

  const greeting = (() => {
    const h = Number(new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const today = new Date().toLocaleDateString(language, { timeZone: timezone, weekday: "long", month: "long", day: "numeric", year: "numeric" });

  useEffect(() => {
    const newest = liveNotifications[0];
    if (!newest || newest.isRead) return;
    if (toastedNotifIds.current.has(newest.id)) return;

    const iconName = newest.icon;
    const Icon = resolveNotifIcon(iconName);

    playNotificationBell();
    toast(iconName ? <Icon className="h-4 w-4 text-[#8127cf]" /> : undefined, {
      description: (
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#1d1b20]">{newest.title}</p>
          {newest.message && (
            <p className="mt-0.5 text-xs font-medium text-ink line-clamp-2">{newest.message}</p>
          )}
        </div>
      ),
      duration: 5000,
    });

    toastedNotifIds.current.add(newest.id);
    if (toastedNotifIds.current.size > 100) {
      const ids = [...toastedNotifIds.current];
      ids.slice(0, ids.length - 100).forEach((id) => toastedNotifIds.current.delete(id));
    }
  }, [liveNotifications, markAsRead]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.profile) setHeaderProfile(data.profile);
      })
      .catch(() => { toast.error(t("Failed to load profile")); });

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setBellShake(true);
      const timer = setTimeout(() => setBellShake(false), 340);
      prevUnreadRef.current = unreadCount;
      return () => clearTimeout(timer);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    if (!menuOpen && !notifOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (notifRef.current?.contains(target)) return;
      setMenuOpen(false);
      setNotifOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setNotifOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen, notifOpen]);

  const handleLogout = async () => {
    clearDeviceDrafts();
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const handleNotificationClick = (notification: AppNotification) => {
    // Mark as read
    if (!notification.isRead) {
      markAsRead([notification.id]);
    }

    // Close the dropdown
    setNotifOpen(false);

    // Navigate to the link if available
    if (notification.link) {
      router.push(notification.link);
    }
  };

  return (
    <>
      <header className={cn("relative flex flex-wrap items-center justify-between gap-[8px] shrink-0 bg-white/40 backdrop-blur-xl border border-[#cfc2d6]/25 rounded-[22px] px-[12px] py-[8px] sm:px-4 sm:py-2.5 shadow-[0_1px_2px_rgba(31,26,35,0.05),0_8px_28px_-10px_rgba(129,39,207,0.18)] z-40", compact ? "mb-3" : "mb-4")}>
        <div className="hidden min-[400px]:flex items-center gap-4">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] flex items-center justify-center shadow-md shadow-[#8127cf]/15 shrink-0">
            <LayoutDashboard className="h-[18px] w-[18px] text-white" />
          </div>
          {/* Both lines come from the *viewer's* clock and timezone, which the
              server cannot know, so its guess and the browser's routinely
              disagree ("Good evening" vs "Good morning", and the date itself
              either side of midnight). That mismatch was throwing a hydration
              error on every dashboard load. The client value is the correct
              one; suppress the diff rather than degrade to a server guess. */}
          <div className="hidden sm:block">
            <p suppressHydrationWarning className="text-xs font-bold tracking-tight text-[#1d1b20] leading-tight">{t(greeting)}, <bdi>{displayName}</bdi></p>
            <p suppressHydrationWarning className="text-[9px] font-semibold text-ink-muted leading-tight mt-px">{today}</p>
          </div>
        </div>

        <div className="ms-auto flex w-full min-w-0 flex-wrap items-center justify-end gap-[6px] sm:w-auto sm:gap-2.5">
          <div className="me-auto max-w-full [&>div]:max-w-full [&>div]:px-[8px] [&>div]:py-[6px] [&_svg]:shrink-0"><CycleBadge /></div>
        {actions}
        <div ref={notifRef} className="sm:relative">
          <Button variant="outline" size="icon"
            type="button"
            onClick={() => { setNotifOpen((o) => !o); setMenuOpen(false); }}
            className={cn(
              "relative flex h-[44px] w-[44px] min-w-[44px] items-center justify-center [&>svg]:size-[18px] sm:h-11 sm:w-11 sm:min-w-11",
              notifOpen && "border-primary",
              bellShake && "sk-shake"
            )}
            title={t("View notifications")}
            aria-label={t("View notifications")}
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="sk-glow absolute -end-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#8127cf] px-1.5 text-[12px] font-black text-white ring-2 ring-white shadow-md shadow-[#8127cf]/30">{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </Button>

          {notifOpen && (
            <div className="animate-dropdown-enter absolute end-0 top-full z-[999] mt-2 max-h-[70dvh] w-[min(20rem,calc(100vw-24px))] overflow-y-auto rounded-[28px] border border-[#cfc2d6]/15 bg-white shadow-[0_28px_80px_rgba(31,26,35,0.18)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#cfc2d6]/10">
                <h3 className="text-sm font-bold text-[#1d1b20] tracking-tight"><UiText>{"Notifications"}</UiText></h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-semibold text-[#8127cf] bg-[#fbf0fe] px-2.5 py-1 rounded-full">{unreadCount}{" "}<UiText>{"new"}</UiText></span>
                )}
              </div>
              <div className="max-h-[360px] overflow-y-auto p-1.5 space-y-0.5">
                {liveNotifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell className="mx-auto h-8 w-8 text-ink-subtle mb-3" />
                    <p className="text-sm font-bold text-ink-subtle"><UiText>{"No notifications yet"}</UiText></p>
                    <p className="text-xs font-medium text-ink-subtle mt-1"><UiText>{"You're all caught up"}</UiText></p>
                  </div>
                ) : (
                  liveNotifications.map((n) => {
                    const Icon = resolveNotifIcon(n.icon);
                    return (
                      <Button variant="ghost"
                        key={n.id}
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={cn(
                          "w-full flex justify-start items-start gap-3 text-start",
                          !n.isRead && "bg-[#fbf0fe]/30"
                        )}
                      >
                        <div className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          !n.isRead ? "bg-[#8127cf]/10 text-[#8127cf]" : "bg-[#4d4354]/8 text-ink-muted"
                        )}>
                          <Icon className="w-[18px] h-[18px]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={cn("text-sm truncate", !n.isRead ? "font-bold text-[#1d1b20]" : "font-semibold text-ink")}>{n.title}</p>
                            {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-[#8127cf]" />}
                          </div>
                          <p className="text-xs font-medium text-ink-muted mt-0.5 leading-snug line-clamp-2">{n.message}</p>
                          <p className="text-[10px] font-semibold text-ink-subtle mt-1">{relativeTime(n.createdAt, language, timezone)}</p>
                        </div>
                      </Button>
                    );
                  })
                )}
              </div>
              {unreadCount > 0 && (
                <div className="border-t border-[#cfc2d6]/10 px-5 py-3">
                  <Button variant="secondary" size="sm"
                    type="button"
                    onClick={markAllAsRead}
                    className="w-full"
                  ><UiText>{"Mark all as read"}</UiText></Button>
                </div>
              )}
            </div>
          )}
        </div>
        <Button variant="outline" size="icon"
          type="button"
          onClick={() => openSettings("profile")}
          className="flex h-[44px] w-[44px] min-w-[44px] items-center justify-center [&>svg]:size-[18px] sm:h-11 sm:w-11 sm:min-w-11"
          title={t("Account settings")}
          aria-label={t("Account settings")}
        >
          <Settings className="w-[18px] h-[18px]" />
        </Button>
        <div aria-hidden="true" className="hidden h-7 w-px shrink-0 bg-border sm:block" />

        <div ref={menuRef} className="sm:relative">
          <Button variant="ghost"
            type="button"
            onClick={() => { setMenuOpen((open) => !open); setNotifOpen(false); }}
            title={t("Account menu")}
            aria-label={t("Account menu")}
            className={cn(
              "flex min-h-[44px] min-w-[44px] justify-start items-center gap-0 px-[6px] py-[6px] sm:min-h-11 sm:gap-2.5 sm:px-4 hover:-translate-y-0.5",
              menuOpen && "border-[#8127cf]/30 bg-white shadow-lg"
            )}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <div className={cn("h-[28px] w-[28px] sm:h-8 sm:w-8 bg-gradient-to-br from-[#fbf0fe] to-white rounded-xl border-2 border-white shadow-sm flex items-center justify-center overflow-hidden", menuOpen ? "ring-2 ring-[#8127cf]/25" : "ring-1 ring-[#8127cf]/10")}>
              <AvatarImage src={displayAvatar} name={displayName} initialsClassName="text-[11px]" />
            </div>
            <div className="hidden sm:block text-start">
              <p className="max-w-28 truncate text-xs font-semibold text-[#1d1b20] leading-none">{displayName}</p>
            </div>
            <ChevronDown className={cn("hidden sm:block h-3.5 w-3.5 text-ink-subtle transition-transform duration-300", menuOpen && "rotate-180 text-[#8127cf]")} />
          </Button>

          {menuOpen && (
            <div
              role="menu"
              className="animate-dropdown-enter absolute end-0 top-full z-[999] mt-2 max-h-[70dvh] w-[min(18rem,calc(100vw-24px))] overflow-y-auto rounded-[28px] border border-[#cfc2d6]/15 bg-white shadow-[0_28px_80px_rgba(31,26,35,0.18)]"
            >
              <div className="border-b border-[#cfc2d6]/10 bg-gradient-to-br from-[#fbf0fe]/80 to-white p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-md", menuOpen ? "ring-2 ring-[#8127cf]/25" : "ring-1 ring-[#8127cf]/10")}>
                    <AvatarImage src={displayAvatar} name={displayName} initialsClassName="text-[11px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-[#1d1b20]">{displayName}</p>
                    <p className="truncate text-[11px] font-semibold text-ink-muted">{t(displayRole)}</p>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-[9px] font-semibold text-[#8127cf] border border-[#8127cf]/10">
                      <UserRound className="h-3 w-3" /><UiText>{"Active account"}</UiText></div>
                  </div>
                </div>
              </div>

              <div className="p-1.5">
                <MenuLink href={dashboardHref} icon={LayoutDashboard} label="Main dashboard" onClick={() => setMenuOpen(false)} />
                <Button variant="ghost" size="sm"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openSettings("profile");
                  }}
                  className={accountMenuItemClass}
                  role="menuitem"
                >
                  <Settings className="h-4 w-4" /><UiText>{"Account settings"}</UiText></Button>
                <Button variant="ghost" size="sm"
                  type="button"
                  onClick={handleLogout}
                  className={accountMenuItemClass}
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" /><UiText>{"Sign out"}</UiText></Button>
              </div>
            </div>
          )}
        </div>
      </div>
      </header>

      <SettingsModalHost onProfileSaved={setHeaderProfile} />
    </>
  );
}

function MenuLink({
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
      className={buttonVariants({ variant: "ghost", size: "sm", className: accountMenuItemClass })}
      role="menuitem"
    >
      <Icon className="h-4 w-4" />
      <UiText>{label}</UiText>
    </Link>
  );
}
