# SKAI-1100 — Competitor teardown: UAE/GCC school management systems

Status: desk research draft, 29 October 2026. Owner: Mohsin Ali. Recommendations are pending founder approval.
Builds on: `docs/product-review-2026-10/d1-business-model.md` (D1), `d2-market-research.md`, `SKAI-1005-cohort-validation.md` (Dubai pilot), `SKAI-1006-market-expansion.md` (GCC sequence) and `docs/competitor-eskooly-brief.md`.

**Confidence legend.** **[V]** means verified on a public page on the date given. **[U]** means unverified or vendor self-description, to be confirmed in discovery calls. Gulf pricing is mostly quote-only, so most price cells are [U].

## 1. Why this matters

D1 keeps the Gulf as an Exam Studio *discovery* market until two Gulf paid pilots exist. The Dubai pilot (KHDA) is the first Gulf proof point. Buyers there already run an SIS or LMS, so Skoolee will usually be sold **next to** an incumbent rather than in place of one. This teardown looks at where incumbents are strong, where they are thin, and what that means for our positioning.

## 2. Competitor set

| Vendor | Type | Home market / GCC footprint | Notes |
|---|---|---|---|
| Classera | LMS + school management | KSA HQ; wide GCC public and private use [U] | Strong with ministries and large groups; quote-only pricing (see D1 doc, viewed 29 Oct 2026) |
| Alef Education | AI adaptive learning platform | Abu Dhabi; UAE public schools and other countries [U] | Content-led with government contracts; not a school SIS |
| iSAMS / Arbor / Engage (UK SIS) | SIS + MIS | UK; used by British-curriculum schools in Dubai and Abu Dhabi [U] | Deep UK workflows such as assessment tracking and reports; Arabic UI limited [U] |
| PowerSchool / Veracross / OpenApply (Faria) | SIS, admissions | US and international schools in the GCC [U] | Enterprise pricing; strong admissions and reporting |
| Fedena / Teachmint / Edunation / Entab | Low-cost ERP | India-origin; strong in Indian-curriculum GCC schools [U] | Teachmint from USD 5 per user per year ([Capterra](https://capterra.com/p/163105/Teachmint/), viewed 29 Oct 2026) [V]. Edunation lists Arabic, from EUR 1.25 flat-rate, but its listed availability is Ireland ([Capterra IN](https://www.capterra.in/software/188393/edunation), viewed 29 Oct 2026) [V] |
| OpenEduCat | Open-source ERP | Markets UAE, KHDA and ADEK compliance | Its own page says the KHDA and ADEK connectors are on a roadmap and not yet shipped ([OpenEduCat](https://openeducat.org/solutions/school-management-system-in-uae/), viewed 29 Oct 2026) [V as a claim] |
| eSkooly | Low-cost SaaS | Global; PK/GCC small schools | See `docs/competitor-eskooly-brief.md` |
| Regulator systems: ADEK eSIS, KHDA and MOE portals | Mandatory government systems | Per emirate | Integration targets, not competitors. ADEK eSIS covers school profiles, admissions, transfers, withdrawals and parent requests ([ADEK guide](https://guides.adek.gov.ae/Esis/tc), viewed 29 Oct 2026) [V] |

## 3. Feature comparison

Scale: ● strong, ◐ partial, ○ absent or not found. Competitor ratings are [U] unless noted. Skoolee ratings come from the current codebase and PRD v2.0.

| Capability | Classera | Alef | UK SIS | PowerSchool/Faria | India-origin ERP | Skoolee today |
|---|---|---|---|---|---|---|
| Admissions, enrolment | ◐ | ○ | ● | ● | ● | ◐ |
| Attendance, timetable | ● | ○ | ● | ● | ● | ● |
| Fees and invoicing in AED/SAR | ◐ | ○ | ◐ | ● | ● | ◐ (PKR catalogue only; see SKAI-1044) |
| Gradebook, report cards | ● | ◐ | ● | ● | ● | ● |
| Exam authoring and paper printing | ◐ | ○ | ○ | ○ | ◐ | ● Exam Studio |
| Marked evidence → next lesson | ○ | ◐ (adaptive practice) | ◐ | ○ | ○ | ● (flagship promise) |
| Parent messaging, WhatsApp | ◐ | ○ | ◐ (email/app) | ◐ | ● | ● (D3 school-owned WABA) |
| Regulator returns (KHDA/ADEK/MOE) | ◐ | n/a | ◐ | ◐ | ◐ | ○ |
| Arabic UI and RTL | ● | ● | ○–◐ | ◐ | ◐ | ● (RTL parity is a release gate) |
| Urdu UI | ○ | ○ | ○ | ○ | ○ | ● |
| Generative AI for teachers | ◐ | ● adaptive, ◐ generative | ◐ add-ons | ◐ (PowerBuddy) | ◐ | ● behind flags (AI-05 gate) |
| In-country data hosting | ● for KSA public sector | ● UAE | ◐ | ◐ | ○ | ○ (see SKAI-1101) |

## 4. Pricing models seen

- **Per student per year** is the norm for SIS and ERP products. India-origin tools publish low entry prices. UK and US SIS vendors sell annual contracts with setup fees [U].
- **Quote-only enterprise** is the model for Classera, Alef and PowerSchool [U]. Government tenders drive Classera and Alef volume [U].
- **What this means for D1 and D7:** Gulf buyers expect a quote rather than a public price list. That supports D7 (no pricing on the marketing site) and D1 (a separate founder decision for each Gulf quote).

## 5. AI positioning

- Alef sells adaptive learning built on its own content. It is a content company, not an assessment-workflow tool [U].
- Incumbent SIS vendors are adding chat assistants and summaries [U]. We found none that shows a closed loop from a marked paper to a re-teach plan with evidence.
- **Our edge:** the Exam Studio chain (author → print → mark → evidence → next lesson), with pseudonymised prompts (AI PII policy) and AI-05 evaluation gates.
- **Our risk:** buyers will compare us with free general-purpose chatbots. The pilot must measure time saved per assessment cycle.

## 6. Arabic and RTL

- Classera and Alef are Arabic-first. UK and US SIS products are English-first with partial Arabic [U].
- Skoolee ships EN, AR and UR with RTL parity as a release gate.
- **Gap:** Arabic **content** is thin (question banks, rubrics, MOE Arabic and Islamic studies). An RTL UI alone will not win Arabic-medium schools.

## 7. Gaps (where we lose today)

1. There are no regulator returns and no eSIS or KHDA integration. See SKAI-1104.
2. There is no in-country hosting for KSA. See SKAI-1101.
3. Billing is PKR only, so AED and SAR quotes are manual (SKAI-1044).
4. Our admissions module is weaker than the UK and US SIS products.
5. We have no published SOC 2 or ISO 27001 report. Our status is [U]; confirm with the founder. Large groups usually ask for one.
6. Exam Studio has no Gulf curriculum packs (UK, CBSE, MOE), only FBISE (SKAI-1006 prerequisite 3).

## 8. Edges (where we can win)

1. The assessment-to-lesson loop with evidence. We found no incumbent that does this end to end.
2. Pakistani-curriculum and South Asian community schools. We offer Urdu and FBISE content, which no Gulf incumbent does.
3. WhatsApp-first parent communication with a school-owned WABA (D3).
4. Module positioning: Exam Studio can sit beside iSAMS, Classera or PowerSchool rather than replace them.

## 9. Recommendations

1. In the Dubai pilot, position Exam Studio as a **module next to the existing SIS**. Do not pitch replacing the SIS.
2. Lead with Pakistani-curriculum schools (SKAI-1005 segment D). Move to UK and Indian mid-fee schools once a second curriculum pack ships.
3. Add three questions to the SKAI-1044 discovery script: which SIS the school uses and when its contract renews, what hurts in regulator reporting, and what the school's AI policy is.
4. Collect real Gulf quotes for Classera, iSAMS and Teachmint during discovery. None in this doc are verified.

## 10. Open questions (unverified)

- Does Classera offer a paper workflow like Exam Studio's? [U]
- What do UK SIS vendors charge per student in Dubai? [U]
- Which incumbents already submit KHDA or ADEK returns automatically? [U]

## Sources

All accessed 29 October 2026.

- [Teachmint on Capterra](https://capterra.com/p/163105/Teachmint/)
- [Edunation on Capterra India](https://www.capterra.in/software/188393/edunation)
- [OpenEduCat: school management system in UAE](https://openeducat.org/solutions/school-management-system-in-uae/)
- [ADEK eSIS guide](https://guides.adek.gov.ae/Esis/tc)
- [Gulf News: private school staff profiles on the ADEK system](https://gulfnews.com/uae/education/more-than-24400-profiles-of-private-school-employees-on-new-system-1.63752862)
- Internal: `docs/product-review-2026-10/d1-business-model.md`, `SKAI-1005-cohort-validation.md`, `SKAI-1006-market-expansion.md`
