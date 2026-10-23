// SKO-505: the Family Exam Brief sentence in the reader's language ("Science moved to Thursday, 5 Nov").
// Shared by the family inbox row and the timetable's brief panel; the subject is isolated for mixed scripts.
type Ui = (source: string, values?: unknown[]) => string;

export function examBriefWhen(language: string, date: string | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function examBriefSentence(ui: Ui, language: string, item: { kind: string; subject: string; date: string | null }) {
  const subject = `⁨${item.subject}⁩`, when = examBriefWhen(language, item.date);
  if (item.kind === "MOVED") return ui("{0} moved to {1}", [subject, when]);
  if (item.kind === "ADDED") return ui("{0} added on {1}", [subject, when]);
  if (item.kind === "REMOVED") return ui("{0} removed from the date sheet", [subject]);
  return ui("{0}: exam room changed", [subject]);
}
