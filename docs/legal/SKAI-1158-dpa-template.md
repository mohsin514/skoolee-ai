# SKAI-1158 — School data processing agreement (DPA) template with country annexes

> **⚠️ NEEDS COUNSEL REVIEW.** This template is a product-team draft, not legal advice. Do not send it to a school until counsel has reviewed the main terms and the annex for that school's country, and every [U] item is confirmed or corrected.

Status: draft, 29 October 2026. Owner: Mohsin Ali.
Builds on: `docs/research/2026-10/SKAI-1105-gcc-data-law-matrix.md` (§3 item 4: "DPA template with country annexes: transfer mechanism, sub-processors and their regions"; item 5: OpenAI as cross-border sub-processor in every annex) and `docs/research/2026-10/SKAI-1101-ksa-data-residency-decision.md`.
Related: KSA addendum (SKAI-1144), breach runbook (SKAI-1145), hosting region record (SKAI-1146, `docs/ENVIRONMENTS.md`).

**Confidence legend.** [V] verified in a cited source. [U] unverified; confirm before relying on it.

---

## Part 1 — Main terms

1. **Roles.** The School is the controller. Skoolee is the processor. Skoolee processes personal data only to provide the Skoolee AI service and only on the School's documented instructions.
2. **Subject matter and duration.** Processing for the term of the service agreement plus the return/deletion period in clause 11.
3. **Data and data subjects.** As listed in Annex A.
4. **Confidentiality.** Skoolee staff with access are bound by confidentiality and get access on a least-privilege basis.
5. **Security.** Skoolee keeps the measures in Annex B, including tenant isolation by `school_id`, encryption in transit, and audit logging.
6. **Sub-processors.** The School authorises the sub-processors in Annex C. Skoolee gives **30 days'** notice of a new sub-processor or a region change; the School may object on reasonable grounds. Skoolee flows down equivalent data-protection terms.
7. **International transfers.** Transfers outside the School's country follow the mechanism in that country's annex (Annex D). **OpenAI is a cross-border sub-processor in every annex.**
8. **AI processing.** Personal identifiers are pseudonymised before any prompt leaves Skoolee. Skoolee never routes School data to an AI provider not listed in Annex C. The School can switch AI features off.
9. **Data-subject requests.** Skoolee helps the School answer access, correction and deletion requests, including per-student and per-guardian exports.
10. **Breach notice.** Skoolee notifies the School **without undue delay and within 24 hours** of confirming a personal data breach, following the breach runbook (SKAI-1145), so the School can meet any 72-hour regulator deadline.
11. **Return and deletion.** At the end of the service, Skoolee returns the School's data in a standard export on request and deletes it within **[60] days** [U — confirm], except where law requires retention.
12. **Audit.** Skoolee provides information needed to show compliance, and allows a reasonable audit once a year on 30 days' notice.
13. **Order of precedence.** A country annex (and the KSA addendum, SKAI-1144) prevails over these main terms for that country's data.

---

## Annex A — Processing details

| Data subjects | Categories | Sensitive data |
|---|---|---|
| Students (often minors) | Identity, enrolment, attendance, marks, report cards, exam papers, photos [U if used] | Health/welfare notes entered by the school |
| Guardians | Identity, contact (phone, email, WhatsApp), fee and payment status | None expected |
| Staff | Identity, contact, role, timetable, payroll-related fields [U if used] | None expected |

Purposes: school administration, communication with guardians, academic records, fees, AI-assisted teaching tools.

## Annex B — Security measures (summary)

- Tenant isolation by `school_id`, enforced by a fail-closed database guard.
- TLS in transit; provider-managed encryption at rest [U per provider].
- Role-based access; MFA for administrators.
- Audit trail for sensitive actions.
- Pseudonymisation before any AI prompt.
- Separate environments (dev, staging, QA, production, demo) with separate databases.

## Annex C — Sub-processors and regions

Regions are what we know on 29 October 2026. Rows marked [U] must be checked in each vendor's dashboard or contract before signing.

