// SKAI-380: validate the invoice list query so bad filters return 400 instead of reaching Prisma.
export const INVOICE_STATUSES = ["PENDING", "PAID", "PARTIAL", "OVERDUE", "CANCELLED"] as const;
export type InvoiceListStatus = (typeof INVOICE_STATUSES)[number];

export type InvoiceListFilterResult =
  | { ok: true; status: InvoiceListStatus | null; month: string | null }
  | { ok: false; fieldErrors: Record<string, string[]> };

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseInvoiceListFilters(searchParams: URLSearchParams): InvoiceListFilterResult {
  const fieldErrors: Record<string, string[]> = {};

  const rawStatus = searchParams.get("status");
  let status: InvoiceListStatus | null = null;
  if (rawStatus) {
    if ((INVOICE_STATUSES as readonly string[]).includes(rawStatus)) {
      status = rawStatus as InvoiceListStatus;
    } else {
      fieldErrors.status = [`status must be one of ${INVOICE_STATUSES.join(", ")}`];
    }
  }

  const rawMonth = searchParams.get("month");
  let month: string | null = null;
  if (rawMonth) {
    if (MONTH_PATTERN.test(rawMonth)) {
      month = rawMonth;
    } else {
      fieldErrors.month = ["month must be in YYYY-MM format"];
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, status, month };
}
