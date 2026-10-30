import { reportMessages } from "./report-messages";

/**
 * SKO-496: "Grade" as an academic result (A, B+, 86%) is a different word from "Grade" as a school level, which
 * the interface catalog translates as الصف / جماعت. Result columns use the report-card wording instead, so a
 * class's final grades never read as "class" in Arabic or Urdu.
 */
export const resultGradeLabel = (language: "en" | "ar" | "ur") => (reportMessages[language] ?? reportMessages.en).grade;
