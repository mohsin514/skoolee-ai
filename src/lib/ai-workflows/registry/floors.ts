import type { ConfirmationClass, Risk } from "./types";

/**
 * Static class floor per Appendix A risk (architecture §6.2). An entry may sit at its floor or above,
 * never below — except writes listed in CLASS_A_ALLOWLIST, each with a reviewed justification.
 */
export const RISK_FLOOR: Record<Risk, ConfirmationClass> = {
  READ: "A",
  CREATE: "B",
  UPDATE: "B",
  DESTRUCTIVE: "C",
  APPROVAL_DECISION: "C",
  FINANCIAL: "C",
  ACCESS_GRANT: "C",
  COMMUNICATION: "C",
  PUBLISH: "C",
};

/** Writes that run at A. Adding one is a product decision (CODEOWNERS review). */
export const CLASS_A_ALLOWLIST: Readonly<Record<string, string>> = {
  "profile.update": "Own profile fields only; the user is the subject of the record.",
  "personal.save_plan": "Private plan visible only to its author; no school record changes.",
  "front_desk.call_log": "Append-only call record keyed by the request; nothing is sent or decided.",
  "library.book_create": "Append-only catalogue titles; duplicate ISBNs are refused by the domain.",
  "work.save": "Saves an unapproved draft plan; no operational record changes.",
  "digests.prepare": "Builds an unsent draft only from evidence already released to families; sending is a separate reviewed step.",
  "marks_scan.create_template": "Prints a blank paper marks sheet from the class roster; no mark changes until a scanned batch is reviewed and approved.",
  "pathways.save_goal_private": "Saves the learner's own goal with no audience: only the learner sees it until they confirm sharing it.",
  "pathways.add_action": "Adds the learner's own next step to one of their own goals; it is seen only by whoever the goal is already shared with.",
  "resources.create": "Saves a link as a staff-only DRAFT; nothing is visible to learners or families until it is published on the Resources screen; the same link in a class is never added twice.",
  "curriculum.import_topics": "Appends missing topics only from approved, page-referenced sources; existing topics are kept.",
};

/** Reviewed exceptions that keep an entry below its risk floor (e.g. a computed, non-chosen fine). */
export const FLOOR_OVERRIDES: Readonly<Record<string, { class: ConfirmationClass; reason: string }>> = {};

const ORDER: Record<ConfirmationClass, number> = { A: 0, B: 1, C: 2 };

export function floorFor(key: string, risk: Risk): ConfirmationClass {
  if (CLASS_A_ALLOWLIST[key]) return "A";
  return FLOOR_OVERRIDES[key]?.class ?? RISK_FLOOR[risk];
}

export function atLeast(actual: ConfirmationClass, floor: ConfirmationClass) { return ORDER[actual] >= ORDER[floor]; }

/** The effective class only ever escalates. */
export function escalate(current: ConfirmationClass, to: ConfirmationClass): ConfirmationClass { return ORDER[to] > ORDER[current] ? to : current; }
