"use client";

import { LocaleProvider, UiText } from "@/components/locale/LocaleProvider";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NavigationAccessProvider, NavigationAccessNotice, useNavigationAccess } from "@/components/nav/NavigationAccess";
import type { NavigationAccess } from "@/lib/navigation/modules";
import { cn } from "@/lib/utils";
import { ChatDock, ChatProvider } from "@/components/chat";
import { RoleHeader } from "./RoleHeader";
import { RoleSidebar, type RoleNavItem, type SidebarEntry } from "./RoleSidebar";

const SIDEBAR_KEY = "skoolee.sidebar.collapsed";

interface RoleShellProps {
  navigationAccess?: NavigationAccess | null;
  navigationAccessFallback?: ReactNode;
  tagline?: string;
  navItems: SidebarEntry[];
  bottomItems?: RoleNavItem[];
  searchPlaceholder?: string;
  eyebrow?: string;
  userName?: string;
  userRole?: string;
  avatarSeed?: string;
  dashboardHref?: string;
  logoUrl?: string | null;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function RoleShell(props: RoleShellProps) {
  return <LocaleProvider><NavigationAccessProvider access={props.navigationAccess}><RoleShellContent {...props} /></NavigationAccessProvider></LocaleProvider>;
}

function RoleShellContent({
  navigationAccessFallback,
  tagline,
  navItems,
  bottomItems,
  searchPlaceholder,
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
   * On a 1280px screen that is the difference between five card columns and
   * six, or a timetable that fits its week without scrolling sideways.
   *
   * Load and save cannot both be plain effects — they run in the same commit,
   * so the saver would write the default over what was stored before the
   * loader had a chance. `loaded` makes the save wait its turn.
   */
  const pathname = usePathname();
  const access = useNavigationAccess();
  const activeItems = navItems.flatMap((item) => "children" in item ? item.children : [item]).filter((item) => item.active);
  const denied = !access.allowsHref(pathname) || activeItems.some((item) => item.available === false || !access.allows(item.module));
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

  return (
    <ChatProvider>
      <div className="min-h-dvh bg-background flex font-sans text-foreground selection:bg-[#8127cf]/30">
        <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[1400] focus:rounded-lg focus:bg-card focus:p-3"><UiText>Skip to content</UiText></a>
        <RoleSidebar
          tagline={tagline}
          items={navItems}
          bottomItems={bottomItems}
          logoUrl={logoUrl}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
        <main
          id="workspace-content"
          tabIndex={-1}
          className={cn(
            "flex-1 min-w-0 p-3 md:p-5 pb-20 md:pb-5 flex flex-col h-dvh overflow-hidden transition-none md:transition-[margin] duration-300 ease-out",
            collapsed ? "md:ms-[72px]" : "md:ms-64",
            className,
          )}
        >
          <RoleHeader
            eyebrow={eyebrow}
            searchPlaceholder={searchPlaceholder}
            userName={userName}
            userRole={userRole}
            avatarSeed={avatarSeed}
            dashboardHref={dashboardHref}
            actions={headerActions}
          />
          <div className="flex-1 min-h-0 flex flex-col">
            <NavigationAccessNotice denied={denied} fallback={navigationAccessFallback} />
            <div style={{ display: denied ? "none" : "contents" }}>{children}</div>
          </div>
        </main>

        {/* Mounted here rather than in each dashboard: every role console
            renders this shell, so one placement gives all ten roles messaging,
            and one provider means one EventSource per tab, not one per screen. */}
        <ChatDock />
      </div>
    </ChatProvider>
  );
}
