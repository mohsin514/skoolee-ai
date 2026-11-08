// SKAI-1000 trust pack, English. DRAFT — requires legal review.
// Every factual statement here is taken from the code (cited inline) so a
// reviewer can check it. Square-bracket placeholders are for the founder and
// counsel to fill in; do not replace them with guesses.
import type { TrustPackDoc, TrustPackId } from "./trust-pack";

export const TRUST_PACK_EN: Record<TrustPackId, TrustPackDoc> = {
  privacy: {
    title: "Privacy policy",
    description:
      "How Skoolee AI handles school, student, guardian and staff data. Schools decide what is collected; Skoolee processes it to run the service.",
    sections: [
      { title: "Who we are", body: "Skoolee AI is operated by [LEGAL ENTITY NAME], [REGISTERED ADDRESS], [COMPANY REGISTRATION NUMBER]. Privacy contact: [PRIVACY CONTACT EMAIL]. For school records, the school is the controller and Skoolee acts on the school's instructions (see the DPA template)." },
      { title: "Data we handle", body: "Schools may store student records (identity, enrolment, attendance, marks, report cards, documents and notes entered by staff), guardian contact details (phone, email, WhatsApp number), staff accounts, invoices and payment status, messages, sign-in sessions, audit events and AI usage logs." },
      { title: "Why we use it", body: "To run the school platform, keep accounts secure, send messages the school approves, manage fees and billing, produce AI-assisted drafts that staff review, and protect the service from misuse." },
      { title: "Who processes it for us", body: "Database hosting: Supabase (PostgreSQL). App hosting: Vercel. File storage: Amazon S3 or an S3-compatible store. AI text features: OpenAI. Email: an SMTP provider [EMAIL PROVIDER NAME]. WhatsApp messages and sign-in codes: Meta WhatsApp Business Platform. SMS sign-in codes, when switched on: Twilio. Card payments: Stripe. Regions are listed in the DPA template and must be confirmed before signing." },
      { title: "AI processing", body: "Before a prompt leaves Skoolee, names and other identifiers are replaced with tokens, and a scanner blocks the request if an email, phone number, CNIC or long identifier is still present. The public Pollinations provider is blocked unless an operator explicitly allows it. AI output is a draft for staff to review." },
      { title: "Access control", body: "Every record carries a school ID and a database guard refuses queries without one. Owners, campus admins, principals, teachers, guardians and students have separate roles, so each person sees only their school and campus scope." },
      { title: "Retention and deletion", body: "Each school sets how long notifications (at least 30 days), expired sign-in sessions (at least 1 day) and AI usage logs (at least 90 days) are kept, and can place legal holds. Deleted rows leave provider backups only when those backups expire. [STUDENT RECORD RETENTION PERIOD — to be confirmed with counsel]." },
      { title: "Your rights", body: "Schools can export a student's or guardian's records, correct fields and delete a person's records through the data requests screen. Export download links expire after 24 hours. Guardians and staff should contact their school first; you may also write to [PRIVACY CONTACT EMAIL]." },
      { title: "Changes and governing law", body: "Version [VERSION], effective [EFFECTIVE DATE]. Governing law: [GOVERNING LAW AND JURISDICTION]. We will notify schools of material changes before they take effect." },
    ],
  },
  terms: {
    title: "Terms of service",
    description:
      "The rules for using Skoolee AI as a school, staff member, guardian or student.",
    sections: [
      { title: "Parties", body: "These terms are between [LEGAL ENTITY NAME] (\"Skoolee\") and the school that signs up. Staff, guardians and students use Skoolee under the school's account." },
      { title: "Accounts", body: "Each user signs in with their own account. Keep sign-in details private. Administrators may be required to use multi-factor authentication. The school is responsible for who it invites and for removing access when people leave." },
      { title: "School data", body: "The school owns the data it enters. Skoolee processes it only to provide the service, as described in the privacy policy and the DPA." },
      { title: "AI features", body: "AI features produce drafts. Staff must review drafts before sharing them; Skoolee does not guarantee AI output is accurate. Schools can choose not to use AI features." },
      { title: "Messaging", body: "Email, WhatsApp and SMS messages are sent only when the school or a user triggers them. The school must have a lawful basis to contact each guardian." },
      { title: "Fees and payment", body: "Plan prices, billing cycle, refunds and taxes: [COMMERCIAL TERMS — to be set by founder]. Card payments are handled by Stripe." },
      { title: "Acceptable use", body: "Do not upload unlawful content, try to access another school's data, probe or overload the service, or share accounts." },
      { title: "Liability and termination", body: "[LIABILITY CAP, WARRANTIES AND INDEMNITIES — counsel to draft]. On termination the school can request an export; deletion follows the DPA." },
      { title: "Governing law", body: "Version [VERSION], effective [EFFECTIVE DATE]. [GOVERNING LAW AND JURISDICTION]." },
    ],
  },
  dpa: {
    title: "Data processing agreement (template)",
    description:
      "Template between a school (controller) and Skoolee (processor). The full annexes, including country terms, live in docs/legal/SKAI-1158-dpa-template.md.",
    sections: [
      { title: "Parties and roles", body: "Controller: [SCHOOL LEGAL NAME, ADDRESS]. Processor: [LEGAL ENTITY NAME, REGISTERED ADDRESS]. Skoolee processes personal data only to provide the service and on the school's documented instructions." },
      { title: "Data and subjects", body: "Students (often minors), guardians and staff: identity, enrolment, attendance, marks, report cards, documents, contact details, fee and payment status, messages and notes entered by the school." },
      { title: "Security measures", body: "Tenant isolation by school ID with a fail-closed database guard; role-based access; MFA for administrators; audit trail of sensitive actions; pseudonymisation and a PII scanner before any AI prompt; separate databases per environment; encryption in transit." },
      { title: "Sub-processors", body: "Supabase (database), Vercel (hosting), Amazon S3 or S3-compatible storage (files; default region us-east-1, configurable), OpenAI (AI text), [EMAIL PROVIDER NAME] (email over SMTP), Meta WhatsApp Business Platform (messages and codes), Twilio (SMS codes, when on), Stripe (payments). Production regions: [CONFIRM PER VENDOR]. Notice of a new sub-processor: [30] days." },
      { title: "Retention and deletion", body: "The school sets retention schedules and legal holds in the product. At the end of the service Skoolee returns data in a standard export on request and deletes it within [DELETION PERIOD] days, except where law requires retention. Provider backups expire on the provider's schedule." },
      { title: "Data-subject requests", body: "The product supports student export, guardian export, field correction and subject deletion. Skoolee assists the school with requests it cannot complete itself within [RESPONSE PERIOD]." },
      { title: "Breach notice", body: "Skoolee notifies the school without undue delay and within [24] hours of confirming a personal data breach, following the breach runbook (docs/legal/SKAI-1145-breach-runbook.md)." },
      { title: "Audit and signatures", body: "Skoolee provides the information needed to show compliance. Signed for the school: [NAME, TITLE, DATE]. Signed for Skoolee: [NAME, TITLE, DATE]." },
    ],
  },
  guardian: {
    title: "Guardian notice",
    description:
      "For parents and guardians at a pilot school. Your school uses Skoolee AI to manage your child's school records.",
    sections: [
      { title: "Who is responsible", body: "[SCHOOL NAME] decides what information about your child is recorded and is responsible for it. Skoolee ([LEGAL ENTITY NAME]) runs the software for the school." },
      { title: "What is recorded", body: "Your child's name, class, attendance, marks, report cards, documents and notes the school enters, and your name, phone number, email and WhatsApp number." },
      { title: "AI-assisted drafts", body: "Teachers may use AI to draft remarks, questions or messages. Your child's name and contact details are replaced with tokens before any text is sent to OpenAI, and a teacher reviews each draft before it is shared." },
      { title: "WhatsApp, SMS and email", body: "The school may send you updates and sign-in codes by WhatsApp (Meta), SMS (Twilio) or email. Tell the school if you prefer a different channel." },
      { title: "Your choices", body: "You can ask the school for a copy of your child's records, to correct them, or to delete them where the school is allowed to. Contact: [SCHOOL CONTACT]. Skoolee privacy contact: [PRIVACY CONTACT EMAIL]." },
      { title: "Consent", body: "[CONSENT WORDING AND SIGNATURE LINE — counsel to confirm whether consent or another lawful basis applies, including for AI processing and WhatsApp]." },
    ],
  },
};
