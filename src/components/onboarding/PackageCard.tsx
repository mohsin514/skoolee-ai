"use client";

import type { ReactNode } from "react";
import { Check, TriangleAlert } from "lucide-react";

/**
 * One package in the setup chooser: name (+ "Current" tag), price, an optional
 * one-line description, whether it fits the expected size, four limit tiles,
 * the feature list, then the card's action and its note. The current package
 * carries the gradient border; every card keeps the same row rhythm so prices,
 * fit lines and actions align across the grid.
 */
export type PackageCardProps = {
  name: string;
  /** Shown as a tag beside the name ("Current"). */
  tag?: string;
  current?: boolean;
  price: ReactNode;
  description?: string;
  fit: { fits: boolean; label: string };
  limits: { label: string; value: string }[];
  features: ReactNode[];
  action: ReactNode;
  /** Why the action is what it is (quote only, checkout not set up…), in the info tone. */
  note?: string;
};

export function PackageCard({ name, tag, current, price, description, fit, limits, features, action, note }: PackageCardProps) {
  return (
    <article className={current ? "sk-package-card sk-gradient-border" : "sk-package-card"} data-current={current || undefined}>
      <header className="sk-package-head">
        <h2 className="min-w-0 text-md font-bold text-ink-strong [overflow-wrap:anywhere]"><bdi>{name}</bdi></h2>
        {tag ? <span className="sk-choice-tag shrink-0">{tag}</span> : null}
      </header>
      <p className="sk-package-price" dir="ltr"><bdi>{price}</bdi></p>
      {description ? <p className="text-xs leading-relaxed text-ink-muted">{description}</p> : null}
      <p className="sk-package-fit" data-fits={fit.fits}>
        {fit.fits ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />}
        <span>{fit.label}</span>
      </p>
      <dl className="sk-package-limits">
        {limits.map((limit) => (
          <div key={limit.label}>
            <dt>{limit.label}</dt>
            <dd dir="ltr">{limit.value}</dd>
          </div>
        ))}
      </dl>
      <ul className="sk-package-features">
        {features.map((feature, index) => (
          <li key={index}><Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" /><span className="min-w-0">{feature}</span></li>
        ))}
      </ul>
      <div className="sk-package-action">
        {action}
        {note ? <p className="sk-package-note">{note}</p> : null}
      </div>
    </article>
  );
}
