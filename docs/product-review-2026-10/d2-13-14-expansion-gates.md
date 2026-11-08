# SKAI-1019 (D2-13) and SKAI-1020 (D2-14) — Science and in-market curriculum expansion gates

Status: **gate, registry and comparison only. Every candidate is PENDING and unavailable.** No edition is verified, no educator has calibrated anything, and no decision is approved. Built 29 October 2026 against the approved D2 plan (`docs/product-review-2026-10/d2-market-research.md`). Neither card is a prerequisite for the first mathematics packs.

## Enforcement

`src/lib/school-ai/pack-expansion-gate.ts` holds a registry of deferred candidates (`EXPANSION_CANDIDATES`) and a fail-closed `evaluateExpansion`. A candidate becomes available only when its **own** record has:

- a source identity (board, qualification, subject, grade) that matches the registry entry exactly, plus edition, exam year, academic year, term, tier, language, official URL and retrieval date, marked `VERIFIED`;
- no `inheritsFrom`: support is never copied from another pack or edition (0625 ≠ 0580, BISE Rawalpindi/Multan ≠ BISE Lahore, BSEK SSC ≠ BIEK HSC, historical editions not reused);
- source rights `SCHOOL_APPROVED` or `LICENSED`, and a school academic-owner selection;
- for science: the required mathematics pack verified with a SKAI-1018 go decision, educator sign-off on all eight calibration areas (coverage, diagrams, units, significant figures, numerical tolerance, method marks, rubric, practical limitations) and an explicit list of disabled practical/diagram/question types;
- for KSA foreign-curriculum reuse: an exact approved Cambridge pack with matching qualification, tier and exam year plus a school grade mapping; US/IB equivalence is refused;
- an `ADOPT` decision signed by founder and educator, with its own bounded `SKAI-` implementation ticket;
- a passed SKAI-1018 readiness gate for the pack's pilot.

`expansionAvailability` produces the capability/sales availability matrix: all `false` until each record passes. Tests: `tests/school-ai/pack-expansion-gate.test.ts`.

## Candidate comparison (in current markets only)

Sources retrieved 29 October 2026 unless noted. "Observed" means the official page states it; everything else is a check to perform.

| Candidate | Official source | Observed | Must verify before ADOPT | Proposed disposition |
| --- | --- | --- | --- | --- |
| Cambridge IGCSE Physics 0625 (Dubai; KSA foreign) | [cambridgeinternational.org 0625](https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-physics-0625/) | Syllabuses listed for exam years 2023–2025, 2026–2028 and 2029 — a different cycle from 0580 (2025–2027 / 2028–2030). | Core/Extended papers, practical vs alternative-to-practical, rights to past papers, school year mapping. | DEFER until 0580 pack + go decision. |
| FBISE Grade 9 physics | [fbise.edu.pk](https://www.fbise.edu.pk/) (see D2 plan notice) | NCP 2022–23 frameworks notice (D2 plan). | Grade-9-specific current notice, scheme, marks, practical rules. | DEFER until FBISE math (SKAI-1009). |
| BISE Lahore Grade 9 physics | [biselahore.com/notifications](https://biselahore.com/notifications) (D2 plan) | Edition-sensitive 2025–27 schemes (D2 plan). | Separate physics scheme for target exam year. | DEFER until SKAI-1010. |
| KSA school-selected science | [MoE Ain guidance](https://www.moe.gov.sa/ar/mediacenter/MOEnews/Pages/i-85976-t.aspx) (D2 plan) | Channel only; edition not verified. | School-supplied textbook edition, term, marking policy. | DEFER until KSA math pack. |
| Grade 10 FBISE / BISE Lahore maths | As above | — | Own SSC-II / Part II scheme; never copy Grade 9. | DEFER. |
| BSEK SSC maths (Karachi) | [bsek.edu.pk](https://www.bsek.edu.pk/) (D2 plan) | Separate syllabus and model-paper resources (D2 plan). | Grade, year, rights, marking. | DEFER pending SKAI-1005 demand. |
| BIEK HSC maths (Karachi) | [biek.edu.pk](https://www.biek.edu.pk/) | Board administers HSC (intermediate) exams — distinct from BSEK SSC. | Outside first secondary scope; demand evidence. | DEFER (likely REJECT for this phase). |
| Pearson Edexcel International GCSE maths (Dubai) | Pearson qualifications site — not retrieved here | KHDA groups it under "UK" with Cambridge (D2 plan). | Spec code, tier, exam series, rights. | DEFER pending demand. |
| CBSE Class X maths (Dubai) | cbseacademic.nic.in — not retrieved here | Indian curriculum 26% of Dubai enrolment ([KHDA 2024–25](https://web.khda.gov.ae/en/About-Us/News/2025/Dubais-private-school-sector-records-6-enrolment)) motivates comparison only. | Current curriculum year, sample papers, rights. | DEFER; next comparison candidate. |
| US curriculum maths (Dubai) | School-specific standards | 14% of enrolment (KHDA). | No single board; per-school framework. | DEFER. |
| IB MYP maths (Dubai) | ibo.org — not retrieved here | 7% of enrolment (KHDA). | Criteria-based assessment rights and fit. | DEFER. |

Rows citing "D2 plan" reuse that plan's sources (cut-off 28 October 2026) and were not re-fetched for this PR. Rows marked "not retrieved" have no verified fact recorded; they stay unverified.

## Decision record (per candidate)

| Field | Value |
| --- | --- |
| Candidate id | |
| Decision (ADOPT / DEFER / REJECT) and rationale | |
| SKAI-1005 demand evidence (qualification / exam-year demand) | |
| Source rights status and reference | |
| Implementation/support cost estimate | |
| Founder sign-off / educator sign-off / date | |
| Bounded implementation ticket (≤400 lines) | |
| Prerequisites outstanding | |

## Human-only, not done here

Edition verification of every row, rights clearance, school selection, subject/native educator calibration, demand evidence (SKAI-1005), founder and educator decisions, and creating bounded implementation tickets for adopted packs. Additional geographies remain SKAI-1006.
