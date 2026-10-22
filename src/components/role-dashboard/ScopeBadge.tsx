"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Building2, Crown, GraduationCap } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { noteNavigationIdentity, useNavigationAccess } from "@/components/nav/NavigationAccess";
import { subscribeWorkspaceNavigation } from "@/components/nav/useWorkspaceView";
import { useSuperAdminData } from "@/app/super/super-data-context";
import type { UserRole } from "@/lib/roles";

/** The `/api/auth/session` user the shell reads (P1 adds `institution`; every field is optional on the wire). */
export interface ShellSession {
  id: string;
  /** With `id`, `role` and `accessVersion`: the identity the shell's access cache is keyed on (NavigationAccess). */
  schoolId?: string;
  accessVersion?: number | null;
  fullName: string;
  role: UserRole;
  /** Mode-aware label already in the viewer's display language (§1.5). */
  roleLabel: string;
  /** The same label as its EN UI key, so a client can re-translate after a language switch. */
  roleLabelKey?: string;
  dashboardPath: string;
  /** Campus logo, else school logo (P1). Frame layouts pass their own; RoleFrame reads this only as a fallback. */
  logoUrl?: string | null;
  schoolName: string | null;
  campusName: string | null;
  institution?: {
    kind: "GROUP" | "STANDALONE";
    isAuthority: boolean;
    standaloneOwner: boolean;
    isOwner: boolean;
    schoolName: string | null;
    authorityName: string | null;
    subscriptionOwnerName: string | null;
  };
}

/**
 * One `/api/auth/session` read per page for the whole shell (scope chip, header role label, Help "Your
 * role", the billing fence). A module-level promise de-duplicates the header, sidebar and menu; a locale
 * change refetches because the role label is language-aware.
 *
 * A failed read (network, 5xx, signed out) is never cached: the promise is dropped, so the next subscriber,
 * the next window focus or the network coming back retries, and the last good session stays on screen
 * meanwhile. Without this one failed read left the shell without a role label, scope chip, Account owner chip or
 * billing "Managed by" copy until a full reload.
 */
let sessionPromise: Promise<ShellSession | null> | null = null;
let sessionValue: ShellSession | null = null;
const listeners = new Set<() => void>();
function loadSession(force = false): Promise<ShellSession | null> {
  if (sessionPromise && !force) return sessionPromise;
  const request: Promise<ShellSession | null> = fetch("/api/auth/session", { cache: "no-store" })
    .then((response) => {
      // Signed out: the shell's cached access map belongs to nobody any more.
      if (response.status === 401) noteNavigationIdentity(null);
      return response.ok ? response.json() : null;
    })
    .then((body) => (body?.user ?? null) as ShellSession | null)
    .catch(() => null)
    .then((user) => {
      if (user) {
        sessionValue = user;
        noteNavigationIdentity({ userId: user.id, schoolId: user.schoolId, role: user.role, accessVersion: user.accessVersion ?? 0 });
        listeners.forEach((listener) => listener());
      } else if (sessionPromise === request) {
        sessionPromise = null;
      }
      return user ?? sessionValue;
    });
  sessionPromise = request;
  return request;
}
const onLocale = () => { void loadSession(true); };
/** Retry only while nothing has loaded yet; a loaded session is kept until the locale changes. */
const onRecover = () => { if (!sessionValue) void loadSession(); };
function subscribeSession(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("skoolee:locale-change", onLocale);
    window.addEventListener("focus", onRecover);
    window.addEventListener("online", onRecover);
  }
  void loadSession();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("skoolee:locale-change", onLocale);
      window.removeEventListener("focus", onRecover);
      window.removeEventListener("online", onRecover);
    }
  };
}

export function useShellSession(): ShellSession | null {
  return useSyncExternalStore(subscribeSession, () => sessionValue, () => null);
}

const FAMILY_OR_PLATFORM: ReadonlySet<string> = new Set(["PARENT", "STUDENT", "APP_OWNER"]);

const searchSnapshot = () => window.location.search;
const pathSnapshot = () => window.location.pathname;
const emptySnapshot = () => "";

/**
 * The campus the group admin has opened on `/super?view=campuses&campus=<id>` (SPEC §4.1 "Group · {campus}"),
 * by name from the group console's own data (already loaded for the drill-in; no extra request). Outside the
 * group console the provider is absent and this is null.
 */
function useDrillInCampus(active: boolean): string | null {
  const search = useSyncExternalStore(subscribeWorkspaceNavigation, searchSnapshot, emptySnapshot);
  const pathname = useSyncExternalStore(subscribeWorkspaceNavigation, pathSnapshot, emptySnapshot);
  const { data } = useSuperAdminData();
  if (!active || pathname !== "/super") return null;
  const params = new URLSearchParams(search);
  const campusId = params.get("campus");
  if (!campusId || params.get("view") !== "campuses") return null;
  const campuses = (data as { campuses?: Array<{ id: string; name?: string | null }> } | null)?.campuses ?? [];
  return campuses.find((campus) => campus.id === campusId)?.name ?? null;
}

/**
 * SKO-479: the school and campus the session is acting in, so staff can confirm scope before acting.
 * Shape by seat (SPEC §4.1): campus admin "{Group} · {Campus}", standalone school admin "{School}",
 * group admin "{Group}", and "{Group} · {campus}" while the group admin is inside a campus drill-in. Adds the
 * "Acting academic lead" chip when a campus operator holds the vacant principal seat, and the "Account owner"
 * chip for the account owner (its own key: the reviewed "Owner" means a task owner). Names come from the server session (and the group console's data for the drill-in).
 */
export function ScopeBadge() {
  const t = useUiText();
  const session = useShellSession();
  const access = useNavigationAccess();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const drillIn = useDrillInCampus(mounted && session?.role === "SUPER_ADMIN");
  if (!mounted || !session?.schoolName || FAMILY_OR_PLATFORM.has(session.role)) return null;

  const standalone = session.institution?.standaloneOwner === true || (session.institution?.kind === "STANDALONE" && session.role === "ADMIN");
  const campus = session.role === "SUPER_ADMIN" ? drillIn : standalone ? null : session.campusName;
  const label = campus ? `${session.schoolName} · ${campus}` : session.schoolName;
  const acting = access.has("academicLead") && access.has("campusOps");
  const owner = session.institution?.isOwner === true;

  return (
    <div data-tour="shell.header.scope" className="flex min-w-0 max-w-full flex-nowrap items-center gap-1.5 sm:flex-wrap">
      <div data-testid="scope-badge" aria-label={t("Working in {0}", [label])} className="flex min-w-0 max-w-full items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-1.5 shrink-0 text-2xs font-semibold leading-tight text-ink max-sm:rounded-full sm:max-w-[20rem] sm:shrink sm:rounded-full">
        <Building2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
        <span className="min-w-0 whitespace-nowrap sm:truncate"><bdi>{session.schoolName}</bdi>{campus ? <> · <bdi>{campus}</bdi></> : null}</span>
      </div>
      {acting ? (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-status-brand-border bg-status-brand-surface px-2 py-1 text-2xs font-semibold text-status-brand-text">
          <GraduationCap aria-hidden className="h-3.5 w-3.5 shrink-0" />{t("Acting academic lead")}
        </span>
      ) : null}
      {owner ? (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border-subtle bg-surface-subtle px-2 py-1 text-2xs font-semibold text-ink">
          <Crown aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />{session.role === "SUPER_ADMIN" ? t("Group owner") : t("Account owner")}
        </span>
      ) : null}
    </div>
  );
}
