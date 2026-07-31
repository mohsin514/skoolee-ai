"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Calendar,
  ChevronDown,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
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

interface ActiveCycle {
  id: string;
  label: string;
  academicYear: number;
  status: string;
}

export function Header({ title, description, actions }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [cycle, setCycle] = useState<ActiveCycle | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
      } catch {}
    };

    load();

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
    <header className="sticky top-0 z-30 border-b border-[#cfc2d6]/20 bg-[#fbf0fe]/90 px-4 py-3 backdrop-blur-xl md:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 rotate-3 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-lg shadow-[#8127cf]/20 md:hidden">
            <GraduationCap className="h-6 w-6 text-white" />
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative shrink-0 rounded-xl bg-white/80 hover:-translate-y-0.5 h-10 w-10"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#8127cf]" />
          </Button>

          {actions}

          <div ref={menuRef} className="relative z-[80]">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className={cn(
                "flex h-10 items-center gap-2 rounded-xl border border-[#cfc2d6]/25 bg-white/85 px-2 pr-2.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#8127cf]/30 hover:bg-white hover:shadow-lg cursor-pointer",
                menuOpen && "border-[#8127cf]/35 bg-white shadow-lg"
              )}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#8127cf] text-[10px] font-black text-white">
                {user?.profileImageUrl ? <img src={avatarSrc} alt="" className="h-full w-full object-cover" /> : initials}
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
                className="absolute right-0 z-[90] mt-2 w-64 overflow-hidden rounded-[22px] border border-[#cfc2d6]/20 bg-white shadow-[0_24px_70px_rgba(31,26,35,0.16)]"
              >
                <div className="border-b border-[#cfc2d6]/15 bg-[#fbf0fe]/70 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-[#8127cf] text-xs font-black text-white shadow-lg shadow-[#8127cf]/20">
                      {user?.profileImageUrl ? <img src={avatarSrc} alt="" className="h-full w-full object-cover" /> : initials}
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
