"use client";

/**
 * The one "you cannot use this here" notice (SPEC §8.1 R6). It replaces the `/403` copy inside consoles,
 * `NavigationAccessNotice`'s bare alert, `RestrictedView` and the raw billing fallbacks.
 *
 * It says why and, when known, who owns the thing ("Managed by {name}"). It never shows an email address:
 * an owner value that looks like one is dropped. `panel` fills a workspace; `inline` sits inside a form or
 * a tab as an Alert. Strings are EN UI keys translated here. The panel draws no card: it sits inside the shell's one
 * page card (or a view's section), never card-in-card.
 */

import * as React from "react";
import { Lock, type LucideIcon } from "lucide-react";
import { EmptyState } from "./empty-state";
import { Alert } from "./alert";
import { useUiText } from "@/components/locale/LocaleProvider";

export interface AccessNoticeProps {
  title?: string;
  /** UI key. Empty when the owner sentence alone says it (a paused plan: "{name} can renew it"). */
  reason: string;
  owner?: string | null;
  /** UI key with `{0}` for the owner's name. Default "Managed by {0}". */
  ownerPhrase?: string;
  /** Default the lock. */
  icon?: LucideIcon;
  action?: React.ReactNode;
  variant?: "panel" | "inline";
}

export function AccessNotice({ title, reason, owner, ownerPhrase = "Managed by {0}", icon = Lock, action, variant = "panel" }: AccessNoticeProps) {
  const t = useUiText();
  const heading = t(title ?? "Not available with your access");
  const safeOwner = owner && !owner.includes("@") ? owner.trim() : "";
  const [before, after = ""] = t(ownerPhrase).split("{0}");
  const reasonText = reason ? t(reason) : null;
  // Under a reason the owner is a small "Managed by" line; on its own it is the sentence.
  const managedBy = safeOwner ? (
    <span className={reasonText ? "mt-2 block text-xs font-semibold text-ink" : "block"}>{before}<bdi>{safeOwner}</bdi>{after}</span>
  ) : null;

  if (variant === "inline") {
    return (
      <Alert tone="neutral" live="polite" icon={icon} title={heading} actions={action} data-access-notice="">
        {reasonText ? <span className="block">{reasonText}</span> : null}
        {managedBy}
      </Alert>
    );
  }

  // The shell's page card is the surface (addendum 2026-10-22): the panel notice fills it without a card of its own.
  return (
    <section data-resource-state="denied" data-access-notice="" aria-live="polite" className="flex min-h-0 flex-1 flex-col items-center justify-center py-8 sm:py-12">
      <EmptyState
        icon={icon}
        title={heading}
        description={<>{reasonText}{managedBy}</>}
        action={action}
      />
    </section>
  );
}
