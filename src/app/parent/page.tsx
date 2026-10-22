"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, House, MailOpen, Users } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentOverviewSkeleton } from "@/components/parent/parent-components";
import { useParentData } from "./parent-data-context";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { FamilyInbox, type InboxTopAction } from "@/components/parent/family-inbox";
import { GuardianDigest } from "@/components/family/family-digest";
import { FamilyCareMessages } from "@/components/care/care";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Home — the family's landing screen (SPEC §4.4): what needs the family comes first, and the screen's
 * one primary action is the top request itself ("Pay …", "Explain …'s absence"); with nothing to do
 * there is no primary. Canteen, pathways, consent, the policy assistant, the calendar, the stat row
 * and the Quick Access tiles left Home: each now has its own page under More (or Help → Ask the
 * school), so the sidebar is never repeated as tiles.
 */
export default function ParentHomePage() {
  const ui = useUiText();
  const { money } = useLocaleFormat();
  const { language } = useLocale();
  const { data, loading, error, refetch, selectedStudentId, selectChild, noChildren, guardianName } = useParentData();
  const [topAction, setTopAction] = useState<InboxTopAction>(null);
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const onTopAction = useCallback((action: InboxTopAction) => setTopAction(action), []);

  // M98: invitations still waiting for this account surface on Home, not only by email — including for a
  // guardian whose first child is not linked yet (G4), for whom it is the way in.
  useEffect(() => {
    let live = true;
    fetch("/api/parent/invitations", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => { if (live && body?.success && Array.isArray(body.invitations)) setPendingInvitations(body.invitations.length); })
      .catch(() => { /* the banner is optional */ });
    return () => { live = false; };
  }, []);

  const invitationsBanner = pendingInvitations > 0 ? (
    <Alert
      tone="brand"
      icon={MailOpen}
      live="off"
      title={pendingInvitations === 1 ? ui("A guardian invitation is waiting for you") : ui("{0} guardian invitations are waiting for you", [pendingInvitations])}
      // Outline: the screen's one primary is the PageHeader's (the top inbox request).
      actions={<Link href="/parent-invitations" className={buttonVariants({ variant: "outline", size: "sm" })}>{ui("Review invitations")}</Link>}
    >
      {ui("Accept an invitation to see that child here.")}
    </Alert>
  ) : null;

  if (noChildren) {
    // G4: no linked child yet. Home still greets the guardian and offers the one useful step.
    return (
      <ParentPage
        icon={House}
        title="Home"
        description={guardianName ? <>{ui("Welcome")}, <bdi>{guardianName}</bdi></> : undefined}
        primaryAction={pendingInvitations > 0 ? { id: "review-invitations", label: "Review invitations", icon: MailOpen, href: "/parent-invitations" } : undefined}
      >
        {/* The header's primary already opens the invitations, so no banner repeats it here. */}
        <div className="space-y-4">
          <EmptyState
            icon={Users}
            title={ui("No child is linked to your account yet")}
            description={pendingInvitations > 0
              ? ui("Accept the school's invitation to see your child's fees, attendance and results here.")
              : ui("When the school links your child to this account, their fees, attendance and results appear here. Ask the school office if you were expecting an invitation.")}
          />
        </div>
      </ParentPage>
    );
  }

  if (loading && !data) return <ParentOverviewSkeleton />;
  if (error && !data) return <ParentErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const { student, campus } = data;
  const latest = data.access.learningRecords ? data.reportCards?.[0] : undefined;
  const outstanding = (data.feeTotals ?? []).filter((row) => row.outstanding > 0);

  return (
    <ParentPage
      icon={House}
      title="Home"
      description={<><bdi>{student.fullName}</bdi> · <bdi>{student.className}</bdi> · <bdi>{campus.name}</bdi></>}
      primaryAction={topAction ? {
        id: "top-request",
        label: topAction.label,
        href: topAction.href,
        onClick: () => selectChild(topAction.childId),
      } : undefined}
      status={outstanding.length && data.access.finances ? (
        <Link href="/parent/fees" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
          {/* Family totals: every open invoice of every child this account pays for (G9). */}
          <span>{(data.navigationAccess?.multiChild ? ui("Family fees due: {0}", [outstanding.map((row) => money(row.outstanding, row.currency)).join(" · ")]) : ui("Fees due: {0}", [outstanding.map((row) => money(row.outstanding, row.currency)).join(" · ")]))}</span>
          <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" />
        </Link>
      ) : undefined}
    >
      <div className="space-y-4">
        {invitationsBanner}

        {/* SKO-419: requests across every child come first; the panels below are the selected child's. */}
        <FamilyInbox onTopAction={onTopAction} />

        {/* M91 / SKO-439: messages a safeguarding lead approved for this guardian; renders nothing when empty. */}
        <FamilyCareMessages />

        {/* SKO-423: the selected child's reviewed weekly update. */}
        {selectedStudentId ? <GuardianDigest key={selectedStudentId} studentId={selectedStudentId} /> : null}

        {data.access.learningRecords ? (
          <section aria-labelledby="home-latest-result" className="sk-panel min-w-0 p-4">
            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h2 id="home-latest-result" className="flex items-center gap-2 text-base font-bold text-ink-strong">
                <FileText aria-hidden="true" className="size-4 text-primary" />
                {ui("Latest result")}
              </h2>
              {latest ? (
                <Link href="/parent/results" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "sk-nudge-trigger gap-1 text-primary")}>
                  {ui("All results")} <ChevronRight aria-hidden="true" className="sk-nudge size-4 rtl:rotate-180" />
                </Link>
              ) : null}
            </div>
            {latest ? (
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-3 sm:p-4">
                <div className="min-w-0 flex-1 basis-[min(100%,12rem)]">
                  <p className="text-xs font-semibold text-ink-muted [overflow-wrap:anywhere]"><bdi>{latest.term}</bdi> <bdi>{latest.academicYear}</bdi></p>
                  <p className="mt-0.5 text-sm font-bold text-ink-strong [overflow-wrap:anywhere]"><bdi>{latest.examTitle}</bdi></p>
                  {/* The teacher's remark in the family's language when the school wrote one (Urdu), else English. */}
                  {(language === "ur" && latest.remarksUr) || latest.remarksEn ? <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted" dir="auto">{language === "ur" && latest.remarksUr ? latest.remarksUr : latest.remarksEn}</p> : null}
                </div>
                <div className="min-w-0 text-start">
                  <p className="text-2xl font-bold tabular-nums text-primary"><bdi>{Math.round(latest.percentage)}%</bdi></p>
                  <p className="text-xs font-medium text-ink-subtle">{ui("Grade {0}", [latest.grade || "—"])}</p>
                </div>
              </div>
            ) : (
              <EmptyState size="sm" icon={FileText} title={ui("No report cards yet")} description={ui("Results appear here once the school publishes them.")} />
            )}
          </section>
        ) : null}
      </div>
    </ParentPage>
  );
}
