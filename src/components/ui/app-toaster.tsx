"use client";

import { useDocumentLocale } from "@/hooks/use-document-locale";
import { Toaster } from "sonner";

const labels = {
  en: { notifications: "Notifications", close: "Close notification" },
  ar: { notifications: "الإشعارات", close: "إغلاق الإشعار" },
  ur: { notifications: "اطلاعات", close: "اطلاع بند کریں" },
} as const;

/** The root toaster sits above page LocaleProviders, which publish to html. */
export function AppToaster() {
  const { language, dir } = useDocumentLocale();
  const copy = labels[language];

  return <Toaster
    position="bottom-center"
    richColors
    closeButton
    visibleToasts={3}
    dir={dir}
    containerAriaLabel={copy.notifications}
    mobileOffset={{
      bottom: "calc(74px + env(safe-area-inset-bottom, 0px))",
      top: 16,
      left: 16,
      right: 16,
    }}
    toastOptions={{
      duration: 5000,
      className: "skoolee-toast",
      closeButtonAriaLabel: copy.close,
    }}
  />;
}
