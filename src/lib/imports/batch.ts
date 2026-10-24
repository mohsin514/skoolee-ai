export type ImportRowState = "ACCEPTED" | "REJECTED" | "SKIPPED" | "UNRESOLVED";

export type ImportRow = {
  rowNumber: number;
  source: Record<string, string>;
  proposal: Record<string, unknown> | null;
  state: ImportRowState;
  selected: boolean;
  matchKey: string | null;
  matchLabel?: string | null;
  errors: string[];
  result?: Record<string, unknown>;
};

export function summarizeImportRows(rows: ImportRow[]) {
  const counts = { total: rows.length, accepted: 0, rejected: 0, skipped: 0, unresolved: 0 };
  for (const row of rows) {
    if (row.state === "REJECTED") counts.rejected++;
    else if (row.state === "UNRESOLVED") counts.unresolved++;
    else if (row.state === "SKIPPED" || !row.selected) counts.skipped++;
    else counts.accepted++;
  }
  return counts;
}

export function isoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
