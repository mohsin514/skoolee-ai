"use client";

import Link from "next/link";
import { AvatarImage } from "@/components/ui/avatar-image";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  Calendar,
  CalendarCheck,
  CheckCircle,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  Receipt,
  Settings,
  UserCheck,
  UserRound,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EditableProfileCard, type EditableProfile } from "@/components/profile/editable-profile-card";
import { CycleBadge } from "@/components/academic-year/CycleBadge";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { playNotificationBell } from "@/lib/sounds/bell";

const NOTIF_ICON_MAP: Record<string, LucideIcon> = {
  Award, Bell, BookOpen, Calendar, CalendarCheck, FileText,
  GraduationCap, LayoutGrid, Mail, MessageCircle, Receipt, UserCheck,
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
  const [bellShake, setBellShake] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [headerProfile, setHeaderProfile] = useState<EditableProfile | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const prevUnreadRef = useRef(0);
  const { notifications: liveNotifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const toastedNotifIds = useRef<Set<string>>(new Set());
  const displayName = (headerProfile?.fullName || userName || "").split("@")[0].replace(/[._-]/g, " ").replace(/\s+/g, " ").trim() || "User";
  const displayRole = headerProfile?.roleLabel || userRole;
  const displayAvatar = headerProfile?.profileImageUrl;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

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
      .catch(() => { toast.error("Failed to load profile"); });

    return () => {
      cancelled = true;
    };
  }, []);

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
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <>
      <header className={cn("flex items-center justify-between gap-3 shrink-0 bg-white/40 backdrop-blur-xl border border-[#cfc2d6]/25 rounded-[28px] px-5 py-3 shadow-[0_1px_2px_rgba(31,26,35,0.06),0_10px_36px_-8px_rgba(129,39,207,0.18)] z-40", compact ? "mb-5" : "mb-8")}>
        <div className="flex items-center gap-4">
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
            <p suppressHydrationWarning className="text-xs font-bold tracking-tight text-[#1d1b20] leading-tight">{greeting}, {displayName}</p>
            <p suppressHydrationWarning className="text-[9px] font-semibold text-ink-muted leading-tight mt-px">{today}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <CycleBadge />
        {actions}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => { setNotifOpen((o) => !o); setMenuOpen(false); }}
            className={cn(
              "relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-white/80 text-ink-subtle shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:text-[#8127cf] hover:shadow-md active:scale-[0.92] border border-[#cfc2d6]/12",
              notifOpen && "bg-white text-[#8127cf] shadow-md border-[#8127cf]/20",
              bellShake && "sk-shake"
            )}
            title="View notifications"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="sk-glow absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#8127cf] px-1.5 text-[12px] font-black text-white ring-2 ring-white shadow-md shadow-[#8127cf]/30">{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </button>

          {notifOpen && (
            <div className="animate-dropdown-enter absolute right-0 z-[999] mt-3 w-80 overflow-hidden rounded-[28px] border border-[#cfc2d6]/15 bg-white shadow-[0_28px_80px_rgba(31,26,35,0.18)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#cfc2d6]/10">
                <h3 className="text-sm font-bold text-[#1d1b20] tracking-tight">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-semibold text-[#8127cf] bg-[#fbf0fe] px-2.5 py-1 rounded-full">{unreadCount} new</span>
                )}
              </div>
              <div className="max-h-[360px] overflow-y-auto p-1.5 space-y-0.5">
                {liveNotifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell className="mx-auto h-8 w-8 text-ink-subtle mb-3" />
                    <p className="text-sm font-bold text-ink-subtle">No notifications yet</p>
                    <p className="text-xs font-medium text-ink-subtle mt-1">You&#39;re all caught up</p>
                  </div>
                ) : (
                  liveNotifications.map((n) => {
                    const Icon = resolveNotifIcon(n.icon);
                    return (
                      <div
                        key={n.id}
                        onClick={() => { if (!n.isRead) markAsRead([n.id]); }}
                        className={cn(
                          "flex items-start gap-3 rounded-2xl px-4 py-3 transition-all cursor-pointer hover:bg-[#fbf0fe]/60",
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
                          <p className="text-[10px] font-semibold text-ink-subtle mt-1">{relativeTime(n.createdAt)}</p>
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
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-white/80 text-ink-subtle shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:text-[#8127cf] hover:shadow-md active:scale-[0.92] border border-[#cfc2d6]/12"
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
            <div className={cn("h-8 w-8 bg-gradient-to-br from-[#fbf0fe] to-white rounded-xl border-2 border-white shadow-sm flex items-center justify-center overflow-hidden", menuOpen ? "ring-2 ring-[#8127cf]/25" : "ring-1 ring-[#8127cf]/10")}>
              <AvatarImage src={displayAvatar} />
            </div>
            <div className="hidden sm:block text-left">
              <p className="max-w-28 truncate text-xs font-semibold text-[#1d1b20] leading-none">{displayName}</p>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 text-ink-subtle transition-transform duration-300", menuOpen && "rotate-180 text-[#8127cf]")} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="animate-dropdown-enter absolute right-0 z-[999] mt-3 w-72 overflow-hidden rounded-[28px] border border-[#cfc2d6]/15 bg-white shadow-[0_28px_80px_rgba(31,26,35,0.18)]"
            >
              <div className="border-b border-[#cfc2d6]/10 bg-gradient-to-br from-[#fbf0fe]/80 to-white p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-md", menuOpen ? "ring-2 ring-[#8127cf]/25" : "ring-1 ring-[#8127cf]/10")}>
                    <AvatarImage src={displayAvatar} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-[#1d1b20]">{displayName}</p>
                    <p className="truncate text-[11px] font-semibold text-ink-muted">{displayRole}</p>
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
                  className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-xs font-semibold text-ink transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                  role="menuitem"
                >
                  <Settings className="h-4 w-4" />
                  Account settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setPasswordModalOpen(true);
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-xs font-semibold text-ink transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                  role="menuitem"
                >
                  <KeyRound className="h-4 w-4" />
                  Change password
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-0.5 flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-xs font-semibold text-rose-600 transition-all hover:bg-rose-50"
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
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-[#1f1a23]/45 p-5 backdrop-blur-sm animate-backdrop-enter" onClick={() => setSettingsOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Account Settings" onClick={(e) => e.stopPropagation()} className="w-full max-w-[720px] max-h-[85vh] overflow-y-auto rounded-[34px] border border-[#cfc2d6]/15 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)] animate-modal-enter">
            <div className="flex items-center justify-between px-7 py-5 border-b border-[#cfc2d6]/10 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#fbf0fe] to-white shadow-inner ring-1 ring-[#cfc2d6]/15">
                  <AvatarImage src={displayAvatar} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#1d1b20] tracking-tight">Account Settings</h2>
                  <p className="text-xs font-semibold text-ink-muted">Manage your profile details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-ink-subtle transition-all hover:bg-rose-50 hover:text-rose-500 active:scale-90"
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

      {passwordModalOpen && (
        <ChangePasswordModal
          onClose={() => setPasswordModalOpen(false)}
        />
      )}
    </>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const strength = passwordStrength(newPassword);

  const reqs = [
    { label: "Min 8 characters", met: newPassword.length >= 8 },
    { label: "One uppercase", met: /[A-Z]/.test(newPassword) },
    { label: "One lowercase", met: /[a-z]/.test(newPassword) },
    { label: "One number", met: /[0-9]/.test(newPassword) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(newPassword) },
    { label: "Passwords match", met: newPassword === confirmPassword && newPassword !== "" },
  ];

  const handleSubmit = async () => {
    setError("");
    if (!currentPassword) return setError("Current password is required");
    if (!newPassword) return setError("New password is required");
    if (newPassword.length < 8) return setError("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return setError("Passwords do not match");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to change password");
      toast.success("Password changed successfully");
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#1f1a23]/45 p-5 backdrop-blur-sm animate-backdrop-enter" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Change Password" onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-[34px] border border-[#cfc2d6]/15 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)] animate-modal-enter">
        <div className="flex items-center justify-between px-7 py-5 border-b border-[#cfc2d6]/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#fbf0fe] to-white text-[#8127cf] shadow-sm ring-1 ring-[#cfc2d6]/15">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1d1b20] tracking-tight">Change Password</h2>
              <p className="text-xs font-semibold text-ink-muted">Update your account password</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-ink-subtle transition-all hover:bg-rose-50 hover:text-rose-500 active:scale-90"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="mb-1.5 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
              Current Password
            </label>
            <input
              type={showPasswords ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="h-12 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/35 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPasswords ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="h-12 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 pr-12 text-sm font-bold outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/35 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-[#8127cf] cursor-pointer"
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1.5 flex-1 rounded-full transition-all ${
                        level <= strength.level
                          ? strength.level <= 1 ? "bg-rose-500" : strength.level <= 2 ? "bg-amber-500" : strength.level <= 3 ? "bg-emerald-400" : "bg-emerald-600"
                          : "bg-[#f3f4f9]"
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-wider ${
                  strength.level <= 1 ? "text-rose-500" : strength.level <= 2 ? "text-amber-500" : "text-emerald-600"
                }`}>
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
              Confirm New Password
            </label>
            <input
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="h-12 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/35 focus:bg-white"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="mt-1.5 text-[10px] font-bold text-rose-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Passwords do not match
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {reqs.slice(0, 3).map((r, i) => (
              <div key={i} className={`flex items-center gap-1.5 text-[9px] font-bold ${r.met ? 'text-emerald-600' : 'text-ink-subtle'}`}>
                {r.met ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5 opacity-30" />} {r.label}
              </div>
            ))}
            {reqs.slice(3).map((r, i) => (
              <div key={i + 3} className={`flex items-center gap-1.5 text-[9px] font-bold ${r.met ? 'text-emerald-600' : 'text-ink-subtle'}`}>
                {r.met ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5 opacity-30" />} {r.label}
              </div>
            ))}
          </div>

          {error && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200/40 p-3">
              <p className="text-[10px] font-bold text-rose-700">{error}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-2xl bg-[#f3f4f9] text-sm font-black text-ink hover:bg-[#e8e0ec] transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !currentPassword || !newPassword || newPassword !== confirmPassword}
            className="flex-[2] h-12 rounded-2xl bg-gradient-to-r from-[#8127cf] to-[#9c48ea] text-white text-sm font-black flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-[#8127cf]/20 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {loading ? "Updating..." : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

function passwordStrength(password: string): { level: number; label: string } {
  if (!password) return { level: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: "Weak" };
  if (score <= 2) return { level: 2, label: "Fair" };
  if (score <= 3) return { level: 3, label: "Good" };
  return { level: 4, label: "Strong" };
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
      className="flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-xs font-semibold text-ink transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
      role="menuitem"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