| Sub-processor | Service | Data | Processing region | Cross-border for GCC/PK schools? | Confidence |
|---|---|---|---|---|---|
| Supabase (on AWS) | Database, auth, storage | All service data | **AWS us-east-1, USA** | Yes | [V] for the dev projects we can see (SKAI-1146); [U] for production |
| Vercel | App hosting, serverless functions | Request data in transit, logs | Function region [U]; global edge network | Yes | [U] |
| **OpenAI** | AI text and media features | Pseudonymised prompts and outputs | **USA** [U on account-level data residency] | **Yes — cross-border processor in every annex** | [U] |
| Meta (WhatsApp Business Platform) | Guardian messaging | Phone numbers, message content | Global [U] | Yes | [U] |
| Email provider [name U] | Transactional email | Email addresses, message content | [U] | [U] | [U] |
| SMS / OTP provider [name U] | SMS and one-time codes | Phone numbers | [U] | [U] | [U] |
| Object storage (S3-compatible) [name U] | Files, uploads | Documents, images | [U] | [U] | [U] |

## Annex D — Country annexes

Each annex states the governing law, the transfer mechanism for every Annex C row, any extra terms, and the regulator for breach notices (see SKAI-1145 §4).

### D1. Pakistan

- Law: no comprehensive data-protection statute in force [U]; contractual protections apply.
- Transfers: contractual (this DPA). [U — check any sector rules for schools.]
- OpenAI: cross-border processor (USA), pseudonymised data.
- Extra terms: none.

### D2. United Arab Emirates (federal)

- Law: Federal Decree-Law 45/2021 (PDPL) [V]. Regulator: UAE Data Office [V].
- Transfers: to adequate countries or with safeguards such as contractual clauses [U]. Mechanism for Supabase (USA), Vercel and **OpenAI (USA, cross-border processor)**: contractual safeguards in this DPA [U — counsel to confirm form].
- Extra terms: executive-regulation status disputed; plan for a 1 January 2027 compliance date [U]. Free-zone schools (DIFC, ADGM) may fall under different laws [U].

### D3. Kingdom of Saudi Arabia

- Law: PDPL, Royal Decree M/19 (2021), amended 2023 [V]. Regulator: SDAIA [V].
- Transfers: SDAIA standard contractual clauses plus a transfer risk assessment — **use the KSA addendum (SKAI-1144)**. Applies to Supabase (USA), Vercel and **OpenAI (USA, cross-border processor)**.
- Extra terms: data minimisation; re-review after SDAIA finalises its draft amendments (consultation runs to 5 November 2026 [V]).

### D4. Qatar (deferred market)

- Law: Law 13/2016 [V]. Regulator: NCSA [U].
- Transfers: allowed unless they breach the law or cause harm; regulator may restrict [U]. **OpenAI: cross-border processor.**
- Extra terms: check Ministry of Education rules for school data [U].

### D5. Bahrain (deferred market)

- Law: Law 30/2018 [V]. Regulator: Personal Data Protection Authority [V].
- Transfers: adequate-country list, or authority approval / safeguards [U]. Check whether the USA is on the list [U]. **OpenAI: cross-border processor.**
- Extra terms: registration with the authority if required [U].

### D6. Oman (deferred market)

- Law: Royal Decree 6/2022; executive regulations January 2024 [V].
- Transfers: permitted with conditions under regulator rules [U]. **OpenAI: cross-border processor.**
- Extra terms: explicit written consent for sensitive data; children's data may be sensitive [U]; permits for some processing [U].

### D7. Kuwait (deferred market)

- Law: CITRA Data Privacy Protection Regulation [U]. Regulator: CITRA [U].
- Transfers: allowed with safeguards; data-classification rules may require local hosting for some classes [U]. **OpenAI: cross-border processor.**
- Extra terms: confirm the regulation applies to a foreign SaaS serving private schools [U].

---

## Signatures

| | School (controller) | Skoolee (processor) |
|---|---|---|
| Name | | |
| Title | | |
| Date | | |

## Open questions for counsel

1. Form of transfer safeguard per country (Annex D) and whether one DPA can carry all annexes. [U]
2. Confirm every sub-processor region in Annex C, especially production Supabase, Vercel functions and OpenAI. [U]
3. Return/deletion period (clause 11). [U]
4. Does pseudonymised AI traffic count as personal data in each country? [U]
