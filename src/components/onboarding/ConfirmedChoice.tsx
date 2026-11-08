"use client";

import type { ReactNode } from "react";
import { BadgeCheck } from "lucide-react";

/**
 * An answer the owner already gave elsewhere (e.g. single school vs school
 * group, picked at registration), shown as a settled choice instead of an open
 * question: the selected OptionCard look, a "where this came from" tag, an
 * optional note, and one action to reopen the choice.
 */
export type ConfirmedChoiceProps = {
  title: string;
  description: string;
  /** Where the answer came from ("Chosen when you created your account"). */
  tag: string;
  note?: string;
  art?: ReactNode;
  /** Reopens the choice (a link-style Button). */
  action?: ReactNode;
};

export function ConfirmedChoice({ title, description, tag, note, art, action }: ConfirmedChoiceProps) {
  return (
    <div className="sk-option sk-confirmed-choice" data-confirmed="">
      <span className="sk-option-art" aria-hidden="true">{art}</span>
      <div className="min-w-0 flex-1">
        <p className="sk-choice-tag">
          <BadgeCheck aria-hidden="true" className="size-3.5 shrink-0" />
          <span>{tag}</span>
        </p>
        <p className="mt-2 text-md font-semibold leading-snug text-ink-strong">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>
        {note ? <p className="mt-2 text-xs leading-relaxed text-ink-subtle">{note}</p> : null}
      </div>
      {action ? <div className="sk-confirmed-choice-action">{action}</div> : null}
    </div>
  );
}
