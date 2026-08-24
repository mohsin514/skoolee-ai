"use client";

// ─────────────────────────────────────────────────────────────────
// The school's messaging policy.
//
// Reachable by leadership from the messages page rather than buried in one
// dashboard's settings tab: a super admin, campus admin and principal all
// hold this power, and their consoles are three different screens.
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatSettings } from "@/lib/chat/policy";
import { ChatPortal } from "./chat-portal";

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
    <ChatPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1f1a23]/40 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-settings-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#cfc2d6]/25 px-5 py-4">
            <div>
              <h2 id="chat-settings-title" className="text-sm font-black text-[#1f1a23]">
                Messaging policy
              </h2>
              <p className="mt-0.5 text-[11px] font-semibold text-ink-muted">
                Applies to everyone in your school.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="cursor-pointer rounded-xl p-1.5 text-ink-muted transition-colors hover:bg-[#fbf0fe] hover:text-[#8127cf]"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
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

                      <button
                        id={`chat-setting-${toggle.key}`}
                        type="button"
                        role="switch"
                        aria-checked={value}
                        onClick={() => save({ ...settings, [toggle.key]: !value })}
                        className={cn(
                          "mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors",
                          value ? "bg-[#8127cf]" : "bg-[#cfc2d6]/60"
                        )}
                      >
                        <span
                          className={cn(
                            "block h-5 w-5 rounded-full bg-white shadow transition-transform",
                            value && "translate-x-5"
                          )}
                          aria-hidden
                        />
                      </button>
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

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#cfc2d6]/25 px-5 py-3">
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
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl bg-[#8127cf] px-4 py-2 text-[11px] font-black text-white transition-all hover:bg-[#6a1fb0] active:scale-95"
            >
              Done
            </button>
          </footer>
        </div>
      </div>
    </ChatPortal>
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
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[#cfc2d6]/30 bg-white px-3 py-2 text-xs font-bold text-ink focus:border-[#8127cf]/40 focus:outline-none focus:ring-2 focus:ring-[#8127cf]/20"
      />
    </div>
  );
}
