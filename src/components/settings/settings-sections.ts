/** The sections of the personal Settings modal, in nav order. */
export const SETTINGS_SECTIONS = ["profile", "language", "security"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Query param that deep-links the Settings modal, e.g. `/parent?settings=security`. */
export const SETTINGS_PARAM = "settings";
export const OPEN_SETTINGS_EVENT = "skoolee:open-settings";

export function parseSettingsSection(value: string | null | undefined): SettingsSection | null {
  return SETTINGS_SECTIONS.find(section => section === value) ?? null;
}

/** Opens the Settings modal on `section` from anywhere in a signed-in shell. */
export function openSettings(section: SettingsSection = "profile") {
  window.dispatchEvent(new CustomEvent<SettingsSection>(OPEN_SETTINGS_EVENT, { detail: section }));
}
