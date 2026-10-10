export { getEffectiveDisplayLocale } from "../foundation-b/locale-action";
const unexpected = async () => { throw new Error("Locale mutation is outside the shell fixture"); };
export const applyLocaleChange = unexpected;
export const getLocaleSettings = unexpected;
export const previewLocaleChange = unexpected;
export const reviewLocaleCurrency = unexpected;
export const saveLanguagePreference = unexpected;
export const setLocaleDelegation = unexpected;
