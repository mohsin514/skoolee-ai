"use client";

// ─────────────────────────────────────────────────────────────────
// The school's messaging policy.
//
// Reachable by leadership from the messages page rather than buried in one
// dashboard's settings tab: a super admin, campus admin and principal all
// hold this power, and their consoles are three different screens.
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import type { ChatSettings } from "@/lib/chat/policy";
import { Input as SystemInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SkeletonList } from "@/components/ui/skeleton";
import { useUiText } from "@/components/locale/LocaleProvider";


interface ChatSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type Ui = ReturnType<typeof useUiText>;

const TOGGLES: {
  key: keyof ChatSettings;
  label: (ui: Ui) => string;
  help: (ui: Ui) => string;
}[] = [
  {
    key: "parentToSupport",
    label: (ui) => ui("Guardians may message the office"),
    help: (ui) => ui("Accounts, library and front desk. Leadership and their children's teachers are always reachable."),
  },
  {
    key: "studentToSupport",
    label: (ui) => ui("Students may message the office"),
    help: (ui) => ui("Same departments, for pupils with their own login."),
  },
  {
    key: "parentToParent",
    label: (ui) => ui("Guardians may message each other"),
    help: (ui) => ui("Off by default. Turning this on lets any guardian find any other guardian on the campus."),
  },
  {
    key: "studentToStudent",
    label: (ui) => ui("Students may message each other"),
    help: (ui) => ui("Off by default. Consider your safeguarding policy before enabling pupil-to-pupil messaging."),
  },
  {
    key: "attachmentsEnabled",
    label: (ui) => ui("Allow file attachments"),
    help: (ui) => ui("Images and documents up to 10 MB."),
  },
  {
    key: "quietHoursEnabled",
    label: (ui) => ui("Quiet hours for staff"),
    help: (ui) => ui("Outside these hours a family's message still arrives, but staff are not notified."),
  },
];

export function ChatSettingsDialog({ open, onClose }: ChatSettingsDialogProps) {
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const ui = useUiText();

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/settings");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.success) setSettings(json.settings);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  async function save(next: ChatSettings) {
    setSettings(next);
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/chat/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ? ui(json.error) : ui("Could not save"));
        return;
      }
      setHasSaved(true);
    } catch {
      setError(ui("Could not save — check your connection"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title={ui("Messaging policy")}
      eyebrow={ui("Messaging")}
      subtitle={ui("Applies to everyone in your school.")}
      icon={Settings2}
      size="sm"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p
            className={cn(
              "text-2xs font-bold",
              error ? "text-rose-600" : "text-ink-muted"
            )}
            role={error ? "alert" : "status"}
          >
            {error
              ? error
              : isSaving
                ? ui("Saving…")
                : hasSaved
                  ? ui("Saved")
                  : ui("Changes save as you make them")}
          </p>
          <Button variant="default" size="sm"
            type="button"
            onClick={onClose}

          >
            {ui("Done")}
          </Button>
        </div>
      }
    >
          <div>
            {!settings ? (
              <SkeletonList rows={4} label={ui("Loading")} className="py-2" />
            ) : (
              <div className="space-y-1">
                {TOGGLES.map((toggle) => {
                  const value = Boolean(settings[toggle.key]);
                  return (
                    <div
                      key={toggle.key}
                      className="flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-brand-50/50"
                    >
                      <div className="min-w-0 flex-1">
                        <label
                          htmlFor={`chat-setting-${toggle.key}`}
                          className="block cursor-pointer text-sm font-semibold text-ink-strong"
                        >
                          {toggle.label(ui)}
                        </label>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                          {toggle.help(ui)}
                        </p>
                      </div>

                      <Switch
                        id={`chat-setting-${toggle.key}`}
                        checked={value}
                        onChange={() => save({ ...settings, [toggle.key]: !value })}
                        className="mt-0.5 shrink-0"
                      />
                    </div>
                  );
                })}

                {settings.quietHoursEnabled && (
                  <div className="flex items-center gap-3 rounded-2xl bg-brand-50/60 px-3 py-3">
                    <TimeField
                      id="quiet-start"
                      label={ui("Quiet from")}
                      value={settings.quietHoursStart}
                      onChange={(v) => save({ ...settings, quietHoursStart: v })}
                    />
                    <TimeField
                      id="quiet-end"
                      label={ui("until")}
                      value={settings.quietHoursEnd}
                      onChange={(v) => save({ ...settings, quietHoursEnd: v })}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
    </Modal>
  );
}

function TimeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex-1">
      <label htmlFor={id} className="block text-2xs font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </label>
      <SystemInput
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2"
      />
    </div>
  );
}
