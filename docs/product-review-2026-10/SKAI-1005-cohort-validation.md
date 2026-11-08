# SKAI-1005 — Validate Pakistan, KSA and Dubai cohorts

Status: research draft (desk research, 2026-10-29). Follow-up to `d2-market-research.md` and `cohort-discovery.md`.
Every figure cites a URL and access date. Where no current official figure was found, the doc says so rather than giving an estimate. Treat those cells as questions for buyer interviews, not as facts.

## 1. Method and confidence

- Desk research via web search on 2026-10-29. Sources are tagged **[Official]** (regulator/government), **[Press]**, **[Analyst]** (paid-report summaries, consultancies) or **[Vendor]** (listing sites, vendor pages).
- No named private individuals are recorded. Decision makers are described by role only.
- Confidence: Dubai = high (KHDA data reported by press); Islamabad = medium (regulator figures reported by press); Riyadh/Jeddah = medium-low (analyst estimates); Lahore = low (no current public private-school count found).

## 2. City fact sheets

### 2.1 Lahore (Punjab, Pakistan)

| Item | Finding | Source |
|---|---|---|
| Private school count | No current Lahore-specific official count found. Punjab private-school census datasets exist (2016, 2017-18), but Lahore figures could not be extracted in this pass. Older press reports put Punjab private schools at 35,000+, with over 62% unregistered. | [S1], [S2] |
| Private share | About one-third of all students in Pakistan attend private school. Private schooling is concentrated in northern Punjab districts. | [S3] |
| Boards | BISE Lahore (Matric/Inter); Cambridge (O/A level) in premium chains; FBISE in some chain campuses. | `d2-market-research.md` |
| Fee bands (working) | Low-fee (< PKR 5k/month), mid (PKR 5k–20k), premium Cambridge (PKR 20k+). These are internal working assumptions to validate in interviews; no official band data found. | — |

### 2.2 Islamabad / Rawalpindi

| Item | Finding | Source |
|---|---|---|
| Private institutions (ICT) | PEIRA reported 1,571 private institutions across five zones serving ~389,000 students (reported to the Islamabad High Court). An older report cited ~1,560. | [S4], [S5] |
| Regulation | Annual registration renewal window 1 March–30 April; optional 3-year renewal with advance fee. | [S6] |
| Fee control | Schools may raise fees 1–5% a year; up to 8% subject to 28 evaluation checkpoints. Rises of 10–12% were reversed after complaints. Press criticises enforcement. | [S7], [S8] |
| Boards | FBISE dominant for Matric/Inter; Cambridge in premium chains. | `d2-market-research.md` |
| Rawalpindi | Falls under Punjab (not PEIRA); no separate count found. | — |

Implication: fee caps in ICT squeeze school margins. The software must be pitched as saving costs (teacher time, fee collection), not as a premium add-on.

### 2.3 Riyadh / Jeddah (KSA)

| Item | Finding | Source |
|---|---|---|
| Market split | Riyadh ~36% of the KSA private K-12 market (2025); expatriates ~73% of private K-12 students. | [S9] [Analyst] |
| Seat gap | ~214k additional private seats needed by 2035; Riyadh 63.5k+, Jeddah 42.6k. | [S10] |
| Mid-priced segment | Invest Saudi calls mid-priced international schools the largest segment of Riyadh's private international market; ~24k new places by 2030. | [S11] [Official] |
| Fees | International school tuition in Riyadh ~SAR 25,000–150,000+/year (indicative). | [S12] [Vendor] |
| Density | MoE study: KSA has 7 international schools per 1M people vs a GCC average of 31 (dated). | [S13] [Official] |
| Curriculum mix | Saudi national (MoE), US, British, IB, plus community schools (Pakistani, Indian) that follow home-country boards. Pakistani community schools are the natural way in for FBISE content. | `d2-market-research.md` |
| Data law | PDPL in force. Transfers outside KSA need an adequacy finding or safeguards (SCCs, BCRs, certification). The PDPL also applies to residents' data processed outside KSA. | [S14], [S15], [S16] |

### 2.4 Dubai (UAE)

