"use client";

import { useState, type CSSProperties } from "react";
import { ArrowRight, Languages, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/layout/header";
import { EditableProfileCard } from "@/components/profile/editable-profile-card";
import { LocaleSettingsPanel } from "@/components/settings/LocaleSettingsPanel";
import { openSettings, type SettingsSection } from "@/components/settings/settings-sections";
import { useUiText } from "@/components/locale/LocaleProvider";
import { InstitutionSettingsPanel } from "@/components/settings/InstitutionSettingsPanel";

/** Roles for whom the institution record is administrative context worth showing. */
const INSTITUTION_ROLES = new Set(["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"]);

/** Open the Settings modal (hosted by the dashboard layout) straight on a section. */
const SHORTCUTS: { section: SettingsSection; icon: typeof Languages; label: string; hint: string }[] = [
  { section: "language", icon: Languages, label: "Language", hint: "Choose the language Skoolee uses for you." },
  { section: "security", icon: ShieldCheck, label: "Security & sign-in", hint: "Password, two-factor and signed-in devices." },
];

/** Account details only the campus administrator can change. */
const PROTECTED_FIELDS = ["Role", "Email", "Permissions"];

const delay = (ms: number) => ({ "--sk-delay": `${ms}ms` }) as CSSProperties;

export default function SettingsPage() {
  // Learned from the profile the card already loads, rather than a second fetch.
  const [role, setRole] = useState<string | null>(null);
  const t = useUiText();

  return (
    <div className="flex flex-col h-full">
      <Header title={t("Account Settings")} description={t("Update your profile photo, display name, and contact details.")} />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
        <div className="grid max-w-6xl grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <EditableProfileCard onSaved={(profile) => setRole(profile.role ?? null)} />

          <aside className="min-w-0 space-y-4">
            <section aria-labelledby="settings-shortcuts-heading" className="sk-panel sk-enter p-5 sm:p-6" style={delay(80)}>
              <h2 id="settings-shortcuts-heading" className="text-lg font-bold tracking-tight text-ink-strong">{t("Settings")}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t("Language, password, two-factor authentication and signed-in devices.")}</p>
              <div className="mt-4 space-y-2">
                {SHORTCUTS.map(({ section, icon: Icon, label, hint }) => (
                  <Button key={section} type="button" variant="outline" onClick={() => openSettings(section)}
                    className="group sk-nudge-trigger h-auto min-h-14 w-full justify-start gap-3 px-4 py-3 text-start">
                    <span aria-hidden="true" className="sk-icon-tile flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-primary"><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-strong">{t(label)}</span>
                      <span className="block text-xs font-normal leading-relaxed text-ink-muted">{t(hint)}</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="sk-nudge rtl:-scale-x-100" />
                  </Button>
                ))}
              </div>
            </section>
            <Card variant="muted" className="sk-enter p-5 sm:p-6" style={delay(160)}>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                <ShieldCheck aria-hidden="true" className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-ink-strong">{t("Protected fields")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {t("Role, email, and account permissions are managed by your campus administrator and cannot be changed here.")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {PROTECTED_FIELDS.map((field) => (
                  <Badge key={field} variant="outline" size="sm">{t(field)}</Badge>
                ))}
              </div>
            </Card>
          </aside>
        </div>

        {role && INSTITUTION_ROLES.has(role) ? (
          <div className="sk-enter mt-6 max-w-6xl">
            <div className="mb-4">
              <h2 className="text-lg font-bold tracking-tight text-ink-strong">{t("Institution")}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                {t("School and campus records. What you can change depends on the campus you administer.")}
              </p>
            </div>
            <InstitutionSettingsPanel />
            <div className="mt-6"><LocaleSettingsPanel /></div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
