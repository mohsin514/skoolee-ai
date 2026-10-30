import type { CurriculumData, PaperData } from "../../src/lib/school-ai/assessment";

export function assessmentFixture(subjectId = "subject-1", classId = "class-1"): { curriculum: CurriculumData; paper: PaperData } {
  const curriculum: CurriculumData = {
    subjectId, classId, academicYear: "2026", board: "Synthetic curriculum",
    sources: [{ id: "source-1", title: "Synthetic mathematics syllabus", kind: "SYLLABUS", reference: "Test-only document page 1", excerpt: "Addition combines numbers. Two plus two equals four. Explain your addition method.", approved: true }],
    outcomes: [{ id: "outcome-1", title: "Add whole numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: true }],
  };
  const paper: PaperData = {
    curriculumId: "curriculum-1", curriculumVersion: 1, subjectId, classId, language: "en",
    blueprint: { title: "Synthetic mathematics assessment", durationMinutes: 30, totalMarks: 5, instructions: "Choose one question in section A and complete section B.", sections: [{ id: "a", title: "A", type: "SINGLE_CHOICE", questionCount: 2, answerCount: 1, marksPerQuestion: 2, outcomeIds: ["outcome-1"] }, { id: "b", title: "B", type: "SHORT_TEXT", questionCount: 1, answerCount: 1, marksPerQuestion: 3, outcomeIds: ["outcome-1"] }] },
    questions: [
      ...["q1", "q2"].map((id, index) => ({ id, sectionId: "a", type: "SINGLE_CHOICE" as const, prompt: index ? "Choose the result of adding two and two." : "What is 2 + 2?", marks: 2, options: [{ id: "a1", text: "4" }, { id: "a2", text: "5" }], correctOptionId: "a1", modelAnswer: "Four.", rubric: [{ id: "r1", criterion: "Correct choice", marks: 2 }], outcomeIds: ["outcome-1"], sourceRefs: [{ sourceId: "source-1", page: "1", excerpt: "Two plus two equals four." }], locked: false })),
      { id: "q3", sectionId: "b", type: "SHORT_TEXT", prompt: "Explain how to add two numbers.", marks: 3, options: [], correctOptionId: null, modelAnswer: "Combine the quantities and count the total.", rubric: [{ id: "r2", criterion: "Explains combining numbers", marks: 3 }], outcomeIds: ["outcome-1"], sourceRefs: [{ sourceId: "source-1", page: "1", excerpt: "Addition combines numbers." }], locked: false },
    ], generation: { kind: "MANUAL", model: null, generatedAt: null },
  };
  return { curriculum, paper };
}
