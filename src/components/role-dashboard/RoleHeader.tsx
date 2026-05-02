"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [headerProfile, setHeaderProfile] = useState<EditableProfile | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
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
    if (!menuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className={cn("flex items-center justify-between gap-3 shrink-0", compact ? "mb-5" : "mb-8")}>
      {searchPlaceholder ? (
        <div className="bg-white/75 backdrop-blur-xl border border-[#cfc2d6]/20 px-6 py-3 rounded-2xl flex items-center gap-4 w-full max-w-[400px] shadow-sm transition-all hover:bg-white hover:border-[#8127cf]/20">
          <Search className="w-5 h-5 text-[#4d4354]/40" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            className="bg-transparent border-none outline-none text-sm font-bold w-full min-w-0"
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 text-[#4d4354]/60 font-bold text-sm">
          <span className="h-2 w-2 rounded-full bg-[#8127cf]" />
          <span>{eyebrow}</span>
        </div>
      )}

      <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-4">
        {actions}
        <button
          type="button"
          className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl bg-white/75 text-[#4d4354]/45 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:text-[#8127cf]"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#8127cf]" />
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl bg-white/75 text-[#4d4354]/45 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:text-[#8127cf]"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
        <div className="hidden h-5 w-[1px] bg-[#cfc2d6]/35 sm:block" />

        <div ref={menuRef} className="relative z-[80]">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-2xl border border-[#cfc2d6]/20 bg-white/75 p-1.5 pr-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:bg-white hover:shadow-lg",
              menuOpen && "border-[#8127cf]/30 bg-white shadow-lg"
            )}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <div className="h-9 w-9 bg-[#fbf0fe] rounded-xl border-2 border-white shadow-sm flex items-center justify-center overflow-hidden">
              <img src={displayAvatar} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="hidden sm:block text-left">
              <p className="max-w-32 truncate text-sm font-black text-[#1f1a23] leading-none mb-1">{displayName}</p>
              <p className="max-w-32 truncate text-[10px] font-bold text-[#8127cf] uppercase tracking-normal">{displayRole}</p>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-[#4d4354]/45 transition-transform", menuOpen && "rotate-180 text-[#8127cf]")} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-[90] mt-3 w-72 overflow-hidden rounded-[28px] border border-[#cfc2d6]/20 bg-white shadow-[0_24px_70px_rgba(31,26,35,0.16)]"
            >
              <div className="border-b border-[#cfc2d6]/15 bg-[#fbf0fe]/70 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-[#fbf0fe] shadow-inner">
                    <img src={displayAvatar} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#1f1a23]">{displayName}</p>
                    <p className="truncate text-xs font-semibold text-[#4d4354]/65">{displayRole}</p>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-[#8127cf]">
                      <UserRound className="h-3 w-3" />
                      Active account
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-2">
                <MenuLink href={dashboardHref} icon={LayoutDashboard} label="Main dashboard" onClick={() => setMenuOpen(false)} />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black text-[#4d4354] transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                  role="menuitem"
                >
                  <Settings className="h-4 w-4" />
                  Account settings
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black text-rose-600 transition-all hover:bg-rose-50"
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

      {settingsOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 p-5 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[34px] border border-[#cfc2d6]/20 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)]">
            <div className="border-b border-[#cfc2d6]/15 bg-[#fbf0fe]/70 p-6">
              <div className="flex items-start justify-between gap-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-inner">
                    <img src={displayAvatar} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-[#1f1a23]">Account settings</h2>
                    <p className="mt-1 text-sm font-semibold text-[#4d4354]/65">{displayRole}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-[#4d4354]/45 transition-all hover:bg-white hover:text-[#8127cf]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="space-y-4 p-6">
              <EditableProfileCard
                compact
                initialProfile={{
                  fullName: displayName,
                  roleLabel: displayRole,
                  profileImageUrl: headerProfile?.profileImageUrl || "",
                }}
                onSaved={setHeaderProfile}
              />
              <div className="flex gap-3">
                <Link
                  href={dashboardHref}
                  onClick={() => setSettingsOpen(false)}
                  className="flex h-12 flex-1 cursor-pointer items-center justify-center rounded-2xl bg-[#fbf0fe] px-4 text-sm font-black text-[#8127cf] transition-all hover:bg-[#eadfed]"
                >
                  Main dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex h-12 flex-1 cursor-pointer items-center justify-center rounded-2xl bg-rose-50 px-4 text-sm font-black text-rose-600 transition-all hover:bg-rose-500 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
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
      className="flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black text-[#4d4354] transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
      role="menuitem"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
