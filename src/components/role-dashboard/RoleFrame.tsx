"use client";

/**
 * Frame mode (SPEC §6.3, §10.4): a module route (`/care`, `/messages`, `/ai`, `/jobs`, `/pupils/[id]`, …)
 * renders inside the caller's OWN console shell — their sidebar, header, Help, tour handoff and chat —
 * instead of a bare page with a "Back to /" link. View leaves become links into the console
 * (`hrefFor(nav, leaf)`) and the active leaf comes from the pathname (`leafForPath`). A pathname with no
 * leaf still renders: the route's own server gate decides (K-m10).
 */

import type { ReactNode } from "react";
import { consoleForRole } from "@/lib/navigation/role-nav";
import type { UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { RoleShell } from "./RoleShell";
import { PAGE_CARD_BODY } from "./RoleShellSkeleton";
import { useShellSession } from "./ScopeBadge";

export interface RoleFrameProps {
  role: UserRole;
  userName: string;
  userEmail: string;
  logoUrl?: string | null;
  /** Default true. False on /messages (the page owns its chat stream) and in the suspended minimal shell. */
  chatDock?: boolean;
  children: ReactNode;
}

export function RoleFrame({ role, userName, userEmail, logoUrl, chatDock = true, children }: RoleFrameProps) {
  // Every frame layout reads the campus logo, else the school logo, server-side and passes it here: the same image the
  // console passes from its dashboard data, so the sidebar looks the same in a console and in its frames, from the
  // first paint. `/api/auth/session` also returns `user.logoUrl` (the same campus-else-school logo, P1); it is the
  // fallback for a frame whose layout passes none.
  const session = useShellSession();
  const consoleId = consoleForRole(role);
  return (
    <RoleShell
      console={consoleId}
      frame
      role={role}
      userName={userName}
      avatarSeed={userEmail || userName}
      logoUrl={logoUrl ?? session?.logoUrl ?? null}
      // No tagline: RoleShell derives the subtitle from the session, the same rule as the console (school name for a
      // group or standalone owner, "Campus · City" for a campus-bound seat).
      chatDock={chatDock}
    >
      {/* Inside the shell's one page card: the framed page scrolls here, with the card's shared body padding, and
          draws no outer card of its own. */}
      <div data-role-frame className={cn("custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto", PAGE_CARD_BODY)}>{children}</div>
    </RoleShell>
  );
}
