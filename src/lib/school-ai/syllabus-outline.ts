/**
 * SKO-500 (SKO-408 slice 1): the syllabus outline, from an uploaded SOURCE to proposed outcomes.
 *
 * Pure. Two producers feed one shape:
 * - `outlineFromPages` reads unit headings and numbered or bulleted lines with fixed rules, so a school
 *   with no AI provider (and every test) still gets an outline. It never invents text: every title is
 *   the line it came from.
 * - an AI proposal is accepted only through `verifyOutlineSuggestions`, which keeps a suggestion only
 *   when its excerpt is found, word for word (whitespace folded), on the page it cites.
 *
 * `curriculumFromOutline` turns the teacher's accepted rows into a draft CURRICULUM body that cites the
 * SOURCE revision and carries the approval bundle, so one approval covers both records.
 */
import type { CurriculumData } from "./assessment";

export interface OutlinePage { page: number; text: string }
export interface OutlineSuggestion { id: string; unit: string; title: string; code?: string; page: string; excerpt: string }
export interface RawOutlineSuggestion { unit?: unknown; title?: unknown; code?: unknown; page?: unknown; excerpt?: unknown }

/** Rules-only producer name, stored as the proposal's `model` so a reader can tell the two apart. */
export const OUTLINE_RULES_MODEL = "skoolee-outline-rules-v1";
export const MAX_OUTLINE_SUGGESTIONS = 200;

const fold = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** A short, stable identifier (FNV-1a), valid for `workspaceIdSchema`. Same input, same id, on every run. */
export function outlineId(...parts: Array<string | number>): string {
  let hash = 0x811c9dc5;
  for (const char of parts.join("\u0001")) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 0x01000193) >>> 0; }
  return `ol-${hash.toString(36)}`;
}

// "Unit 3: Forces", "Chapter 2 - Cells", "Topic 4. Light"; Arabic and Urdu headings too.
const UNIT_HEADING = /^(?:unit|chapter|topic|module|theme|strand|الوحدة|وحدة|الفصل|الباب|باب|یونٹ|اکائی)\s*([0-9٠-٩۰-۹]+|[ivxlc]+)?\s*[:.\-–—)]?\s*(.*)$/iu;
// "1.2 Describe ...", "1) ...", "a) ...", "- ...", "• ..."
const OUTCOME_LINE = /^(?:([0-9٠-٩۰-۹]+(?:\.[0-9٠-٩۰-۹]+)+)|[0-9٠-٩۰-۹]{1,3}[.)]|\(?[a-z][.)]|[-–•*·▪◦])\s+(.{3,})$/iu;

/** Read units and outcomes from page text by fixed rules. Lines that are neither are ignored. */
export function outlineFromPages(pages: readonly OutlinePage[]): OutlineSuggestion[] {
  const out: OutlineSuggestion[] = [];
  const seen = new Set<string>();
  let unit = "";
  for (const page of [...pages].sort((a, b) => a.page - b.page)) {
    const lines = page.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    lines.forEach((line, index) => {
      const heading = UNIT_HEADING.exec(line);
      if (heading && line.length <= 200) { unit = line; return; }
      const outcome = OUTCOME_LINE.exec(line);
      if (!outcome) return;
      const title = outcome[2].trim();
      const key = `${fold(unit)}|${fold(title)}`;
      if (seen.has(key) || out.length >= MAX_OUTLINE_SUGGESTIONS) return;
      seen.add(key);
      out.push({ id: outlineId(page.page, index, title), unit, title: title.slice(0, 1200), ...(outcome[1] ? { code: outcome[1] } : {}), page: String(page.page), excerpt: line.slice(0, 3000) });
    });
  }
  return out;
}

/**
 * Keep only AI suggestions whose excerpt is on the cited page, and whose title is not empty. The
 * identifier is assigned here, never taken from the model. Duplicates (same unit and title) collapse.
 */
