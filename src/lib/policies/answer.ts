/**
 * SKO-429 policy answers. Pure and deterministic: no model writes the answer. An answer is the
 * approved policy wording itself, quoted with its title, version, section and effective dates, so a
 * sentence planted in a document can be quoted but never obeyed, and nothing is promised that the
 * policy does not say.
 *
 * Outcomes:
 * - ANSWERED   — the best match is one current policy; its matching sections are quoted.
 * - CONFLICT   — two current policies on the same topic both match; no tie-break is invented.
 * - UNCERTAIN  — the only match is a policy not in effect on the question date.
 * - NO_ANSWER  — nothing current matches well enough; the right office is suggested instead.
 */

export const OFFICES = ["GENERAL", "ATTENDANCE", "FINANCE", "ACTIVITIES", "ADMISSIONS", "WELFARE"] as const;
export type Office = (typeof OFFICES)[number];
export type Section = { id: string; heading: string; text: string };
export type PolicyDoc = { id: string; topic: string; title: string; version: number; office: string; effectiveFrom: string; effectiveUntil: string | null; sections: Section[] };
export type Citation = { policyId: string; title: string; version: number; topic: string; sectionId: string; heading: string; text: string; effectiveFrom: string; effectiveUntil: string | null };
export type PolicyAnswer = { status: "ANSWERED" | "CONFLICT" | "UNCERTAIN" | "NO_ANSWER"; citations: Citation[]; office: string; note: string };

const STOP = new Set("a an and are as at be by can do does for from how i if in is it me my of on or our school the their there this to we what when where which who why will with you your".split(" "));

export function tokens(text: string): string[] {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/[ً-ٰٟ]/g, "").split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && /^[a-z]+$/.test(t) ? t.replace(/(ing|ed|es|s)$/, "") : t));
}

/** How well a section answers the question: distinct question words present, headings count double. */
export function scoreSection(question: string[], doc: PolicyDoc, section: Section): { score: number; headed: boolean; body: number } {
  const body = new Set(tokens(section.text)), head = new Set([...tokens(section.heading), ...tokens(doc.title), ...tokens(doc.topic)]);
  let score = 0, headed = false, inBody = 0;
  for (const word of new Set(question)) {
    if (head.has(word)) { score += 2; headed = true; } else if (body.has(word)) { score += 1; inBody++; }
  }
  return { score, headed, body: inBody };
}

/**
 * Enough evidence: the section's heading, title or topic must match the question, or at least three
 * question words must appear in its text. Stray words in an unrelated note (or a planted line) do not
 * make it an answer.
 */
const enough = (m: { score: number; headed: boolean; body: number }, words: number) => (m.headed && m.score >= Math.min(2, Math.max(1, words))) || m.body >= 3;

function ranked(question: string[], docs: PolicyDoc[]) {
  const words = new Set(question).size;
  return docs.flatMap((doc) => doc.sections.map((section) => ({ doc, section, match: scoreSection(question, doc, section) })))
    .filter((r) => enough(r.match, words)).map((r) => ({ doc: r.doc, section: r.section, score: r.match.score }))
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id));
}

const cite = (doc: PolicyDoc, section: Section): Citation => ({ policyId: doc.id, title: doc.title, version: doc.version, topic: doc.topic, sectionId: section.id, heading: section.heading, text: section.text, effectiveFrom: doc.effectiveFrom, effectiveUntil: doc.effectiveUntil });

export function answerQuestion(question: string, current: PolicyDoc[], notCurrent: PolicyDoc[]): PolicyAnswer {
  const words = tokens(question);
  const hits = ranked(words, current);
  if (hits.length) {
    const top = hits[0];
    const near = hits.filter((h) => h.score >= Math.max(top.score * 0.75, 1));
    const sameTopic = [...new Set(near.filter((h) => h.doc.topic === top.doc.topic).map((h) => h.doc.id))];
    if (sameTopic.length > 1) {
      const citations = sameTopic.map((pid) => { const h = near.find((x) => x.doc.id === pid)!; return cite(h.doc, h.section); });
      return { status: "CONFLICT", citations, office: top.doc.office, note: "Two current policies on this topic both apply and they may not agree. The school office needs to confirm which one to follow." };
    }
    const citations = near.filter((h) => h.doc.id === top.doc.id).slice(0, 3).map((h) => cite(h.doc, h.section));
    return { status: "ANSWERED", citations, office: top.doc.office, note: "This quotes the current approved policy. It does not approve a request or change any record." };
  }
  const other = ranked(words, notCurrent);
  if (other.length) {
    const top = other[0];
    return { status: "UNCERTAIN", citations: [cite(top.doc, top.section)], office: top.doc.office, note: "The only matching policy is not in effect on this date, so it cannot be relied on. The school office can confirm what applies now." };
  }
  return { status: "NO_ANSWER", citations: [], office: "GENERAL", note: "I could not verify an answer from the current policies. You can send this question to the school office." };
}

/** True when a cited version is no longer current (superseded, archived or out of its dates). */
export function answerIsStale(answer: PolicyAnswer, currentIds: Set<string>): boolean {
  return answer.citations.some((c) => !currentIds.has(c.policyId));
}
