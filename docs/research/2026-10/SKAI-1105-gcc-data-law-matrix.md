# SKAI-1105 — GCC data-protection law matrix

Status: desk research draft, 29 October 2026. Owner: Mohsin Ali. **This is not legal advice.** Every cell must be confirmed by local counsel before a market opens.
Builds on: `docs/product-review-2026-10/SKAI-1006-market-expansion.md` (follow-up 2, "GCC data-law matrix"; prerequisites 1, 5 and 6), `SKAI-1005-cohort-validation.md` (KSA law), SKAI-1101 (KSA residency decision) and the AI PII policy (pseudonymise before any prompt). D1 sequence: Pakistan → Dubai/KSA pilots → others on trigger.

**Confidence legend.** [V] means verified in a cited source on the date given. [U] means unverified or a secondary-source summary. Many cells are [U]: primary gazettes were not reviewed in this pass.

## 1. Matrix

| | UAE (federal) | KSA | Qatar | Bahrain | Oman | Kuwait |
|---|---|---|---|---|---|---|
| Law | Decree-Law 45/2021 (PDPL), in force 2 Jan 2022 [V] | PDPL, Royal Decree M/19 (2021), amended 2023 [V] | Law 13/2016 on Personal Data Privacy [V] (SKAI-1006 [E3]) | Law 30/2018 (PDPL) [V] ([E3], [E9]) | Royal Decree 6/2022; executive regulations Jan 2024; compliance from Feb 2025 [V] ([E4], [E8]) | CITRA Data Privacy Protection Regulation (2024 update of the 2021 regulation) [U]; no comprehensive statute [V] ([E3]) |
| Regulator | UAE Data Office [V] | SDAIA [V] | National Cyber Governance and Assurance Affairs (NCSA) [U] | Personal Data Protection Authority [V] ([E9]) | Ministry of Transport, Communications and IT [U] | CITRA [U] |
| Implementing rules | **Disputed.** Sources conflict on whether the executive regulations are issued; some cite a compliance date of 1 Jan 2027 [U] | Implementing and Transfer Regulations (Sep 2023); draft amendments under consultation to 5 Nov 2026 [V] | Guidelines issued [U] | Ministerial resolutions issued [U] | Executive regulations Jan 2024 [V] | The regulation itself [U] |
| Consent | Consent or another lawful basis such as contract or legal obligation [U] | Consent or other bases, including legitimate interest since 2023 [U] | Consent or legitimate purpose [U] | Consent or listed bases [U] | Consent-centric; explicit written consent for sensitive data [U] | Consent-centric for service providers [U] |
| Minors | Guardian consent for those lacking capacity [U] | Guardian consent for those lacking capacity [U] | Special protection for children's data online; guardian consent [U] | Guardian consent [U] | Guardian consent; children's data treated as sensitive [U] | Guardian consent [U] |
| Cross-border transfer | Allowed to adequate countries or with safeguards (contracts, consent) [U] | Adequacy, SCCs, BCRs or certification; minimum data; risk assessment in some cases [V] (SKAI-1101) | Allowed unless it breaches the law or causes harm; regulator may restrict [U] | Adequate countries list, or authority approval / safeguards [U] | Permitted with conditions; regulator rules [U] | Allowed with safeguards; sector rules for government data [U] |
| Residency | No general localisation for private-sector data; sector rules (health, government) differ [U] | No general localisation since 2023; government sector (NCA controls) may require it [V]/[U] | No general localisation found [U] | No general localisation; government cloud rules differ [U] | No general localisation found [U] | Data classification rules may require local hosting for some classes [U] |
| Breach notice | Notify the regulator promptly; exact timing in the executive regulations [U] | 72 hours to SDAIA [U] | Notify the regulator and individuals if harm is serious [U] | Notify the authority (72 hours reported) [U] | 72 hours reported [U] | 72 hours to CITRA reported [U] |
| DPO | Required in some cases [U] | Required in some cases [U] | Not mandatory [U] | Optional, with registration [U] | Required in some cases [U] | [U] |
| Penalties (indicative) | Set in the regulations [U] | Up to SAR 5m; higher for sensitive-data disclosure [U] | Up to QAR 5m [U] | Fines and possible imprisonment [U] | Up to OMR 500k [U] | [U] |

