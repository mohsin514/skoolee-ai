import type { NotificationTemplateKey } from "@/lib/notifications/templates";

// SKAI-986 (INT-WA-02): business-initiated WhatsApp messages outside the 24-hour service window must use a
// Meta-approved template. This is the versioned catalogue of Skoolee's utility templates. Each name is
// submitted to Meta in every listed language; changing wording means a new version (a new name), never an edit.
// Sending through templates stays off until WHATSAPP_UTILITY_TEMPLATES=on, i.e. until Meta has approved them.
export type UtilityTemplate = { name: string; version: number; params: readonly string[]; languages: Readonly<Record<"en" | "ur" | "ar", string>> };

const LANGUAGES = { en: "en", ur: "ur", ar: "ar" } as const;

export const WHATSAPP_UTILITY_TEMPLATES: Partial<Record<NotificationTemplateKey, UtilityTemplate>> = {
  ATTENDANCE_ALERT: { name: "skoolee_absence_v1", version: 1, params: ["studentName", "date", "campusName"], languages: LANGUAGES },
  FEE_DUE_REMINDER: { name: "skoolee_fee_due_v1", version: 1, params: ["studentName", "balanceDue", "dueDate"], languages: LANGUAGES },
  FEE_OVERDUE_REMINDER: { name: "skoolee_fee_overdue_v1", version: 1, params: ["studentName", "balanceDue", "dueDate"], languages: LANGUAGES },
  EXAM_SCHEDULE: { name: "skoolee_exam_change_v1", version: 1, params: ["studentName", "examTitle", "className"], languages: LANGUAGES },
};

export const utilityTemplatesEnabled = (env: Record<string, string | undefined> = process.env) => env.WHATSAPP_UTILITY_TEMPLATES === "on";

export type TemplateSend = { name: string; language: string; params: string[] };

/** The approved template for this notification, or null to keep the plain-text (service-window) path. */
export function utilityTemplateFor(key: NotificationTemplateKey, language: string, context: Record<string, unknown>, env: Record<string, string | undefined> = process.env): TemplateSend | null {
  const template = WHATSAPP_UTILITY_TEMPLATES[key];
  if (!template || !utilityTemplatesEnabled(env)) return null;
  const metaLanguage = template.languages[language as keyof UtilityTemplate["languages"]] ?? template.languages.en;
  // Meta rejects empty parameters, so a missing value is sent as a dash rather than dropped.
  const params = template.params.map(name => { const value = context[name]; return value === undefined || value === null || String(value).trim() === "" ? "-" : String(value).slice(0, 1000); });
  return { name: template.name, language: metaLanguage, params };
}

/** The Cloud API body for a template message. */
export function templatePayload(to: string, template: TemplateSend) {
  return { to, type: "template", template: { name: template.name, language: { code: template.language }, components: [{ type: "body", parameters: template.params.map(text => ({ type: "text", text })) }] } };
}
