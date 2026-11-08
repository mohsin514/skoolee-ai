"use client";

import { useFreshValue } from "./use-fresh-value";
import { SealSlot, type SealState } from "./SealSlot";

/**
 * The cover's foot: a dot-leader ledger of everything set so far (type, use,
 * city, package, campuses, session, week) that ends in the empty seal slot.
 * A value inks in once when it changes (not on mount); an unset value is a
 * short dashed rule; a row whose step needs attention is underlined in
 * warning. Decorative and text-only (the cover is aria-hidden): no links, no
 * buttons, no ids, no campus names, no live regions.
 */
export type CharterLedgerRow = { key: string; label: string; value?: string | null; ltr?: boolean; flag?: boolean };

export type CharterLedgerProps = {
  title: string;
  rows: CharterLedgerRow[];
  seal: { state: SealState; caption: string };
};

function LedgerLine({ row }: { row: CharterLedgerRow }) {
  const value = row.value?.trim() ? row.value : null;
  const fresh = useFreshValue(value);
  return (
    <div className="sk-charter-row" data-empty={value ? undefined : ""} data-fresh={fresh ? "" : undefined} data-flag={row.flag ? "" : undefined}>
      <dt className="sk-folio">{row.label}</dt>
      <span aria-hidden="true" className="sk-leader" />
      <dd>{value ? row.ltr ? <bdi dir="ltr">{value}</bdi> : value : null}</dd>
    </div>
  );
}

export function CharterLedger({ title, rows, seal }: CharterLedgerProps) {
  const freshCaption = useFreshValue(seal.caption);
  return (
    <div className="sk-charter-ledger">
      <div className="sk-charter-ledger-head">
        <p className="sk-folio">{title}</p>
        <span aria-hidden="true" className="sk-cover-rule" />
      </div>
      <dl className="sk-charter-rows">
        {rows.map((row) => <LedgerLine key={row.key} row={row} />)}
      </dl>
      <div className="sk-charter-seal" data-state={seal.state}>
        <SealSlot tone="cover" state={seal.state} size={48} />
        <p className="sk-folio" data-fresh={freshCaption ? "" : undefined}>{seal.caption}</p>
      </div>
    </div>
  );
}