export function verifyOutlineSuggestions(raw: readonly RawOutlineSuggestion[], pages: readonly OutlinePage[]): { kept: OutlineSuggestion[]; dropped: number } {
  const byPage = new Map(pages.map(page => [String(page.page), fold(page.text)]));
  const kept: OutlineSuggestion[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  raw.forEach((row, index) => {
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const excerpt = typeof row.excerpt === "string" ? row.excerpt.trim() : "";
    const page = typeof row.page === "string" || typeof row.page === "number" ? String(row.page).trim() : "";
    const unit = typeof row.unit === "string" ? row.unit.trim().slice(0, 200) : "";
    const code = typeof row.code === "string" && row.code.trim() ? row.code.trim().slice(0, 80) : undefined;
    const pageText = byPage.get(page);
    const key = `${fold(unit)}|${fold(title)}`;
    if (!title || !excerpt || !pageText || !pageText.includes(fold(excerpt)) || seen.has(key) || kept.length >= MAX_OUTLINE_SUGGESTIONS) { dropped += 1; return; }
    seen.add(key);
    kept.push({ id: outlineId(page, index, title), unit, title: title.slice(0, 1200), ...(code ? { code } : {}), page, excerpt: excerpt.slice(0, 3000) });
  });
  return { kept, dropped };
}

/** Split pages into batches under a character budget, so each provider call stays bounded. */
export function outlineBatches(pages: readonly OutlinePage[], maxChars = 12_000): OutlinePage[][] {
  const batches: OutlinePage[][] = [];
  let current: OutlinePage[] = [], size = 0;
  for (const page of pages) {
    const text = page.text.slice(0, maxChars);
    if (current.length && size + text.length > maxChars) { batches.push(current); current = []; size = 0; }
    current.push({ page: page.page, text }); size += text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** Pages to read: the reviewed page list when present, else the whole text as page 1. */
export function outlinePagesOf(source: { extractedText: string; sourcePages?: ReadonlyArray<{ page: number; text: string }> }): OutlinePage[] {
  const pages = (source.sourcePages ?? []).filter(page => page.text.trim());
  return pages.length ? pages.map(page => ({ page: page.page, text: page.text })) : source.extractedText.trim() ? [{ page: 1, text: source.extractedText }] : [];
}

export interface AcceptedOutlineRow { suggestionId: string; title: string; unit: string; page: string; code?: string }

/** "3" or "3–7": the pages the accepted outcomes cite. */
export function pageRangeOf(rows: readonly { page: string }[]): string | undefined {
  const numbers = rows.map(row => Number.parseInt(row.page, 10)).filter(Number.isFinite);
  if (!numbers.length) return undefined;
  const low = Math.min(...numbers), high = Math.max(...numbers);
  return low === high ? String(low) : `${low}–${high}`;
}

/**
 * The draft CURRICULUM body for accepted outline rows. Outcome ids are the suggestion ids, so taking
 * the same suggestion twice is a no-op; extending an existing draft keeps its outcomes and appends only
 * new ones. Outcomes start untaught: the Teaching Line records teaching.
 */
export function curriculumFromOutline(input: {
  existing?: CurriculumData;
  subjectId: string; classId: string; academicYear: string; board: string;
  source: { recordId: string; version: number; title: string; fileName: string; excerpt: string; approved: boolean };
  accepted: readonly AcceptedOutlineRow[];
}): CurriculumData {
  const sourceEntryId = `src-${input.source.recordId}`.slice(0, 120);
  const base: CurriculumData = input.existing ?? { subjectId: input.subjectId, classId: input.classId, academicYear: input.academicYear, board: input.board, sources: [], outcomes: [] };
  const entry = {
    id: sourceEntryId, title: input.source.title.slice(0, 240), kind: "SYLLABUS" as const,
    reference: input.source.fileName.slice(0, 2000), excerpt: (input.source.excerpt.trim() || input.source.title).slice(0, 30000), approved: true,
    sourceRecordId: input.source.recordId, sourceVersion: input.source.version,
    ...(pageRangeOf(input.accepted) ? { pageRange: pageRangeOf(input.accepted) } : {}),
  };
  const sources = [...base.sources.filter(source => source.id !== sourceEntryId), entry].slice(0, 30);
  const known = new Set(base.outcomes.map(outcome => outcome.id));
  const added = input.accepted.filter(row => !known.has(row.suggestionId)).map(row => ({
    id: row.suggestionId, title: row.title.trim().slice(0, 1200), sourceId: sourceEntryId, sourcePage: row.page.slice(0, 80),
    taught: false, included: true, ...(row.unit.trim() ? { unit: row.unit.trim().slice(0, 200) } : {}), ...(row.code ? { code: row.code.slice(0, 80) } : {}),
  }));
  const outcomes = [...base.outcomes, ...added].slice(0, 200);
  return {
    ...base,
    academicYear: base.academicYear.trim() ? base.academicYear : input.academicYear,
    board: base.board.trim() ? base.board : input.board,
    sources, outcomes,
    ...(input.source.approved ? {} : { approvalBundle: { sourceRecordId: input.source.recordId, sourceVersion: input.source.version } }),
  };
}
