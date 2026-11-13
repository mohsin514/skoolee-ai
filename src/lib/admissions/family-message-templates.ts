// SKAI-1259: stage message templates and bulk messages to families. A message is recorded on each
// application's timeline as a family-visible event (kind MESSAGE) and shows on the family's status page,
// exactly like a message sent with a stage change. Nothing here sends email, SMS or WhatsApp.

/** Merge fields a template may use; each is replaced per application. */
export const MERGE_FIELDS = ["{child}", "{reference}"] as const;

export type StageTemplate = { key: string; label: string; body: string; statuses: readonly string[] };

/** Starting texts per stage, in English; the desk shows them in the staff member's language before editing. */
export const STAGE_TEMPLATES: readonly StageTemplate[] = [
  { key: "offer", label: "Offer of a place", statuses: ["UNDER_REVIEW", "WAITLISTED", "OFFERED"], body: "We are pleased to offer {child} a place. Please accept or decline the offer from your application page (reference {reference})." },
  { key: "waitlist", label: "Waitlist", statuses: ["UNDER_REVIEW", "OFFERED", "WAITLISTED"], body: "Thank you for applying for {child}. There is no place free yet, so the application is on our waiting list. We will contact you as soon as a place opens (reference {reference})." },
  { key: "reminder", label: "Reminder", statuses: ["INFO_REQUESTED", "OFFERED", "WAITLISTED", "ACCEPTED", "SUBMITTED", "UNDER_REVIEW"], body: "A reminder about the application for {child} (reference {reference}): please check your application page for the next step." },
  { key: "documents", label: "Missing documents", statuses: ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED"], body: "To continue the application for {child} (reference {reference}), please upload the missing documents from your application page." },
];

/** Templates that fit an application stage; with no stage, all of them. */
export const templatesFor = (status?: string | null) => STAGE_TEMPLATES.filter(template => !status || template.statuses.includes(status));

/** Fills the merge fields for one application. Unknown braces are left as written. */
export function renderFamilyMessage(body: string, values: { childName: string | null; reference: string }) {
  return body.replaceAll("{child}", values.childName?.trim() || "your child").replaceAll("{reference}", values.reference);
}
