"use client";

import { use, type ReactNode } from "react";
import { isUiCatalogReady, loadUiCatalog, type UiCatalogScope } from "@/lib/locale/ui-translate";
import type { Language } from "@/lib/locale/package-core";

/**
 * SKAI-1004: suspends until the AR/UR UI catalog is loaded. During hydration React
 * keeps the server-rendered Arabic/Urdu HTML until it arrives, so nothing flashes
 * English. English renders straight through and never fetches the catalog.
 */
export function UiCatalogGate({ language, scope = "full", children }: { language: Language; scope?: UiCatalogScope; children: ReactNode }) {
  if (!isUiCatalogReady(language, scope)) use(loadUiCatalog(language, scope));
  return <>{children}</>;
}
