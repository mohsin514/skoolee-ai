"use client";

/**
 * Header Help (SPEC §4.2): the one place for the spotlight tour, the welcome story, "Your role", keyboard
 * shortcuts, and the two staff-wide requests (Report a problem → service desk, Record a concern → care).
 * Families get "Ask the school" (the policy assistant in a Modal) instead of a Policy Q&A panel on Home.
 *
 * The dialogs live in `HelpDialogsHost`, mounted once by RoleShell, so the same menu can be opened from the
 * header and from the mobile "More" sheet (which closes when an item is chosen) without losing the dialog.
 */

import { useCallback, useSyncExternalStore, type ReactElement } from "react";
import { CircleHelp, Compass, HeartHandshake, Keyboard, MessageSquareText, PlayCircle, UserRound, Wrench } from "lucide-react";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { useTour } from "@/components/tour/TourProvider";
import { PolicyAssistant } from "@/components/policies/policy-assistant";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";
import { useShellSession, type ShellSession } from "./ScopeBadge";
import { membershipPreview } from "@/lib/membership-access";
import type { UserRole } from "@/lib/roles";

type HelpDialog = "role" | "shortcuts" | "ask" | null;

let openDialog: HelpDialog = null;
const dialogListeners = new Set<() => void>();
function setHelpDialog(next: HelpDialog) {
  openDialog = next;
  dialogListeners.forEach((listener) => listener());
}
function subscribeDialog(listener: () => void) {
  dialogListeners.add(listener);
  return () => { dialogListeners.delete(listener); };
}

const FAMILY: ReadonlySet<UserRole> = new Set(["PARENT", "STUDENT"]);

export interface HelpMenuProps {
  role: UserRole;
  /** On a framed route the tour item reads "Tour my workspace" and hands off to the console (SPEC §9.1). */
  framed?: boolean;
  /** `row`: a full-width row for the mobile "More" sheet. */
  variant?: "icon" | "row";
  /** Called before an item acts (the mobile sheet closes itself). */
  onAction?: () => void;
}

