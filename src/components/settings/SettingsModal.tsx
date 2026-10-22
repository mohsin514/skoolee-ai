"use client";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { Languages, Settings, ShieldCheck, UserRound, X, type LucideIcon } from "lucide-react";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { ModalSurface, useModalSurface } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { SecuritySettingsPanel } from "@/components/account-security/SecuritySettingsPanel";
import { PersonalLanguageSetting } from "@/components/settings/PersonalLanguageSetting";
import { ProfileSettingsSection } from "@/components/settings/ProfileSettingsSection";
import { securityCardClass } from "@/components/account-security/TwoFactorCard";
import type { EditableProfile } from "@/components/profile/editable-profile-card";
import { securityUiCopy } from "@/lib/auth/security-ui-copy";
import { directionFor } from "@/lib/locale/language-cookie";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS, type SettingsSection } from "./settings-sections";

const ICONS: Record<SettingsSection, LucideIcon> = { profile: UserRound, language: Languages, security: ShieldCheck };

/**
 * Personal settings as one modal: Profile, Language and Security & sign-in,
 * behind a tabs nav (left on desktop, top on phones; a full-screen sheet there).
 * Visited sections stay mounted, so switching tabs or changing the language —
 * which re-renders everything in the new language and direction — keeps state.
 * Security flows open as dialogs stacked on top; the shared ModalSurface gives
 * each its own focus trap, Escape for the top layer only, and focus restore.
 *
 * Personal only (M105, F22): the school's language and region live in the authority's Settings / School
 * settings (`LocaleSettingsPanel`), and the accountant's review of a currency change is `LocaleCurrencyReview`,
 * mounted in the finance desk — never here.
 */
