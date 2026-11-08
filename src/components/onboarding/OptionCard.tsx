"use client";

import { useId, type ReactNode } from "react";

/**
 * One answer to a setup question: a card-sized label around a real, visible
 * native radio (its last direct child, 20px, never sr-only), so getByLabel,
 * .check(), arrow keys and form semantics all stay native. The radio's
 * accessible name is the title; the description is its description. The
 * card shows the shared focus ring (`.sk-choice-card:has(> input:focus-visible)`).
 */
export type OptionCardProps = {
  name: string;
  value: string;
  checked: boolean;
  onSelect(): void;
  title: string;
  description: string;
  art?: ReactNode;
};

export function OptionCard({ name, value, checked, onSelect, title, description, art }: OptionCardProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  return (
    <label className="sk-choice-card sk-option sk-press" data-option={value}>
      <span className="sk-option-art" aria-hidden="true">{art}</span>
      <span className="min-w-0">
        <span id={titleId} className="block text-md font-semibold leading-snug text-ink-strong">{title}</span>
        <span id={descId} className="mt-1 block text-sm leading-relaxed text-ink-muted">{description}</span>
      </span>
      <input
        type="radio"
        className="sk-option-radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        aria-labelledby={titleId}
        aria-describedby={descId}
      />
    </label>
  );
}
