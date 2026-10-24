"use client";

import { LocaleProvider, UiText, useUiText } from "@/components/locale/LocaleProvider";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CirclePause } from "lucide-react";
import { NavigationAccessProvider, NavigationAccessNotice, useNavigationAccess } from "@/components/nav/NavigationAccess";
import { SidebarNavigationContext } from "@/components/nav/WorkspaceSubnav";
import type { NavigationAccess } from "@/lib/navigation/modules";
import {
  ROLE_NAV, consoleName, eyebrowFor, hrefFor, labelFor, leafForPath, leafForView, leafVisible, mobileLeaves, visibleEntries,
  type ConsoleId, type ConsoleNav, type NavLeaf,
} from "@/lib/navigation/role-nav";
import type { UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { ChatDock, ChatProvider } from "@/components/chat";
import { HeaderSkeleton, MobileBarSkeleton, PAGE_CARD_BODY, PAGE_CARD_CLASS, SidebarSkeleton } from "./RoleShellSkeleton";
import { TourProvider } from "@/components/tour/TourProvider";
import { RoleHeader, type AccountMenuLink } from "./RoleHeader";
import { RoleSidebar, type RoleNavItem, type SidebarEntry } from "./RoleSidebar";
import { HelpDialogsHost } from "./HelpMenu";
import { useShellSession } from "./ScopeBadge";

const SIDEBAR_KEY = "skoolee.sidebar.collapsed";
const TAGLINE_KEY = "skoolee.sidebar.campus-line";

/**
 * One source for the sidebar brand subtitle, the same on a console and on every framed route: the school name for a
 * group admin or a standalone owner, "Campus · City" for a campus-bound seat. Only the campus console knows the city
 * (its own data), so the line it passes is remembered for the session and reused by frames for the same campus.
 */
function useSidebarTagline(passed: string | undefined, session: ReturnType<typeof useShellSession>): string | undefined {
  const [remembered, setRemembered] = useState<string | null>(null);
  const campus = session?.campusName ?? null;
  const schoolWide = !session || session.role === "SUPER_ADMIN" || session.institution?.standaloneOwner === true || !campus;
  useEffect(() => {
    if (schoolWide || !campus) return;
    try {
      if (passed && passed.startsWith(campus)) window.sessionStorage.setItem(TAGLINE_KEY, passed);
      const stored = window.sessionStorage.getItem(TAGLINE_KEY);
      setRemembered(stored && stored.startsWith(campus) ? stored : null);
    } catch { /* blocked storage: the campus name alone */ }
  }, [campus, passed, schoolWide]);
  if (!session) return passed;
  if (schoolWide) return session.schoolName ?? passed;
  return passed && campus && passed.startsWith(campus) ? passed : remembered ?? campus ?? passed;
}
const DEFAULT_DENIED = "This workspace is not available with your current access.";
/**
 * Framed routes every staff member may open from Help ("Report a problem" → /service-desk?tab=new, "Record a
 * concern" → /care?tab=report; SPEC §4.2, §6.3) although their sidebar leaf is shown only to agents / care
 * members. Their nav visibility is a duty filter, not a route gate: the page and its API decide what each person
 * sees, so the frame fence never closes them.
 */
const OPEN_STAFF_ROUTES = ["/care", "/service-desk"];
const isOpenStaffRoute = (pathname: string) => OPEN_STAFF_ROUTES.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/** Representative role for a console until the session names the exact one (Help menu items only). */
const CONSOLE_ROLE: Record<ConsoleId, UserRole> = {
  owner: "APP_OWNER", super: "SUPER_ADMIN", admin: "CAMPUS_ADMIN", principal: "PRINCIPAL", teacher: "TEACHER",
  accountant: "ACCOUNTANT", receptionist: "RECEPTIONIST", librarian: "LIBRARIAN", parent: "PARENT", student: "STUDENT",
};

export interface RoleShellProps {
  /** Registry console (SPEC §3). When set, nav, eyebrow, mobile slots, account-menu leaves and the fence come from ROLE_NAV. */
  console?: ConsoleId;
  /** View consoles: the current `?view=` (from useConsoleView). */
  activeView?: string;
  /** View consoles: select a view without a route change (useConsoleView().setView). */
  onSelectView?: (view: string, tab?: string | null) => void;
  /** Scope switchers only (parent child switcher; SA "Back to all campuses"). */
  headerContext?: ReactNode;
  /** Default true. RoleFrame passes false on /messages and the suspended minimal shell (no chat stream). */
  chatDock?: boolean;
  /**
   * The school's plan is paused (the F3 minimal shell; the console knows it from its server read). A Billing & plan
   * leaf the viewer cannot pay for then says "Your plan is paused. {name} can renew it." with no button, instead of
   * its usual denied reason (SPEC §2.1 note 2). Presentation only.
   */
  suspended?: boolean;
  /** Frame mode (RoleFrame): view leaves become links to their console; the active leaf comes from the pathname. */
  frame?: boolean;
  /** Exact role when the caller knows it (RoleFrame); otherwise the session decides. */
  role?: UserRole;
  /** Family reading flows use one document scroll surface on narrow screens. */
  mobileDocumentFlow?: boolean;
  navigationAccess?: NavigationAccess | null;
  navigationAccessFallback?: ReactNode;
  tagline?: string;
  /** @deprecated registry consoles pass `console`; kept for one release. */
  navItems?: SidebarEntry[];
  /** @deprecated legacy bottom links; registry consoles have none. */
  bottomItems?: RoleNavItem[];
  /** @deprecated ignored (no header search, SPEC §4.1 H2). */
  searchPlaceholder?: string;
  /** @deprecated the registry eyebrow wins when `console` is set. */
  eyebrow?: string;
  userName?: string;
  /** @deprecated the session role label wins. */
  userRole?: string;
  avatarSeed?: string;
  dashboardHref?: string;
  logoUrl?: string | null;
  /** @deprecated rendered in the header context slot; page actions belong in PageHeader. */
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function RoleShell(props: RoleShellProps) {
  return <LocaleProvider><NavigationAccessProvider access={props.navigationAccess}><SidebarNavigationContext.Provider value={true}><RoleShellContent {...props} /></SidebarNavigationContext.Provider></NavigationAccessProvider></LocaleProvider>;
}

/** Counts for registry badges, fetched once per pathname and refreshed on focus (never part of `access`). */
function useNavigationCounts(enabled: boolean): Record<string, number> {
  const pathname = usePathname();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/navigation/counts", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const next = body?.counts;
        if (next && typeof next === "object") setCounts(Object.fromEntries(Object.entries(next).filter(([, value]) => typeof value === "number")) as Record<string, number>);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, pathname, version]);
  return counts;
}

