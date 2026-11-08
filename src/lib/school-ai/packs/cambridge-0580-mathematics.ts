import type { CurriculumContract } from "../curriculum-contract";

/**
 * SKAI-1012 (D2-06): Cambridge IGCSE Mathematics 0580, exam-year and tier-specific pack for Dubai.
 *
 * Verified from the official Cambridge International 0580 page
 * (https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-mathematics-0580/),
 * syllabus PDFs and their syllabus-update notices retrieved 2026-10-29 (SHA-256 below):
 * - Two editions: "for exams in 2025, 2026 and 2027" (version 3, May 2024) and
 *   "for exams in 2028, 2029 and 2030" (version 2, August 2026). There is no rollover between them.
 * - Both editions: Core = Paper 1 (non-calculator) + Paper 3 (calculator), 1h30 and 80 marks each,
 *   grades C-G. Extended = Paper 2 (non-calculator) + Paper 4 (calculator), 2h and 100 marks each,
 *   grades A*-E. Each paper is 50% of the qualification. Calculators are not allowed for Papers 1/2,
 *   a scientific calculator is required for Papers 3/4. June and November series.
 * - Topic codes and headings (C1.1-C9.5 Core, E1.1-E9.7 Extended) are identical across both editions.
 *
 * Content rights: only structural metadata (codes, headings, component facts) is stored. No
 * learning-outcome text, notes, examples, specimen or past-paper content is copied. Cambridge states
 * registered centres may copy syllabus material for internal use; Skoolee is not a centre, so
 * `rightsScope` stays empty and publication is blocked until rights are recorded per school.
 */

export type Cambridge0580Tier = "Core" | "Extended";
export type Cambridge0580Component = "P1" | "P2" | "P3" | "P4";

type ComponentFacts = { tier: Cambridge0580Tier; title: string; durationMinutes: number; totalMarks: number; calculator: "ALLOWED" | "NOT_ALLOWED"; weightPercent: 50 };

export const cambridge0580Components: Record<Cambridge0580Component, ComponentFacts> = {
  P1: { tier: "Core", title: "Paper 1: Non-calculator (Core)", durationMinutes: 90, totalMarks: 80, calculator: "NOT_ALLOWED", weightPercent: 50 },
  P3: { tier: "Core", title: "Paper 3: Calculator (Core)", durationMinutes: 90, totalMarks: 80, calculator: "ALLOWED", weightPercent: 50 },
  P2: { tier: "Extended", title: "Paper 2: Non-calculator (Extended)", durationMinutes: 120, totalMarks: 100, calculator: "NOT_ALLOWED", weightPercent: 50 },
  P4: { tier: "Extended", title: "Paper 4: Calculator (Extended)", durationMinutes: 120, totalMarks: 100, calculator: "ALLOWED", weightPercent: 50 },
};

/** Topic headings (structure only). Core omits topics marked "Extended content only" in the syllabus. */
const topics = {
  1: ["Types of number", "Sets", "Powers and roots", "Fractions, decimals and percentages", "Ordering", "The four operations", "Indices I", "Standard form", "Estimation", "Limits of accuracy", "Ratio and proportion", "Rates", "Percentages", "Using a calculator", "Time", "Money", "Exponential growth and decay", "Surds"],
  2: ["Introduction to algebra", "Algebraic manipulation", "Algebraic fractions", "Indices II", "Equations", "Inequalities", "Sequences", "Proportion", "Graphs in practical situations", "Graphs of functions", "Sketching curves", "Differentiation", "Functions"],
  3: ["Coordinates", "Drawing linear graphs", "Gradient of linear graphs", "Length and midpoint", "Equations of linear graphs", "Parallel lines", "Perpendicular lines"],
  4: ["Geometrical terms", "Geometrical constructions", "Scale drawings", "Similarity", "Symmetry", "Angles", "Circle theorems I", "Circle theorems II"],
  5: ["Units of measure", "Area and perimeter", "Circles, arcs and sectors", "Surface area and volume", "Compound shapes and parts of shapes"],
  6: ["Pythagoras’ theorem", "Right-angled triangles", "Exact trigonometric values", "Trigonometric functions", "Non-right-angled triangles"],
  7: ["Transformations", "Vectors in two dimensions", "Magnitude of a vector", "Vector geometry"],
  8: ["Introduction to probability", "Relative and expected frequencies", "Probability of combined events", "Conditional probability"],
  9: ["Classifying statistical data", "Interpreting statistical data", "Averages and measures of spread", "Statistical charts and diagrams", "Scatter diagrams", "Cumulative frequency diagrams", "Histograms"],
} as const;
const extendedOnly = new Set(["1.17", "1.18", "2.3", "2.8", "2.12", "2.13", "3.4", "3.7", "4.8", "6.3", "6.4", "6.5", "7.2", "7.3", "7.4", "8.4", "9.6", "9.7"]);
const coreHeadings: Record<string, string> = { "4.7": "Circle theorems", "9.3": "Averages and range" };