export function SettingsModal({ initialSection = "profile", onClose, onProfileSaved }: {
  initialSection?: SettingsSection;
  onClose: () => void;
  onProfileSaved?: (profile: EditableProfile) => void;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [visited, setVisited] = useState<Set<SettingsSection>>(() => new Set([initialSection]));
  const [profileDirty, setProfileDirty] = useState(false);
  const tabRefs = useRef<Partial<Record<SettingsSection, HTMLButtonElement | null>>>({});
  const initialFocusRef = useRef<HTMLElement | null>(null);
  const t = useUiText();

  const select = useCallback((next: SettingsSection, focus = false) => {
    setSection(next);
    setVisited(current => current.has(next) ? current : new Set(current).add(next));
    if (focus) tabRefs.current[next]?.focus();
  }, []);

  return (
    <ModalSurface onClose={onClose} size="lg" initialFocusRef={initialFocusRef}
      dirty={profileDirty} dirtyMessage={t("Your profile changes have not been saved. Close without saving?")}
      className="sm:max-w-[920px] max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none max-sm:border-0 sm:h-[min(760px,90dvh)]">
      <SettingsBody section={section} visited={visited} select={select} tabRefs={tabRefs} initialFocusRef={initialFocusRef}
        onProfileSaved={onProfileSaved} onProfileDirty={setProfileDirty} />
    </ModalSurface>
  );
}

function SettingsBody({ section, visited, select, tabRefs, initialFocusRef, onProfileSaved, onProfileDirty }: {
  section: SettingsSection;
  visited: Set<SettingsSection>;
  select: (next: SettingsSection, focus?: boolean) => void;
  tabRefs: React.RefObject<Partial<Record<SettingsSection, HTMLButtonElement | null>>>;
  initialFocusRef: React.RefObject<HTMLElement | null>;
  onProfileSaved?: (profile: EditableProfile) => void;
  onProfileDirty: (dirty: boolean) => void;
}) {
  const { language } = useLocale();
  const t = useUiText();
  const security = securityUiCopy[language];
  const { requestClose, dismissible, titleId } = useModalSurface();
  const dir = directionFor(language);

  const labels: Record<SettingsSection, { title: string; description: string }> = {
    profile: { title: t("Profile"), description: t("Your photo, name and contact details.") },
    language: { title: t("Language"), description: t("Choose the language Skoolee uses for you.") },
    security: { title: security.title, description: security.intro },
  };

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = SETTINGS_SECTIONS.indexOf(section);
    // The list is a column on desktop and a row on phones, so both axes move; the row follows reading direction.
    const forward = ["ArrowDown", dir === "rtl" ? "ArrowLeft" : "ArrowRight"];
    const back = ["ArrowUp", dir === "rtl" ? "ArrowRight" : "ArrowLeft"];
    let next: number | null = null;
    if (forward.includes(event.key)) next = (index + 1) % SETTINGS_SECTIONS.length;
    else if (back.includes(event.key)) next = (index - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = SETTINGS_SECTIONS.length - 1;
    if (next === null) return;
    event.preventDefault();
    select(SETTINGS_SECTIONS[next], true);
  }

  return (
    <div lang={language} dir={dir} data-settings-root className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start gap-3.5 border-b border-brand-100 bg-gradient-to-b from-surface-subtle to-white px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7 sm:pt-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-700 text-white shadow-[0_10px_22px_-12px_rgba(106,31,176,0.8)]">
          <Settings aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold text-primary">{t("Your account")}</p>
          <h2 id={titleId} className="text-xl font-bold leading-tight tracking-tight text-ink-strong sm:text-2xl">{t("Settings")}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={requestClose} disabled={!dismissible} aria-label={t("Close settings")} className="-me-2 shrink-0 text-ink-muted">
          <X aria-hidden="true" className="size-5" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div role="tablist" aria-label={t("Settings sections")} onKeyDown={onTabKey}
          className="grid shrink-0 grid-cols-3 gap-1.5 border-b border-brand-100 bg-surface-subtle p-2.5 md:flex md:w-60 md:flex-col md:gap-1 md:border-b-0 md:border-e md:p-4">
          {SETTINGS_SECTIONS.map(key => {
            const Icon = ICONS[key];
            const selected = key === section;
            return (
              <Button key={key} type="button" variant="ghost" role="tab" id={`settings-tab-${key}`}
                aria-selected={selected} aria-controls={`settings-panel-${key}`} tabIndex={selected ? 0 : -1}
                ref={element => { tabRefs.current[key] = element; if (selected) initialFocusRef.current = element; }}
                onClick={() => select(key)}
                className={cn(
                  "h-auto min-h-14 w-full min-w-0 flex-col gap-1 px-1.5 py-2 text-center text-xs leading-tight md:min-h-12 md:flex-row md:justify-start md:gap-3 md:px-3 md:text-start md:text-sm",
                  selected ? "bg-card text-brand-700 shadow-[0_1px_2px_rgba(120,70,180,0.06),0_6px_16px_-10px_rgba(106,31,176,0.45)] ring-1 ring-brand-200" : "text-ink-muted",
                )}>
                <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg md:size-8",
                  selected ? "bg-primary text-white" : "bg-card text-ink-muted ring-1 ring-border-subtle")}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{labels[key].title}</span>
              </Button>
            );
          })}
        </div>

        <div className="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-surface-subtle">
          {SETTINGS_SECTIONS.map(key => visited.has(key) ? (
            <section key={key} role="tabpanel" id={`settings-panel-${key}`} aria-labelledby={`settings-tab-${key}`} hidden={key !== section}
              className="mx-auto w-full max-w-2xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pt-7">
              <div className="mb-5">
                <h3 className="text-lg font-bold tracking-tight text-ink-strong sm:text-xl">{labels[key].title}</h3>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-ink-muted">{labels[key].description}</p>
              </div>
              {key === "profile" && <ProfileSettingsSection onSaved={onProfileSaved} onDirtyChange={onProfileDirty} />}
              {key === "language" && <LanguageSection />}
              {key === "security" && <SecuritySettingsPanel />}
            </section>
          ) : null)}
        </div>
      </div>
    </div>
  );
}

/**
 * Personal language only (M105, F22). School language and region is institution policy: it lives in the
 * authority's Settings › Language and region (and a campus admin's Campus setup), never in a personal modal.
 */
function LanguageSection() {
  const t = useUiText();
  return (
    <section aria-labelledby="settings-language-heading" className={securityCardClass}>
      <h4 id="settings-language-heading" className="mb-4 text-base font-bold tracking-tight text-ink-strong">{t("Display language")}</h4>
      <PersonalLanguageSetting id="settings-language" />
    </section>
  );
}