## 2. What each means for Skoolee

| Market | Status in our plan | What we must do before real data |
|---|---|---|
| UAE | Dubai pilot (live market) | DPA with a transfer clause for our hosting region and for OpenAI; guardian consent flow for students; breach runbook; watch the executive-regulation status and plan for a 1 Jan 2027 compliance date [U] |
| KSA | Pilot, discovery-only (D1) | Follow SKAI-1101: SDAIA SCCs plus a transfer risk assessment now; in-Kingdom hosting on trigger; 72-hour breach runbook |
| Qatar | Deferred (SKAI-1006) | Counsel review; check any school-sector rules from the Ministry of Education [U] |
| Bahrain | Deferred | Check the adequacy list and whether our hosting country is on it [U]; register with the authority if required |
| Oman | Deferred | Explicit consent and permits for some processing [U]; budget extra time for regulator approvals |
| Kuwait | Deferred | Confirm whether CITRA's regulation covers a foreign SaaS serving private schools [U] |

## 3. Cross-cutting product requirements

These apply in every market, so build them once:

1. **Guardian consent record per student**: who consented, when, which purposes, and the language shown (EN/AR/UR).
2. **Per-school data region attribute** (shared with SKAI-1101) so hosting can be routed later.
3. **Breach runbook** with a 72-hour clock and a per-country regulator contact table.
4. **DPA template with country annexes**: transfer mechanism, sub-processors (Supabase, Vercel, OpenAI, WhatsApp/Meta, email/SMS providers) and their regions.
5. **AI**: keep pseudonymisation before every prompt and never default to an unapproved provider (existing policy). Record OpenAI as a cross-border sub-processor in every annex.
6. **Data-subject requests**: access, correction and deletion exports per student and guardian, with tenant isolation (school_id) preserved.

## 4. Recommendation

- Treat **UAE and KSA** as the only markets needing completed legal review now. Everything else stays deferred under the SKAI-1006 triggers.
- Build the six cross-cutting items in §3 as one compliance epic. Most of the cost is shared, and the remaining per-country work is mainly annexes and runbook rows.
- Book a single GCC counsel review covering all six countries once the first KSA paid pilot is signed. Ask counsel to convert every [U] cell to [V] or to correct it.

## 5. Open questions

- What is the official status and date of the UAE PDPL executive regulations? [U]
- Do Qatar or Kuwait apply sector rules to school data? [U]
- Does pseudonymised AI traffic count as personal data in each country? [U]

## Sources

Accessed 29 October 2026 unless noted.

- [Kennedys: overview of personal data protection laws in the GCC](https://kennedyslaw.com/thought-leadership/article/an-overview-of-personal-data-protection-laws-in-the-member-states-of-the-cooperation-council-for-the-arab-states-of-the-gulf-gulf-cooperation-council-gcc) (SKAI-1006 [E3])
- [Plexal: comparison between GCC data protection legislation](https://www.plexal.com/wp-content/uploads/2023/09/COMPARISON-BETWEEN-GCC-DATA-PROTECTION-LEGISLATION_.pdf) (Sep 2023)
- [Clyde & Co: Oman issues PDPL executive regulations](https://www.clydeco.com/en/insights/2024/02/oman-issues-executive-regulations-to-pdpl) (Feb 2024)
- [PwC Middle East: Oman PDPL series](https://www.pwc.com/m1/en/blog/oman-personal-data-protection-law-series.html)
- [Clyde & Co: SDAIA draft amendments to the PDPL Implementing Regulations](https://www.clydeco.com/en/insights/2026/10/sdaia-publishes-draft-amendments-to-the-pdpl) (Oct 2026)
- [Clyde & Co: Saudi PDPL becomes enforceable](https://www.clydeco.com/en/insights/2024/09/saudi-arabia-s-personal-data-protection-law-become) (Sep 2024)
- [ConsentStack: UAE PDPL](https://consentstack.io/regulations/uae-pdpl) (secondary; flags conflicting reports on the executive regulations)
- [PromptQuorum: UAE PDPL data sovereignty 2026](https://www.promptquorum.com/local-llms/uae-pdpl-data-sovereignty-local-ai-2026) (secondary)
