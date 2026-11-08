# SKAI-1006 — Evaluate international markets beyond Pakistan, KSA and Dubai

Status: research draft (desk research, 2026-10-29). Companion to `SKAI-1005-cohort-validation.md` and `d2-13-14-expansion-gates.md`.
**Recommendation: DEFER all new markets** until the triggers in section 4 are met. Figures cite their access date. Blank cells mean this pass found no reliable public figure.

## 1. Evaluation criteria

- Market size: private and international K-12.
- Curriculum fit: whether FBISE, Cambridge or Pakistani-diaspora schools exist there.
- Data-protection law.
- Payments.
- Language.
- Competition.
- Cost to enter.

Each criterion is scored 1–5 (5 = most favourable), for a total out of 35.

## 2. Candidate comparison

| Market | Size evidence | Curriculum fit | Data law | Payments | Language | Competition | Entry cost | Score /35 |
|---|---|---|---|---|---|---|---|---|
| Rest of UAE (Abu Dhabi, Sharjah) | Dubai alone has 227 private schools [E1]; other emirates add more under ADEK/SPEA | High: same Pakistani/Indian/UK mix as Dubai | UAE federal PDPL; same as the Dubai pilot (re-use) | Cards, bank transfer; same as Dubai | EN/AR | High (international SIS vendors) | Low: same entity and hosting as Dubai | **27** |
| Qatar | GCC private enrolment data paywalled [E2] | Medium: Pakistani community schools exist | Law 13/2016 [E3] | Cards | EN/AR | Medium | Medium: new regulator | **21** |
| Oman | No current count found | Medium: Pakistani community schools | PDPL RD 6/2022, executive regulations Jan 2024, compliance from Feb 2025 [E4], [E8] | Cards | EN/AR | Low-medium | Medium | **20** |
| Kuwait | 653 private schools (2011, stale) [E5] | Medium: large South Asian community | No comprehensive PDPL confirmed in this pass (sectoral rules) [E3] | Cards, KNET | EN/AR | Medium | Medium | **20** |
| UK supplementary schools | Not quantified in this pass | Low-medium: weekend, Islamic or GCSE tuition rather than the boards we target | UK GDPR (well understood) | Stripe/cards easy | EN | High (many cheap tools) | Low tech cost, high go-to-market cost | **19** |
| Bahrain | No count found | Medium | Law 30/2018 with a PDP Authority [E3], [E9] | Cards, BenefitPay | EN/AR | Medium | Medium: small market | **18** |
| Malaysia | 500+ private schools incl. 250+ international; international enrolment ~88.9k (May 2024) [E6] | Low: Cambridge/IGCSE, no Pakistani boards | PDPA 2010 | FPX, cards | EN/MS | High | High | **16** |
| Bangladesh | No count found in this pass | Medium: English-medium Cambridge schools; national boards differ | Data protection law not confirmed in force | bKash, Nagad | BN/EN | Medium, price-sensitive | High: new board content | **15** |
| Egypt | No count found in this pass | Low: Thanaweya Amma / IGCSE / American | Law 151/2020 (status of executive regulations unconfirmed) | Fawry, cards; FX controls | AR | Medium | High: Arabic content, FX | **14** |

Global context: 15,075 international schools, 7.6M students and USD 69.3B fee income (ISC Research 2025, via Tes) [E7].

## 3. Interpretation

- **Rest of UAE** is an extension of Dubai rather than a new market: same law, entity, payments and curricula. Open it automatically once Dubai passes its gate.
- **Qatar, Oman, Kuwait and Bahrain** are worth entering only through the Pakistani community-school segment, once it is proven in KSA (SKAI-1005 segment C). Each country adds its own regulator and data law, and each market is small.
- **Egypt, Bangladesh and Malaysia** need new board content beyond FBISE plus Arabic or Bangla localisation. That amounts to a new product line. They are not viable until Exam Studio supports a second family of boards.
- **UK supplementary schools** are technically easy to enter but fit Exam Studio's board-aligned value proposition poorly.

## 4. Recommendation: DEFER with triggers

| Market | Trigger to reopen |
|---|---|
| Rest of UAE | Dubai cohort hits the SKAI-1005 GO metrics and has ≥ 5 paying schools |
| Qatar, Oman, Kuwait, Bahrain | KSA community-school segment is GO, ≥ 3 inbound requests from that country, and a data-law review is complete |
| UK supplementary | Unsolicited demand from ≥ 10 schools, or a GCSE/A-level content pack exists |
| Egypt, Bangladesh, Malaysia | A second curriculum family (Cambridge or a national board) ships in Exam Studio and the PK+GCC ARR target in `d1-business-model.md` is met |

## 5. Prerequisites before any new market

1. Multi-region data hosting, or a documented transfer mechanism per jurisdiction. The KSA decision in SKAI-1005 is the template.
2. Arabic RTL parity across the app (already part of the UI quality bar).
3. A curriculum abstraction in Exam Studio, so boards beyond FBISE/BISE can be added as content packs.
4. Multi-currency billing with local payment rails (KNET, BenefitPay, Fawry, bKash) behind one billing interface.
5. AI PII pseudonymisation verified against each target country's data law.
6. A country-level legal review and DPA template.

## 6. Sources (all accessed 2026-10-29)

- [E1] Education Middle East, Dubai sees rise in private schools — https://educationmiddleeast.com/news/industry-news/dubai-sees-rise-in-private-schools-student-enrolments/
- [E2] Statista, Enrolled private school students GCC 2023 — https://www.statista.com/statistics/721428/gcc-number-of-private-school-students-by-country
- [E3] Kennedys, Overview of personal data protection laws in the GCC — https://kennedyslaw.com/thought-leadership/article/an-overview-of-personal-data-protection-laws-in-the-member-states-of-the-cooperation-council-for-the-arab-states-of-the-gulf-gulf-cooperation-council-gcc
- [E4] Clyde & Co, Oman issues Executive Regulations to the PDPL — https://www.clydeco.com/en/insights/2024/02/oman-issues-executive-regulations-to-pdpl
- [E5] MEED, GCC schools directory — https://www.meed.com/gcc-schools-directory
- [E6] ISC Research, Malaysia Market Intelligence Summary 2025-26 — https://iscresearch.com/reports/malaysia-market-intelligence-summary/
- [E7] Tes, International sector passes 15,000 school milestone — https://www.tes.com/magazine/news/specialist-sector/international-sector-passes-15000-school-milestone
- [E8] PwC Middle East, Oman PDPL series — https://www.pwc.com/m1/en/blog/oman-personal-data-protection-law-series.html
- [E9] Plexal, Comparison between GCC data protection legislation — https://www.plexal.com/wp-content/uploads/2023/09/COMPARISON-BETWEEN-GCC-DATA-PROTECTION-LEGISLATION_.pdf

## Follow-up tickets

1. **Rest-of-UAE readiness check**: confirm how ADEK/SPEA reporting differs from KHDA; reopen when the Dubai gate passes.
2. **GCC data-law matrix**: legal review of Qatar, Oman, Kuwait, Bahrain and Egypt laws and transfer rules; produce DPA templates.
3. **Curriculum abstraction for Exam Studio**: design a board/content-pack model so boards beyond FBISE can be added.
4. **Multi-currency and local payment rails spike**: evaluate KNET, BenefitPay, Fawry and bKash behind the billing interface.
5. **Expansion trigger tracker**: add the section 4 triggers to `d2-13-14-expansion-gates.md` and review them quarterly.
6. **Fill market-size gaps**: get current private school counts for Qatar, Oman, Kuwait, Bahrain, Egypt and Bangladesh from ministry statistics.