| Item | Finding | Source |
|---|---|---|
| Private schools | 227 private schools and 387,441 students (185 nationalities) in 2024–25; enrolment +6%; target of 100+ new schools by 2033. | [S17], [S18] |
| Curricula | ~17 curricula; UK, Indian, US, IB and French most common among Outstanding schools. | [S19], [S20] |
| Fees | Outstanding schools: AED 29,488 (preschool) to AED 111,799 (Y13). Fees frozen for 2026–27; 2.35% ECI for 2025–26. | [S21], [S22] |
| Inspections | KHDA paused formal inspections for 2025–26. | [S20] |

Implication: Pakistani-curriculum schools are a small share of Dubai. The larger segment is mid-fee Indian and UK curriculum schools, which need content beyond FBISE.

## 3. Competitors and pricing

| Product | Market | Pricing evidence | Notes | Source |
|---|---|---|---|---|
| SkoolPro | Pakistan | PKR 40/student/month (Standard), PKR 55 (Premium: OCR, test maker, analytics) | Closest price anchor for PK; already includes a test maker | [S23] |
| Studentcare.pk | Pakistan | Not published | Claims 1,100+ institutions; fees via 1BILL and Raast QR | [S24] |
| Schooli | Pakistan | Listing shows USD 9 (unit unclear) | WhatsApp-bot attendance/exams | [S25] |
| Smart Campus | Pakistan | Not published | — | [S26] |
| Teachmint | India/GCC | From USD 5/user/year (Capterra Basic) | Hardware board + ERP | [S27] |
| Alma, Classter, iSAMS, Orison | GCC | Not published (quote-based) | Established SIS vendors at premium international schools | [S28] |
| Classera | KSA/GCC | Not found | Known regional LMS; get pricing in interviews | — |

Takeaway: in Pakistan, full school-management software sells for about PKR 40–55 per student per month. Exam Studio must either fit inside that band or justify a separate AI credit line (see `d1-business-model.md`).

## 4. Buying process and decision makers (by role)

| Segment | Economic buyer | Champion | Blocker / gate | Typical cycle |
|---|---|---|---|---|
| PK single-campus private | Owner-principal | Exam coordinator / senior teacher | Fee-collection staff (resist change) | 2–6 weeks, aligned to term start |
| PK chain (10+ campuses) | Head office (CEO/COO) | Academic director | IT lead, regional heads | 3–6 months, annual budget |
| KSA community school | School board / owner | Principal | Ministry licensing, PDPL data-residency questions | 3–9 months, before the August term |
| KSA/Dubai international (mid-fee) | Group CFO / owner | Head of Assessment | IT/DPO; existing SIS contract | 6–12 months, aligned to renewal |
| Dubai Pakistani-curriculum | Owner / board | Principal | KHDA reporting needs | 2–4 months |

This table is an unvalidated assumption. The interviews in section 7 will confirm or replace it.

## 5. Demand signals

- Dubai enrolment +6% and a 100-school expansion target [S17].
- KSA seat gap of ~214k by 2035 [S10]; the government is actively seeking mid-priced international schools [S11].
- Islamabad fee caps [S7] push schools to cut admin cost, which supports a fee-collection and teacher-time pitch.
- PK competitors already bundle a test maker at PKR 55 [S23]. That shows schools will pay for assessment features, but it also caps the price low.

## 6. Scored segment shortlist

Each criterion is scored 1–5 (5 = best). Weights: Pain 25%, Ability to pay 20%, Reachability 20%, Product fit (boards/curricula we support) 25%, Regulatory ease 10%.

| # | Segment profile | Pain | Pay | Reach | Fit | Reg | Weighted |
|---|---|---|---|---|---|---|---|
| A | Islamabad/Rawalpindi FBISE mid-fee school, 300–1,500 students | 4 | 3 | 5 | 5 | 4 | **4.25** |
| C | Riyadh/Jeddah Pakistani community school (FBISE) | 4 | 4 | 3 | 5 | 2 | **3.85** |
| B | Lahore BISE mid-fee chain, 3–15 campuses | 4 | 3 | 4 | 4 | 4 | **3.80** |
| D | Dubai Pakistani-curriculum school | 3 | 4 | 3 | 5 | 3 | **3.65** |
| E | Lahore low-fee single campus (< PKR 5k) | 3 | 1 | 4 | 4 | 4 | **3.20** |
| F | Dubai/Riyadh mid-fee UK/Indian international | 4 | 5 | 2 | 2 | 3 | **3.20** |
| G | Premium Cambridge chain (PK) | 3 | 5 | 2 | 2 | 4 | **3.00** |

