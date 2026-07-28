"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Award,
  BarChart3,
  Bell,
  CalendarCheck,
  ChevronDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EditableProfileCard, type EditableProfile } from "@/components/profile/editable-profile-card";

interface Notification {
  id: number;
  type: "grade" | "attendance" | "exam" | "system";
  title: string;
  message: string;
  time: string;
  unread: boolean;
}

const dummyNotifications: Notification[] = [
  { id: 1, type: "grade", title: "Term grades published", message: "Final grades for Term 1 are ready. Check your subject reports.", time: "2 hours ago", unread: true },
  { id: 2, type: "attendance", title: "Attendance report ready", message: "Weekly attendance summary is now available for review.", time: "5 hours ago", unread: true },
  { id: 3, type: "exam", title: "New assessment created", message: "Mid-term exam has been scheduled for next week.", time: "1 day ago", unread: false },
  { id: 4, type: "system", title: "Profile updated", message: "Your profile changes have been saved successfully.", time: "2 days ago", unread: false },
];

const notifIconMap: Record<Notification["type"], LucideIcon> = {
  grade: Award,
  attendance: CalendarCheck,
  exam: FileText,
  system: Bell,
};

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [headerProfile, setHeaderProfile] = useState<EditableProfile | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const displayName = headerProfile?.fullName || userName;
  const displayRole = headerProfile?.roleLabel || userRole;
  const displayAvatar = headerProfile?.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(avatarSeed || displayName)}`;

  useEffect(() => {
    let cancelled = false;

    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.profile) setHeaderProfile(data.profile);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

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
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <>
      <header className={cn("flex items-center justify-between gap-3 shrink-0 bg-white/40 backdrop-blur-xl border border-[#cfc2d6]/12 rounded-[28px] px-5 py-3 shadow-sm z-40", compact ? "mb-5" : "mb-8")}>
      {searchPlaceholder ? (
        <div className="flex items-center gap-4 w-full max-w-[400px] group">
          <div className="flex items-center gap-3 rounded-2xl bg-white/80 border border-[#cfc2d6]/20 px-4 py-2.5 w-full shadow-sm transition-all group-focus-within:border-[#8127cf]/30 group-focus-within:shadow-md hover:border-[#8127cf]/20">
            <Search className="w-4 h-4 text-[#4d4354]/40 shrink-0" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              className="bg-transparent border-none outline-none text-sm font-semibold w-full min-w-0 placeholder:text-[#4d4354]/35"
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#fbf0fe] to-white border border-[#cfc2d6]/12 px-4 py-2 shadow-sm">
            <span className="flex h-2.5 w-2.5 rounded-full bg-[#8127cf] shadow-sm shadow-[#8127cf]/30" />
            <span className="text-xs font-semibold text-[#4d4354]/60 tracking-wide">{eyebrow}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 sm:gap-2.5 pl-2 sm:pl-4">
        {actions}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => { setNotifOpen((o) => !o); setMenuOpen(false); }}
            className={cn(
              "relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-white/80 text-[#4d4354]/45 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:text-[#8127cf] hover:shadow-md active:scale-[0.92] border border-[#cfc2d6]/12",
              notifOpen && "bg-white text-[#8127cf] shadow-md border-[#8127cf]/20"
            )}
            title="View notifications"
          >
            <Bell className="w-[18px] h-[18px]" />
            {dummyNotifications.some((n) => n.unread) && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#8127cf] ring-2 ring-white" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 z-[999] mt-3 w-80 overflow-hidden rounded-[28px] border border-[#cfc2d6]/15 bg-white shadow-[0_28px_80px_rgba(31,26,35,0.18)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#cfc2d6]/10">
                <h3 className="text-sm font-bold text-[#1d1b20] tracking-tight">Notifications</h3>
                <span className="text-[10px] font-semibold text-[#8127cf] bg-[#fbf0fe] px-2.5 py-1 rounded-full">{dummyNotifications.filter((n) => n.unread).length} new</span>
              </div>
              <div className="max-h-[320px] overflow-y-auto p-1.5 space-y-0.5">
                {dummyNotifications.map((n) => {
                  const Icon = notifIconMap[n.type];
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl px-4 py-3 transition-all cursor-pointer hover:bg-[#fbf0fe]/60",
                        n.unread && "bg-[#fbf0fe]/30"
                      )}
                    >
                      <div className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        n.unread ? "bg-[#8127cf]/10 text-[#8127cf]" : "bg-[#4d4354]/8 text-[#4d4354]/50"
                      )}>
                        <Icon className="w-[18px] h-[18px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("text-sm truncate", n.unread ? "font-bold text-[#1d1b20]" : "font-semibold text-[#4d4354]/80")}>{n.title}</p>
                          {n.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-[#8127cf]" />}
                        </div>
                        <p className="text-xs font-medium text-[#4d4354]/50 mt-0.5 leading-snug line-clamp-2">{n.message}</p>
                        <p className="text-[10px] font-semibold text-[#4d4354]/35 mt-1">{n.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-[#cfc2d6]/10 px-5 py-3">
                <button
                  type="button"
                  className="w-full cursor-pointer rounded-2xl bg-[#fbf0fe]/60 py-2.5 text-xs font-bold text-[#8127cf] transition-all hover:bg-[#fbf0fe] active:scale-[0.98]"
                >
                  Mark all as read
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-white/80 text-[#4d4354]/45 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:text-[#8127cf] hover:shadow-md active:scale-[0.92] border border-[#cfc2d6]/12"
          title="Account settings"
        >
          <Settings className="w-[18px] h-[18px]" />
        </button>
        <div className="hidden h-6 w-[1px] bg-gradient-to-b from-transparent via-[#cfc2d6]/30 to-transparent sm:block" />

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => { setMenuOpen((open) => !open); setNotifOpen(false); }}
            title="Account menu"
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-2xl border border-[#cfc2d6]/15 bg-white/85 p-1 pr-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:bg-white hover:shadow-lg active:scale-[0.98]",
              menuOpen && "border-[#8127cf]/30 bg-white shadow-lg"
            )}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <div className="h-8 w-8 bg-gradient-to-br from-[#fbf0fe] to-white rounded-xl border-2 border-white shadow-sm flex items-center justify-center overflow-hidden ring-1 ring-[#8127cf]/10">
              <img src={displayAvatar} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="hidden sm:block text-left">
              <p className="max-w-28 truncate text-sm font-semibold text-[#1d1b20] leading-none mb-0.5">{displayName}</p>
              <p className="max-w-28 truncate text-[9px] font-semibold text-[#8127cf] uppercase tracking-wider">{displayRole}</p>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 text-[#4d4354]/40 transition-transform duration-300", menuOpen && "rotate-180 text-[#8127cf]")} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-[999] mt-3 w-72 overflow-hidden rounded-[28px] border border-[#cfc2d6]/15 bg-white shadow-[0_28px_80px_rgba(31,26,35,0.18)]"
            >
              <div className="border-b border-[#cfc2d6]/10 bg-gradient-to-br from-[#fbf0fe]/80 to-white p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-[#8127cf]/10">
                    <img src={displayAvatar} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#1d1b20]">{displayName}</p>
                    <p className="truncate text-xs font-semibold text-[#4d4354]/60">{displayRole}</p>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-[9px] font-semibold text-[#8127cf] border border-[#8127cf]/10">
                      <UserRound className="h-3 w-3" />
                      Active account
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-1.5">
                <MenuLink href={dashboardHref} icon={LayoutDashboard} label="Main dashboard" onClick={() => setMenuOpen(false)} />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-[#4d4354] transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                  role="menuitem"
                >
                  <Settings className="h-4 w-4" />
                  Account settings
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-0.5 flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-rose-600 transition-all hover:bg-rose-50"
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
      </header>

      {settingsOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-[#1f1a23]/45 p-5 backdrop-blur-sm">
          <div className="w-full max-w-[720px] max-h-[85vh] overflow-y-auto rounded-[34px] border border-[#cfc2d6]/20 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)]">
            <div className="flex items-center justify-between px-7 py-5 border-b border-[#cfc2d6]/10 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#fbf0fe] to-white shadow-inner ring-1 ring-[#cfc2d6]/15">
                  <img src={displayAvatar} alt="" className="h-full w-full object-cover" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#1d1b20] tracking-tight">Account Settings</h2>
                  <p className="text-xs font-semibold text-[#4d4354]/60">Manage your profile details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-[#4d4354]/45 transition-all hover:bg-rose-50 hover:text-rose-500 active:scale-90"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6">
              <EditableProfileCard
                initialProfile={{
                  fullName: displayName,
                  roleLabel: displayRole,
                  profileImageUrl: headerProfile?.profileImageUrl || "",
                }}
                onSaved={setHeaderProfile}
              />
            </div>
          </div>
        </div>
      )}
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
      className="flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-[#4d4354] transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
      role="menuitem"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
