import { defaultLocale } from "../../../src/lib/locale/package";

// The fixture exercises client components without loading a server action/DB.
export async function getEffectiveDisplayLocale() { return defaultLocale; }
