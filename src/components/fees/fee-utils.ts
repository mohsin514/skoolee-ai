import type { InvoiceStatus } from "./fee-types";
import { csvCell } from "@/lib/csv";

export function formatPKR(paisa: number): string {
  return `Rs ${(paisa / 100).toLocaleString("en-PK")}`;
}

export function paisaToRupees(paisa: number): number {
  return paisa / 100;
}

export function rupeesToPaisa(rupees: number): number {
  return Math.round(rupees * 100);
}

export function statusBadgeClass(status: InvoiceStatus | string): string {
  switch (status) {
    case "PAID":
      return "bg-emerald-50 text-emerald-600";
    case "PARTIAL":
      return "bg-amber-50 text-amber-600";
    case "PENDING":
      return "bg-blue-50 text-blue-600";
    case "OVERDUE":
      return "bg-rose-50 text-rose-600";
    case "CANCELLED":
      return "bg-gray-100 text-gray-500";
    default:
      return "bg-gray-100 text-gray-500";
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

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-PK", { month: "long", year: "numeric" });
}

export function classLabel(name: string, section?: string | null): string {
  return section ? `${name} ${section}` : name;
}

export function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Cash",
    bank_transfer: "Bank Transfer",
    card: "Card",
    mobile_wallet: "Mobile Wallet",
    cheque: "Cheque",
  };
  return labels[method] ?? method;
}

export const API = "/api/fees";