export function cambridge0580Topics(tier: Cambridge0580Tier): { code: string; heading: string }[] {
  return Object.entries(topics).flatMap(([unit, headings]) => headings.map((heading, index) => ({ key: `${unit}.${index + 1}`, heading })))
    .filter(item => tier === "Extended" || !extendedOnly.has(item.key))
    .map(item => ({ code: `${tier === "Core" ? "C" : "E"}${item.key}`, heading: tier === "Core" ? (coreHeadings[item.key] ?? item.heading) : item.heading }));
}

type Edition = { id: "2025-2027" | "2028-2030"; examYears: string[]; syllabusVersion: string; sources: CurriculumContract["sources"] };
const authority = "Cambridge University Press & Assessment (Cambridge International Education)";
const pageUrl = "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-mathematics-0580/";

export const cambridge0580Editions: Edition[] = [
  {
    id: "2025-2027", examYears: ["2025", "2026", "2027"], syllabusVersion: "Version 3 (May 2024)",
    sources: [
      { id: "cie-0580-syllabus-2025-2027", kind: "SYLLABUS", authority, reference: "Cambridge IGCSE Mathematics 0580 syllabus for exams in 2025, 2026 and 2027", issuedOn: "2024-05-01", edition: "2025-2027 Version 3 (May 2024)", url: "https://www.cambridgeinternational.org/Images/662466-2025-2027-syllabus.pdf", retrievedOn: "2026-10-29", checksumSha256: "627f8e5dab21605f95b9aceec4a2dcdddf91dce5767d6938d647b38041c6d363", applicability: `Exam years 2025-2027 only, June and November series. Listed on ${pageUrl}` },
      { id: "cie-0580-update-2025-2027", kind: "NOTICE", authority, reference: "Syllabus update: 0580 for examination in 2025, 2026 and 2027", issuedOn: "2024-05-01", edition: "Update to version 3", url: "https://www.cambridgeinternational.org/Images/709706-2025-2027-syllabus-update.pdf", retrievedOn: "2026-10-29", checksumSha256: "33c80ceda2c8dc054bb9abfbf15de88ebb36181e205fa7b51551d033a1532008", applicability: "Confirms version 3 is the latest 2025-2027 syllabus (content clarifications only)." },
    ],
  },
  {
    id: "2028-2030", examYears: ["2028", "2029", "2030"], syllabusVersion: "Version 2 (August 2026)",
    sources: [
      { id: "cie-0580-syllabus-2028-2030", kind: "SYLLABUS", authority, reference: "Cambridge IGCSE Mathematics 0580 syllabus for exams in 2028, 2029 and 2030", issuedOn: "2026-08-01", edition: "2028-2030 Version 2 (August 2026)", url: "https://www.cambridgeinternational.org/Images/745681-2028-2030-syllabus.pdf", retrievedOn: "2026-10-29", checksumSha256: "26bfebd820210d0147fdc8a6001443556178c046f543e71379501a33046be695", applicability: `Exam years 2028-2030 only, June and November series. Listed on ${pageUrl}` },
      { id: "cie-0580-update-2028-2030", kind: "NOTICE", authority, reference: "Syllabus update: 0580 for examination in 2028, 2029 and 2030", issuedOn: "2026-08-01", edition: "Update to version 2", url: "https://www.cambridgeinternational.org/Images/763300-2028-2030-syllabus-update.pdf", retrievedOn: "2026-10-29", checksumSha256: "e002c36cb5a219be7076151d9e7ff162a41f32ab10652e63405fcbe74cdcca84", applicability: "Version 2 updates the Assessment Overview (page 9); version 1 of this edition is superseded." },
    ],
  },
];

/** Exact edition for an exam year. No fallback: a year outside every edition is unsupported. */
export function cambridge0580EditionFor(examYear: string): Edition | undefined {
  return cambridge0580Editions.find(edition => edition.examYears.includes(examYear));
}

export type Cambridge0580Request = { examYear: string; teachingYear: string; tier: Cambridge0580Tier; component: Cambridge0580Component; schoolGradeLabel: string; series: "June" | "November" };
export type Cambridge0580Availability = { available: true } | { available: false; reason: string };

/** Unsupported combinations are reported, never silently mapped to another year, tier or paper. */
export function cambridge0580Availability(request: Pick<Cambridge0580Request, "examYear" | "tier" | "component">): Cambridge0580Availability {
  if (!cambridge0580EditionFor(request.examYear)) return { available: false, reason: `No verified 0580 syllabus edition covers exam year ${request.examYear}.` };
  const component = cambridge0580Components[request.component];
  if (!component) return { available: false, reason: `Unknown 0580 component ${request.component}.` };
  if (component.tier !== request.tier) return { available: false, reason: `${component.title} is not a ${request.tier} paper.` };
  return { available: true };
}

