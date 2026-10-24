"use client";

import type { ReactNode } from "react";
import { PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The review step as one letterhead document of numbered articles. Each
 * article has its folio ("01"), a title (h2), an optional "Needs attention"
 * flag and an "Edit" jump whose accessible name names the section
 * ("Edit Package"; the visible word is part of it). Rows are dot-leader
 * ledger lines; values keep their normal case (labels alone are uppercase).
 */
export type ReviewArticleProps = {
  index: number;
  id: string;
  title: string;
  edit?: { label: string; text: string; onClick(): void; disabled?: boolean };   // label: aria-label; text: visible "Edit"
  attention?: string;
  wide?: boolean;
  children: ReactNode;
};

export function ReviewArticle({ index, id, title, edit, attention, wide, children }: ReviewArticleProps) {
  return (
    <section aria-labelledby={id} className="sk-charter-article" data-attention={attention ? "" : undefined} data-wide={wide ? "" : undefined}>
      <div className="sk-charter-article-head">
        <h2 id={id} className="flex min-w-0 flex-1 items-baseline gap-2.5 text-md font-bold leading-snug text-ink-strong">
          <span aria-hidden="true" className="sk-folio text-primary">{String(index).padStart(2, "0")}</span>
          <span className="min-w-0">{title}</span>
        </h2>
        {attention ? <Badge variant="warning" size="sm" dot className="shrink-0">{attention}</Badge> : null}
        {edit ? (
          <Button variant="ghost" size="sm" type="button" aria-label={edit.label} onClick={edit.onClick} disabled={edit.disabled} className="-my-1.5 shrink-0 gap-1.5 px-2.5 text-primary disabled:bg-transparent disabled:text-ink-faint">
            <PencilLine aria-hidden="true" className="size-3.5" />
            {edit.text}
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function LedgerList({ children }: { children: ReactNode }) {
  return <dl className="sk-ledger">{children}</dl>;
}

export type LedgerRowProps = { label: string; value: ReactNode; ltr?: boolean };

export function LedgerRow({ label, value, ltr }: LedgerRowProps) {
  return (
    <div className="sk-ledger-row">
      <dt className="sk-eyebrow">{label}</dt>
      <span data-leader="" aria-hidden="true" />
      <dd>{ltr ? <bdi dir="ltr">{value}</bdi> : value}</dd>
    </div>
  );
}
