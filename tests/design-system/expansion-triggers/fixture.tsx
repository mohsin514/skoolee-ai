import { createRoot } from "react-dom/client";
import ExpansionTriggersPage from "../../../src/app/owner/expansion/triggers/page";
import { StaticLocaleProvider } from "../../../src/components/locale/LocaleProvider";
import { defaultLocale } from "../../../src/lib/locale/package";

const language = new URL(location.href).searchParams.get("language") as "en" | "ar" | "ur";
createRoot(document.getElementById("root")!).render(<StaticLocaleProvider value={{ ...defaultLocale, language }}><ExpansionTriggersPage /></StaticLocaleProvider>);