Recommendation: validate A, C and B first. Add D opportunistically alongside C, since it uses the same curriculum. Defer F until Exam Studio has content beyond FBISE.

## 7. Buyer-interview script (10 questions, ~30 min)

1. Walk me through how a term exam paper is produced today, from blueprint to printed paper. Who does each step?
2. How many teacher-hours does one exam cycle take across the school? What gets skipped when time runs short?
3. What tools do you use today for fees, attendance, results and paper-setting? What do you pay for each (per student or flat)?
4. Tell me about the last time you switched or dropped a software product. Who decided, and why?
5. Who signs a software purchase here, and who must agree before they sign?
6. When in the year could a new system start without disrupting classes?
7. How do you check that exam papers match the board (FBISE/BISE/MoE) syllabus and past-paper patterns?
8. What would worry you about AI writing exam questions? What would you need to see to trust it?
9. Where must student data be stored, and who in the school would ask that question? (KSA/UAE: PDPL/KHDA specifics)
10. If a tool halved paper-setting time, what would that be worth per student per month, and what would make you say no at that price?

Rules: no demo before Q8, so the demo does not steer answers. Record role, segment letter, student count and fee band. Never record student PII.

## 8. Validation plan and go/no-go metrics

**Timeline:** 6 weeks.
- Weeks 1–2: 8 interviews per segment for A, B and C (24 total), through warm intros and board-teacher networks.
- Weeks 3–4: 3 paid or letter-of-intent pilots per top segment, using the existing pilot flow (`d2-12-pilot-readiness.md`).
- Weeks 5–6: measure pilot usage and decide.

| Metric | Go | No-go |
|---|---|---|
| Interviewees confirming exam-setting as a top-3 pain | ≥ 60% | < 35% |
| Stated WTP ≥ PKR 40/student/month (PK) or SAR 10/student/month (KSA) | ≥ 40% | < 20% |
| Signed pilots / LOIs from interviews | ≥ 3 per segment | 0–1 |
| Pilot: teachers generating ≥ 2 papers in 4 weeks | ≥ 50% of invited | < 20% |
| Pilot: papers accepted with ≤ 20% edits | ≥ 60% of papers | < 30% |
| KSA: data-residency blocker raised and unresolved | ≤ 1 of 8 | ≥ 4 of 8 |

A segment is GO when 4 of the 6 metrics hit Go and neither the WTP nor the pilot-usage metric hits No-go.

## 9. Gaps

- Current Lahore and Rawalpindi private school counts (request Punjab School Education Department census / PEF data).
- Count of Pakistani-curriculum schools in KSA and Dubai (embassy/community-school lists).
- Classera, iSAMS and Alma price points in the GCC (get them in interviews).

## 10. Sources (all accessed 2026-10-29)

