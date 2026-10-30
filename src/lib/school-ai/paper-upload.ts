/**
 * SKO-501 (plan F2b): read reviewed text from a teacher's paper (PDF/photo extraction or native text) into
 * draft questions. Pure and deterministic: numbered questions, lettered options, marks written as
 * "[2]", "(2 marks)" or "2 marks", and an answer key after a heading such as "Answers" or "Marking
 * scheme". Nothing is invented: a missing mark becomes 1 with a warning; an unmatched key line is
 * reported. Every item starts in DRAFT review with no source citation, so review, moderation, rehearsal
 * and the Seal apply exactly as to a generated paper.
 */
import type { Blueprint, PaperData, Question } from "./assessment";

export interface ReadQuestion { number: number; prompt: string; marks: number; marksStated: boolean; options: Array<{ letter: string; text: string }>; key: string | null }
export interface PaperReading { questions: ReadQuestion[]; warnings: Array<{ code: "MARKS_NOT_STATED" | "KEY_NOT_MATCHED" | "NO_QUESTIONS"; values: Array<string | number> }> }

const DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };
const western = (text: string) => text.replace(/[٠-٩۰-۹]/g, digit => DIGITS[digit]);
const QUESTION = /^(?:q(?:uestion)?\.?\s*|س\s*)?(\d{1,3})\s*[.):\-]\s*(.+)$/i;
const OPTION = /^\(?([a-h])[.)]\s+(.+)$/i;
const MARKS = /\s*(?:\[\s*(\d+(?:\.\d+)?)\s*(?:marks?)?\s*\]|\(\s*(\d+(?:\.\d+)?)\s*marks?\s*\)|(\d+(?:\.\d+)?)\s*marks?)\s*$/i;
const KEY_HEADING = /^(?:answers?|answer\s*key|key|marking\s*scheme|mark\s*scheme|الإجابات|مفتاح الإجابة|جوابات)\s*:?$/i;
const KEY_LINE = /^(\d{1,3})\s*[.):\-]?\s*(.+)$/;

export function readPaperText(raw: string): PaperReading {
  const lines = raw.split(/\r?\n/).map(line => western(line).trim()).filter(Boolean);
  const questions: ReadQuestion[] = [];
  const warnings: PaperReading["warnings"] = [];
  let inKey = false;
  const keys = new Map<number, string>();
  for (const line of lines) {
    if (KEY_HEADING.test(line)) { inKey = true; continue; }
    if (inKey) {
      const entry = KEY_LINE.exec(line);
      if (entry) keys.set(Number(entry[1]), entry[2].trim());
      continue;
    }
    const question = QUESTION.exec(line);
    if (question && !OPTION.test(line)) {
      const marksMatch = MARKS.exec(question[2]);
      const marks = marksMatch ? Number(marksMatch[1] ?? marksMatch[2] ?? marksMatch[3]) : 1;
      questions.push({ number: Number(question[1]), prompt: (marksMatch ? question[2].slice(0, marksMatch.index) : question[2]).trim(), marks: marks > 0 ? marks : 1, marksStated: Boolean(marksMatch), options: [], key: null });
      continue;
    }
    const current = questions.at(-1);
    if (!current) continue;
    const option = OPTION.exec(line);
    if (option && current.options.length < 8) { current.options.push({ letter: option[1].toLowerCase(), text: option[2].trim() }); continue; }
    if (!current.options.length) current.prompt = `${current.prompt}\n${line}`.slice(0, 12000);
  }
  for (const question of questions) {
    const key = keys.get(question.number);
    if (key) question.key = key;
    if (!question.marksStated) warnings.push({ code: "MARKS_NOT_STATED", values: [question.number] });
  }
  for (const number of keys.keys()) if (!questions.some(question => question.number === number)) warnings.push({ code: "KEY_NOT_MATCHED", values: [number] });
  if (!questions.length) warnings.push({ code: "NO_QUESTIONS", values: [] });
  return { questions, warnings };
}

/**
 * A draft PAPER body from the reading: one section per (type, marks) so the blueprint's marks always
 * add up; options and keys carried over; extended answers for 5 marks or more. Outcomes and citations
 * are left for the teacher to map, so each item starts as "needs source".
 */
export function paperFromReading(reading: PaperReading, input: {
  curriculumId: string; curriculumVersion: number; subjectId: string; classId: string; language: PaperData["language"];
  title: string; durationMinutes: number; slotId?: string; examType?: PaperData["examType"]; now: string;
}): PaperData {
  const typeOf = (question: ReadQuestion): Question["type"] => question.options.length >= 2 ? "SINGLE_CHOICE" : question.marks >= 5 ? "EXTENDED_TEXT" : "SHORT_TEXT";
  const groups = new Map<string, ReadQuestion[]>();
  for (const question of reading.questions) {
    const key = `${typeOf(question)}|${question.marks}`;
    groups.set(key, [...(groups.get(key) ?? []), question]);
  }
  const sections: Blueprint["sections"] = [];
  const questions: Question[] = [];
  let index = 0;
  for (const [key, rows] of groups) {
    const [type, marks] = key.split("|");
    const sectionId = `sec-${String.fromCharCode(97 + index++)}`;
    sections.push({ id: sectionId, title: `Section ${String.fromCharCode(65 + index - 1)}`, questionCount: rows.length, answerCount: rows.length, marksPerQuestion: Number(marks), type: type as Question["type"], outcomeIds: [] });
    for (const row of rows) {
      const options = row.options.map(option => ({ id: `q${row.number}-${option.letter}`, text: option.text }));
      const keyLetter = row.key && /^\(?([a-h])\)?\b/i.exec(row.key)?.[1]?.toLowerCase();
      const correct = type === "SINGLE_CHOICE" && keyLetter ? options.find(option => option.id === `q${row.number}-${keyLetter}`)?.id ?? null : null;
      questions.push({
        id: `q${row.number}`, sectionId, type: type as Question["type"], prompt: row.prompt, marks: row.marks, options,
        correctOptionId: correct, modelAnswer: type === "SINGLE_CHOICE" ? "" : (row.key ?? ""), rubric: [], outcomeIds: [], sourceRefs: [], locked: false,
      });
    }
  }
  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
  return {
    curriculumId: input.curriculumId, curriculumVersion: input.curriculumVersion, subjectId: input.subjectId, classId: input.classId, language: input.language,
    blueprint: { title: input.title, durationMinutes: input.durationMinutes, totalMarks: totalMarks > 0 ? totalMarks : 1, instructions: "", sections: sections.length ? sections : [{ id: "sec-a", title: "Section A", questionCount: 1, answerCount: 1, marksPerQuestion: 1, type: "SHORT_TEXT", outcomeIds: [] }] },
    resources: [], questions,
    ...(input.examType ? { examType: input.examType } : {}), ...(input.slotId ? { slotId: input.slotId } : {}),
    generation: { kind: "UPLOADED", model: null, generatedAt: input.now },
  } as PaperData;
}
