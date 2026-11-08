/**
 * Role re-architecture translation aggregator (§10.10). Every work package keeps its AR/UR keys in its own
 * `p<N>-messages.ts`; this file merges all nine into one Arabic and one Urdu catalog, which
 * `src/lib/locale/ui-messages.ts` consults only for keys the reviewed catalogs do not know (P9-01): a package can add
 * copy, never change what an existing word means across the app.
 *
 * When two packages translate the same EN key differently, the shared-vocabulary owners win, then the earlier
 * package: P9 (shared primitives: toasts, errors, confirmations, notifications) → P2 (navigation and shell labels,
 * seen on every screen) → P1 → P3 → … → P8. That order only makes the result deterministic; a conflict is still a
 * defect, and `tests/locale/catalog-conflicts.test.ts` lists every one with the packages involved.
 */
import { arabicP1Ui, urduP1Ui } from "./p1-messages";
import { arabicP2Ui, urduP2Ui } from "./p2-messages";
import { arabicP3Ui, urduP3Ui } from "./p3-messages";
import { arabicP4Ui, urduP4Ui } from "./p4-messages";
import { arabicP5Ui, urduP5Ui } from "./p5-messages";
import { arabicP6Ui, urduP6Ui } from "./p6-messages";
import { arabicP7Ui, urduP7Ui } from "./p7-messages";
import { arabicP8Ui, urduP8Ui } from "./p8-messages";
import { arabicP9Ui, urduP9Ui } from "./p9-messages";

export type RoleUxPackage = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8" | "P9";

/** Each package's own catalogs, highest precedence first (see the file comment). Exported for the conflict test. */
export const ROLE_UX_CATALOGS: ReadonlyArray<{ pkg: RoleUxPackage; ar: Record<string, string>; ur: Record<string, string> }> = [
  { pkg: "P9", ar: arabicP9Ui, ur: urduP9Ui },
  { pkg: "P2", ar: arabicP2Ui, ur: urduP2Ui },
  { pkg: "P1", ar: arabicP1Ui, ur: urduP1Ui },
  { pkg: "P3", ar: arabicP3Ui, ur: urduP3Ui },
  { pkg: "P4", ar: arabicP4Ui, ur: urduP4Ui },
  { pkg: "P5", ar: arabicP5Ui, ur: urduP5Ui },
  { pkg: "P6", ar: arabicP6Ui, ur: urduP6Ui },
  { pkg: "P7", ar: arabicP7Ui, ur: urduP7Ui },
  { pkg: "P8", ar: arabicP8Ui, ur: urduP8Ui },
];

/** First definition wins, walking the precedence order above. */
function merge(language: "ar" | "ur"): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const catalog of ROLE_UX_CATALOGS) {
    for (const [key, value] of Object.entries(catalog[language])) if (!(key in merged)) merged[key] = value;
  }
  return merged;
}

export const arabicRoleUxUi: Record<string, string> = merge("ar");
export const urduRoleUxUi: Record<string, string> = merge("ur");
