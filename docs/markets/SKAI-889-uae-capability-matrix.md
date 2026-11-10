# SKAI-889: UAE country capability matrix row

**Status: planned. No UAE claim is supported yet.** This is the engineering inventory for the UAE row of the country capability matrix (epic SKAI-15). It lists what the code on `dev` contains and what is still owed. A capability counts as **live** only when its ticket is Done at L3 or L4 with QA evidence. Nothing here is legal, regulatory or commercial clearance. Snapshot taken 8 November 2026.

Legend: **live** = Done at L3/L4 with QA evidence; **recorded** = code merged to dev, not yet QA-verified at L3; **planned** = not built, or depends on a human or vendor.

| Requirement (card) | What exists on dev | Source | Status |
| --- | --- | --- | --- |
| AED currency | `AE` maps to `AED` in the locale country package | `src/lib/locale/country.ts`, `src/lib/locale/package.ts` | recorded |
| AED payments | Provider catalogue lists AED for Stripe UAE, Checkout.com, Telr, Network International, Tap. No merchant account or production keys | `src/lib/payments/provider.ts` | planned (vendor contract) |
| Arabic and English print | UAE report-card template with mandatory Arabic and Islamic Education, bilingual EN+AR print | `src/lib/academic/uae-report-template.ts` (SKAI-1151) | recorded |
| KHDA / ADEK student and staff identifiers | Regulator ID fields on student and staff records | SKAI-1149 migration `20261109000100_skai_1149_regulator_id_fields` | recorded |
| KHDA / ADEK attendance codes | Regulator attendance codes and calendars per school | SKAI-1153 | recorded |
| KHDA fee caps | Regulator fee caps on fee structures and invoices | SKAI-1154 | recorded |
| Curriculum diversity | Versioned cross-market curriculum contract and board rule table | SKAI-1008, SKAI-1106 | recorded |
| Phone OTP (+971) | AE market config, WhatsApp first, SMS fallback | `src/lib/auth/otp/markets.ts` (SKAI-1061) | planned (sender registration, SKAI-1062) |
| Data protection (federal PDPL, free zones) | Per-market trust gate blocks UAE_DUBAI until reviews are recorded | `docs/trust/SKAI-1016-gulf-trust-readiness.md`, `src/lib/school-ai/market-trust-readiness.ts` | planned (legal review) |
| Emirate operating requirements (KHDA Dubai, ADEK Abu Dhabi, SPEA Sharjah) | No regulator-confirmed requirement list | none | planned (human research) |

## What QA must do before any public UAE claim

1. For each **recorded** row, confirm its ticket is Done at L3 or higher with the QA comment template, then change the row to **live** and link the evidence.
2. Capture screenshots of every public claim about the UAE (marketing site, pricing, sales material). A claim may only name rows marked **live**.
3. Keep this file as the matrix row; update the snapshot date when statuses change.

## Human actions still required

- Qualified review of KHDA, ADEK and SPEA operating requirements for school management software.
- UAE PDPL / free-zone legal review and transfer basis (SKAI-1016 gate).
- A signed AED payment provider agreement and production merchant setup.
- OTP sender registration for +971 (SKAI-1062).
- Gate G4 expansion review (SKAI-964) after pilot evidence.
