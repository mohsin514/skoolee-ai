// SKO-398: the admission form definition and its rules. Pure and shared by the server (authoritative) and
// the family and staff forms (for immediate feedback). A definition is what a published version freezes.

export type Language = "en" | "ar" | "ur";
export type Localized = { en: string; ar?: string; ur?: string };
export const FIELD_TYPES = ["text", "textarea", "date", "select", "phone", "email", "checkbox"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
/** Fields the school can map onto the pupil record when an application is converted. */
export const IDENTITY_FIELDS = ["childName", "dateOfBirth", "gender", "guardianName", "guardianPhone", "guardianEmail", "nationalId", "address", "previousSchool"] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];
/** Stable identifiers a school may choose for spotting the same child twice. */
export const IDENTITY_KEYS = ["nationalId", "nameAndDob", "guardianPhoneAndName"] as const;
export type IdentityKey = (typeof IDENTITY_KEYS)[number];

export type Condition = { field: string; equals: string };
export type FieldDef = { key: string; type: FieldType; label: Localized; help?: Localized; required: boolean; options?: { value: string; label: Localized }[]; showIf?: Condition; identity?: IdentityField; section?: Localized };
export type DocumentDef = { key: string; label: Localized; required: boolean; showIf?: Condition };
export type FormDefinition = { fields: FieldDef[]; documents: DocumentDef[]; identityKeys: IdentityKey[]; consent: Localized };
export type Answers = Record<string, string | boolean | undefined>;
export type Problem = { key: string; message: string };

export const label = (text: Localized | undefined, language: Language) => (text ? text[language]?.trim() || text.en : "");
const KEY = /^[a-z][a-zA-Z0-9]{1,39}$/;

/** A sensible starting form; every school edits it before publishing. Medical questions are not included by default. */
export function starterDefinition(): FormDefinition {
  return {
    fields: [
      { key: "childName", type: "text", identity: "childName", required: true, label: { en: "Child's full name", ar: "اسم الطفل الكامل", ur: "بچے کا پورا نام" }, section: { en: "About the child", ar: "عن الطفل", ur: "بچے کے بارے میں" } },
      { key: "dateOfBirth", type: "date", identity: "dateOfBirth", required: true, label: { en: "Date of birth", ar: "تاريخ الميلاد", ur: "تاریخ پیدائش" } },
      { key: "gender", type: "select", identity: "gender", required: true, label: { en: "Gender", ar: "الجنس", ur: "جنس" }, options: [{ value: "FEMALE", label: { en: "Female", ar: "أنثى", ur: "لڑکی" } }, { value: "MALE", label: { en: "Male", ar: "ذكر", ur: "لڑکا" } }] },
      { key: "previousSchool", type: "text", identity: "previousSchool", required: false, label: { en: "Previous school (if any)", ar: "المدرسة السابقة (إن وجدت)", ur: "سابقہ اسکول (اگر کوئی ہو)" } },
      { key: "guardianName", type: "text", identity: "guardianName", required: true, label: { en: "Parent or guardian name", ar: "اسم ولي الأمر", ur: "والدین یا سرپرست کا نام" }, section: { en: "Family contact", ar: "التواصل مع الأسرة", ur: "خاندان سے رابطہ" } },
      { key: "guardianPhone", type: "phone", identity: "guardianPhone", required: true, label: { en: "Phone", ar: "الهاتف", ur: "فون" } },
      { key: "guardianEmail", type: "email", identity: "guardianEmail", required: false, label: { en: "Email", ar: "البريد الإلكتروني", ur: "ای میل" } },
    ],
    documents: [{ key: "birthCertificate", required: true, label: { en: "Birth certificate", ar: "شهادة الميلاد", ur: "پیدائشی سرٹیفکیٹ" } }],
    identityKeys: ["nameAndDob", "guardianPhoneAndName"],
    consent: { en: "I confirm the information is correct and agree that the school may use it to process this application.", ar: "أؤكد صحة المعلومات وأوافق على أن تستخدمها المدرسة لمعالجة هذا الطلب.", ur: "میں تصدیق کرتا/کرتی ہوں کہ معلومات درست ہیں اور اسکول اسے اس درخواست کے لیے استعمال کر سکتا ہے۔" },
  };
}

