"use client";

import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useUiText } from "@/components/locale/LocaleProvider";
import { RoleShell } from "@/components/role-dashboard";
import { useParentData } from "./parent-data-context";
import { ParentErrorState } from "@/components/parent/parent-components";

/**
 * The family console. Navigation is the registry's `parent` console (Home · Fees · Attendance ·
 * Results on the mobile bar, Messages, More), with visibility from `/api/parent/data`
 * `navigationAccess` — module access per child plus the family keys (`pickupGuardian`, `pkgCanteen`,
 * `accessPlans`, `multiChild`, `corrections`).
 *
 * The header greets the signed-in guardian, never the child (F19), and the child switcher sits in the
 * header's context slot so every page follows the choice. Portal-token links are retired (D14): every
 * link here is a plain path.
 */
export function ParentShell({ children }: { children: React.ReactNode }) {
  const t = useUiText();
  const { data, error, refetch, navigationAccess, guardianName: name, noChildren } = useParentData();
  const guardianName = name || t("Guardian");
  const pathname = usePathname();
  const router = useRouter();
  // M98 / G4: with no linked child yet, Home (invitations banner + empty state) and the invitations page are the
  // only screens with anything to show; any other family route goes back to Home instead of an empty page.
  const homeOnly = noChildren && pathname !== "/parent" && !pathname.startsWith("/parent-invitations");
  useEffect(() => { if (homeOnly) router.replace("/parent"); }, [homeOnly, router]);

  return (
    <RoleShell
      console="parent"
      mobileDocumentFlow
      // G7: the last confirmed map stays while the next child loads, so the navigation never drops to a skeleton.
      navigationAccess={navigationAccess}
      navigationAccessFallback={error && !navigationAccess ? <ParentErrorState error={error} onRetry={refetch} /> : undefined}
      headerContext={<ChildSwitcher />}
      userName={guardianName}
      avatarSeed={guardianName}
      logoUrl={data?.campus?.logoUrl || data?.campus?.school?.logoUrl}
      dashboardHref="/parent"
    >
      {homeOnly ? null : children}
    </RoleShell>
  );
}

/**
 * Only rendered for guardians with more than one child at the school — a single-child account should
 * not carry a control with nothing to choose. A compact chip in the header; the list opens as a sheet.
 */
function ChildSwitcher() {
  const { children: siblings, selectedStudentId, selectChild } = useParentData();
  const [open, setOpen] = useState(false);
  const t = useUiText();
  if (siblings.length < 2) return null;
  const selected = siblings.find(child => child.id === selectedStudentId) ?? siblings[0];

  return (
    <>
      <Button
        variant="choice"
        size="sm"
        type="button"
        data-tour="shell.parent.child-switcher"
        aria-label={t("Change child, viewing {0}", [selected.fullName])}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="min-h-11 min-w-0 max-w-[14rem] justify-between gap-2 px-3 text-start"
      >
        <span className="min-w-0">
          <span className="sr-only">{t("Viewing")} </span>
          <bdi className="block truncate text-sm font-semibold text-ink-strong">{selected.fullName}</bdi>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
      </Button>
      {open && <Modal size="xs" icon={Users} tone="violet" title={t("Choose child")} subtitle={t("Every page follows the child you choose.")} onClose={() => setOpen(false)}>
        <div className="space-y-2">
          {siblings.map(child => {
            const active = child.id === selected.id;
            return (
              <Button
                variant="choice"
                key={child.id}
                type="button"
                aria-pressed={active}
                onClick={() => { if (!active) selectChild(child.id); setOpen(false); }}
                className="w-full min-w-0 items-center justify-between gap-3 px-3 py-2 text-start"
              >
                <span className="flex min-w-0 flex-col items-start gap-1">
                  <bdi className="max-w-full text-sm font-semibold text-ink-strong [overflow-wrap:anywhere]">{child.fullName}</bdi>
                  {child.rollNo && <span className="max-w-full text-xs font-medium text-ink-muted [overflow-wrap:anywhere]">{t("Roll number")}: <bdi>{child.rollNo}</bdi></span>}
                </span>
                {active ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary" /> : null}
              </Button>
            );
          })}
        </div>
      </Modal>}
    </>
  );
}
