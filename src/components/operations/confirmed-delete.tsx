"use client";

import { useRef, useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Menu } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";

type Preview = { id: string; label: string; count: number; version: string; blocked: boolean };

/** The existing operations row action: preparation never mutates a record. */
export function OperationDelete({ endpoint, record, label, onDeleted }: {
  endpoint: string; record: { id: string; campusId: string }; label: string; onDeleted: () => void;
}) {
  const ui = useUiText();
  const document = endpoint.endsWith("/documents");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const url = `/api/${endpoint}?${new URLSearchParams({ id: record.id, campusId: record.campusId })}`;
  function message(status: number) {
    return ui(status === 401 || status === 403 ? "Your permission changed. Cancel and contact your administrator."
      : status === 409 ? "This record or its dependencies changed. Review it again before deleting."
      : status === 404 ? "This record is no longer available. Cancel and refresh the list."
      : "Deletion could not be confirmed. Your work is kept. Retry safely or cancel.");
  }
  async function prepare() {
    const current = ++generation.current;
    setOpen(true); setPreview(null); setError(null); setPreparing(true);
    try {
      const response = await fetch(`${url}&preview=true`, { method: "DELETE", signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (current !== generation.current) return;
      if (!response.ok || !result.preview) { setError(message(response.status)); return; }
      setPreview(result.preview);
    } catch { if (current === generation.current) setError(message(0)); }
    finally { if (current === generation.current) setPreparing(false); }
  }
  async function confirm() {
    if (!preview || preview.blocked) return;
    setError(null);
    try {
      const response = await fetch(url, { method: "DELETE", headers: { "If-Match": preview.version }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) {
        setError(message(response.status));
        if ([401, 403, 404, 409, 428].includes(response.status)) setPreview(null);
        return;
      }
      setOpen(false);
      toast.success(ui("Record deleted."));
      onDeleted();
    } catch { setError(message(0)); }
  }
  return <>
    <Menu label={ui("More actions")} align="end"
      items={[{ id: "delete", label: ui("Delete"), icon: Trash2, tone: "danger", onSelect: () => { void prepare(); } }]}
      trigger={<IconButton label={ui("More actions")} variant="ghost" data-row-actions><MoreHorizontal aria-hidden="true" /></IconButton>} />
    <ConfirmAction open={open} title={ui("Delete {0}?", [preview?.label ?? label])}
      description={ui(document ? "This document will be removed from the record. Other documents and unsaved work are kept." : "One record will be permanently removed. Related history must be kept; records with dependencies cannot be deleted.")}
      confirmLabel={ui("Delete")} cancelLabel={ui("Keep editing")} tone="danger"
      disabled={preparing || !preview || preview.blocked}
      onConfirm={confirm} onCancel={() => { generation.current++; setOpen(false); }}
      detail={<div className="space-y-3">
        {preparing ? <p role="status">{ui("Checking current permissions and record…")}</p> : null}
        {preview?.blocked ? <p role="alert">{ui("Related records or history prevent deletion. Keep this record and review its dependencies.")}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {!preparing && !preview ? <Button variant="outline" onClick={prepare}>{ui("Review again")}</Button> : null}
      </div>} />
  </>;
}
