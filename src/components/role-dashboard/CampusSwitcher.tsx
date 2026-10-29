"use client";

import { useEffect, useState } from "react";
import { Building2, Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ModalSurface } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";

interface CampusOption { id: string; name: string; city: string }

/**
 * SKAI-1113: the SUPER_ADMIN campus switcher in the shell header. "All campuses" (the default) keeps the
 * school-wide view; a campus narrows every campus-scoped read to it. The server validates the choice.
 */
export function CampusSwitcher() {
  const t = useUiText();
  const [campuses, setCampuses] = useState<CampusOption[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/super/active-campus", { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(body => { if (live && body?.data) { setCampuses(body.data.campuses ?? []); setActiveId(body.data.activeCampusId ?? null); } })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (campuses.length < 2) return null;
  const active = campuses.find(campus => campus.id === activeId) ?? null;
  const label = active ? active.name : t("All campuses");

  async function choose(campusId: string | null) {
    setOpen(false);
    if (campusId === activeId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/super/active-campus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campusId }) });
      if (!response.ok) throw new Error();
      // Every console panel reads through campusScope on the server, so a reload is the honest refresh.
      window.location.reload();
    } catch {
      setSaving(false);
      toast.error(t("Could not switch campus. Try again."));
    }
  }

  const options: Array<{ id: string | null; name: string; detail?: string }> = [
    { id: null, name: t("All campuses"), detail: t("School-wide view") },
    ...campuses.map(campus => ({ id: campus.id, name: campus.name, detail: campus.city })),
  ];

  return (
    <>
      <Button
        variant="choice"
        size="sm"
        type="button"
        data-campus-switcher=""
        aria-label={t("Change campus, viewing {0}", [label])}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={saving}
        onClick={() => setOpen(true)}
        className="min-h-11 min-w-0 max-w-[14rem] justify-between gap-2 px-3 text-start"
      >
        <Building2 aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
        <bdi className="block min-w-0 flex-1 truncate text-sm font-semibold text-ink-strong">{label}</bdi>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
      </Button>
      {open && <ModalSurface ariaLabel={t("Choose campus")} onClose={() => setOpen(false)}>
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle p-3">
          <h2 className="text-lg font-bold text-ink-strong">{t("Choose campus")}</h2>
          <IconButton label={t("Close")} tooltip={false} onClick={() => setOpen(false)}><X aria-hidden="true" /></IconButton>
        </div>
        <p className="px-3 pt-3 text-sm text-ink-muted">{t("Every page follows the campus you choose.")}</p>
        <div className="min-h-0 space-y-2 overflow-y-auto p-3">
          {options.map(option => {
            const selected = option.id === (active?.id ?? null);
            return (
              <Button
                variant="choice"
                key={option.id ?? "all"}
                type="button"
                aria-pressed={selected}
                onClick={() => void choose(option.id)}
                className="w-full min-w-0 items-center justify-between gap-3 px-3 py-2 text-start"
              >
                <span className="flex min-w-0 flex-col items-start gap-1">
                  <bdi className="max-w-full text-sm font-semibold text-ink-strong [overflow-wrap:anywhere]">{option.name}</bdi>
                  {option.detail && <bdi className="max-w-full text-xs font-medium text-ink-muted [overflow-wrap:anywhere]">{option.detail}</bdi>}
                </span>
                {selected ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary" /> : null}
              </Button>
            );
          })}
        </div>
      </ModalSurface>}
    </>
  );
}
