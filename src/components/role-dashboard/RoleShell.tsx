"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
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
  headerActions,
  children,
  className,
}: RoleShellProps) {
  return (
    <div className="min-h-screen bg-[#fbf0fe] flex font-sans text-[#1f1a23] selection:bg-[#8127cf]/30">
      <RoleSidebar tagline={tagline} items={navItems} bottomItems={bottomItems} />
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
    </div>
  );
}
