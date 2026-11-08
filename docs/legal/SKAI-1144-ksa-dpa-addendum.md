# SKAI-1144 — KSA DPA addendum (SDAIA SCCs) and transfer risk assessment template

> **⚠️ NEEDS COUNSEL REVIEW.** This is a working draft written by the product team, not legal advice. Do not sign it or send it to a school until KSA counsel has reviewed it and every [U] item is either confirmed ([V]) or corrected.

Status: draft, 29 October 2026. Owner: Mohsin Ali.
Builds on: `docs/research/2026-10/SKAI-1101-ksa-data-residency-decision.md` (recommendation path A: current hosting region + SDAIA SCCs + transfer risk assessment) and `docs/research/2026-10/SKAI-1105-gcc-data-law-matrix.md` (§3 item 4).
Attaches to: the main school DPA template (SKAI-1158). This addendum adds to that DPA; where they conflict for KSA data, this addendum wins.

**Confidence legend.** [V] verified in a source cited in SKAI-1101 or SKAI-1105. [U] unverified; confirm before relying on it.

---

## Part A — Addendum text

### A1. Parties and scope

1. This addendum applies when the **School** (controller) is established in the Kingdom of Saudi Arabia, or processes the personal data of people resident in the Kingdom, through the Skoolee AI service.
2. **Skoolee** acts as processor for the School. Skoolee's sub-processors are listed in the DPA's sub-processor annex (SKAI-1158).
3. Governing law for data protection matters: the Personal Data Protection Law (Royal Decree M/19 of 2021, amended 2023) and its Implementing Regulations and Regulation on Personal Data Transfer outside the Kingdom (September 2023) [V]. Regulator: SDAIA [V].

### A2. Data covered

| Category | Data subjects | Examples | Sensitive? |
|---|---|---|---|
| Identity and enrolment | Students, guardians, staff | Name, class, admission number, guardian relationship | No |
| Contact | Guardians, staff | Phone, email, WhatsApp number | No |
| Academic | Students | Attendance, marks, report cards, exam papers | No [U] |
| Finance | Guardians | Fee invoices, payment status | No [U] (card data is not stored by Skoolee) |
| Health and welfare notes | Students | Allergies, medical notes entered by the school | **Yes** [U] — treat as sensitive |
| AI inputs | Students, staff | Pseudonymised prompt payloads (AI PII policy) | See A5 |

Minors: students under the age of full legal capacity are processed on the basis of guardian consent or another lawful basis the School relies on [U on age and form; SKAI-1101 §7].

### A3. Transfer outside the Kingdom

1. **Where the data goes.** Skoolee hosts the service's primary database in **AWS us-east-1 (United States)** through Supabase (see SKAI-1146 for the evidence and which environments are confirmed). Other sub-processor regions are listed in the DPA annex. This is a transfer outside the Kingdom.
2. **Mechanism.** The parties rely on the **SDAIA standard contractual clauses** for transfers from a controller in the Kingdom to a processor outside it [V that SCCs are an accepted safeguard; U on the exact module and current text]. The SCCs are incorporated by reference as **Schedule 1** and prevail over this addendum where they conflict.
   - *Counsel to confirm:* which SCC module applies (controller → processor), whether the School or Skoolee signs as exporter, and whether onward transfers to sub-processors need a separate SCC set.
3. **Conditions** both parties keep while transferring [V, SKAI-1101 §2]:
   - the transfer does not prejudice national security or the Kingdom's vital interests;
   - only the minimum data needed for the service is transferred;
   - a transfer risk assessment (Part B) is completed before first transfer and reviewed at least yearly, or when a trigger in B7 fires.
4. **Pending change.** SDAIA's draft amendments to the Implementing Regulations were open for consultation until 5 November 2026 [V]. Skoolee will review this addendum within 30 days of the final text and notify the School of any change needed.

### A4. Processor commitments specific to KSA

1. Process only on the School's documented instructions.
2. Keep the School's data logically isolated by tenant (`school_id`) and enforce it in code (fail-closed tenant guard).
3. Notify the School **without undue delay and within 24 hours** of confirming a personal data breach affecting its data, so the School can meet the **72-hour** SDAIA notice [U on the 72 hours; SKAI-1101 §2]. The breach runbook (SKAI-1145) is the operating procedure.
4. Help the School answer data-subject requests (access, correction, destruction) within the statutory period [U on the period].
5. Not change a sub-processor or its region without at least **30 days'** notice, giving the School a right to object.
6. On request, move the School's data to an in-Kingdom environment if Skoolee launches one (SKAI-1101 path C/D), subject to a separate order.
7. At the end of the contract, return and then delete the School's data within the period set in the main DPA.

