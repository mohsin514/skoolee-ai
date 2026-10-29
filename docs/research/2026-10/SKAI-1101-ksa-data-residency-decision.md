# SKAI-1101 — KSA data-residency decision

Status: decision draft, 29 October 2026. Owner: Mohsin Ali. **This is not legal advice.** Confirm with KSA counsel before any KSA pilot processes real data.
Builds on: `docs/product-review-2026-10/SKAI-1005-cohort-validation.md` (follow-up 5, "KSA PDPL data-residency decision"), `SKAI-1006-market-expansion.md` (prerequisite 1), D1 (KSA is discovery-only until paid pilots exist) and `docs/ENVIRONMENTS.md` (one Supabase project per environment, all in the same region).

**Confidence legend.** [V] means verified in a cited source on the date given. [U] means unverified; confirm before acting.

## 1. Decision needed

Where do we store and process the personal data of KSA students, guardians and staff? We need an answer before the first KSA paid pilot (D1) and before the SKAI-1016 trust gate for KSA.

## 2. PDPL requirements that drive hosting

| Topic | Position | Confidence |
|---|---|---|
| Law | Personal Data Protection Law (Royal Decree M/19 of 2021), amended in March 2023, regulated by SDAIA | [V] ([Addleshaw Goddard](https://www.addleshawgoddard.com/en/insights/insights-briefings/2023/data-protection/saudi-arabia-issues-amendments-to-pdpl/), 2023) |
| Enforcement | Fully enforceable since 14 September 2024, after a one-year transition | [V] ([Clyde & Co](https://www.clydeco.com/en/insights/2024/09/saudi-arabia-s-personal-data-protection-law-become), Sep 2024) |
| Localisation | The 2023 amendments removed the original default of keeping data in the Kingdom. Transfers are allowed on set grounds | [V] ([Addleshaw Goddard](https://www.addleshawgoddard.com/en/insights/insights-briefings/2023/data-protection/saudi-arabia-issues-amendments-to-pdpl/)) |
| Transfer grounds | An adequacy decision, or safeguards such as SDAIA standard contractual clauses, binding corporate rules or certification. Conditions: no prejudice to national security, minimum necessary data, and a transfer risk assessment in some cases | [V] ([King & Spalding](https://www.kslaw.com/insights/articles/international-personal-data-transfers-under-saudi-arabias-data-protection-law), cited in SKAI-1005) |
| Extraterritorial reach | Applies to processing of KSA residents' data outside the Kingdom | [V] (SKAI-1005 [S14]) |
| Minors | A guardian's consent is needed for people who lack full legal capacity | [U] on exact age and mechanics |
| Breach notice | Notify SDAIA within 72 hours of becoming aware of a breach likely to harm data subjects | [U] (widely reported; confirm in the Implementing Regulations) |
| Pending change | SDAIA published draft amendments to the Implementing Regulations. Consultation runs 6 October to 5 November 2026. Transfer rules may change | [V] ([Clyde & Co](https://www.clydeco.com/en/insights/2026/10/sdaia-publishes-draft-amendments-to-the-pdpl), Oct 2026) |
| Sector overlays | Government and semi-government customers (for example ministry or public schools) may fall under NCA cloud cybersecurity controls, which can require in-Kingdom hosting | [U]; out of scope while we target private schools |

**Reading:** the PDPL **does not** require in-Kingdom storage for a private-school SaaS. It requires a lawful transfer mechanism. Buyers may still **ask** for in-Kingdom hosting; SKAI-1005 tracks "data-residency blocker raised" as a discovery metric.

## 3. Hosting options

| Option | Status | Fit | Cost and effort | Confidence |
|---|---|---|---|---|
| A. Current Supabase region with SCCs | Works today. Supabase's published region list has no Middle East region | No code change; transfer documented by SDAIA SCCs and a transfer risk assessment | Lowest | [V] regions ([Supabase docs](https://supabase.com/docs/guides/platform/regions), viewed 29 Oct 2026). Which region we use today is [U]; `docs/ENVIRONMENTS.md` does not name it |
| B. Supabase in AWS me-central-1 (UAE) | Not offered by Supabase managed. AWS me-central-1 exists | Would not be in-Kingdom anyway; helps latency only | Would need self-hosted Supabase or Postgres on AWS | [V] that me-central-1 exists; [U] on Supabase plans |
| C. AWS Saudi Arabia region | AWS announced the region in March 2024 with 3 AZs. At LEAP it said launch was "on track" for December 2026. Not GA on 29 Oct 2026 | Full in-Kingdom option once GA | Self-host Postgres (RDS) + storage + auth, or self-hosted Supabase; a second ops stack | [V] ([About Amazon](https://press.aboutamazon.com/2024/3/aws-to-launch-an-infrastructure-region-in-the-kingdom-of-saudi-arabia), Mar 2024; [Zawya](https://www.zawya.com/en/business/ai-shaping-digital-future/aws-cloud-infrastructure-region-in-saudi-arabia-to-open-in-december-473652)) |
| D. Google Cloud Dammam (me-central2) | Reported GA as an in-Kingdom region | In-Kingdom today | Cloud SQL Postgres + GCS; same second-stack cost as C | [U]: confirm the current service list and the reseller model (CNTXT partnership reported) |
| E. Local providers (STC Cloud, Oracle Jeddah/Riyadh) | Available | In-Kingdom | Procurement-heavy | [U] |

## 4. AI processing

OpenAI remains our provider. Prompts are pseudonymised before they leave our stack (AI PII policy). Even with in-Kingdom storage, OpenAI calls are a cross-border transfer. Pseudonymised payloads lower the risk, but the transfer still needs to be in the SCC and the transfer risk assessment unless counsel confirms the data is no longer personal [U].

## 5. Recommendation

**Path: A now, C or D only on trigger.**

1. **Pilot phase (now to the first ≥3 KSA paid schools):** keep the current Supabase region. Sign SDAIA SCCs in the school DPA, run a transfer risk assessment, apply data minimisation, and keep AI pseudonymisation on. Add a KSA addendum to the DPA template.
2. **Trigger for in-Kingdom hosting**, when any of these is true:
   - ≥ 4 of 8 KSA discovery schools raise residency as a blocker (the SKAI-1005 metric);
   - a contracted customer requires it;
   - the final SDAIA amendments restrict transfers for education data.
3. **If triggered:** prefer AWS Saudi Arabia once GA (same vendor family as Supabase's infrastructure, which eases a self-hosted Supabase). Fall back to GCP Dammam if AWS slips. Build the second stack as a separate environment row in `docs/ENVIRONMENTS.md`, with tenant routing by school region. That is a multi-week project; scope it as its own epic.
4. **Re-check after 5 November 2026**, when the SDAIA consultation closes.

## 6. Product and engineering follow-ups

- Add a `data_region` attribute per school, so routing is possible later without a migration rewrite.
- Write the KSA DPA addendum with SCCs and a transfer risk assessment template.
- Write a breach runbook with a 72-hour SDAIA path.
- Confirm and record the current Supabase region in `docs/ENVIRONMENTS.md`.

## 7. Open questions

- What age and form of guardian consent does SDAIA expect for minors? [U]
- Does pseudonymised AI traffic count as a transfer of personal data? [U]
- What is the actual GA date of the AWS KSA region, and the service list in GCP Dammam? [U]

## Sources

Accessed 29 October 2026 unless noted.

- [Clyde & Co: SDAIA publishes draft amendments to the PDPL Implementing Regulations](https://www.clydeco.com/en/insights/2026/10/sdaia-publishes-draft-amendments-to-the-pdpl) (Oct 2026)
- [Clyde & Co: Saudi PDPL becomes enforceable](https://www.clydeco.com/en/insights/2024/09/saudi-arabia-s-personal-data-protection-law-become) (Sep 2024)
- [Addleshaw Goddard: Saudi Arabia issues amendments to PDPL](https://www.addleshawgoddard.com/en/insights/insights-briefings/2023/data-protection/saudi-arabia-issues-amendments-to-pdpl/) (2023)
- [King & Spalding: international transfers under the Saudi PDPL](https://www.kslaw.com/insights/articles/international-personal-data-transfers-under-saudi-arabias-data-protection-law)
- [Supabase: available regions](https://supabase.com/docs/guides/platform/regions)
- [About Amazon: AWS to launch a region in Saudi Arabia](https://press.aboutamazon.com/2024/3/aws-to-launch-an-infrastructure-region-in-the-kingdom-of-saudi-arabia) (Mar 2024)
- [Zawya: AWS Saudi region to open in December](https://www.zawya.com/en/business/ai-shaping-digital-future/aws-cloud-infrastructure-region-in-saudi-arabia-to-open-in-december-473652)
- [Cloud Mercato: AWS me-central-1](https://observer.cloud-mercato.com/providers/aws/me-central-1)
