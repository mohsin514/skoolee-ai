"use client";

import { MessageCircle } from "lucide-react";
import { RoleShell, type RoleNavItem } from "@/components/role-dashboard";
import { useParentData } from "./parent-data-context";
import { PARENT_NAV } from "@/components/parent/parent-page";

export function ParentShell({ children }: { children: React.ReactNode }) {
  const { data, token } = useParentData();

  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const link = (path: string) => `${path}${q}`;

  // Built from the same list the in-page subnav uses, so the two cannot drift.
  const navItems: RoleNavItem[] = [
    ...PARENT_NAV.map((item) => ({ icon: item.icon, label: item.label, href: link(item.href) })),
    // Only for guardians who are actually signed in. A portal token grants
    // 30 days of unauthenticated read access with no account behind it, so
    // there is nobody for the other side of a conversation to be talking to —
    // the link would only bounce them to the login screen. Signed-in
    // guardians who happen to arrive on a token URL still reach messages
    // through the floating messenger.
    ...(token
      ? []
      : [{ icon: MessageCircle, label: "Messages", href: "/messages" }]),
  ];

  const child = data?.student;

  return (
    <RoleShell
      navItems={navItems}
      eyebrow="Parent Guardian Console"
      userName={child?.fullName || "Guardian"}
      userRole={child?.className || "Guardian Console"}
      avatarSeed={child?.fullName || "Parent"}
      logoUrl={data?.campus?.logoUrl || data?.campus?.school?.logoUrl}
      dashboardHref={link("/parent")}
    >
      <ChildSwitcher />
      {children}
    </RoleShell>
  );
}

/**
 * Only rendered for guardians with more than one child at the school — a
 * single-child account should not carry a control with nothing to choose.
 */
function ChildSwitcher() {
  const { children: siblings, selectedStudentId, selectChild } = useParentData();
  if (siblings.length < 2) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-black uppercase tracking-wider text-ink-muted">
        Viewing
      </span>
      {siblings.map((s) => {
        const active = s.id === selectedStudentId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => selectChild(s.id)}
            aria-pressed={active}
            className={
              active
                ? "cursor-pointer rounded-full bg-[#8127cf] px-3 py-1 text-[11px] font-bold text-white shadow-[0_4px_14px_-2px_rgba(129,39,207,0.45)]"
                : "cursor-pointer rounded-full border border-[#cfc2d6]/40 bg-white px-3 py-1 text-[11px] font-bold text-ink transition-colors hover:border-[#8127cf]/40 hover:text-[#8127cf]"
            }
          >
            {s.fullName}
            {s.rollNo ? <span className="ml-1.5 font-semibold opacity-60">{s.rollNo}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