### A5. AI processing

1. Skoolee sends AI requests to **OpenAI** (United States) [U on OpenAI's processing region for our account]. This is a cross-border transfer and is listed in the sub-processor annex.
2. Before any prompt leaves Skoolee, names and direct identifiers are replaced with pseudonyms (AI PII policy). Skoolee never defaults to an unapproved AI provider.
3. Pseudonymised payloads lower the risk but may still be personal data under the PDPL [U; SKAI-1101 §7]. Until counsel confirms otherwise, AI transfers are covered by the SCCs and assessed in Part B.
4. AI features can be switched off per school.

### A6. Signatures

| | School (controller / exporter [U]) | Skoolee (processor / importer [U]) |
|---|---|---|
| Name | | |
| Title | | |
| Date | | |

---

## Part B — Transfer risk assessment (TRA) template

Complete one TRA per School (or one for all KSA Schools if the facts are identical), before the first transfer. Keep it with the signed DPA.

### B1. Header

| Field | Value |
|---|---|
| School | |
| Assessment date | |
| Assessor | |
| Reviewer (counsel) | |
| Next review due | (≤ 12 months) |

### B2. Transfer description

| # | Data category (A2) | Recipient | Country / region | Purpose | Volume (approx.) | Frequency |
|---|---|---|---|---|---|---|
| 1 | All service data | Supabase (AWS) | USA, us-east-1 | Hosting the database | | Continuous |
| 2 | Pseudonymised AI inputs | OpenAI | USA [U] | AI features | | Per request |
| 3 | Contact data | Messaging / email providers (see DPA annex) | See annex | Notifications | | Per message |
| 4 | | | | | | |

### B3. Legal basis for the transfer

- [ ] Adequacy decision for the destination country (none known for the USA [U])
- [ ] SDAIA standard contractual clauses — Schedule 1
- [ ] Binding corporate rules
- [ ] Certification
- [ ] Other ground (describe, with counsel sign-off):

### B4. Necessity and minimisation

| Question | Answer |
|---|---|
| Could the purpose be met without transferring this category? | |
| Which fields are excluded or pseudonymised before transfer? | |
| Is health/welfare data transferred? If yes, why is it needed? | |
| Retention period at the recipient | |

### B5. Destination risk

| Factor | Notes | Rating (L/M/H) |
|---|---|---|
| Public authority access laws in the destination | | |
| Recipient's contractual commitments (DPA, SCCs) | | |
| Recipient's security certifications (e.g. SOC 2, ISO 27001) [U per vendor] | | |
| Prior incidents at the recipient | | |
| National security / vital interests impact (A3.3) | | |

### B6. Safeguards in place

| Safeguard | In place? | Evidence |
|---|---|---|
| Encryption in transit (TLS) | | |
| Encryption at rest | | |
| Tenant isolation by `school_id` | | |
| AI pseudonymisation before prompt | | |
| Access logging / audit trail | | |
| Least-privilege staff access | | |
| Breach runbook (SKAI-1145) | | |

### B7. Conclusion and review triggers

- Residual risk: Low / Medium / High
- Decision: Proceed / Proceed with conditions / Do not transfer
- Conditions:
- Re-assess when: a sub-processor or region changes; SDAIA finalises the draft amendments; a breach affects transferred data; ≥ 4 of 8 KSA discovery schools raise residency as a blocker (SKAI-1101 trigger); or 12 months pass.

| Signed (Skoolee) | Signed (School) | Counsel reviewed |
|---|---|---|
| | | |

---

## Open questions for counsel

1. Exact SDAIA SCC module and current text to attach as Schedule 1. [U]
2. Is the TRA mandatory for every transfer, or only for some (e.g. sensitive data, large scale)? [U]
3. Does pseudonymised AI traffic count as personal data? [U]
4. Statutory deadline for data-subject requests, and the exact breach-notice clock. [U]
5. Age and form of guardian consent for minors. [U]
