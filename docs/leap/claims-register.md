# Claims register (SKO-452)

Every public or investor-facing statement must appear here before use. A claim without evidence, date and (for customer facts) permission is **not usable**. Targets are written as targets. Status values: *implemented* (code and tests exist), *verified in pilot*, *target*, *do not use*.

Last reviewed from the repository on 18 October 2026. Founder review is pending.

| Claim | Status | Evidence | Date | Permission | Notes |
|---|---|---|---|---|---|
| A teacher can scan a paper mark sheet; uncertain cells are held for teacher review and only approved marks are imported | Implemented | `tests/marks-scan/scan.browser.test.ts` (SKO-412) | Oct 2026 | n/a | Not yet verified with a school. Say "built", not "proven". |
| Assessments cite their approved curriculum source | Implemented | `src/lib/school-ai/question-bank-service.ts`, `tests/school-ai/question-bank.database.test.ts` | Oct 2026 | n/a | AI generation depends on the configured OpenAI provider; the demo uses an approved, manually prepared paper. |
| Families receive one clear in-app action | Implemented | Family inbox (SKO-416), demo fixture notification | Oct 2026 | n/a | No real messages are sent in the demo. |
| Arabic and Urdu interfaces with right-to-left layout | Implemented | `tests/locale/ui-coverage.test.ts` and per-feature AR screenshots in Linear | Oct 2026 | n/a | Native-speaker review is still required (SKO-452). |
| Number of schools using SkooleeAI | Do not use | None; the founder reports no current school users (product review, 7 Oct 2026) | — | — | State pilot recruitment instead. |
| Teacher time saved / learning gains | Do not use | No pilot measurements yet | — | — | Collect via the pilot scorecard first. |
| Revenue, retention, willingness to pay | Do not use | None recorded | — | — | Replace with measured results after pilots. |
| Security certifications (ISO, SOC 2, etc.) | Do not use | None held | — | — | Describe controls only where tests exist. |
| Pricing and plan entitlements | Check before use | `src/config/plans.ts` (catalogue `2026-10-08.1`); `scripts/check-commercial-contract.ts` | Oct 2026 | n/a | The review found the live site and app differed; reconcile before publishing. |
| LEAP 2027 dates and venue | Check before use | The review cited the official site listing 12–15 April 2027 | 7 Oct 2026 | n/a | Recheck on the official site before booking or publishing. |
| Funding amount sought | Target | Founder's fundraising aspiration | — | — | Always say "target", never imply a commitment. |
| Case studies | Not available | None yet | — | Written school permission required | Add only with permission, dates and sample sizes. |
