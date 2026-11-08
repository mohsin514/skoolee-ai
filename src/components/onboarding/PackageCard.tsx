"use client";

import { memo, type ReactNode } from "react";
import { Check, ChevronDown, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One package in the chooser (PackageChooser). On tablet and desktop it sits
 * on seven rows of the grid's shared subgrid, so names, prices, meters, tiles
 * and actions line up across cards: head · price · why · headroom · limits ·
 * features · action. On phones (`compact`) it is an accordion row whose
 * toggle carries the name, the short price and a fit pill.
 *
 * The recommended card wears the ribbon, the turning ring and gradient ink and
 * is the only card whose button is the plum default (the chooser decides).
 * Meters show how much of each limit the school would use; the text beside a
 * meter carries the meaning (the bar and campus cells are decorative).
 */
type PlanType = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";

export type PackageMeter = {
  label: string;
  /** "420 of 500", "Up to 500", "Unlimited". */
  value: string;
  /** 0..1, or null for an unlimited limit (drawn full and calm). */
  usage: number | null;
  /** The expected size is above this limit. */
  over: boolean;
  /** The expected value is not known yet: no track is drawn. */
  unknown?: boolean;
  /** Replaces the track (the campuses meter draws CapacityMeter cells). */
  graphic?: ReactNode;
};

export type PackageCardProps = {
  plan: PlanType;
  name: string;
  tags?: { label: string; tone?: "success" | "info" | "brand"; icon?: LucideIcon }[];
  recommended?: { label: string };
  price: {
    amount: string;
    currency?: string;
    unit?: string;
    /** The undiscounted monthly amount, struck through (annual billing). */
    was?: string;
    wasSr?: string;
    note?: ReactNode;
    /** Changes with the billing period, so the amount replays its tick. */
    periodKey: string;
    /** Gradient ink on the amount (the recommended card). */
    emphasis?: boolean;
    /** The phone toggle's one-line price: the amount ("PKR 4,000", "Free", "Tailored") and its unit, kept apart so the unit flows in the page direction. */
    short: { amount: string; unit?: string; ltr?: boolean };
  };
  why: string;
  meters: PackageMeter[];
  fit: { tone: "success" | "warning" | "neutral"; label: string; short: string };
  limits: { label: string; value: string }[];
  features: { heading: string; items: ReactNode[] };
  action: ReactNode;
  next: { icon: LucideIcon; text: string; extra?: string };
  current?: boolean;
  busy?: boolean;
  compact?: boolean;
  open?: boolean;
  onToggle?(): void;
  /** Clicking anywhere on the card (outside its own controls) chooses it; the card's button stays the keyboard path. */
  onSelect?(): void;
  /** The owner picked this card (it wears the selected ring and tag). */
  selected?: { label: string };
};

/** Element ids a card exposes (the chooser wires aria-describedby to them). */
export const packageIds = (plan: string) => ({
  name: `package-${plan}-name`,
  fit: `package-${plan}-fit`,
  next: `package-${plan}-next`,
  detail: `package-${plan}-detail`,
});

function PackageCardImpl({ plan, name, tags, recommended, price, why, meters, fit, limits, features, action, next, current, busy, compact, open, onToggle, onSelect, selected }: PackageCardProps) {
  const ids = packageIds(plan);
  const NextIcon = next.icon;
  const allTags = selected ? [{ label: selected.label, tone: "brand" as const, icon: Check }, ...(tags ?? [])] : tags;
  const tagList = allTags?.length ? (
    <span className="sk-package-tags">
      {allTags.map(({ label, tone, icon: Icon }) => (
        <span key={label} className="sk-choice-tag shrink-0" data-tone={tone}>{Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}<span>{label}</span></span>
      ))}
    </span>
  ) : null;

  const pricing = (
    <div className="sk-package-pricing">
      <p className="sk-package-price">
        {price.was ? <><s data-part="was" aria-hidden="true"><bdi dir="ltr">{price.was}</bdi></s><span className="sr-only">{price.wasSr}</span></> : null}
        <bdi dir="ltr">
          {price.currency ? <span data-part="currency">{price.currency}</span> : null}
          <span key={price.periodKey} data-part="amount" className={price.emphasis ? "sk-text-gradient" : undefined}>{price.amount}</span>
        </bdi>
        {price.unit ? <span data-part="unit">{price.unit}</span> : null}
      </p>
      {price.note ? <div className="sk-package-price-note">{price.note}</div> : null}
    </div>
  );

  const detail = (
    <>
      {/* Always rendered so every card keeps the same rows on the shared subgrid. */}
      <p className="sk-package-desc">{why}</p>
      <div className="sk-package-meters">
        {meters.map((meter) => (
          <div key={meter.label} className="sk-headroom" data-over={meter.over || undefined} data-unlimited={meter.usage === null || undefined}>
            <div className="sk-headroom-row">
              <span>{meter.label}</span>
              <span className="sk-headroom-value"><bdi>{meter.value}</bdi></span>
            </div>
            {meter.graphic ?? (meter.unknown ? null : (
              <span aria-hidden="true" className="sk-headroom-track">
                <span className="sk-headroom-fill" style={{ inlineSize: `${Math.round((meter.usage ?? 1) * 100)}%` }} />
              </span>
            ))}
          </div>
        ))}
        <p id={ids.fit} className="sk-package-fit" data-tone={fit.tone}>
          {fit.tone === "warning" ? <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" /> : <Check aria-hidden="true" className="size-3.5 shrink-0" />}
          <span>{fit.label}</span>
        </p>
      </div>
      <dl className="sk-package-limits">
        {limits.map((limit) => (
          <div key={limit.label}>
            <dt>{limit.label}</dt>
            <dd><bdi>{limit.value}</bdi></dd>
          </div>
        ))}
      </dl>
      <div className="sk-package-features">
        <p className="sk-eyebrow">{features.heading}</p>
        <ul>
          {features.items.map((item, index) => (
            <li key={index}><Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" /><span className="min-w-0">{item}</span></li>
          ))}
        </ul>
      </div>
      <div className="sk-package-action">
        {action}
        <p id={ids.next} className="sk-package-next"><NextIcon aria-hidden="true" /><span>{next.text}</span></p>
        {next.extra ? <p className="sk-package-next" data-tone="warning"><TriangleAlert aria-hidden="true" /><span>{next.extra}</span></p> : null}
      </div>
    </>
  );

  return (
    <article
      className="sk-package-card"
      data-plan={plan}
      data-recommended={recommended ? "" : undefined}
      data-current={current || undefined}
      data-fits={fit.tone !== "warning"}
      data-busy={busy || undefined}
      data-compact={compact || undefined}
      data-open={compact && open ? "" : undefined}
      aria-labelledby={ids.name}
      data-selectable={onSelect && !compact ? "" : undefined}
      data-selected={selected ? "" : undefined}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect && !compact ? (event) => {
        if ((event.target as HTMLElement).closest("button, a, input, [role='button']")) return;
        onSelect();
      } : undefined}
    >
      {recommended ? (
        <p key={plan} className="sk-package-ribbon sk-enter-scale"><Sparkles aria-hidden="true" className="size-3.5 shrink-0" /><span>{recommended.label}</span></p>
      ) : null}
      {compact ? (
        <>
          <h3 id={ids.name} className="sk-package-toggle-head">
            <Button type="button" variant="ghost" className="sk-package-toggle" aria-expanded={Boolean(open)} aria-controls={ids.detail} onClick={onToggle}>
              <span data-part="name"><bdi>{name}</bdi></span>
              <span data-part="sum">
                <span>{price.short.ltr ? <bdi dir="ltr">{price.short.amount}</bdi> : price.short.amount}{price.short.unit ? <span>{price.short.unit}</span> : null}</span>
                <span className="sk-package-fit-pill" data-tone={fit.tone}>
                  {fit.tone === "warning" ? <TriangleAlert aria-hidden="true" className="size-3 shrink-0" /> : <Check aria-hidden="true" className="size-3 shrink-0" />}
                  {fit.short}
                </span>
              </span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
            </Button>
          </h3>
          {tagList ? <div className="sk-package-compact-tags">{tagList}</div> : null}
          <div id={ids.detail} data-detail="" hidden={!open}>
            {pricing}
            {detail}
          </div>
        </>
      ) : (
        <>
          <header className="sk-package-head">
            <h3 id={ids.name} className="min-w-0 text-md font-bold text-ink-strong [overflow-wrap:anywhere]"><bdi>{name}</bdi></h3>
            {tagList}
          </header>
          {pricing}
          {detail}
        </>
      )}
    </article>
  );
}

export const PackageCard = memo(PackageCardImpl);
