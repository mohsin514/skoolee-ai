import type { CurriculumContract } from "../curriculum-contract";

/**
 * SKAI-1011 (D2-05): KSA national-curriculum intermediate mathematics, one grade and one term.
 *
 * Verified (official moe.gov.sa pages, retrieved 2026-10-29, SHA-256 of the fetched HTML recorded):
 * - News 11/02/1447 (05 Aug 2025): Council of Ministers approved two semesters for general-education
 *   schools from 1447/1448, applied over the next four years. A pack therefore names one of two
 *   semesters (الفصل الدراسي الأول / الثاني); a third term is rejected.
 * - Private-schools page: a licensed private school offers education "in line with the national
 *   curriculum". National-curriculum and foreign-curriculum schools are distinct; this pack serves
 *   only the former.
 * - Ain news 05/01/1440: textbooks are selected on ien.edu.sa by stage, grade, term and subject.
 *   This older page identifies a source channel only; it does not prove the 1448 edition.
 *
 * Not verified, so listed in `unverified`: the 1448 textbook edition, outcomes, assessment policy,
 * marks/timing/sections, calculator rule, notation convention, rights and educator sign-off.
 * The pack stays DRAFT and the SKAI-1007 gate stays off. No textbook content is copied.
 */
export const ksaIntermediateGrades = { "7": "الصف الأول المتوسط", "8": "الصف الثاني المتوسط", "9": "الصف الثالث المتوسط" } as const;
export type KsaIntermediateGrade = keyof typeof ksaIntermediateGrades;
export const ksaSemesters = ["الفصل الدراسي الأول", "الفصل الدراسي الثاني"] as const;
export type KsaSemester = (typeof ksaSemesters)[number];
/** Hijri academic year 1448/1449 = Gregorian 2026-27 (the current pilot year). */
export const ksaPilotAcademicYear = { hijri: "1448/1449", gregorian: "2026-27" } as const;

const moe = "Ministry of Education, Kingdom of Saudi Arabia";

export function ksaIntermediateMathematicsPack(schoolGrade: KsaIntermediateGrade, term: KsaSemester): CurriculumContract {
  return {
    packId: `ksa-moe-g${schoolGrade}-mathematics-1448-s${term === ksaSemesters[0] ? 1 : 2}`,
    version: 1,
    status: "DRAFT",
    board: "KSA_MOE",
    qualification: "Saudi national curriculum, intermediate stage (المرحلة المتوسطة)",
    examSession: `End of ${term === ksaSemesters[0] ? "first" : "second"} semester assessment (school-set)`,
    examYear: "2027",
    teachingYear: ksaPilotAcademicYear.gregorian,
    gradeMapping: { boardLevel: ksaIntermediateGrades[schoolGrade], schoolGrade },
    term,
    subject: "Mathematics",
    tier: "National curriculum",
    language: "ar",
    outcomes: [],
    paper: { sections: [], calculator: "UNVERIFIED", rules: ["Arabic is the instructional language; English is reviewed assistance only and never replaces the Arabic source meaning."] },
    sources: [
      {
        id: "moe-two-semesters-1447",
        kind: "NOTICE",
        authority: moe,
        reference: "MoE news: approval of two semesters for general-education schools (11/02/1447)",
        issuedOn: "2025-08-05",
        edition: "Two-semester calendar from 1447/1448 for four years",
        url: "https://www.moe.gov.sa/ar/mediacenter/MOEnews/Pages/news1_05082025.aspx",
        retrievedOn: "2026-10-29",
        checksumSha256: "dc9ab6f39537ab8d3056b1119a06aa4ccb64b40879054efddf3640604ba83be5",
        applicability: "Term structure only: general-education schools study two semesters in 1448/1449.",
      },
      {
        id: "moe-private-schools",
        kind: "NOTICE",
        authority: moe,
        reference: "MoE investment: Private Schools definition",
        edition: "Page updated 2025-05-21",
        url: "https://www.moe.gov.sa/en/investment/specialedupre/Pages/privateschools.aspx",
        retrievedOn: "2026-10-29",
        checksumSha256: "58de28b1fee0f807ecd41a6eea5fa11aedc6524d0faa91addc209abad3ae2f79",
        applicability: "Distinguishes licensed national-curriculum private schools; foreign-curriculum schools need a separate pack.",
      },
      {
        id: "moe-ain-textbooks-1440",
        kind: "NOTICE",
        authority: moe,
        reference: "MoE news: six steps to download digital textbooks via Ain (05/01/1440)",
        issuedOn: "2018-09-15",
        edition: "1440 guidance (source channel only)",
        url: "https://www.moe.gov.sa/ar/mediacenter/MOEnews/Pages/i-85976-t.aspx",
        retrievedOn: "2026-10-29",
        checksumSha256: "4865ff9871edd10f88add699751d0220a6b739df880aa2ffab2d4dd85f4afaf5",
        applicability: "Identifies ien.edu.sa as the textbook channel by grade/term/subject. Does not prove the 1448 edition.",
      },
    ],
    register: { reviewTrigger: "A new MoE textbook edition, calendar or assessment-policy change for this grade/term, or the school changes grade, term or academic year." },
    unverified: [
      { field: "textbook", evidenceRequest: `School academic owner records the exact MoE mathematics textbook edition for ${ksaIntermediateGrades[schoolGrade]}, ${term}, ${ksaPilotAcademicYear.hijri} (ien.edu.sa failed TLS verification on 2026-10-29), as a TEXTBOOK source with checksum.` },
      { field: "gradeMapping", evidenceRequest: "School confirms the grade mapping and that it teaches the Saudi national curriculum (not a foreign curriculum)." },
      { field: "outcomes", evidenceRequest: "Record the assessed learning outcomes for this grade/term from the approved textbook or MoE framework." },
      { field: "assessmentPolicy", evidenceRequest: "School supplies its current MoE assessment policy: total marks, duration, sections, choices and marking rules for the end-of-term assessment." },
      { field: "paper.calculator", evidenceRequest: "Confirm the calculator rule in the school's assessment policy." },
      { field: "notation", evidenceRequest: "Native Arabic mathematics educator confirms notation (Arabic or Latin variables, Eastern Arabic or Western digits, decimal separator) and signs off a synthetic Arabic paper and rubric." },
      { field: "rights", evidenceRequest: "Record permitted source use (rights scope and permission evidence) for each source at the pilot school." },
      { field: "educatorApprover", evidenceRequest: "Qualified educator approver, approval date and review date; English assistance reviewed separately." },
    ],
  };
}

