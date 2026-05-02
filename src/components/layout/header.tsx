"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export function Header({ title, description, actions }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<HeaderUser | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.user) setUser(data.user);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

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
    <header className="sticky top-0 z-30 border-b border-[#cfc2d6]/20 bg-[#fbf0fe]/90 px-4 py-4 backdrop-blur-xl md:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 rotate-3 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-lg shadow-[#8127cf]/20 md:hidden">
            <GraduationCap className="h-7 w-7 text-white" />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#8127cf]" />
              <span className="text-[10px] font-black text-[#b10e6b]/70">
                Skoolee Console
              </span>
            </div>
            <h1 className="truncate text-2xl font-black leading-tight text-[#1f1a23]">
              {title}
            </h1>
            {description && (
              <p className="mt-1 max-w-2xl text-sm font-medium text-[#4d4354]/65">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center xl:justify-end">
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4d4354]/45" />
            <Input
              placeholder="Search records..."
              className="h-11 rounded-2xl bg-white/80 pl-11 shadow-sm hover:bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="relative shrink-0 rounded-2xl bg-white/80 hover:-translate-y-0.5"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#8127cf]" />
            </Button>

            {actions}

            <div ref={menuRef} className="relative z-[80]">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-2xl border border-[#cfc2d6]/25 bg-white/85 px-2.5 pr-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#8127cf]/30 hover:bg-white hover:shadow-lg cursor-pointer",
                  menuOpen && "border-[#8127cf]/35 bg-white shadow-lg"
                )}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#8127cf] text-xs font-black text-white">
                  {user?.profileImageUrl ? <img src={avatarSrc} alt="" className="h-full w-full object-cover" /> : initials}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block max-w-36 truncate text-sm font-black text-[#1f1a23]">
                    {user?.fullName || "Account"}
                  </span>
                  <span className="block truncate text-[10px] font-bold text-[#8127cf]">
                    {user?.roleLabel || "Signed in"}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-[#4d4354]/50 transition-transform",
                    menuOpen && "rotate-180 text-[#8127cf]"
                  )}
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-[90] mt-3 w-72 overflow-hidden rounded-[28px] border border-[#cfc2d6]/20 bg-white shadow-[0_24px_70px_rgba(31,26,35,0.16)]"
                >
                  <div className="border-b border-[#cfc2d6]/15 bg-[#fbf0fe]/70 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-[#8127cf] text-sm font-black text-white shadow-lg shadow-[#8127cf]/20">
                        {user?.profileImageUrl ? <img src={avatarSrc} alt="" className="h-full w-full object-cover" /> : initials}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#1f1a23]">
                          {user?.fullName || "Skoolee User"}
                        </p>
                        <p className="truncate text-xs font-semibold text-[#4d4354]/65">
                          {user?.email || "Signed in"}
                        </p>
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-[#8127cf]">
                          <ShieldCheck className="h-3 w-3" />
                          {user?.roleLabel || "Active"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-2">
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
      className="flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black text-[#4d4354] transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
      role="menuitem"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
