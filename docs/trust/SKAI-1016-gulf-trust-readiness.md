# SKAI-1016: KSA and Dubai trust readiness (extends SKAI-1000)

**Status: draft. Requires legal review.** This file is desk research plus an engineering inventory. It is not legal advice, legal clearance or a compliance certification. SKAI-1000 still owns the base trust pack. This file owns only the Gulf extensions and the D2 readiness evidence. Sources were viewed on 29 October 2026.

## 1. Processing inventory (taken from the repository; confirm against the live deployment)

| Item | What the code shows | Status |
| --- | --- | --- |
| Data collected | School, campus, staff, student, guardian, attendance, fee, assessment and exam records (Prisma schema). Every row carries `school_id`, enforced by the fail-closed tenant guard. | Verified in code |
| Roles | The school is the controller and Skoolee the processor for school records. Skoolee is the controller for its own account and billing data. | **Requires legal review** for each entity |
| AI subprocessor | OpenAI (`docs/ai-provider-policy.md`). Prompts are pseudonymized before they are sent. | Verified in code. OpenAI's processing region is not verified |
| Hosting | Vercel runs the app; Supabase provides Postgres and storage. `docs/ENVIRONMENTS.md` says all projects share one region but does not name it. | **Unverified.** Record the region from the provider dashboards before making any claim |
| Payments | SafePay (Pakistan, PKR), sandbox only. No Gulf provider. | See SKAI-1017 |
| Support access | Owner and super-admin consoles. There is no region-restricted support model. | Gap |
| Transfers | Unless proven otherwise, Gulf school data would leave KSA/UAE, because neither the hosting nor OpenAI is shown to be in either country. | **Blocks KSA and Dubai until reviewed** |
| Retention, deletion and export | Pilot closure records evidence of export and access closure (SKAI-832). No automated deletion run is claimed. | Technical test pending |
| Breach handling and rights requests | The repository has no documented Gulf notification timeline and no rights-request runbook. | Gap |

## 2. Country matrix (review inputs, not conclusions)

| Market | Primary source | What a qualified reviewer must decide |
| --- | --- | --- |
| Pakistan | No general data protection statute has been enacted. The Personal Data Protection Bill 2023 was approved by cabinet and was still awaiting Parliament in February 2025 ([Law Over Borders](https://www.globallegalpost.com/lawoverborders/data-protection-1072382791/pakistan-1623790143), secondary source). PECA 2016 applies. | The bill's current status. Until there is a statute, the contractual DPA terms carry the load. |
| KSA (Riyadh, Jeddah) | The Personal Data Protection Law; SDAIA's [Regulation on Personal Data Transfer outside the Kingdom](https://sdaia.gov.sa/Documents/RegulationonPersonalDataEN.pdf) (updated September 2024 according to secondary summaries); SDAIA Standard Contractual Clauses v1.0. | Whether the hosting and OpenAI transfers fit adequacy, SCCs or an exemption. Children's data, notices, and DPO/registration duties for both the school and Skoolee. Do **not** infer a blanket residency rule. |
| Dubai (mainland) | Federal Decree-Law No. 45 of 2021 ([UAE legislation portal](https://uaelegislation.gov.ae/en/legislations/1972/download)). In force since 2 January 2022; compliance depends on Executive Regulations whose status must be checked. | Whether the school is on the mainland (federal PDPL) or in a free zone with its own law (DIFC and ADGM are excluded from the federal PDPL). The transfer basis. Any KHDA data requirements that apply to the school. |

## 3. Go/no-go conditions per market

Each market is blocked on its own: a gap in KSA does not block Pakistan or Dubai. The rules are encoded in `src/lib/school-ai/market-trust-readiness.ts`. A market may process real school data only when every item below is recorded with a reviewer reference and a date:

1. Qualified legal review of the country matrix.
2. Security review of the hosting region and subprocessors.
3. A transfer basis.
4. A versioned DPA.
5. Privacy and guardian notices in the required languages: AR/EN for KSA and Dubai, EN/UR for Pakistan.
6. School approval of source rights and the AI disclosure.
7. A tested retention, deletion and export path.
8. Redacted acceptance from the school approver.

Once a review expires, the market is blocked again.

## 4. Gaps and owners

| Gap | Owner | Blocks |
| --- | --- | --- |
| Hosting and AI regions not recorded | Engineering owner | All Gulf markets |
| Transfer assessment (SDAIA / UAE PDPL) | Qualified KSA and UAE counsel | KSA, Dubai |
| Arabic DPA, privacy notice and guardian notice | SKAI-1000 owner, counsel and a native reviewer | KSA, Dubai |
| Breach and rights-request runbook | Security owner | All markets |
| Technical test of deletion and export | QA (with SKAI-1015) | All markets |

## Human-only

The following need people, not code: legal and security review, school approver acceptance, translations and real-school evidence. Keep review evidence in restricted storage. Never put student or guardian data, or agreements, in fixtures or in this repository.
