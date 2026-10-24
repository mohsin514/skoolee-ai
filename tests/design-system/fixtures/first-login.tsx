import React from "react";
import { createRoot } from "react-dom/client";
import FirstLoginPage from "@/app/(auth)/first-login/page";
import { AuthLocaleProvider } from "@/components/locale/AuthLocaleProvider";

// The (auth) layout seeds the language from the cookie; here the served <html lang> stands in for it.
const initial = (["en", "ar", "ur"] as const).find(l => l === document.documentElement.lang) ?? "en";
createRoot(document.getElementById("first-login-fixture")!).render(<AuthLocaleProvider initialLanguage={initial}><FirstLoginPage /></AuthLocaleProvider>);
