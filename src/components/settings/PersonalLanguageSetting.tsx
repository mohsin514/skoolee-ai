"use client";
import { useEffect, useState } from "react";
import { Check, Loader2, Lock, School } from "lucide-react";
import { getPersonalLanguage, saveLanguagePreference } from "@/app/actions/locale";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskStatus } from "@/components/ui/task-patterns";
import { LANGUAGE_NATIVE_NAMES } from "@/lib/locale/language-cookie";
import { LANGUAGES, type Language } from "@/lib/locale/package";
import { cn } from "@/lib/utils";

type Personal = Awaited<ReturnType<typeof getPersonalLanguage>>;
type Choice = Language | "";

/** English-language names, shown under each native name so every option is recognisable. */
const ENGLISH_NAMES: Record<Language, string> = { en: "English", ar: "Arabic", ur: "Urdu" };
/** A short tile mark per language, in its own script (a lone alif reads as a Latin "I"). */
const MONOGRAMS: Record<Language, string> = { en: "En", ar: "عر", ur: "ار" };

/**
 * The signed-in user's own display language (design §B.1.5), as radio cards
 * with each language in its own script. "School default" stores null and
 * follows the school/campus policy. Saving applies app-wide at once: the
 * locale root reloads, so <html lang/dir> and any open overlay switch in place.
 * The same column drives the language of notifications sent to this user.
 */
export function PersonalLanguageSetting({ id = "personal-language", lockedReason }: {
  id?: string;
  /** Reserved for a school policy that locks the personal language (design §B.1.6). */
  lockedReason?: string;
}) {
  const t = useUiText();
  const [personal, setPersonal] = useState<Personal | null>(null);
  const [value, setValue] = useState<Choice>("");
  const [saving, setSaving] = useState<Choice | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<"save" | "permission" | null>(null);
  const hintId = `${id}-hint`;

  useEffect(() => {
    let active = true;
    getPersonalLanguage()
      .then(result => { if (active) { setPersonal(result); setValue(result.personal ?? ""); } })
      .catch(() => { if (active) setError("permission"); });
    return () => { active = false; };
  }, []);

  async function change(next: Choice) {
    if (next === value || saving !== null) return;
    const previous = value;
    setValue(next);
    setSaving(next);
    setSaved(false);
    setError(null);
    try {
      await saveLanguagePreference(next || null);
      setPersonal(current => current && { ...current, personal: next || null });
      setSaved(true);
      // LocaleRoot reloads, so <html>, the shell and this modal switch without a reload.
      window.dispatchEvent(new Event("skoolee:locale-change"));
    } catch (failure) {
      setValue(previous);
      setError(failure instanceof Error && failure.message === "permission" ? "permission" : "save");
    } finally {
      setSaving(null);
    }
  }

  const locked = Boolean(lockedReason);
  // Not disabled while saving: that would drop keyboard focus out of the group. change() ignores input until the save settles.
  const disabled = locked || !personal;
  const inherited = personal?.inherited ?? "en";
  const options: { value: Choice; native: string; english: string; lang?: Language }[] = [
    { value: "", native: t("School default"), english: t("Follows your school ({0})", [LANGUAGE_NATIVE_NAMES[inherited]]) },
    ...LANGUAGES.map(lang => ({ value: lang, native: LANGUAGE_NATIVE_NAMES[lang], english: t(ENGLISH_NAMES[lang]), lang })),
  ];

  return (
    <div className="space-y-4">
      {locked ? (
        <p className="flex items-start gap-2.5 rounded-2xl border border-border-subtle bg-surface-subtle px-4 py-3 text-sm font-semibold leading-relaxed text-ink-muted">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{lockedReason}
        </p>
      ) : null}

      {!personal && !error ? (
        <div role="status" aria-busy="true" className="grid gap-3 sm:grid-cols-2">
          <span className="sr-only">{t("Loading…")}</span>
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[76px] w-full rounded-2xl" delay={i * 60} />)}
        </div>
      ) : (
        <fieldset aria-describedby={hintId} aria-busy={saving !== null} disabled={disabled} className="min-w-0">
          <legend className="sr-only">{t("Display language")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map(option => {
              const selected = value === option.value;
              const inputId = `${id}-${option.value || "default"}`;
              return (
                <label key={inputId} htmlFor={inputId}
                  className={cn(
                    "sk-choice-card relative flex min-h-[76px] cursor-pointer items-center gap-3.5 rounded-2xl border bg-white px-4 py-3.5 motion-safe:transition-[border-color,background-color,box-shadow] motion-safe:duration-200",
                    selected ? "border-primary bg-brand-50 shadow-[0_0_0_1px_#8127cf,0_10px_24px_-18px_rgba(129,39,207,0.6)]" : "border-[#e5dcee] hover:border-[#c9b4dd] hover:bg-surface-subtle",
                    disabled && !selected && "cursor-not-allowed opacity-60",
                  )}>
                  <input type="radio" id={inputId} name={id} value={option.value} checked={selected}
                    onChange={() => { void change(option.value); }} className="sr-only" />
                  <span aria-hidden="true" className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                    selected ? "bg-primary text-white" : "bg-brand-100 text-primary")}>
                    {option.lang ? <span lang={option.lang}>{MONOGRAMS[option.lang]}</span> : <School className="size-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span lang={option.lang} className="block text-md font-bold leading-snug text-ink-strong [overflow-wrap:anywhere]">{option.native}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-ink-muted [overflow-wrap:anywhere]">{option.english}</span>
                  </span>
                  <span aria-hidden="true" className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                    selected ? "border-primary bg-primary text-white" : "border-field-border bg-white")}>
                    {saving === option.value ? <Loader2 className="size-3.5 motion-safe:animate-spin" /> : selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <p id={hintId} className="text-sm font-medium text-ink-muted">{t("Applies across Skoolee straight away, and to messages we send you.")}</p>
      {/* Always mounted so the polite announcement fires when the text appears. */}
      <div role="status" aria-live="polite" className="min-h-6">
        {saved ? <TaskStatus>{t("Language saved")}</TaskStatus> : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error === "permission" ? t("Sign in again to change your language.") : t("Couldn't save your language. Try again.")}
        </p>
      ) : null}
    </div>
  );
}
