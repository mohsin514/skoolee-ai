// SKO-412: how a marks-sheet photo becomes proposed values. A proposal is never a mark: every cell is
// reviewed by the teacher beside its crop, and confidence only orders that review.
//
// Modes (MARK_SCAN_EXTRACTOR):
//   "none" (default) — no recognition is configured. Cells are created empty and the teacher transcribes
//                      each one from the photo. No pupil image leaves the school's storage.
//   "synthetic"      — test and demonstration only, refused in production: readings come from the request
//                      (`syntheticReadings`), never from the image, so QA can exercise uncertain digits,
//                      a confidently wrong value and absences deterministically.
// A real recognition provider must go through the AI provider policy (pupil names appear on the sheet, so a
// photo cannot be sent to an external model without the school's approval) and is not wired here.

export type Reading = { row: number; value: number | null; absent: boolean; confidence: number; alternatives: number[] };

export async function extractMarks(input: { bytes: Uint8Array; contentType: string; rows: number[]; maxMarks: number; synthetic?: unknown }): Promise<Reading[]> {
  const mode = process.env.MARK_SCAN_EXTRACTOR ?? "none";
  if (mode === "synthetic") {
    if (process.env.NODE_ENV === "production") throw new Error("Synthetic mark extraction is not available in production.");
    const rows = Array.isArray(input.synthetic) ? input.synthetic as Record<string, unknown>[] : [];
    return rows.filter(r => input.rows.includes(Number(r.row))).map(r => ({
      row: Number(r.row),
      value: r.absent ? null : Number.isFinite(Number(r.value)) ? Number(r.value) : null,
      absent: r.absent === true,
      confidence: Math.min(1, Math.max(0, Number(r.confidence ?? 0))),
      alternatives: Array.isArray(r.alternatives) ? r.alternatives.map(Number).filter(Number.isFinite) : [],
    }));
  }
  return [];
}