/** Structural checks on a definition before it can be saved or published. */
export function definitionProblems(definition: FormDefinition): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const fields = Array.isArray(definition?.fields) ? definition.fields : [];
  const documents = Array.isArray(definition?.documents) ? definition.documents : [];
  if (!fields.length) problems.push("Add at least one question.");
  if (fields.length > 80) problems.push("A form can have at most 80 questions.");
  if (documents.length > 20) problems.push("A form can ask for at most 20 documents.");
  const identities = new Set<string>();
  fields.forEach((field, index) => {
    if (!KEY.test(field.key ?? "")) problems.push(`Question ${index + 1}: the key must start with a letter and use letters and digits only.`);
    if (keys.has(field.key)) problems.push(`Question ${index + 1}: the key "${field.key}" is used twice.`);
    keys.add(field.key);
    if (!(FIELD_TYPES as readonly string[]).includes(field.type)) problems.push(`Question ${index + 1}: unknown answer type.`);
    if (!field.label?.en?.trim()) problems.push(`Question ${index + 1}: write the English question.`);
    if (field.type === "select" && !(field.options?.length)) problems.push(`Question ${index + 1}: a choice question needs options.`);
    if (field.identity) {
      if (!(IDENTITY_FIELDS as readonly string[]).includes(field.identity)) problems.push(`Question ${index + 1}: unknown pupil-record field.`);
      if (identities.has(field.identity)) problems.push(`Question ${index + 1}: "${field.identity}" is mapped twice.`);
      identities.add(field.identity);
    }
    if (field.showIf && !fields.slice(0, index).some(earlier => earlier.key === field.showIf!.field)) problems.push(`Question ${index + 1}: it can only depend on an earlier question.`);
  });
  documents.forEach((document, index) => {
    if (!KEY.test(document.key ?? "")) problems.push(`Document ${index + 1}: the key must start with a letter and use letters and digits only.`);
    if (keys.has(document.key)) problems.push(`Document ${index + 1}: the key "${document.key}" is used twice.`);
    keys.add(document.key);
    if (!document.label?.en?.trim()) problems.push(`Document ${index + 1}: write the English name.`);
    if (document.showIf && !fields.some(field => field.key === document.showIf!.field)) problems.push(`Document ${index + 1}: it can only depend on a question.`);
  });
  const childName = fields.find(field => field.identity === "childName");
  if (!childName) problems.push("Map one question to the child's full name.");
  else if (!childName.required || childName.showIf) problems.push("The child's full name must always be asked and required.");
  for (const key of definition?.identityKeys ?? []) {
    if (!(IDENTITY_KEYS as readonly string[]).includes(key)) problems.push(`Unknown duplicate check "${key}".`);
    const needs: Record<IdentityKey, IdentityField[]> = { nationalId: ["nationalId"], nameAndDob: ["childName", "dateOfBirth"], guardianPhoneAndName: ["guardianPhone", "childName"] };
    if ((IDENTITY_KEYS as readonly string[]).includes(key) && needs[key].some(field => !identities.has(field))) problems.push(`The duplicate check "${key}" needs questions mapped to ${needs[key].join(" and ")}.`);
  }
  if (!definition?.consent?.en?.trim()) problems.push("Write the consent statement families agree to.");
  return problems;
}

const shown = (condition: Condition | undefined, answers: Answers) => !condition || String(answers[condition.field] ?? "") === condition.equals;
export const visibleFields = (definition: FormDefinition, answers: Answers) => definition.fields.filter(field => shown(field.showIf, answers));
export const visibleDocuments = (definition: FormDefinition, answers: Answers) => definition.documents.filter(document => shown(document.showIf, answers));

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s()-]{6,30}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Problems with the answers. A draft only checks what was typed; a submission also needs everything required. */
export function answerProblems(definition: FormDefinition, answers: Answers, uploadedKeys: string[], final: boolean): Problem[] {
  const problems: Problem[] = [];
  const known = new Set([...definition.fields.map(field => field.key), ...definition.documents.map(document => document.key)]);
  for (const key of Object.keys(answers)) if (!known.has(key)) problems.push({ key, message: "This answer is not part of the form." });
  for (const field of visibleFields(definition, answers)) {
    const raw = answers[field.key];
    const value = typeof raw === "boolean" ? raw : String(raw ?? "").trim();
    const empty = value === "" || value === false;
    if (empty) { if (final && field.required) problems.push({ key: field.key, message: "This answer is required." }); continue; }
    if (typeof value === "string" && value.length > (field.type === "textarea" ? 2000 : 200)) problems.push({ key: field.key, message: "This answer is too long." });
    if (field.type === "email" && typeof value === "string" && !EMAIL.test(value)) problems.push({ key: field.key, message: "Enter a valid email address." });
    if (field.type === "phone" && typeof value === "string" && !PHONE.test(value)) problems.push({ key: field.key, message: "Enter a valid phone number, with the country code if outside the school's country." });
    if (field.type === "date" && typeof value === "string") {
      const date = new Date(`${value}T00:00:00Z`);
      if (!DATE.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) problems.push({ key: field.key, message: "Enter a real date." });
      else if (field.identity === "dateOfBirth" && date.getTime() > Date.now()) problems.push({ key: field.key, message: "The date of birth cannot be in the future." });
    }
    if (field.type === "select" && typeof value === "string" && !field.options?.some(option => option.value === value)) problems.push({ key: field.key, message: "Choose one of the options." });
  }
  if (final) for (const document of visibleDocuments(definition, answers)) if (document.required && !uploadedKeys.includes(document.key)) problems.push({ key: document.key, message: "This document is required." });
  return problems;
}

/** Answers for hidden questions are dropped, so a changed choice cannot leave a stale answer behind. */
export function keepVisible(definition: FormDefinition, answers: Answers): Answers {
  const visible = new Set(visibleFields(definition, answers).map(field => field.key));
  return Object.fromEntries(Object.entries(answers).filter(([key]) => visible.has(key)));
}

export function identityValues(definition: FormDefinition, answers: Answers) {
  const out: Partial<Record<IdentityField, string>> = {};
  for (const field of definition.fields) if (field.identity && answers[field.key] !== undefined) out[field.identity] = String(answers[field.key]).trim();
  return out;
}
const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, "");
/** The normalised identifiers used to find possible duplicates, e.g. "nameAndDob:ayeshakhan|2015-03-04". */
export function identityKeysFor(definition: FormDefinition, answers: Answers) {
  const values = identityValues(definition, answers);
  const keys: string[] = [];
  for (const key of definition.identityKeys) {
    if (key === "nationalId" && values.nationalId) keys.push(`nationalId:${fold(values.nationalId)}`);
    if (key === "nameAndDob" && values.childName && values.dateOfBirth) keys.push(`nameAndDob:${fold(values.childName)}|${values.dateOfBirth}`);
    if (key === "guardianPhoneAndName" && values.childName && values.guardianPhone) keys.push(`guardianPhoneAndName:${values.guardianPhone.replace(/\D/g, "").slice(-9)}|${fold(values.childName)}`);
  }
  return keys;
}
export const foldName = fold;
