import type { SourceData } from "./types";
import { parseRosterSource, RosterMappingError, type RosterSource } from "./roster-import";
import { sourceStructureApprovalIssues } from "./intake";

/** Reuse reviewed OCR tables; never guess rows from prose or merge unrelated table layouts. */
export function tableFromReviewedSource(data: SourceData): RosterSource {
  if (sourceStructureApprovalIssues(data).length) throw new RosterMappingError("format");
  if (data.mimeType === "text/csv") return parseRosterSource(data.extractedText);
  const tables = (data.sourcePages ?? []).flatMap(page => page.regions ?? []).filter(region => region.kind === "TABLE" && region.table);
  if (!tables.length) throw new RosterMappingError("format");
  const rows: string[][] = [];
  let header: string[] | undefined;
  for (const table of tables) {
    if (!table.reviewed || table.needsReview || !table.table?.rows.length) throw new RosterMappingError("format");
    const [first, ...body] = table.table.rows;
    if (!header) { header = first; rows.push(first); }
    else if (JSON.stringify(first) !== JSON.stringify(header)) throw new RosterMappingError("headers");
    rows.push(...body);
  }
  return parseRosterSource(rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n"));
}

export function rosterFromReviewedSource(data: SourceData): RosterSource {
  if (data.documentKind !== "register") throw new RosterMappingError("format");
  return tableFromReviewedSource(data);
}