export function HelpMenu({ role, framed = false, variant = "icon", onAction }: HelpMenuProps) {
  const t = useUiText();
  const tour = useTour();
  const staff = !FAMILY.has(role);
  const act = useCallback((fn: () => void) => () => { onAction?.(); fn(); }, [onAction]);

  const items: Array<MenuItem | "separator"> = [
    {
      id: "tour",
      label: framed ? "Tour my workspace" : "Tour this page",
      icon: Compass,
      anchor: "shell.help.tour",
      disabled: tour.available === false,
      description: tour.available === false ? "No tour is available here yet." : undefined,
      onSelect: act(() => window.dispatchEvent(new CustomEvent("skoolee:start-tour", { detail: {} }))),
    },
    { id: "welcome", label: "Replay welcome", icon: PlayCircle, anchor: "shell.help.welcome", onSelect: act(() => window.dispatchEvent(new Event("skoolee:replay-welcome"))) },
  ];
  if (staff) {
    items.push(
      { id: "role", label: "Your role", icon: UserRound, anchor: "shell.help.role", onSelect: act(() => setHelpDialog("role")) },
      { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, anchor: "shell.help.shortcuts", onSelect: act(() => setHelpDialog("shortcuts")) },
    );
    if (role !== "APP_OWNER") {
      items.push(
        "separator",
        { id: "problem", label: "Report a problem", description: "Ask facilities or IT to fix something.", icon: Wrench, anchor: "shell.help.problem", href: "/service-desk?tab=new", onSelect: onAction },
        { id: "concern", label: "Record a concern", description: "Confidential: about a student's safety or wellbeing.", icon: HeartHandshake, anchor: "shell.help.concern", href: "/care?tab=report", onSelect: onAction },
      );
    }
  } else {
    items.push("separator", { id: "ask", label: "Ask the school", description: "Answers quoted from the school's current policies.", icon: MessageSquareText, anchor: "shell.help.ask", onSelect: act(() => setHelpDialog("ask")) });
  }

  const trigger: ReactElement = variant === "row"
    ? (
      <Button type="button" variant="ghost" className="w-full justify-start gap-3 rounded-xl px-3 text-ink">
        <CircleHelp aria-hidden="true" /><span>{t("Help & tour")}</span>
      </Button>
    )
    : (
      <IconButton label={t("Help")} variant="outline" data-tour="shell.header.help" className="relative">
        <CircleHelp aria-hidden="true" />
        {tour.hasNew ? <span aria-hidden="true" className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-card" /> : null}
        {tour.hasNew ? <span className="sr-only">{t("A new tour is available")}</span> : null}
      </IconButton>
    );

  return <Menu label="Help" align={variant === "row" ? "start" : "end"} trigger={trigger} items={items} className={variant === "row" ? "w-full" : undefined} />;
}

/** One line of "Your role" copy: an EN UI key and its `{n}` values (names stay data, inside `<bdi>` by the caller). */
type Line = { key: string; values?: string[] };
type RoleCopy = { headline: string[]; own: Line[]; approve: Line[]; approvedBy: Line[] };
const line = (key: string, values?: string[]): Line => ({ key, values });

/**
 * "Your role" (SPEC §4.2): the headline is the role's task line from `MEMBERSHIP_TASKS` (P1, `membershipPreview`,
 * already in the viewer's language), so the invite preview, the accept-invite page and Help say the same thing.
 * Every other line comes from the server-computed capability keys and seats, never from the role alone:
 * - authority lines only with `institutionAuthority` (a flagless group admin is one; a super admin in a single
 *   school, or a user whose kind is unknown, is not — §1.1 fails closed), billing only with `billing`;
 * - campus-operations lines with `campusOps`, plus each desk held while that seat is vacant (§2.6);
 * - the principal's "who decides" line names the vacancy when no campus admin is appointed.
 */
function roleCopy(role: UserRole, has: (key: string) => boolean, session: ShellSession | null, language: "en" | "ar" | "ur"): RoleCopy {
  const authority = has("institutionAuthority");
  const groupAuthority = authority && has("groupConsole");
  const schoolAuthority = authority && has("standaloneOwner");
  const operator = has("campusOps");
  const leader = session?.institution?.authorityName ?? null;
  // An ADMIN inside a group is a campus operator (§1.1); a super admin who is not the authority holds no seat.
  const headlineRole: UserRole | null = role === "ADMIN" && !schoolAuthority ? "CAMPUS_ADMIN" : role === "SUPER_ADMIN" && !authority ? null : role;
  const headline = headlineRole ? membershipPreview(headlineRole, false, false, language).tasks : [];
  const own: Line[] = [];
  const approve: Line[] = [];
  const approvedBy: Line[] = [];

  if (groupAuthority) own.push(line("Campuses, campus leaders, group standards and school settings."));
  if (schoolAuthority) own.push(line("Daily operations of your school: students, staff, year setup and services."));
  else if (operator) own.push(line("This campus: students, staff, year setup and campus services."));
  if (has("billing")) own.push(line("The SkooleeAI subscription: plan, AI credits and payment method."));
  if (schoolAuthority) own.push(line("People & access and school settings."));
  if (operator) {
    if (has("academicLead")) own.push(line("Timetable, exams and report approvals, until a principal is appointed."));
    if (has("financeDesk")) own.push(line("Invoices and payments, until an accountant is appointed."));
    if (has("frontDesk")) own.push(line("Visitors, calls and post, until a receptionist is on duty."));
    if (has("libraryDesk")) own.push(line("The library, until a librarian is appointed."));
  }

  // The two flagships (addendum 2026-10-22), for the roles whose console shows them.
  if (has("schoolAi") && (authority || operator || role === "PRINCIPAL")) own.push(line("AI Workflows: AI drafts your school's setup and routine runs; nothing applies until you approve it."));
  if (has("schoolAiExams") && role !== "STUDENT") own.push(line("Exam Studio: AI-built assessments, secure delivery, marking and learning recovery."));

  if (operator) approve.push(line("Fee adjustments, payroll, purchase requests, office staff leave and admission offers."));
  if (groupAuthority) approve.push(line("SkooleeAI support access, tax packages and group policy reviews."));
  else if (schoolAuthority) approve.push(line("SkooleeAI support access and tax packages."));

  if (authority) approvedBy.push(line("Your decisions are final and each one is recorded in the activity log."));
  else if (operator) approvedBy.push(line(has("standaloneDeputy") ? "Billing and school-wide settings stay with your school admin." : "Billing and school-wide settings stay with your group admin."));
  else if (role === "SUPER_ADMIN" || role === "ADMIN") approvedBy.push(leader ? line("School-wide decisions stay with {0}.", [leader]) : line("School-wide decisions stay with your institution's administrator."));

  switch (role) {
    case "PRINCIPAL":
      own.push(line("Timetable, exams, results and report cards."), line("Teacher performance and learning actions."));
      approve.push(line("Report cards, results, teachers' leave, mark corrections and promotion plans."));
      approvedBy.push(has("hasCampusAdmin")
        ? line("Admissions, fees and campus setup belong to your campus admin.")
        : leader
          ? line("No campus admin is appointed. Admissions, fee approvals and campus setup wait until {0} appoints one.", [leader])
          : line("No campus admin is appointed yet. Admissions, fee approvals and campus setup wait until one is appointed."));
      break;
    case "TEACHER":
      own.push(line("Registers, marks, homework and class tests for your classes."));
      approve.push(line("Absence explanations from families."));
      approvedBy.push(line("Your academic lead approves report remarks, mark corrections and leave."));
      break;
    case "ACCOUNTANT":
      own.push(line("Invoices, payments, receipts, the ledger and payroll preparation."));
      approve.push(line("Nothing: you prepare the work and others decide."));
      approvedBy.push(line("Your campus admin approves refunds, waivers and payroll; the school's administrator signs off tax packages."));
      break;
    case "RECEPTIONIST":
      own.push(line("Visitors, pickup, calls, post, complaint intake and certificates."));
      approve.push(line("Nothing: unusual pickups and complaints go to your campus admin."));
      approvedBy.push(line("Your campus admin makes admission offers and handles escalated complaints."));
      break;
    case "LIBRARIAN":
      own.push(line("Lending, returns, the catalogue and library members."));
      approve.push(line("Nothing: library charges are handed to the fees office."));
      approvedBy.push(line("Your campus admin can waive library charges."));
      break;
    case "APP_OWNER":
      own.push(line("The platform: schools, pricing, payment gateways and the audit log."));
      approve.push(line("Subscription requests from schools."));
      approvedBy.push(line("Support access to a school works only within a grant that school approves."));
      break;
    default:
      break;
  }
  return { headline, own, approve, approvedBy };
}

const SHORTCUTS: Array<{ keys: string; label: string; roles?: UserRole[] }> = [
  { keys: "Alt + Shift + K", label: "Find a workspace" },
  { keys: "Alt + Shift + [", label: "Collapse or expand the sidebar" },
  { keys: "⌘ K / Ctrl + K", label: "Open the command palette", roles: ["TEACHER"] },
];

/** A translated line whose `{n}` values are names: each name sits in its own `<bdi>` so RTL copy keeps its order. */
function RoleLine({ item }: { item: Line }) {
  const t = useUiText();
  const values = item.values ?? [];
  if (values.length === 0) return <>{t(item.key)}</>;
  // Translate with markers in place of the values, then put each name back as data (never through the dictionary).
  const marked = t(item.key, values.map((_, index) => `\u0000${index}\u0001`));
  return <>{marked.split(/\u0000(\d+)\u0001/).map((part, index) => index % 2 === 1 ? <bdi key={index} className="font-semibold">{values[Number(part)]}</bdi> : part)}</>;
}

/** Mounted once by RoleShell. Renders the Help dialogs opened from any HelpMenu instance. */
export function HelpDialogsHost({ role }: { role: UserRole }) {
  const t = useUiText();
  const { language } = useLocale();
  const dir = language === "en" ? "ltr" : "rtl";
  const current = useSyncExternalStore(subscribeDialog, () => openDialog, () => null);
  const access = useNavigationAccess();
  const session = useShellSession();
  const close = () => setHelpDialog(null);

  if (current === "role") {
    // The session label is mode-aware (§1.5); its EN key re-translates after a language switch. Before the
    // session arrives the subtitle is left out rather than showing a raw role code (R7).
    const label = session ? t(session.roleLabelKey ?? session.roleLabel) : null;
    const ready = access.status === "ready";
    const copy = ready ? roleCopy(role, access.has, session, language) : null;
    const sections: Array<[string, Line[]]> = copy ? [["What you own", copy.own], ["What you approve", copy.approve], ["Who decides beyond you", copy.approvedBy]] : [];
    return (
      <Modal title={t("Your role")} subtitle={label ? <bdi>{label}</bdi> : undefined} icon={UserRound} size="sm" onClose={close} dir={dir} lang={language}>
        {copy ? (
          <div className="space-y-5">
            {copy.headline.length > 0 ? <p className="text-sm font-semibold leading-relaxed text-ink-strong">{copy.headline.join(" · ")}</p> : null}
            {sections.filter(([, lines]) => lines.length > 0).map(([heading, lines]) => (
              <section key={heading} className="space-y-2">
                <h3 className="text-sm font-bold text-ink-strong">{t(heading)}</h3>
                <ul className="space-y-1.5">
                  {lines.map((item) => (
                    <li key={item.key} className="flex gap-2 text-sm leading-relaxed text-ink">
                      <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                      <span><RoleLine item={item} /></span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <SkeletonRegion label={t("Loading your role")} className="space-y-3">
            <Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-full" delay={1} /><Skeleton className="h-4 w-5/6" delay={2} />
          </SkeletonRegion>
        )}
      </Modal>
    );
  }
  if (current === "shortcuts") {
    return (
      <Modal title={t("Keyboard shortcuts")} icon={Keyboard} size="xs" onClose={close} dir={dir} lang={language}>
        <dl className="divide-y divide-border-subtle">
          {SHORTCUTS.filter((s) => !s.roles || s.roles.includes(role)).map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-ink">{t(s.label)}</dt>
              <dd><kbd dir="ltr" className="rounded-lg border border-border bg-surface-subtle px-2 py-1 font-mono text-xs font-semibold text-ink-strong">{s.keys}</kbd></dd>
            </div>
          ))}
        </dl>
      </Modal>
    );
  }
  if (current === "ask") {
    return (
      <Modal title={t("Ask the school")} subtitle={t("Answers quoted from the school's current policies.")} icon={MessageSquareText} size="md" onClose={close} dir={dir} lang={language}>
        <PolicyAssistant />
      </Modal>
    );
  }
  return null;
}
