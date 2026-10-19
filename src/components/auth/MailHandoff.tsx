"use client";

import { Fragment, type ReactNode } from "react";
import { ArrowUpRight, Check, Inbox, Mail, PenLine } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";
import { authCopy } from "@/lib/auth/auth-copy";
import { authEmailCopy } from "@/lib/auth/email-copy";
import { fillNodes, fillText } from "@/lib/auth/fill-nodes";
import { inboxProvidersFor, inboxUrl } from "@/lib/auth/inbox-provider";
import { RETRY_SUGGESTION_MS } from "@/lib/auth/link-expiry";
import type { Language } from "@/lib/locale/package";
import { cn } from "@/lib/utils";

/**
 * Everything a person needs after "we sent you an email": the exact address,
 * one-tap links into their webmail (chosen by domain; the address never goes
 * into a URL), the subject to look for, an advisory retry time and a
 * "Didn't arrive?" panel. No live regions, no focus moves, no fetch.
 */
export type MailHandoffProps = {
  language: Language;
  email: string;
  kind: "reset" | "verify";
  intro?: ReactNode;              // rendered between the plate and the shortcuts (forgot: the pinned inboxBody <p>)
  sentAt?: Date;                  // reset: drives the advisory "If nothing arrives by {time}" line
  onUseDifferentEmail?: () => void;     // renders the ghost Button "Use a different email"
  action?: ReactNode;             // register: <VerificationResend/>
};

/** The only element whose text is exactly the email address. */
export function AddressPlate({ label, email }: { label: string; email: string }) {
  return (
    <p className="sk-address-plate">
      <span className="sk-eyebrow">{label}</span>
      <bdi className="font-semibold text-ink-strong">{email}</bdi>
    </p>
  );
}

/** Webmail links for the address's domain. Links, never buttons; nothing for an invalid address. */
export function InboxShortcuts({ language, email }: { language: Language; email: string }) {
  const copy = authCopy[language].mail;
  const providers = inboxProvidersFor(email);
  if (providers.length === 0) return null;
  return (
    <div className="space-y-2">
      <ul aria-label={copy.openInbox} className="flex flex-wrap gap-2">
        {providers.map((provider) => (
          <li key={provider} className="min-w-0">
            <a
              href={inboxUrl(provider)}
              target="_blank"
              rel="noopener noreferrer"
              data-mascot-look=""
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "sk-nudge-trigger")}
            >
              <Mail aria-hidden="true" className="text-primary" />
              {copy[provider]}
              <span className="sr-only"> {copy.newTab}</span>
              <span aria-hidden="true" className="sk-nudge inline-flex text-ink-subtle">
                <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
              </span>
            </a>
          </li>
        ))}
      </ul>
      {providers.length > 1 ? <p className="text-xs text-ink-subtle">{copy.customDomain}</p> : null}
    </div>
  );
}

/** "Didn't arrive?" — collapsed tips on the shared panel. Its toggle never says Send/Resend. */
export function DeliveryHelp({ language, tips }: { language: Language; tips: string[] }) {
  const copy = authCopy[language].mail;
  return (
    <CollapsiblePanel icon={Inbox} title={copy.helpTitle} defaultOpen={false} className="sk-mail-help bg-surface-subtle shadow-none">
      <ul className="space-y-2 text-sm text-ink-muted">
        {tips.map((tip) => (
          <li key={tip} className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-px grid size-5 shrink-0 place-items-center rounded-md bg-brand-50 text-primary ring-1 ring-brand-200/70">
              <Check className="size-3" strokeWidth={2.5} />
            </span>
            <span className="min-w-0">{tip}</span>
          </li>
        ))}
      </ul>
    </CollapsiblePanel>
  );
}

function retryTime(language: Language, sentAt: Date): string {
  const locale = language === "en" ? "en" : `${language}-u-nu-latn`;
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(sentAt.getTime() + RETRY_SUGGESTION_MS));
}

export function MailHandoff({ language, email, kind, intro, sentAt, onUseDifferentEmail, action }: MailHandoffProps) {
  const copy = authCopy[language].mail;
  const tips = kind === "reset"
    ? [copy.tipSpam, copy.tipSearch, copy.tipResetExpiry, copy.tipFilters]
    : [copy.tipSpam, copy.tipSearch, copy.tipVerifyExpiry, copy.tipFilters];

  return (
    <div className="space-y-5 text-start">
      <AddressPlate label={kind === "reset" ? copy.requestedFor : copy.sentTo} email={email} />
      {intro}
      <InboxShortcuts language={language} email={email} />
      {kind === "reset" ? (
        // What to look for and when to retry read as one note, not two loose lines.
        <div className="space-y-1.5 text-xs leading-relaxed text-ink-muted">
          <p>{fillNodes(copy.lookFor, <span className="font-semibold text-ink-strong">{([language, ...(["en", "ar", "ur"] as const).filter((code) => code !== language)]).map((code, index) => <Fragment key={code}>{index > 0 && " / "}<bdi lang={code}>{authEmailCopy[code].reset.subject}</bdi></Fragment>)}</span>)}</p>
          {sentAt ? <p data-numeric>{fillText(copy.retryBy, retryTime(language, sentAt))}</p> : null}
        </div>
      ) : null}
      <DeliveryHelp language={language} tips={tips} />
      {onUseDifferentEmail || action ? (
        <div className="flex flex-wrap gap-2">
          {onUseDifferentEmail ? (
            // -ms-4 cancels the ghost button's own inline padding, so its label lines up
            // with the plate and the lines above (its hover fill reaches into the card's padding).
            <Button variant="ghost" type="button" className="-ms-4 text-primary" onClick={onUseDifferentEmail}>
              <PenLine aria-hidden="true" className="rtl:-scale-x-100" />
              {copy.useDifferent}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
