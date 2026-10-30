# SKAI-832 — Pilot charter and evidence

Draft: no actual school agreement, price, payment, deployment or publication approval.
Ticket: https://skooleeai.atlassian.net/browse/SKAI-832

## Before offering a charter

Founder decisions remain pending: buyer cohort (M01-01), representative task benchmark
(M01-02), sustainable fee (M10-01), capacity and dates. Both parties must identify an
authorized purchaser, school champion, vendor coordinator and measurement owner.
The signed charter must specify supported modules, users/classes/campuses, smallest
useful outcome, exclusions, responsibilities, support effort, cancellation/refund
terms and a usable exit. Bespoke work requires separate bilateral approval.
Catalog subscription prices are not an agreed pilot price; see [CONTRACT.md](CONTRACT.md).

## Owner workflow

Create the pilot and its workflow/success definitions, then record reviewed commercial
evidence under its details. References point to restricted evidence, not personal data.
Save the signed charter reference, both approval references, scope/responsibilities,
baseline method, price/currency, invoice/payment evidence and refund terms.
Record school data authority and reviewed privacy, deployment and provider references.
These are operator attestations of external review, not automated provider verification.
Purchase consent and publication permission remain independent. A school can decline
publication without losing product access. Synthetic QA-01 records are never customers.

Start records WAITING_CHARTER, WAITING_PAYMENT, WAITING_PROVIDER or WAITING_READINESS
when evidence is incomplete. PAID requires a settlement reference; intentions are not
cash collected. Synthetic pilots cannot become ACTIVE. Charter updates preserve prior
snapshots; stale versions conflict. API workflow changes require both approval references.
Original workflow definitions remain visible in the stored history.

Record completed and incomplete cycles with workflow, source and date. Workflow claims require
two complete cycles for the relevant agreed workflow plus the existing findings rules. Preserve
baseline comparability, denominators, correction/elapsed time and exclusions. Unknown is
not zero; two cycles alone do not prove causation. Revised charters require claim review.

Before closure, record paid/renewed/declined/stopped outcome, reason, date and source,
plus evidence of agreed export, resolved unpaid/refund obligations and access closure
under the approved retention policy. This does not execute refunds or delete school data.
Track signed, paid, activated and completed stages separately; record days/staff hours,
collected revenue, delivery/support cost and scope changes in the evidence register.

## Release and review

The additive charter_history migration must precede deployment. Existing records gain
empty history and must supply commercial evidence for activation. No historical approval
or payment is fabricated. Human code-owner review is required for migration/commercial
handling. Actual school execution, translated charter comprehension, independent review
and real cycle evidence remain blockers; neither this PR nor synthetic tests close them.
Never mark SKAI-832 Done or unblock SKAI-980 from test data. QA owns final acceptance.

Local QA (2026-10-28, code 94cccee5): lint, types, full tests, build, five pilot tests and four isolated browser tests passed; EN/UR/AR, keyboard, 200% text and migration evidence are linked in PR #153. Human acceptance and deployment remain pending.
