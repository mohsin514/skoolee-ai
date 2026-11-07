"use client";

import { use, type ReactNode } from "react";
import { isUiCatalogReady, loadUiCatalog } from "@/lib/locale/ui-translate";
import type { Language } from "@/lib/locale/package";

/**
 * SKAI-1004: suspends until the AR/UR UI catalog is loaded. During hydration React
 * keeps the server-rendered Arabic/Urdu HTML until it arrives, so nothing flashes
 * English. English renders straight through and never fetches the catalog.
 */
export function UiCatalogGate({ language, children }: { language: Language; children: ReactNode }) {
  if (!isUiCatalogReady(language)) use(loadUiCatalog(language));
  return <>{children}</>;
}
