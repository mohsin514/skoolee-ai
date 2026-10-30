# SKAI-1104 — Rest-of-UAE readiness beyond the Dubai pilot

Status: desk research draft, 29 October 2026. Owner: Mohsin Ali. Pending founder approval.
Builds on: `docs/product-review-2026-10/SKAI-1006-market-expansion.md` (Rest of UAE scored 27/35; follow-up 1, "confirm how ADEK/SPEA reporting differs from KHDA"), `SKAI-1005-cohort-validation.md` (Dubai pilot), D1 (Gulf is discovery-only until two paid pilots) and D3/D8 (WhatsApp).

**Trigger, unchanged from SKAI-1006:** reopen when the Dubai cohort hits the SKAI-1005 GO metrics and has ≥ 5 paying schools.

**Confidence legend.** [V] means verified in a cited source on the date given. [U] means unverified; confirm with the regulator or a school before building.

## 1. Regulators

| Regulator | Emirates | Private-school role | Data / systems | Confidence |
|---|---|---|---|---|
| KHDA (Knowledge and Human Development Authority) | Dubai (the pilot) | Licensing, fee framework (Education Cost Index), inspections. Formal inspections paused for 2025–26 | School data returns via KHDA portals | [V] for the inspection pause (SKAI-1005 [S20]); [U] for data-return formats |
| ADEK (Department of Education and Knowledge) | Abu Dhabi, including Al Ain and Al Dhafra | Licensing, policies, Irtiqaa inspections, fees | **eSIS** is mandatory for profiles, admissions, transfers, withdrawals, reservations and parent requests. The staff "Pass" system links to eSIS | [V] ([ADEK eSIS guide](https://guides.adek.gov.ae/Esis/tc); [Gulf News](https://gulfnews.com/uae/education/more-than-24400-profiles-of-private-school-employees-on-new-system-1.63752862)) |
| SPEA (Sharjah Private Education Authority) | Sharjah | Licensing, fees and quality framework for Sharjah private schools | Own reporting; formats not found | [U] |
| MOE (Ministry of Education) | Federal; private schools in Ajman, Umm Al Quwain, Ras Al Khaimah and Fujairah, plus the federal curriculum everywhere | Licensing in the northern emirates; sets mandatory subjects (Arabic, Islamic Education, Moral/Social Studies) for all private schools | Federal student systems (names and formats not confirmed) | [U] |

The federal **UAE PDPL** (Decree-Law 45/2021) applies in every emirate. The data law is the same as Dubai's, so the SKAI-1105 analysis carries over. Free-zone regimes (DIFC, ADGM) apply only to entities in those zones, which schools usually are not [U].

## 2. Curricula

The curriculum mix is broadly similar across emirates: British, American, Indian (CBSE/ICSE), IB, MOE, Pakistani (FBISE) and others. Abu Dhabi has a larger share of American and MOE-curriculum schools; Sharjah and the northern emirates have more lower-fee Indian, Pakistani and Arabic-medium schools [U; based on general market knowledge, not counted in this pass].

Every emirate requires the MOE subjects: Arabic, Islamic Education, and Moral, Social and Cultural Studies. This matters for Exam Studio content and report cards everywhere.

## 3. Product changes per regulator

| Change | KHDA (Dubai) | ADEK | SPEA | MOE (northern emirates) | Size |
|---|---|---|---|---|---|
| Regulator field set on student and staff records (Emirates ID, nationality, MOE/eSIS ID) | Needed for the pilot already | Needed; eSIS ID | Needed [U] | Needed; MOE ID [U] | M |
| Export or integration for official returns | CSV export first | eSIS: export matching its fields; an API only if ADEK offers one [U] | CSV export [U] | CSV export [U] | M–L |
| Report-card templates with mandatory Arabic and Islamic subjects, bilingual print | Yes | Yes | Yes | Yes | M |
| Arabic content packs for Exam Studio (Arabic, Islamic Education) | Optional | Higher need (more Arabic-medium schools) | Higher need | Highest need | L |
| Attendance codes and calendars per regulator | Check KHDA codes | eSIS attendance rules [U] | [U] | [U] | S |
| Fee rules (approved fee caps, invoices showing the approved fee) | ECI-based framework | ADEK fee policy [U] | SPEA fee approval [U] | MOE [U] | S–M |
| Inspection evidence packs (assessment data in framework language) | Paused this year | Irtiqaa | SPEA framework [U] | MOE framework [U] | M |
| Hosting and data law | UAE PDPL | Same | Same | Same | None beyond Dubai |
| Billing in AED | Needed for the pilot | Same | Same | Same | Shared with Dubai |

## 4. Recommended sequence

1. **Abu Dhabi (ADEK) first:** biggest market after Dubai with a clear system of record (eSIS). The work is mostly a field mapping and export.
2. **Sharjah (SPEA) second:** fit with the Pakistani and Indian community-school segment.
3. **Northern emirates (MOE) last:** small, more Arabic-medium, needs Arabic content packs.

Everything in §3 marked "Needed for the pilot" belongs in the Dubai scope, not in this expansion.

## 5. Before building

- Confirm eSIS field formats and whether ADEK offers a vendor API. Ask a pilot school's registrar.
- Get the SPEA and MOE reporting formats from two schools in each.
- Confirm that the mandatory-subject rules apply to the grades our pilot schools teach.

## 6. Open questions

- Does ADEK accredit SIS vendors for eSIS integration? [U]
- Does SPEA have a central student information system? [U]
- How many Pakistani-curriculum schools are in Sharjah and Abu Dhabi? [U]; this is SKAI-1005 follow-up 3.

## Sources

All accessed 29 October 2026.

- [ADEK eSIS guide](https://guides.adek.gov.ae/Esis/tc)
- [ADEK eSIS guide, section 10225](https://guides.adek.gov.ae/Esis/tc/10225)
- [Gulf News: more than 24,400 private school staff profiles on the new system](https://gulfnews.com/uae/education/more-than-24400-profiles-of-private-school-employees-on-new-system-1.63752862)
- [OpenEduCat: school management system in UAE](https://openeducat.org/solutions/school-management-system-in-uae/) (vendor claims; it says its KHDA/ADEK connectors are on a roadmap)
- Internal: `docs/product-review-2026-10/SKAI-1005-cohort-validation.md` [S17]–[S22] for Dubai/KHDA facts; `SKAI-1006-market-expansion.md`
