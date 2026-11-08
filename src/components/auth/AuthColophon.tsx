"use client";

import { Fragment } from "react";
import Link from "next/link";
import { BadgeCheck, Building2, KeyRound, Languages, ShieldCheck, Timer, type LucideIcon } from "lucide-react";
import { authCopy, type AuthClaimId } from "@/lib/auth/auth-copy";
import type { Language } from "@/lib/locale/package";
import { cn } from "@/lib/utils";

export type { AuthClaimId } from "@/lib/auth/auth-copy";

/**
 * The quiet foot of every auth column: short claim chips (below lg by
 * default, where the cover is hidden) and the three policy links.
 */
export type AuthColophonProps = { language: Language; claims?: AuthClaimId[]; claimsAt?: "below-lg" | "always" | "never" };  // default "below-lg"

/** One icon per claim, shared by the colophon chips and the cover index. */
export const AUTH_CLAIM_ICONS: Record<AuthClaimId, LucideIcon> = {
  campuses: Building2,
  encrypted: ShieldCheck,
  human: BadgeCheck,
  languages: Languages,
  singleUse: KeyRound,
  resetExpiry: Timer,
};

/** A cover-index item for a shared claim: `{ icon, title, body? }`. Pass `{ body: false }` for title only. */
export function authClaimItem(language: Language, id: AuthClaimId, opts?: { body?: boolean }): { icon: LucideIcon; title: string; body?: string } {
  const claim = authCopy[language].claims[id];
  return { icon: AUTH_CLAIM_ICONS[id], title: claim.title, body: opts?.body === false ? undefined : claim.body };
}

const POLICIES = [
  { href: "/privacy", key: "privacy" },
  { href: "/security", key: "security" },
  { href: "/ai-governance", key: "aiGovernance" },
] as const;

export function AuthColophon({ language, claims = [], claimsAt = "below-lg" }: AuthColophonProps) {
  const copy = authCopy[language];
  return (
    <footer className="sk-fade-in print:hidden" style={{ ["--sk-delay" as string]: "210ms" }}>
      {claims.length > 0 && claimsAt !== "never" ? (
        <ul aria-label={copy.trustLabel} className={cn("mt-6 flex flex-wrap justify-center gap-2", claimsAt === "below-lg" && "lg:hidden")}>
          {claims.map((id) => {
            const Icon = AUTH_CLAIM_ICONS[id];
            return (
              <li key={id} className="sk-chip">
                <Icon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0">{copy.claims[id].short}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <nav aria-label={copy.policies} className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-medium text-ink-subtle">
        {POLICIES.map((policy, index) => (
          <Fragment key={policy.href}>
            {index > 0 ? <span aria-hidden="true" className="h-3 w-px bg-edge/50" /> : null}
            <Link href={policy.href} className="inline-flex min-h-11 items-center px-1 hover:text-primary">{copy[policy.key]}</Link>
          </Fragment>
        ))}
      </nav>
    </footer>
  );
}
