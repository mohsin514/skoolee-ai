"use client";

// ─────────────────────────────────────────────────────────────────
// The school's messaging policy.
//
// Reachable by leadership from the messages page rather than buried in one
// dashboard's settings tab: a super admin, campus admin and principal all
// hold this power, and their consoles are three different screens.
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import type { ChatSettings } from "@/lib/chat/policy";
import { Input as SystemInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";


interface ChatSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const TOGGLES: {
  key: keyof ChatSettings;
  label: string;
  help: string;
}[] = [
  {
    key: "parentToSupport",
    label: "Guardians may message the office",
    help: "Accounts, library and front desk. Leadership and their children's teachers are always reachable.",
  },
  {
    key: "studentToSupport",
    label: "Students may message the office",
    help: "Same departments, for pupils with their own login.",
  },
  {
    key: "parentToParent",
    label: "Guardians may message each other",
    help: "Off by default. Turning this on lets any guardian find any other guardian on the campus.",
  },
  {
    key: "studentToStudent",
    label: "Students may message each other",
    help: "Off by default. Consider your safeguarding policy before enabling pupil-to-pupil messaging.",
  },
  {
    key: "attachmentsEnabled",
    label: "Allow file attachments",
    help: "Images and documents up to 10 MB.",
  },
  {
    key: "quietHoursEnabled",
    label: "Quiet hours for staff",
    help: "Outside these hours a family's message still arrives, but staff are not notified.",
  },
];

export function ChatSettingsDialog({ open, onClose }: ChatSettingsDialogProps) {
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSaved, setHasSaved] = useState(false);

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
        setError(json.error ?? "Could not save");
        return;
      }
      setHasSaved(true);
    } catch {
      setError("Could not save — check your connection");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title="Messaging policy"
      eyebrow="Messaging"
      subtitle="Applies to everyone in your school."
      icon={Settings2}
      size="sm"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p
            className={cn(
              "text-[11px] font-bold",
              error ? "text-rose-600" : "text-ink-muted"
            )}
            role={error ? "alert" : "status"}
          >
            {error
              ? error
              : isSaving
                ? "Saving…"
                : hasSaved
                  ? "Saved"
                  : "Changes save as you make them"}
          </p>
          <Button variant="default" size="sm"
            type="button"
            onClick={onClose}

          >
            Done
          </Button>
        </div>
      }
    >
          <div>
            {!settings ? (
              <p className="flex items-center justify-center gap-2 py-10 text-xs font-bold text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading
              </p>
            ) : (
              <div className="space-y-1">
                {TOGGLES.map((toggle) => {
                  const value = Boolean(settings[toggle.key]);
                  return (
                    <div
                      key={toggle.key}
                      className="flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-[#fbf0fe]/50"
                    >
                      <div className="min-w-0 flex-1">
                        <label
                          htmlFor={`chat-setting-${toggle.key}`}
                          className="block cursor-pointer text-xs font-black text-[#1f1a23]"
                        >
                          {toggle.label}
                        </label>
                        <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-ink-muted">
                          {toggle.help}
                        </p>
                      </div>

                      <Button variant="choice" size="icon"
                        id={`chat-setting-${toggle.key}`}
                        type="button"
                        role="switch"
                        aria-checked={value}
                        onClick={() => save({ ...settings, [toggle.key]: !value })}
                        className="mt-0.5 shrink-0"
                      >
                        <span
                          className={cn(
                            "block h-5 w-5 rounded-full bg-current transition-opacity",
                            value ? "opacity-100" : "opacity-25"
                          )}
                          aria-hidden
                        />
                      </Button>
                    </div>
                  );
                })}

                {settings.quietHoursEnabled && (
                  <div className="flex items-center gap-3 rounded-2xl bg-[#fbf0fe]/60 px-3 py-3">
                    <TimeField
                      id="quiet-start"
                      label="Quiet from"
                      value={settings.quietHoursStart}
                      onChange={(v) => save({ ...settings, quietHoursStart: v })}
                    />
                    <TimeField
                      id="quiet-end"
                      label="until"
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
      <label htmlFor={id} className="block text-[10px] font-black uppercase tracking-wide text-ink-faint">
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
