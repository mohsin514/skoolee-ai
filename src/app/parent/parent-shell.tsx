"use client";

import { Button } from "@/components/ui/button";
import { ChevronDown, MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { ModalSurface } from "@/components/ui/modal";
import { useUiText } from "@/components/locale/LocaleProvider";
import { RoleShell, type RoleNavItem } from "@/components/role-dashboard";
import { useParentData } from "./parent-data-context";
import { PARENT_NAV } from "@/components/parent/parent-page";
import { ParentErrorState } from "@/components/parent/parent-components";

export function ParentShell({ children }: { children: React.ReactNode }) {
  const { data, token, error, refetch } = useParentData();

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
      mobileDocumentFlow
      navItems={navItems}
      navigationAccess={data?.navigationAccess ?? null}
      navigationAccessFallback={error ? <ParentErrorState error={error} onRetry={refetch} /> : undefined}
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
  const [open, setOpen] = useState(false);
  const t = useUiText();
  if (siblings.length < 2) return null;
  const selected = siblings.find(child => child.id === selectedStudentId) ?? siblings[0];

  return (
    <>
      <Button variant="choice" type="button" aria-label={t("Change child")} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="mb-[12px] w-full min-w-0 shrink-0 justify-between gap-[8px] px-[12px] py-[8px] text-start">
        <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-wider text-ink-muted">{t("Viewing")}</span><bdi className="block text-sm [overflow-wrap:anywhere]">{selected.fullName}</bdi>{selected.rollNo && <bdi className="block text-xs font-medium text-ink-muted [overflow-wrap:anywhere]">{selected.rollNo}</bdi>}</span>
        <ChevronDown aria-hidden="true" className="shrink-0" />
      </Button>
      {open && <ModalSurface ariaLabel={t("Choose child")} onClose={() => setOpen(false)}>
        <div className="flex items-center justify-between gap-[8px] border-b border-border p-[12px]"><h2 className="text-lg font-bold">{t("Choose child")}</h2><Button variant="ghost" size="icon" aria-label={t("Close")} onClick={() => setOpen(false)} className="h-[44px] w-[44px] min-w-[44px]"><X aria-hidden="true" /></Button></div>
        <div className="min-h-0 space-y-[8px] overflow-y-auto p-[12px]">
          {siblings.map(child => <Button variant="choice" key={child.id} type="button" aria-pressed={child.id === selectedStudentId} onClick={() => { selectChild(child.id); setOpen(false); }} className="w-full min-w-0 flex-col items-start gap-[4px] px-[12px] py-[8px] text-start"><bdi className="max-w-full text-sm [overflow-wrap:anywhere]">{child.fullName}</bdi>{child.rollNo && <span className="max-w-full text-xs font-medium text-ink-muted [overflow-wrap:anywhere]">{t("Roll number")}: <bdi>{child.rollNo}</bdi></span>}</Button>)}
        </div>
      </ModalSurface>}
    </>
  );
}
