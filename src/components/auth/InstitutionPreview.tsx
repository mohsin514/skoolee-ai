"use client";

import { Badge } from "@/components/ui/badge";
import { authCopy } from "@/lib/auth/auth-copy";
import { fillNodes } from "@/lib/auth/fill-nodes";
import type { Language } from "@/lib/locale/package";
import { cn } from "@/lib/utils";
import { WaxSeal } from "./WaxSeal";

/**
 * A live "prints as" preview of the school name, institution ID and billing
 * country while registering — what "cannot be changed later" will look like.
 * `card` is white letterhead paper for the cover (lg+); `strip` is a compact
 * line under the ID field below lg. Plain text: no ids, no live region,
 * never referenced by aria-describedby.
 */
export type InstitutionPreviewProps = {
  language: Language; schoolName: string; regId: string; countryLabel: string; currency: string;
  kicker: string;                     // the page's kickerGroup / kickerSingle
  variant?: "card" | "strip";
  className?: string;
};

export function InstitutionPreview({ language, schoolName, regId, countryLabel, currency, kicker, variant = "card", className }: InstitutionPreviewProps) {
  const copy = authCopy[language].preview;
  const name = schoolName.trim();
  const id = regId.trim();

  if (variant === "strip") {
    return (
      <p className={cn("sk-address-plate text-xs text-ink-muted", className)}>
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {fillNodes(copy.printsAs, (
            <>
              <strong className="font-semibold uppercase text-ink-strong">{name || copy.placeholder}</strong>
              {"\u00a0· "}
              <bdi data-numeric className="font-semibold tracking-wide text-ink-strong">{id || "—"}</bdi>
            </>
          ))}
        </span>
      </p>
    );
  }

  return (
    <div className={cn("sk-letterhead", className)}>
      <div className="flex items-start gap-3">
        <WaxSeal size={40} finish="wax" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          {/* The name takes the full width (a narrow cover at 1024–1280px used to
              squeeze it onto three lines beside the badge); the badge rides with the kicker. */}
          <p className={cn("text-lg font-semibold uppercase leading-snug tracking-wide [overflow-wrap:anywhere]", name ? "text-ink-strong" : "text-ink-subtle")}>
            {name || copy.placeholder}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="sk-eyebrow text-primary">{kicker}</p>
            <Badge variant="secondary" size="sm" className="shrink-0">{copy.badge}</Badge>
          </div>
        </div>
      </div>
      <div className="sk-letterhead-rule mt-5" />
      <dl className="mt-4 grid gap-y-1.5 text-sm">
        <dt className="sk-eyebrow">{copy.idLabel}</dt>
        <dd className="min-w-0">
          <bdi data-numeric className="inline-block max-w-full rounded-lg bg-brand-50 px-2 py-0.5 font-semibold tabular-nums tracking-wide text-ink-strong ring-1 ring-brand-200 whitespace-nowrap">
            {id || "—"}
          </bdi>
        </dd>
        <dt className="sk-eyebrow mt-2">{copy.countryLabel}</dt>
        <dd className="min-w-0 font-medium text-ink-strong">
          {countryLabel} · <bdi data-numeric>{currency}</bdi>
        </dd>
      </dl>
    </div>
  );
}