- [S1] Dawn, Punjab private schools registration — https://www.dawn.com/news/86995
- [S2] OpenData Pakistan, Punjab Private School Census 2016 dataset — https://opendata.com.pk/dataset/punjab-annual-school-census-report-2017-18/resource/f57f7bb0-458d-429f-ae4d-bf7816e777b3
- [S3] Nguyen & Raju, Lahore Journal of Economics vol. 20 — https://lahoreschoolofeconomics.edu.pk/assets/uploads/lje/Volume20/01_Nguyen_and_Raju_ED_ttc.pdf
- [S4] APP, IHC directs full compliance on 10% free quota — https://www.app.com.pk/?p=1193755
- [S5] Business Recorder, ICT private schools' fee details — https://www.brecorder.com/news/577831
- [S6] ProPakistani, Islamabad new rules for private school registration (Jan 2026) — https://propakistani.pk/2026/01/22/islamabad-introduces-new-rules-for-private-school-registration/amp/
- [S7] APP, PEIRA enforces strict oversight on private school fees — https://www.app.com.pk/?p=1187679
- [S8] Express Tribune, Parents decry rising private school fees — https://tribune.com.pk/story/2631726/parents-decry-rising-private-school-fees
- [S9] Mordor Intelligence, KSA Private K-12 Education Market — https://www.mordorintelligence.com/industry-reports/ksa-private-k12-education-market
- [S10] Argaam, Saudi private schools need 214K more seats by 2035 — https://www.argaam.com/en/article/articledetail/id/1689706
- [S11] Invest Saudi, Mid-priced international schools in Riyadh — https://www.investsaudi.sa/ar/sectors-opportunities/human-capital-innovation/Mid-priced%20International%20Schools%20in%20Riyadh
- [S12] Tutopiya, Riyadh private school fees — https://www.tutopiya.com/blog/international-school-fees/riyadh-private-school-fees
- [S13] KSA MoE, Growth Potential — https://moe.gov.sa/ar/education/studies/Documents/Growth-Potential.pdf
- [S14] Securiti, KSA Regulation on Personal Data Transfer Outside the Kingdom — https://securiti.ai/regulation-on-personal-data-transfer-outside-the-kingdom
- [S15] King & Spalding, International transfers under the Saudi PDPL — https://www.kslaw.com/insights/articles/international-personal-data-transfers-under-saudi-arabias-data-protection-law
- [S16] DLA Piper, Saudi PDPL in force (Feb 2024) — https://www.dlapiper.com/en/insights/publications/2024/02/saudi-arabias-new-personal-data-protection-law-in-force
- [S17] Education Middle East, Dubai sees rise in private schools — https://educationmiddleeast.com/news/industry-news/dubai-sees-rise-in-private-schools-student-enrolments/
- [S18] Gulf Business, Dubai private schools fee nod 2025-26 — https://gulfbusiness.com/?p=309545
- [S19] Takween Advisory, Dubai schools fees and curriculum guide — https://takweenadvisory.ae/en/blog/dubai-schools-fees-curriculum-guide
- [S20] Gulf News, Dubai's 23 outstanding private schools — https://gulfnews.com/living-in-uae/education/dubais-23-outstanding-private-schools-rated-by-khda-1.500227394
- [S21] Khaleej Times, Dubai school fees 2026-27 — https://www.khaleejtimes.com/uae/schools-and-parents/dubai-school-fees-2026-27-tuition-costs-at-outstanding-schools-range?amp=1
- [S22] Gulf News, ECI 2.35% for 2025-26 — https://gulfnews.com/uae/education/education-cost-index-set-at-235-for-dubais-for-profit-private-schools-in-2025-26-academic-year-1.500114256
- [S23] Software Advice, SkoolPro — https://www.softwareadvice.com.au/software/695234/SkoolPro
- [S24] Studentcare.pk — https://studentcare.pk
- [S25] Capterra, Schooli — https://www.capterra.in/software/1097145/Schooli
- [S26] Smart Campus — https://smartcampussolution.it.com
- [S27] Capterra, Teachmint — https://capterra.com/p/163105/Teachmint/
- [S28] Capterra UAE, Orison School ERP alternatives — https://www.capterra.ae/alternatives/1060205/orison-school-erp

## Follow-up tickets

1. **Run 24 buyer interviews (segments A, B, C)**: run the section 7 script and log anonymised results by segment.
2. **Obtain current Lahore/Rawalpindi private school counts**: request Punjab SED/PEF census data and update section 2.
3. **Map Pakistani-curriculum schools in KSA and Dubai**: build a segment-level list (no individuals) from public community-school directories.
4. **Competitor price teardown (Classera, iSAMS, Alma, SkoolPro Premium)**: collect quotes and a feature matrix vs Exam Studio.
5. **KSA PDPL data-residency decision**: choose KSA hosting or SCC-based transfer before any KSA pilot.
6. **Pilot go/no-go dashboard**: track the six section 8 metrics in the pilot tracker.
7. **PK pricing test at PKR 40–55 band**: A/B test pilot offers against the `d1-business-model.md` tiers.