/** Builds a DRAFT contract for one exam year, tier and component. Human evidence stays unverified. */
export function buildCambridge0580Pack(request: Cambridge0580Request): CurriculumContract {
  const availability = cambridge0580Availability(request);
  if (!availability.available) throw new Error(availability.reason);
  const edition = cambridge0580EditionFor(request.examYear)!;
  const component = cambridge0580Components[request.component];
  return {
    packId: `cambridge-0580-${request.examYear}-${request.tier.toLowerCase()}-${request.component.toLowerCase()}`,
    version: 1,
    status: "DRAFT",
    board: "CAMBRIDGE",
    qualification: `Cambridge IGCSE Mathematics 0580 (syllabus ${edition.id}, ${edition.syllabusVersion})`,
    examSession: `${request.series} series`,
    examYear: request.examYear,
    teachingYear: request.teachingYear,
    gradeMapping: { boardLevel: "IGCSE", schoolGrade: request.schoolGradeLabel },
    term: `${request.series} ${request.examYear} sitting`,
    subject: "Mathematics",
    tier: request.tier,
    language: "en",
    outcomes: cambridge0580Topics(request.tier).map(topic => ({ code: topic.code, statement: topic.heading, assessed: true })),
    paper: {
      totalMarks: component.totalMarks,
      durationMinutes: component.durationMinutes,
      sections: [],
      calculator: component.calculator,
      rules: [
        `${component.title}: ${component.durationMinutes} minutes, ${component.totalMarks} marks, ${component.weightPercent}% of the qualification.`,
        component.calculator === "ALLOWED" ? "A scientific calculator is required; algebraic or graphical calculators are not permitted." : "Use of a calculator is not allowed.",
        `Questions are based on the ${request.tier} subject content only.`,
      ],
    },
    sources: edition.sources,
    register: { reviewTrigger: "Any new 0580 syllabus version or update notice for this edition, a change of the school's exam year, tier or series, or the pilot year's KHDA requirements." },
    unverified: [
      { field: "paper.sections", evidenceRequest: "Educator confirms the question structure for this component from the official specimen paper (structure only, no content copied)." },
      { field: "rights", evidenceRequest: "Record rights scope and permission evidence for using the 0580 syllabus as reference metadata for this school (public access is not permission)." },
      { field: "gradeMapping", evidenceRequest: "The school confirms which local grade/year label sits this exam year and tier." },
      { field: "localRequirements", evidenceRequest: "Dubai school confirms this optional pack does not replace mandatory local subjects; refresh the KHDA curriculum requirements for the pilot year (2024-25 guidance is not current approval)." },
      { field: "educatorApprover", evidenceRequest: "A qualified 0580 educator reviews a representative synthetic paper and rubric for this tier and component and sets the review date." },
    ],
  };
}

/** Rejects wrong-year, wrong-tier, wrong-paper, wrong-calculator, mixed-edition and stale-source contracts. */
export function cambridge0580Errors(contract: CurriculumContract, component: Cambridge0580Component): string[] {
  if (contract.board !== "CAMBRIDGE") return [];
  const errors: string[] = [];
  const edition = cambridge0580EditionFor(contract.examYear);
  if (!edition) return [`No verified 0580 syllabus edition covers exam year ${contract.examYear}.`];
  const facts = cambridge0580Components[component];
  if (!facts) return [`Unknown 0580 component ${component}.`];
  if (facts.tier !== contract.tier) errors.push(`${facts.title} is not a ${contract.tier} paper.`);
  if (contract.paper.calculator !== facts.calculator) errors.push(`${facts.title} calculator rule must be ${facts.calculator}.`);
  if (contract.paper.totalMarks !== facts.totalMarks) errors.push(`${facts.title} is ${facts.totalMarks} marks.`);
  if (contract.paper.durationMinutes !== facts.durationMinutes) errors.push(`${facts.title} lasts ${facts.durationMinutes} minutes.`);
  const expected = new Map(edition.sources.map(source => [source.id, source]));
  for (const source of contract.sources) {
    const pinned = expected.get(source.id);
    if (!pinned) errors.push(`Source ${source.id} is not part of the ${edition.id} edition (mixed or wrong edition).`);
    else if (pinned.checksumSha256 !== source.checksumSha256 || pinned.edition !== source.edition) errors.push(`Source ${source.id} is stale or altered; re-verify against ${pinned.url}.`);
  }
  const allowed = new Set(cambridge0580Topics(contract.tier as Cambridge0580Tier).map(topic => topic.code));
  for (const outcome of contract.outcomes) if (!allowed.has(outcome.code)) errors.push(`Outcome ${outcome.code} is not ${contract.tier} content.`);
  return errors;
}
