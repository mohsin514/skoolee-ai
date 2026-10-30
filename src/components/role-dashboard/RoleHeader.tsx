"use client";

import { UiText, useUiText, useLocale } from "@/components/locale/LocaleProvider";
import { Tooltip } from "@/components/ui/tooltip";

import { SettingsModalHost } from "@/components/settings/SettingsModalHost";
import { openSettings } from "@/components/settings/settings-sections";

import Link from "next/link";
import { AvatarImage } from "@/components/ui/avatar-image";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Languages, LayoutDashboard, LogOut, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EditableProfile } from "@/components/profile/editable-profile-card";
import { CycleBadge } from "@/components/academic-year/CycleBadge";
import { ScopeBadge, useShellSession } from "./ScopeBadge";
import { HelpMenu } from "./HelpMenu";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { playNotificationBell } from "@/lib/sounds/bell";
import { Button } from "@/components/ui/button";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { clearOnSignOut, pendingOnDevice } from "@/lib/offline/store";
import { signOutAndLeave } from "@/lib/auth/sign-out";
import { dashboardPathForRole, type UserRole } from "@/lib/roles";


/** Roles that see the academic-cycle chip (staff who work inside a cycle; not the group admin or the platform). */
const NO_CYCLE: ReadonlySet<string> = new Set(["SUPER_ADMIN", "APP_OWNER", "PARENT", "STUDENT"]);

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

/** A registry `accountMenu` leaf (e.g. My leave), already translated by RoleShell. */
export interface AccountMenuLink { id: string; label: string; icon: LucideIcon; href?: string; onSelect?: () => void }

interface RoleHeaderProps {
  /** Translated console name (registry eyebrow). */
  eyebrow?: string;
  /** The console landing view: the greeting and date show only here. */
  landing?: boolean;
  userName?: string;
  /** @deprecated fallback only; the session's mode-aware role label wins. */
  userRole?: string;
  avatarSeed?: string;
  dashboardHref?: string;
  compact?: boolean;
  /** Scope switchers only (parent child switcher, SA "Back to all campuses"). Never page actions. */
  context?: ReactNode;
  accountLinks?: AccountMenuLink[];
  role?: UserRole;
  framed?: boolean;
}

function isModalOpen() {
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'));
}

