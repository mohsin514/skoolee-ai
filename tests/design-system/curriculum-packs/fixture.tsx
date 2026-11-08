import { createRoot } from "react-dom/client";
import { CurriculumPacks } from "../../../src/components/curriculum/CurriculumPacks";
import { CurriculumCatalogue } from "../../../src/components/owner/CurriculumCatalogue";
import { StaticLocaleProvider } from "../../../src/components/locale/LocaleProvider";
import { defaultLocale } from "../../../src/lib/locale/package";

const params = new URL(location.href).searchParams;
const language = params.get("language") as "en" | "ar" | "ur";
const view = params.get("view");
createRoot(document.getElementById("root")!).render(<StaticLocaleProvider value={{ ...defaultLocale, language }}>{view === "owner" ? <CurriculumCatalogue /> : <CurriculumPacks />}</StaticLocaleProvider>);
