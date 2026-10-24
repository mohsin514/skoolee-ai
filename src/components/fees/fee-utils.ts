import { useEffect, useRef } from "react";
import { defaultLocale, formatMoney, minorUnits, parseMoney } from "@/lib/locale/package";
import type { InvoiceStatus, PanelCommand } from "./fee-types";
import { csvCell } from "@/lib/csv";

/**
 * Formats minor units with the platform default locale. Screens use `useLocaleFormat().money`, which follows the
 * school's locale package; this stays for exports and non-React callers.
 * @deprecated Prefer `useLocaleFormat().money` (role-ux R7: money through the locale package).
 */
export function formatPKR(paisa: number, currency = "PKR"): string {
  return formatMoney({ minor: paisa, currency }, defaultLocale);
}

/**
 * Commands a handler has already run, across mounts. A console or admin view may keep its last header command in
 * state while a panel unmounts (another tab or view) and mounts again; without this, the remounted panel would run
 * the same "Record payment" or export a second time by itself (P8-02). A new press is a new object, so it runs.
 * A parent that forwards a command to a child panel forwards a copy (`forwardCommand`), never the consumed object.
 */
const consumedCommands = new WeakSet<PanelCommand>();

/** A fresh command object for a child panel (the parent's own handler has consumed the original). */
export function forwardCommand(command: PanelCommand | null | undefined, id?: string): PanelCommand | null {
  return command ? { id: id ?? command.id, nonce: command.nonce } : null;
}

/**
 * Runs `handlers[command.id]` once per command (see `PanelCommand`), never again after the panel remounts. While
 * `ready` is false (the panel's data is still loading) the command waits, so a header action pressed during a load
 * acts on the loaded data instead of reporting "nothing here" or doing nothing. A command this hook has no handler
 * for is left for another hook or panel.
 */
export function usePanelCommand(command: PanelCommand | null | undefined, handlers: Record<string, () => void>, ready = true) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!ready || !command || consumedCommands.has(command)) return;
    const handler = latest.current[command.id];
    if (!handler) return;
    consumedCommands.add(command);
    handler();
  }, [command, ready]);
}

export function paisaToRupees(paisa: number, currency = "PKR"): number {
  return paisa / (10 ** minorUnits(currency));
}

export function rupeesToPaisa(rupees: number | string, currency = "PKR"): number {
  return parseMoney(String(rupees), currency).minor;
}

export function statusBadgeClass(status: InvoiceStatus | string): string {
  switch (status) {
    case "PAID":
      return "bg-status-success-surface text-status-success-text";
    case "PARTIAL":
      return "bg-status-warning-surface text-status-warning-text";
    case "PENDING":
      return "bg-status-info-surface text-status-info-text";
    case "OVERDUE":
      return "bg-status-error-surface text-status-error-text";
    default:
      return "bg-surface-subtle text-ink-muted";
  }
}

export function exportCSV(rows: Record<string, string | number>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map((row) =>
      headers.map((h) => csvCell(row[h])).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Exports and fallbacks only; screens use `useLocaleFormat().date` (school locale package). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function classLabel(name: string, section?: string | null): string {
  return section ? `${name} ${section}` : name;
}

export function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Cash",
    bank_transfer: "Bank transfer",
    card: "Card",
    mobile_wallet: "Mobile wallet",
    cheque: "Cheque",
  };
  const key = (method ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (labels[key]) return labels[key];
  // Unknown codes such as "ONLINE_GATEWAY" read as "Online gateway", never raw.
  const words = key.split("_").filter(Boolean).join(" ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : method;
}

export const API = "/api/fees";
