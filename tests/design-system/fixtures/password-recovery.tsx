import React from "react";
import { createRoot } from "react-dom/client";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import { AuthLocaleProvider } from "@/components/locale/AuthLocaleProvider";

// The (auth) layout seeds the language from the cookie; here the served <html lang> stands in for it.
const initial = (["en", "ar", "ur"] as const).find(l => l === document.documentElement.lang) ?? "en";
createRoot(document.getElementById("recovery-fixture")!).render(<AuthLocaleProvider initialLanguage={initial}><ForgotPasswordPage /></AuthLocaleProvider>);