export function RoleHeader({
  eyebrow,
  landing = true,
  userName = "Skoolee User",
  userRole,
  dashboardHref,
  compact = false,
  context,
  accountLinks = [],
  role,
  framed = false,
}: RoleHeaderProps) {
  const t = useUiText();
  const { language, timezone } = useLocale();
  const session = useShellSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [bellShake, setBellShake] = useState(false);
  const [touring, setTouring] = useState(false);
  const [signOutCount, setSignOutCount] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [headerProfile, setHeaderProfile] = useState<EditableProfile | null>(null);
  const [arrival, setArrival] = useState("");
  const notifRef = useRef<HTMLDivElement | null>(null);
  const prevUnreadRef = useRef(0);
  const { notifications: liveNotifications, unreadCount, refresh: refreshNotifications } = useNotifications();
  const seenNotifIds = useRef<Set<string> | null>(null);
  const displayName = (headerProfile?.fullName || session?.fullName || userName || "").split("@")[0].replace(/[._-]/g, " ").replace(/\s+/g, " ").trim() || "User";
  // The EN key re-translates after a language switch; the session label is already in the display language.
  const displayRole = session?.roleLabelKey || session?.roleLabel || headerProfile?.roleLabel || userRole || "";
  const displayAvatar = headerProfile?.profileImageUrl;
  const viewerRole = role ?? session?.role;
  const home = dashboardHref ?? (viewerRole ? dashboardPathForRole(viewerRole) : session?.dashboardPath ?? "/login");
  const scopeLine = session?.schoolName ? (session.campusName && session.role !== "SUPER_ADMIN" && !session.institution?.standaloneOwner ? `${session.schoolName} · ${session.campusName}` : session.schoolName) : null;
  const showCycle = Boolean(viewerRole) && !NO_CYCLE.has(viewerRole as string);

  const greeting = (() => {
    const h = Number(new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const today = new Date().toLocaleDateString(language, { timeZone: timezone, weekday: "long", month: "long", day: "numeric", year: "numeric" });

  // The spotlight tour pauses the arrival cue and the bell shake (SPEC §9.3).
  useEffect(() => {
    const onTour = (event: Event) => setTouring(Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active));
    window.addEventListener("skoolee:tour-state", onTour);
    return () => window.removeEventListener("skoolee:tour-state", onTour);
  }, []);

  // An ACTION item that arrives while the shell is open rings and shakes the bell and is announced to screen readers —
  // never for what was already unread on load, never during a tour or over an open dialog. It is not a toast: toasts
  // report the result of something the viewer just did (addendum 2026-10-22 §4). The bell keeps the full list.
  useEffect(() => {
    if (seenNotifIds.current === null) {
      if (liveNotifications.length === 0) return;
      seenNotifIds.current = new Set(liveNotifications.map((item) => item.id));
      return;
    }
    const seen = seenNotifIds.current;
    const fresh = liveNotifications.filter((item) => !seen.has(item.id));
    fresh.forEach((item) => seen.add(item.id));
    if (seen.size > 200) seenNotifIds.current = new Set([...seen].slice(-100));
    const newest = fresh.find((item) => !item.isRead && (item as { category?: string }).category === "ACTION");
    if (!newest || touring || isModalOpen()) return;
    playNotificationBell();
    setArrival(t("New notification: {0}", [newest.title]));
    // Reads the translator at the moment an item arrives; a language switch should not re-announce it.
  }, [liveNotifications, touring]);

  // Header identity (name, photo). A failed read keeps the session name: no toast for a load (R4).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.profile) setHeaderProfile(data.profile);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && !touring) {
      setBellShake(true);
      const timer = setTimeout(() => setBellShake(false), 340);
      prevUnreadRef.current = unreadCount;
      return () => clearTimeout(timer);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount, touring]);

  useEffect(() => {
    if (!notifOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (notifRef.current?.contains(target)) return;
      setNotifOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotifOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notifOpen]);

  const signOut = async () => {
    setSigningOut(true);
    clearOnSignOut();
    // SKAI-1021: drafts, the access map and the shell session are dropped, the server
    // session is closed (with a retry), and only then is /login loaded — as a replace,
    // so Back cannot repaint this console.
    await signOutAndLeave();
  };

  const handleLogout = () => {
    // SKO-448: this device's shared-device policy removes offline registers and unsynced marks on sign-out.
    const unsynced = pendingOnDevice();
    if (unsynced) { setSignOutCount(unsynced); return; }
    void signOut();
  };

  return (
    <>
      <header data-workspace-header className={cn("sk-panel relative z-40 flex shrink-0 flex-nowrap items-center justify-between gap-[8px] px-[12px] py-[8px] sm:flex-wrap sm:px-4 sm:py-2.5", compact ? "mb-3" : "mb-4")}>
        <div data-tour="shell.header.identity" className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-3">
          <Tooltip content={t("Home")} describe={false}>
            <Link href={home} aria-label={t("Home")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-400 shadow-md shadow-primary/15 sm:h-9 sm:w-9">
              <LayoutDashboard aria-hidden="true" className="h-[18px] w-[18px] text-primary-foreground" />
            </Link>
          </Tooltip>
          {/* Both lines come from the *viewer's* clock and timezone, which the
              server cannot know, so its guess and the browser's routinely
              disagree. The client value is the correct one; suppress the diff
              rather than degrade to a server guess. */}
          <div className="min-w-0">
            {eyebrow && <p className="truncate text-xs font-bold leading-tight text-ink-strong">{eyebrow}</p>}
            {scopeLine ? <p className="mt-1 truncate text-2xs text-ink-muted sm:hidden" title={scopeLine}><bdi>{scopeLine}</bdi></p> : null}
            {landing && <p suppressHydrationWarning className={cn("hidden text-xs font-semibold leading-tight tracking-tight text-ink-muted sm:block", eyebrow && "mt-1")}>{t(greeting)}, <bdi>{displayName}</bdi></p>}
            {landing && <p suppressHydrationWarning className="mt-px hidden text-2xs font-semibold leading-tight text-ink-muted sm:block">{today}</p>}
          </div>
        </div>

        <div className="ms-auto flex w-auto shrink-0 items-center justify-end gap-[6px] sm:min-w-0 sm:max-w-full sm:shrink sm:flex-wrap sm:gap-2.5">
          <div className="me-auto hidden min-w-0 max-w-full flex-wrap items-center gap-[6px] sm:flex [&_svg]:shrink-0">
            <ScopeBadge />
            {showCycle ? <div data-tour="shell.header.cycle" className="hidden sm:block [&>div]:max-w-full [&>div]:px-[8px] [&>div]:py-[6px]"><CycleBadge /></div> : null}
            {context ? <div data-tour="shell.header.context" className="flex min-w-0 max-w-full items-center gap-2">{context}</div> : null}
          </div>
          {viewerRole ? <HelpMenu role={viewerRole} framed={framed} /> : null}
          <div ref={notifRef} className="sm:relative">
            <Tooltip content={t("View notifications")} describe={false}>
            <Button variant="outline" size="icon"
              type="button"
              data-tour="shell.header.notifications"
              onClick={() => setNotifOpen((o) => !o)}
              className={cn(
                "relative flex h-[44px] w-[44px] min-w-[44px] items-center justify-center [&>svg]:size-[18px] sm:h-11 sm:w-11 sm:min-w-11",
                notifOpen && "border-primary",
                bellShake && "sk-shake"
              )}
              aria-label={unreadCount > 0 ? t("Notifications, {0} unread", [unreadCount]) : t("View notifications")}
              aria-expanded={notifOpen}
            >
              <Bell className="h-[18px] w-[18px]" />
              {unreadCount > 0 && (
                <span aria-hidden="true" className="sk-glow absolute -end-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground ring-2 ring-card shadow-md shadow-primary/30"><bdi>{unreadCount > 99 ? "99+" : unreadCount}</bdi></span>
              )}
            </Button>
            </Tooltip>

            {/* Polite announcement of a newly arrived action item (the bell's visual cue is the shake and the count). */}
            <p role="status" aria-live="polite" className="sr-only">{arrival}</p>
            {notifOpen && (
              <div className="animate-dropdown-enter sk-panel absolute end-0 top-full z-[999] mt-2 max-h-[70dvh] w-[min(20rem,calc(100vw-24px))] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-edge/10 px-5 py-4">
                  <h3 className="text-sm font-bold tracking-tight text-ink-strong"><UiText>{"Notifications"}</UiText></h3>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-semibold text-primary"><bdi>{unreadCount}</bdi>{" "}<UiText>{"new"}</UiText></span>
                  )}
                </div>
                <NotificationCenter formatTime={(iso) => relativeTime(iso, language, timezone)} onClose={() => setNotifOpen(false)} onChanged={refreshNotifications} />
              </div>
            )}
          </div>
          <div aria-hidden="true" className="hidden h-7 w-px shrink-0 bg-border sm:block" />

          {/* The shared Menu: role="menu", roving focus, Escape returns focus to the avatar, Tab and outside clicks close it. */}
          <Menu
            label="Account menu"
            align="end"
            onOpenChange={(open) => { setMenuOpen(open); if (open) setNotifOpen(false); }}
            header={(
              <div className="mb-1.5 flex items-center gap-3 rounded-xl bg-surface-subtle p-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-card shadow-md ring-1 ring-primary/10">
                  <AvatarImage src={displayAvatar} name={displayName} initialsClassName="text-2xs" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-ink-strong"><bdi>{displayName}</bdi></p>
                  {displayRole ? <p className="truncate text-2xs font-semibold text-primary">{t(displayRole)}</p> : null}
                  {scopeLine ? <p className="mt-0.5 truncate text-2xs font-medium text-ink-muted"><bdi>{scopeLine}</bdi></p> : null}
                </div>
              </div>
            )}
            items={[
              { id: "account-settings", label: "Account settings", icon: Settings, onSelect: () => openSettings("profile") },
              { id: "language", label: "Language", icon: Languages, onSelect: () => openSettings("language") },
              // The same Settings section `/account/security` redirects to, opened without leaving the page.
              { id: "security", label: "Security & sign-in", icon: ShieldCheck, onSelect: () => openSettings("security") },
              ...accountLinks.map((link): MenuItem => ({ id: link.id, label: link.label, icon: link.icon, href: link.href, onSelect: link.href ? undefined : link.onSelect })),
              "separator",
              { id: "sign-out", label: "Sign out", icon: LogOut, onSelect: handleLogout },
            ]}
            trigger={(
              <Button variant="ghost"
                type="button"
                data-tour="shell.header.account"
                aria-label={t("Account menu")}
                className={cn(
                  "flex min-h-[44px] min-w-[44px] items-center justify-start gap-0 px-[6px] py-[6px] sm:min-h-11 sm:gap-2.5 sm:px-4",
                  menuOpen && "bg-surface-hover"
                )}
              >
                <div className={cn("flex h-[28px] w-[28px] items-center justify-center overflow-hidden rounded-xl border-2 border-card bg-brand-50 shadow-sm sm:h-8 sm:w-8", menuOpen ? "ring-2 ring-primary/25" : "ring-1 ring-primary/10")}>
                  <AvatarImage src={displayAvatar} name={displayName} initialsClassName="text-2xs" />
                </div>
                <div className="hidden text-start sm:block">
                  <p className="max-w-28 truncate text-xs font-semibold leading-none text-ink-strong"><bdi>{displayName}</bdi></p>
                </div>
                <ChevronDown aria-hidden="true" className={cn("hidden h-3.5 w-3.5 text-ink-subtle transition-transform duration-300 sm:block", menuOpen && "rotate-180 text-primary")} />
              </Button>
            )}
          />
        </div>
      </header>

      <ConfirmAction
        open={signOutCount !== null}
        tone="warning"
        title={t("Sign out with unsynced changes?")}
        description={t("{0} changes on this device are not synced yet. Signing out removes them from this device and cannot be undone.", [signOutCount ?? 0])}
        confirmLabel={t("Sign out")}
        cancelLabel={t("Keep editing")}
        busy={signingOut}
        onCancel={() => setSignOutCount(null)}
        onConfirm={() => signOut()}
      />

      <SettingsModalHost onProfileSaved={setHeaderProfile} />
    </>
  );
}