function activeLeafFor(nav: ConsoleNav, frame: boolean, pathname: string, activeView?: string): NavLeaf | undefined {
  if (frame || nav.mode === "path") return leafForPath(nav.id, pathname);
  if (pathname !== nav.base) return leafForPath(nav.id, pathname);
  return leafForView(nav.id, activeView ?? nav.defaultView ?? "");
}

function RoleShellContent({
  console: consoleId,
  activeView,
  onSelectView,
  headerContext,
  chatDock = true,
  suspended = false,
  frame = false,
  role,
  mobileDocumentFlow = false,
  navigationAccessFallback,
  tagline,
  navItems = [],
  bottomItems,
  eyebrow,
  userName,
  userRole,
  avatarSeed,
  dashboardHref,
  logoUrl,
  headerActions,
  children,
  className,
}: RoleShellProps) {
  /**
   * The sidebar folds to a 72px icon rail, handing ~190px back to the content.
   * Load and save cannot both be plain effects — they run in the same commit,
   * so the saver would write the default over what was stored before the
   * loader had a chance. `loaded` makes the save wait its turn.
   */
  const pathname = usePathname();
  const t = useUiText();
  const access = useNavigationAccess();
  const session = useShellSession();
  const sidebarTagline = useSidebarTagline(tagline, session);
  const nav = consoleId ? ROLE_NAV[consoleId] : null;
  const accessMap = useMemo(() => access.access ?? {}, [access.access]);
  const ready = access.status === "ready";
  const checkingAccess = access.status === "loading";
  const effectiveRole: UserRole | undefined = role ?? session?.role ?? (consoleId ? CONSOLE_ROLE[consoleId] : undefined);
  const hasBadges = Boolean(nav) && ready && (nav?.entries.some((e) => e.kind === "group" ? e.children.some((c) => c.badge) : Boolean(e.badge)) ?? false);
  const counts = useNavigationCounts(hasBadges);

  const activeLeaf = nav ? activeLeafFor(nav, frame, pathname, activeView) : undefined;

  /** One registry leaf as a sidebar row: a button for an in-console view, a link for everything else. */
  const toItem = useCallback((leaf: NavLeaf, current: NavLeaf | undefined): RoleNavItem => {
    const target = leaf.target;
    const inConsoleView = "view" in target && !frame && Boolean(onSelectView) && nav !== null && pathname === nav.base;
    return {
      id: leaf.id,
      label: t(labelFor(leaf, accessMap)),
      icon: leaf.icon,
      active: current?.id === leaf.id,
      href: inConsoleView ? undefined : nav ? hrefFor(nav, leaf) : undefined,
      onClick: inConsoleView && "view" in target ? () => onSelectView?.(target.view, target.tab ?? null) : undefined,
      tourAnchor: leaf.tourAnchor,
      mobileAnchor: `shell.mobile.${leaf.id}`,
      badge: leaf.badge ? counts[leaf.badge] : undefined,
      flagship: leaf.flagship === true,
      mobileLabel: leaf.mobileLabel ? t(leaf.mobileLabel) : undefined,
    };
  }, [accessMap, counts, frame, nav, onSelectView, pathname, t]);

  const registryItems: SidebarEntry[] = useMemo(() => {
    if (!nav) return [];
    return visibleEntries(nav, accessMap).map((entry) => entry.kind === "group"
      ? { id: entry.id, label: t(labelFor(entry, accessMap)), icon: entry.icon, zone: entry.zone, tourAnchor: entry.tourAnchor, children: entry.children.map((leaf) => toItem(leaf, activeLeaf)) }
      : toItem(entry, activeLeaf));
  }, [nav, accessMap, t, toItem, activeLeaf]);
  const registryMobile = useMemo(() => (nav ? mobileLeaves(nav, accessMap).map((leaf) => toItem(leaf, activeLeaf)) : undefined), [nav, accessMap, toItem, activeLeaf]);
  const accountLinks: AccountMenuLink[] = useMemo(() => {
    if (!nav) return [];
    return nav.accountMenu.filter((leaf) => leaf.visible ? leafVisible(nav, leaf, accessMap) : true).map((leaf) => {
      const item = toItem(leaf, activeLeaf);
      return { id: leaf.id, label: item.label, icon: leaf.icon, href: item.href, onSelect: item.onClick };
    });
  }, [nav, accessMap, toItem, activeLeaf]);

  // Fence: a registry leaf the caller cannot see renders its AccessNotice, never its children.
  let denied: boolean;
  let deniedReason: string | undefined;
  let deniedOwner: string | null | undefined;
  let deniedNotice: { title?: string; ownerPhrase?: string; icon?: typeof CirclePause } = {};
  if (nav) {
    const openRoute = (frame || pathname !== nav.base) && isOpenStaffRoute(pathname);
    const hidden = ready && activeLeaf !== undefined && !openRoute && !leafVisible(nav, activeLeaf, accessMap);
    denied = !ready || hidden;
    if (hidden && activeLeaf) {
      deniedReason = activeLeaf.deniedReason ?? DEFAULT_DENIED;
      // Billing leaves name who pays ("Managed by {subscriptionOwnerName}"); never an email. A school with no
      // payer names nobody and points at support instead (SPEC §1.5, §2.6).
      if (activeLeaf.visible?.all?.includes("billing")) {
        deniedOwner = session?.institution?.subscriptionOwnerName ?? null;
        if (session?.institution && !deniedOwner) deniedReason = "Contact SkooleeAI support to restore billing access.";
        // While the plan is paused a non-payer is told who can renew it, by name, with no button (§2.1 note 2) — the
        // same words as the console's own paused notice and /subscription-suspended.
        if (suspended) {
          deniedNotice = { title: "Your plan is paused", icon: CirclePause };
          if (deniedOwner) { deniedReason = ""; deniedNotice.ownerPhrase = "Your plan is paused. {0} can renew it."; }
        }
      }
    }
  } else {
    const activeItems = navItems.flatMap((item) => "children" in item ? item.children : [item]).filter((item) => item.active);
    denied = !ready || !access.allowsHref(pathname) || activeItems.some((item) => item.available === false || !access.allows(item.module));
  }

  // NavigationAccessNotice renders something exactly when the view is closed or the access check failed.
  const showNotice = denied || access.status === "error";
  const sidebarItems = nav ? registryItems : navItems;
  const mobileMessagesAvailable = ready && (nav
    ? (registryMobile ?? []).some((item) => item.href === "/messages")
    : [...navItems.flatMap(item => "children" in item ? item.children : [item]), ...(bottomItems ?? [])].some(item => item.href === "/messages" && item.available !== false && access.allows(item.module)));
  const recordSearch = ready && access.has("recordSearch") && (nav ? nav.recordSearch : true);
  // Console names translate through their own keys (§1.5): "Teaching" the console is not "Teaching" the nav group.
  const shellEyebrow = nav ? consoleName(eyebrowFor(nav, accessMap), t) : eyebrow;
  const landing = nav ? (nav.mode === "path" ? pathname === nav.base : pathname === nav.base && (activeView ?? nav.defaultView) === nav.defaultView) : !eyebrow;
  const home = dashboardHref ?? (nav ? nav.base : session?.dashboardPath);

  const [collapsed, setCollapsed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* a blocked storage must never break the shell */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed, loaded]);

  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);

  // The tour reveals a nav group; on the 72px rail that means expanding the sidebar first.
  useEffect(() => {
    const reveal = () => setCollapsed(false);
    window.addEventListener("skoolee:reveal-nav", reveal);
    return () => window.removeEventListener("skoolee:reveal-nav", reveal);
  }, []);

  // Each navigation fades the workspace in, so a new screen arrives instead
  // of snapping. Opacity only: a transform would re-anchor fixed descendants
  // for the length of the animation.
  const workspaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = workspaceRef.current;
    if (!element || typeof element.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = element.animate([{ opacity: 0.001 }, { opacity: 1 }], { duration: 220, easing: "cubic-bezier(.16,1,.3,1)" });
    return () => animation.cancel();
  }, [pathname, activeView]);

  // A modified shortcut avoids intercepting screen-reader single-character commands.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "BracketLeft" || !e.altKey || !e.shiftKey || e.metaKey || e.ctrlKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  const skeletonRows = nav ? nav.entries.length : navItems.length || 8;

  const shell = (
    <div data-role-shell data-console={consoleId} className="sk-app-canvas min-h-dvh flex font-sans text-foreground selection:bg-primary/25">
      <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[1400] focus:rounded-lg focus:p-3"><UiText>Skip to content</UiText></a>
      <TourProvider console={consoleId}>
      {/* Only a session's very first load shows these: afterwards the confirmed access is cached (NavigationAccess). */}
      {checkingAccess && <><SidebarSkeleton rows={skeletonRows} collapsed={collapsed} /><MobileBarSkeleton /></>}
      <div style={{ display: checkingAccess ? "none" : "contents" }}><RoleSidebar
        tagline={sidebarTagline}
        items={sidebarItems}
        bottomItems={nav ? undefined : bottomItems}
        mobileItems={registryMobile}
        logoUrl={logoUrl}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        recordSearch={recordSearch}
        helpRole={effectiveRole}
        framed={frame}
      /></div>
        <main
          id="workspace-content"
          tabIndex={-1}
          className={cn(
            "flex-1 min-w-0 p-[12px] md:p-5 pb-[calc(var(--mobile-nav-height,5rem)+12px)] md:pb-5 flex flex-col transition-none md:transition-[margin] duration-300 ease-out",
            mobileDocumentFlow ? "h-auto min-h-dvh overflow-visible md:h-dvh md:min-h-0 md:overflow-hidden" : "h-dvh overflow-hidden",
            // Tablet (md–lg) always gets the 72px icon rail; the full sidebar starts at lg.
            collapsed ? "md:ms-[72px]" : "md:ms-[72px] lg:ms-64",
            className,
          )}
        >
          {checkingAccess && <HeaderSkeleton />}
          <div style={{ display: checkingAccess ? "none" : "contents" }}><RoleHeader
            eyebrow={shellEyebrow}
            landing={landing}
            userName={userName ?? session?.fullName}
            userRole={userRole}
            avatarSeed={avatarSeed}
            dashboardHref={home}
            context={headerContext ?? headerActions}
            accountLinks={accountLinks}
            role={effectiveRole}
            framed={frame}
          /></div>
          {/* The one page card (addendum 2026-10-22): every console view and framed route renders inside it, so pages
              never draw an outer card of their own. Its body padding and scrolling belong to the page (a console's
              own scroll area, RoleFrame's for framed routes); a notice gets the shared body padding here. */}
          <div ref={workspaceRef} data-page-card className={cn(PAGE_CARD_CLASS, mobileDocumentFlow && "max-md:flex-none max-md:overflow-visible")}>
            {showNotice ? (
              <div className={cn("custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto", PAGE_CARD_BODY)}>
                <NavigationAccessNotice denied={denied} fallback={navigationAccessFallback} reason={deniedReason} owner={deniedOwner} {...deniedNotice} />
              </div>
            ) : null}
            {nav ? (!denied ? children : null) : <div style={{ display: denied ? "none" : "contents" }}>{children}</div>}
          </div>
        </main>
      {effectiveRole ? <HelpDialogsHost role={effectiveRole} /> : null}
      </TourProvider>

      {/* Mounted here rather than in each dashboard: every role console
          renders this shell, so one placement gives all ten roles messaging,
          and one provider means one EventSource per tab, not one per screen. */}
      {chatDock ? <ChatDock mobileMessagesAvailable={mobileMessagesAvailable} /> : null}
    </div>
  );

  return chatDock ? <ChatProvider>{shell}</ChatProvider> : shell;
}
