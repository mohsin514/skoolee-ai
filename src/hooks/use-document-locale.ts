"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!observer) {
    observer = new MutationObserver(() => listeners.forEach(listener => listener()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang", "dir"] });
  }
  return () => {
    listeners.delete(onChange);
    if (!listeners.size) { observer?.disconnect(); observer = undefined; }
  };
}

function snapshot() {
  const { lang, dir } = document.documentElement;
  return `${lang}|${dir}`;
}

/** Root LocaleProviders publish here; overlays also live outside their trees. */
export function useDocumentLocale() {
  const [tag, direction] = useSyncExternalStore(subscribe, snapshot, () => "en|ltr").split("|");
  const base = tag.toLowerCase().split("-")[0];
  const language = base === "ar" || base === "ur" ? base : "en";
  const dir = direction === "ltr" || direction === "rtl" ? direction : language === "en" ? "ltr" : "rtl";
  return { language, dir } as const;
}
