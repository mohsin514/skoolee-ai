# SKO-408 prerequisite execution order

Checked against native Linear blocking relationships on 15 October 2026. There are 30 prerequisites plus SKO-408; no cycle was found. This is an execution plan, not completion evidence.

Initially only SKO-377, SKO-379 and SKO-381 were eligible. SKO-381 is now Done with its final 21-gate recovery report and screenshot evidence attached in Linear, SKO-382 subsequently passed its 29 runtime checks and 48 report browser checks, received inline screenshots and full QA evidence, and is Done. Its only directly eligible descendant SKO-386 is now In Progress. SKO-377 and SKO-379 also passed final authorization, populated responsive UI and native browser zoom checks, received inline screenshots/QA bundles, and are Done. SKO-375 and SKO-388 are now In Progress after those native blockers were freshly verified Done. A dependent may start only when every native blocker has passed acceptance and QA, has evidence attached, and is Done. Mark the issue and its phase project In Progress when work starts. Existing partial work on blocked issues is preserved and is not treated as accepted delivery.

| Layer | Ticket | Prerequisites |
| --- | --- | --- |
| 1 | [SKO-377](https://linear.app/skoolee-ai-app/issue/SKO-377/002-shared-authorization-and-tenantcampuschild-ownership-rules) — [002] Shared authorization and tenant/campus/child ownership rules | None |
| 1 | [SKO-381](https://linear.app/skoolee-ai-app/issue/SKO-381/007-backups-restore-rehearsals-and-migration-checks) — [007] Backups, restore rehearsals and migration checks | None |
| 1 | [SKO-379](https://linear.app/skoolee-ai-app/issue/SKO-379/001-shared-design-system-and-role-based-navigation) — [001] Shared design system and role-based navigation | None |
| 2 | [SKO-375](https://linear.app/skoolee-ai-app/issue/SKO-375/005-approved-report-versions-and-publication-gates) — [005] Approved report versions and publication gates | SKO-377 |
| 2 | [SKO-388](https://linear.app/skoolee-ai-app/issue/SKO-388/014-draft-recovery-consistent-navigation-and-accessibility) — [014] Draft recovery, consistent navigation and accessibility | SKO-379 |
| 2 | [SKO-382](https://linear.app/skoolee-ai-app/issue/SKO-382/010-durable-event-outbox-and-job-orchestration) — [010] Durable event outbox and job orchestration | SKO-381 |
| 2 | [SKO-380](https://linear.app/skoolee-ai-app/issue/SKO-380/004-reliable-account-lifecycle-and-administrator-mfa) — [004] Reliable account lifecycle and administrator MFA | SKO-377 |
| 2 | [SKO-384](https://linear.app/skoolee-ai-app/issue/SKO-384/008-auditable-grade-and-finance-corrections) — [008] Auditable grade and finance corrections | SKO-377 |
| 2 | [SKO-392](https://linear.app/skoolee-ai-app/issue/SKO-392/018-language-rtl-timezone-calendar-and-currency-packages) — [018] Language, RTL, timezone, calendar and currency packages | SKO-379 |
| 2 | [SKO-394](https://linear.app/skoolee-ai-app/issue/SKO-394/020-permanent-student-identity-and-enrollment-history) — [020] Permanent student identity and enrollment history | SKO-381, SKO-377 |
| 2 | [SKO-376](https://linear.app/skoolee-ai-app/issue/SKO-376/003-role-assignment-invitations-and-institution-membership-ux) — [003] Role assignment, invitations and institution membership UX | SKO-377, SKO-379 |
| 3 | [SKO-383](https://linear.app/skoolee-ai-app/issue/SKO-383/009-ai-provider-policy-privacy-and-evaluation-gateway) — [009] AI provider policy, privacy and evaluation gateway | SKO-375, SKO-377 |
| 3 | [SKO-390](https://linear.app/skoolee-ai-app/issue/SKO-390/016-audited-support-access-and-service-operations) — [016] Audited support access and service operations | SKO-380, SKO-384, SKO-377 |
| 3 | [SKO-393](https://linear.app/skoolee-ai-app/issue/SKO-393/019-configurable-curriculum-grading-and-term-structures) — [019] Configurable curriculum, grading and term structures | SKO-392 |
| 3 | [SKO-386](https://linear.app/skoolee-ai-app/issue/SKO-386/013-job-status-retries-and-delivery-receipts) — [013] Job status, retries and delivery receipts | SKO-382 |
| 3 | [SKO-395](https://linear.app/skoolee-ai-app/issue/SKO-395/021-multiple-guardians-and-granular-accessconsent) — [021] Multiple guardians and granular access/consent | SKO-394, SKO-377 |
| 3 | [SKO-396](https://linear.app/skoolee-ai-app/issue/SKO-396/022-reversible-imports-and-clear-validation) — [022] Reversible imports and clear validation | SKO-384, SKO-381, SKO-382 |
| 3 | [SKO-378](https://linear.app/skoolee-ai-app/issue/SKO-378/006-truthful-marketing-and-synchronized-pricing-entitlements) — [006] Truthful marketing and synchronized pricing entitlements | SKO-375, SKO-379 |
| 4 | [SKO-447](https://linear.app/skoolee-ai-app/issue/SKO-447/073-regional-hosting-and-data-lifecycle-controls) — [073] Regional hosting and data lifecycle controls | SKO-390, SKO-383, SKO-381 |
| 4 | [SKO-387](https://linear.app/skoolee-ai-app/issue/SKO-387/011-package-comparison-trial-and-checkout-during-registration) — [011] Package comparison, trial and checkout during registration | SKO-382, SKO-378 |
| 5 | [SKO-476](https://linear.app/skoolee-ai-app/issue/SKO-476/101-campus-scoped-audit-history-and-sensitive-change-coverage) — [101] Campus-scoped audit history and sensitive change coverage | SKO-377, SKO-447 |
| 5 | [SKO-391](https://linear.app/skoolee-ai-app/issue/SKO-391/017-separate-standalone-and-school-group-onboarding-with-resumable) — [017] Separate standalone and school-group onboarding with resumable setup | SKO-376, SKO-387 |
| 6 | [SKO-397](https://linear.app/skoolee-ai-app/issue/SKO-397/023-guided-school-setup-and-import-reconciliation) — [023] Guided school setup and import reconciliation | SKO-395, SKO-394, SKO-393, SKO-396, SKO-392, SKO-391 |
| 7 | [SKO-400](https://linear.app/skoolee-ai-app/issue/SKO-400/026-learning-resource-and-document-library) — [026] Learning resource and document library | SKO-377, SKO-397, SKO-386 |
| 8 | [SKO-406](https://linear.app/skoolee-ai-app/issue/SKO-406/032-curriculum-and-learning-objective-map) — [032] Curriculum and learning objective map | SKO-400, SKO-393 |
| 9 | [SKO-407](https://linear.app/skoolee-ai-app/issue/SKO-407/033-reviewed-question-bank-and-assessment-blueprints) — [033] Reviewed question bank and assessment blueprints | SKO-406 |
| 9 | [SKO-409](https://linear.app/skoolee-ai-app/issue/SKO-409/035-assignments-submissions-and-rubrics) — [035] Assignments, submissions and rubrics | SKO-406, SKO-400 |
| 10 | [SKO-410](https://linear.app/skoolee-ai-app/issue/SKO-410/036-assessment-accommodations-and-accessible-materials) — [036] Assessment accommodations and accessible materials | SKO-388, SKO-409 |
| 11 | [SKO-411](https://linear.app/skoolee-ai-app/issue/SKO-411/037-focused-exam-session-with-autosave-and-recovery) — [037] Focused exam session with autosave and recovery | SKO-407, SKO-382, SKO-410 |
| 12 | [SKO-449](https://linear.app/skoolee-ai-app/issue/SKO-449/075-safe-exam-browser-integration) — [075] Safe Exam Browser integration | SKO-410, SKO-411 |
| 13 | [SKO-408](https://linear.app/skoolee-ai-app/issue/SKO-408/034-ai-exam-studio-flagship-assessment-secure-delivery-and-learning) — [034] AI Exam Studio: flagship assessment, secure delivery and learning recovery | SKO-449, SKO-476, SKO-407, SKO-383 |

For each ticket record acceptance criteria, changes, observed QA results, environment/revision, screenshots or operational evidence, and unresolved gates. A screenshot or source audit alone is not a QA pass. Infrastructure work uses relevant restore/test reports; product surfaces require UI evidence. Keep SKO-408 Todo until its four direct blockers (SKO-449, SKO-476, SKO-407, SKO-383) are Done.

