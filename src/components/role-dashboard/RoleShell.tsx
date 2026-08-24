"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChatDock, ChatProvider } from "@/components/chat";
import { RoleHeader } from "./RoleHeader";
import { RoleSidebar, type RoleNavItem, type SidebarEntry } from "./RoleSidebar";

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
  return (
    <ChatProvider>
      <div className="min-h-screen bg-[#fbf0fe] flex font-sans text-[#1f1a23] selection:bg-[#8127cf]/30">
        <RoleSidebar tagline={tagline} items={navItems} bottomItems={bottomItems} logoUrl={logoUrl} />
        <main className={cn("flex-1 min-w-0 md:ml-64 p-4 md:p-8 pb-20 md:pb-8 flex flex-col h-screen overflow-hidden", className)}>
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
