"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChatDock, ChatProvider } from "@/components/chat";
import { RoleHeader } from "./RoleHeader";
import { RoleSidebar, type RoleNavItem, type SidebarEntry } from "./RoleSidebar";

const SIDEBAR_KEY = "skoolee.sidebar.collapsed";

interface RoleShellProps {
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

export function RoleShell({
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

  // "[" is the shortcut every editor uses for this, and it never collides with
  // typing because the handler ignores fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
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
      <div className="min-h-screen bg-[#fbf0fe] flex font-sans text-[#1f1a23] selection:bg-[#8127cf]/30">
        <RoleSidebar
          tagline={tagline}
          items={navItems}
          bottomItems={bottomItems}
          logoUrl={logoUrl}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
        <main
          className={cn(
            "flex-1 min-w-0 p-3 md:p-5 pb-20 md:pb-5 flex flex-col h-screen overflow-hidden transition-[margin] duration-300 ease-out",
            collapsed ? "md:ml-[72px]" : "md:ml-64",
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
            {children}
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
