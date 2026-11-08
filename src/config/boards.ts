/**
 * Examination boards a campus can be affiliated with, per country.
 *
 * Shared rather than redeclared per screen: the onboarding wizard, Campus
 * Control and institution settings all create or edit campuses, and a board
 * typed in one place has to match the other or report cards and datesheets
 * disagree about what the same campus is affiliated with.
 *
 * Each country lists its national/state boards; every list then ends with the
 * international boards and "Other" (the caller collects a name for "Other"),
 * so a school anywhere in the world can record its real affiliation.
 */
export const INTERNATIONAL_BOARDS = [
  "Cambridge International (IGCSE / A Level)",
  "Pearson Edexcel International",
  "International Baccalaureate (IB)",
] as const;

export const OTHER_BOARD = "Other";

export const NATIONAL_BOARDS: Record<string, readonly string[]> = {
  PK: ["Federal Board", "Punjab Board", "Sindh Board", "KPK Board", "Balochistan Board", "AJK Board", "Gilgit-Baltistan Board", "Aga Khan Board"],
  IN: ["CBSE", "CISCE (ICSE / ISC)", "NIOS", "State Board"],
  BD: ["Dhaka Board", "Chattogram Board", "Rajshahi Board", "Cumilla Board", "Jashore Board", "Barishal Board", "Sylhet Board", "Dinajpur Board", "Mymensingh Board", "Madrasah Board", "Technical Board"],
  NP: ["National Examinations Board (NEB)"],
  LK: ["Department of Examinations (O/L, A/L)"],
  AF: ["Ministry of Education Afghanistan"],
  AE: ["UAE Ministry of Education", "CBSE (UAE)", "UK National Curriculum", "American Curriculum"],
  SA: ["Saudi Ministry of Education", "CBSE (KSA)", "American Curriculum", "UK National Curriculum"],
  KW: ["Kuwait Ministry of Education", "American Curriculum", "UK National Curriculum"],
  QA: ["Qatar Ministry of Education", "American Curriculum", "UK National Curriculum"],
  OM: ["Oman Ministry of Education", "American Curriculum", "UK National Curriculum"],
  BH: ["Bahrain Ministry of Education", "American Curriculum", "UK National Curriculum"],
  EG: ["Thanaweya Amma (Ministry of Education)", "American Diploma", "UK National Curriculum"],
  JO: ["Tawjihi (Ministry of Education)"],
  GB: ["AQA", "Pearson Edexcel", "OCR", "WJEC / Eduqas", "CCEA", "SQA"],
  IE: ["State Examinations Commission"],
  US: ["State Standards (Common Core)", "College Board (AP)", "ACT"],
  CA: ["Provincial Curriculum"],
  AU: ["NESA (NSW)", "VCAA (VIC)", "QCAA (QLD)", "SACE (SA)", "SCSA (WA)", "TASC (TAS)"],
  NZ: ["NZQA (NCEA)"],
  NG: ["WAEC", "NECO", "NABTEB"],
  GH: ["WAEC"],
  KE: ["KNEC (KCSE)"],
  UG: ["UNEB"],
  TZ: ["NECTA"],
  ZA: ["Department of Basic Education (NSC)", "IEB"],
  MY: ["Malaysian Examinations Council (SPM / STPM)"],
  SG: ["SEAB (GCE O / A Level)"],
  ID: ["Kurikulum Merdeka"],
  PH: ["DepEd (K to 12)"],
  TR: ["MEB (Ministry of National Education)"],
};

/** The boards to offer a school in `country` (ISO alpha-2): national ones first, then international, then Other. */
export function boardsForCountry(country: string | null | undefined): string[] {
  const national = (country && NATIONAL_BOARDS[country]) || [];
  return [...national, ...INTERNATIONAL_BOARDS, OTHER_BOARD];
}

/** The first board on a country's list: what a new campus starts with. */
export function defaultBoardFor(country: string | null | undefined): string {
  return boardsForCountry(country)[0];
}

/** Legacy list for screens that do not know the school's country yet (Campus Control, settings). Prefer `boardsForCountry`. */
export const EXAM_BOARDS: readonly string[] = boardsForCountry("PK");

export type ExamBoard = string;

/** Kept for existing callers that seed a campus without a country. */
export const DEFAULT_EXAM_BOARD: ExamBoard = "Federal Board";
