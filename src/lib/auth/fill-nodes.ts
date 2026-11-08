import { Fragment, createElement, type ReactNode } from "react";

const SLOT = /\{(\d+)\}/;

/**
 * Splits a translated template on `{0}`, `{1}`… and drops the given nodes
 * into the slots, so word order stays the translator's:
 *   fillNodes("…setting up {0}.", <bdi>Horizon</bdi>) → ["…setting up ", <bdi key/>, "."]
 * Each node is wrapped in a keyed fragment, so the array renders without key warnings.
 */
export function fillNodes(template: string, ...nodes: ReactNode[]): ReactNode[] {
  const parts = template.split(SLOT);
  const out: ReactNode[] = [];
  parts.forEach((part, index) => {
    if (index % 2 === 0) {
      if (part) out.push(part);
      return;
    }
    out.push(createElement(Fragment, { key: `slot-${index}` }, nodes[Number(part)] ?? null));
  });
  return out;
}

/** Plain-string counterpart: fillText("Try again in {0}s", 12) → "Try again in 12s". */
export function fillText(template: string, ...values: Array<string | number>): string {
  return template.replace(/\{(\d+)\}/g, (_match, index: string) => String(values[Number(index)] ?? ""));
}
