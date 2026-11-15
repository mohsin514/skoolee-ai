// SKAI-2048: paper readiness issues name the question by its number and are shown in the UI language.
// Keys are the English templates built in assessment.ts with the number replaced by {0}.
import { arabicPaperIssues, urduPaperIssues } from "./paper-issue-messages";

export function localizePaperIssue(issue: string, locale: string): string {
  if (locale !== "ar" && locale !== "ur") return issue;
  const numbers: string[] = [];
  const key = issue.replace(/Question (\d+)/g, (_, n: string) => { numbers.push(n); return `Question {${numbers.length - 1}}`; });
  const template = (locale === "ar" ? arabicPaperIssues : urduPaperIssues)[key];
  return template ? template.replace(/\{(\d+)\}/g, (match, i: string) => numbers[Number(i)] ?? match) : issue;
}
/** A server message can join several issues into one string; each sentence is localised on its own. */
export const localizePaperIssues = (message: string, locale: string) =>
  message.split(/(?<=\.)\s+(?=Question \d)/).map((part) => localizePaperIssue(part, locale)).join(" ");