export type KsaSchoolContext = { curriculum: "NATIONAL" | "FOREIGN"; academicYearHijri: string; schoolGrade: string; term: string };

/** KSA-specific gates on top of the shared contract checks. */
export function ksaPackErrors(contract: CurriculumContract, school: KsaSchoolContext): string[] {
  if (contract.board !== "KSA_MOE") return [];
  const errors: string[] = [];
  if (school.curriculum !== "NATIONAL") errors.push("Foreign-curriculum schools need their own separately approved qualification pack; the MoE pack does not apply.");
  if (school.academicYearHijri !== ksaPilotAcademicYear.hijri || contract.teachingYear !== ksaPilotAcademicYear.gregorian) errors.push(`Pack is for ${ksaPilotAcademicYear.hijri} (${ksaPilotAcademicYear.gregorian}), not ${school.academicYearHijri}.`);
  if (school.schoolGrade !== contract.gradeMapping.schoolGrade) errors.push(`Pack is for grade ${contract.gradeMapping.schoolGrade}, not ${school.schoolGrade}.`);
  if (school.term !== contract.term) errors.push(`Pack is for ${contract.term}, not ${school.term}.`);
  if (!(ksaSemesters as readonly string[]).includes(contract.term)) errors.push("Saudi general education uses two semesters; name the first or second semester.");
  if (!(contract.gradeMapping.schoolGrade in ksaIntermediateGrades)) errors.push("Only intermediate grades 7-9 are in scope.");
  if (contract.language !== "ar") errors.push("Arabic is the instructional default for the KSA national pack.");
  const textbook = contract.sources.find(source => source.kind === "TEXTBOOK");
  if (!textbook) errors.push("No MoE textbook edition is recorded; the capability stays unavailable.");
  else if (!textbook.edition.includes("1448")) errors.push(`Textbook edition "${textbook.edition}" is not shown to be the 1448 edition.`);
  return errors;
}

/** Stored maths text must not carry bidi controls; direction is applied at render time (LTR isolate for expressions). */
export function ksaMathTextErrors(text: string): string[] {
  return /[‎‏‪-‮⁦-⁩]/.test(text) ? ["Mathematics text contains bidirectional control characters; remove them and let the renderer isolate expressions."] : [];
}
