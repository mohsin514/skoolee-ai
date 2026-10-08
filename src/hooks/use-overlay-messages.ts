"use client";

import { overlayMessages } from "@/lib/ui/overlay-messages";
import { useDocumentLocale } from "./use-document-locale";

export function useOverlayMessages() {
  return overlayMessages[useDocumentLocale().language];
}
