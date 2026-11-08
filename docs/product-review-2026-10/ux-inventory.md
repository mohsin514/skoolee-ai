# Skoolee UX specification and source inventory — 15 October 2026

This document maps existing source surfaces to the 95 canonical Linear features and specifies the next UX/acceptance/QA contract. It covers global international schools and local schools in Pakistan, Saudi Arabia and the UAE. Country, curriculum, school calendar, language and transaction currency must be independent settings. A school in Saudi Arabia may follow an international curriculum; an international school may use Urdu family communication.

## Coverage and evidence limits

Source inventory: **89 page files, 99 role-console views, 17 School AI tabs, 48 explicitly identified nested tabs/modes, 220 overlay callsites across 83 files, and 80 local-state union candidates**. Boundaries: 17 layouts, 12 loading, 13 error and one not-found. All page files have a primary canonical feature owner; no page is unassigned.

- This is a static source inventory and proposed UX specification, not an end-to-end runtime certification.
- 220 overlay callsites include consumers and shared wrappers; this is not 220 distinct modals. Runtime data-driven confirmations/menus can create more contexts.
- 89 page files include the untracked development-only studio-intro probe and existing development design-system route. Do not advertise them as shipped product features.
- The existing route checklist explicitly records zero complete full-route matrix passes; this audit does not replace that verification.
- 80 literal state unions include fields/status choices as well as tabs; they are candidates requiring rendered traversal.
- Existing dirty files were read only; this audit does not claim their unfinished Exam Studio work is production-ready.

This Markdown inventory records the route, screen and interaction findings used to enrich the canonical Linear issues. Historical source checklist: [route-checklist.md](../ui-plan/route-checklist.md). The static extractor inspects TSX JSX callsites and literal state unions; it does not execute application code.

## Highest-value simplifications

1. **Make every role start from a task.** The admin console currently offers 32 local views; School AI offers 17 tabs. Keep capability breadth, but present Today, Teaching & assessment, People, Finance, Operations and Settings as progressive groups. Show role-permitted exceptions and the next three tasks before charts. Preserve direct links, refresh and Back across all local views.
2. **Make Exam Studio a coherent evidence-to-outcome journey.** Surface evidence → blueprint → paper review → delivery → moderation → learning recovery. Reuse the existing source library, assessment authoring, exam sessions and gradebook integration. Keep school setup/invoices/announcements in operational workspaces. Do not make an animation an exam prerequisite.
3. **Consolidate duplicated academic paths.** Legacy dashboard marks/reports/classes, role consoles, teacher grading modals, ExamCycleManager and ExamsWorkspace create multiple conceptual entry points. Give each job a canonical route and deep-link existing aliases with role/scope retained. Migrate intentionally; some legacy routes may be unreachable and require runtime evidence before retirement.
4. **Replace repeated large detail dialogs with a durable record workspace.** Pupil history, class management and long report/exam review benefit from a deep-linkable detail page with a compact contextual side panel. Keep small confirmations/modal edits. Nested confirmations must name record, impact and exact action.
5. **Give family members one child-labelled action inbox.** Paying, reading, consenting and discussing need different completion semantics. Show siblings together, with child/campus/currency explicit at every action; preserve restricted-guardian permissions per child.
6. **Turn setup into a readiness queue.** Required setup should explain the blocked task, not expose every configuration module. Progressive admission forms must support school/country-required fields without universally requiring sensitive medical/address data. Source/OCR proposals must be reviewed before creating records.
7. **Make AI auditable through the interface.** Every generated output should show sources, uncertainty, revision and the human decision. A generic confidence percentage does not establish correctness. Pending, approved, applied and delivered are separate milestones.
8. **Make money and exam state exceptionally clear.** Device-saved answers are not server-acknowledged answers; provider-return success is not settled payment. Both need receipts, resumable recovery and safe reconciliation when the outcome is unknown.

## State, accessibility and localization contract

- **loading:** Keep page title, scope and current task visible; announce loading once and retain user input.
- **empty:** Explain what data is missing and provide the role-permitted next action; separate first-use from filtered-empty.
- **error:** Keep draft and scope, describe recoverable failure and offer retry; do not show successful persistence before server acknowledgement.
- **no_access:** Prevent restricted content flash; show scoped reason and a safe route back; server enforcement remains authoritative.
- **success:** Show the resulting record/version or receipt and next task; keep acknowledged, approved, published and delivered statuses distinct.
- **offline:** Show last server confirmation separately from local pending work and the supported recovery path.

- Keyboard-only complete the primary flow; visible focus, accessible labels, announced error summary and correct dialog focus return.
- Check EN/LTR, AR/RTL and UR/RTL at 320×720, 390×844, 768×1024 and 1440×1000, 200% zoom and reduced motion; dates/numbers/IDs remain readable.
- Use synthetic fixtures with allowed and denied roles, two tenants/campuses and two siblings; verify UI, direct URL and backing request scopes.
- Exercise initial loading, no data, filtered-empty, 403, recoverable 500, offline interruption, duplicate submission, successful persistence and refresh. Mark inapplicable states N/A with reason.

Also use international-name and long-translation fixtures, country-independent curricula, different work weeks, holidays and timezone/DST boundaries. Verify PKR/SAR/AED and supported international currency precision without converting ledger values merely because a user changes display preference. Arabic/Urdu right-to-left content must preserve left-to-right email/IDs and mathematical notation. A language fallback must be labelled, not presented as a complete translation.

## Route-by-route ownership and UX

The domain-specific flow, acceptance criteria and QA for each owning feature are specified below. The observed controls/states column is the precise route-specific overlay on that contract. Static/redirect/development routes must mark data states N/A rather than inventing a loading workflow.

| ID | Route / owner | Source | Observed controls and required states |
|---|---|---|---|
| R001 | `/accept-invite` · SKO-376 | [src/app/(auth)/accept-invite/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(auth)/accept-invite/page.tsx>) | Missing/invalid/expired/accepted token; institution/campus/role/delegation summary; language switch; name/password validation; busy/accepted/failed submission; reissue flow where offered. |
| R002 | `/first-login` · SKO-457 | [src/app/(auth)/first-login/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(auth)/first-login/page.tsx>) | Forced-password context; rules, confirmation mismatch, reveal, busy/error/success and destination; revisit after reset and unauthorized access. |
| R003 | `/forgot-password` · SKO-457 | [src/app/(auth)/forgot-password/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(auth)/forgot-password/page.tsx>) | Request form and submitted state; token reset form, invalid/expired token, password rules/confirmation, loading/error/success and links back to login. |
| R004 | `/login` · SKO-457 | [src/app/(auth)/login/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(auth)/login/page.tsx>) | Identifier/password validation; password reveal, Caps Lock, remember-me, institution-choice state, submit loading/success/error, cooldown, MFA handoff; verified/invitation/session-expired query banners and redirect parameter. |
| R005 | `/protect-account` · SKO-380 | [src/app/(auth)/protect-account/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(auth)/protect-account/page.tsx>) | MFA setup/verification ticket; authenticator secret and recovery codes, acknowledgement, recovery-code alternative, invalid code, loading/error/success and expired ticket. |
| R006 | `/register` · SKO-457 | [src/app/(auth)/register/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(auth)/register/page.tsx>) | Each registration type and wizard step; back/next, field errors, duplicate identity, generated registration ID, password rules/reveal, loading/success and recoverable server failure. |
| R007 | `/register-split` · SKO-457 | [src/app/(auth)/register-split/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(auth)/register-split/page.tsx>) | Redirect-only alias: verify base URL and supported nested catchall URL where applicable; final destination /register; browser Back, direct load, authentication and suspension gates. No standalone content to migrate. |
| R008 | `/sign-in/[[...sign-in]]` · SKO-457 | [src/app/(auth)/sign-in/[[...sign-in]]/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx>) | Redirect-only alias: verify base URL and supported nested catchall URL where applicable; final destination /login; browser Back, direct load, authentication and suspension gates. No standalone content to migrate. |
| R009 | `/sign-up/[[...sign-up]]` · SKO-457 | [src/app/(auth)/sign-up/[[...sign-up]]/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx>) | Redirect-only alias: verify base URL and supported nested catchall URL where applicable; final destination /register; browser Back, direct load, authentication and suspension gates. No standalone content to migrate. |
| R010 | `/verify-success` · SKO-457 | [src/app/(auth)/verify-success/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(auth)/verify-success/page.tsx>) | Verification success content, countdown/progress, manual login link, automatic transition, reduced motion and interrupted navigation. |
| R011 | `/ai-governance` · SKO-378 | [src/app/(public)/ai-governance/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(public)/ai-governance/page.tsx>) | Inspect this page individually: TrustPage header/nav/content sections, active links, long legal/governance text, keyboard/focus, mobile/RTL wrapping and reduced-motion background. |
| R012 | `/ai-report-cards-urdu-english` · SKO-378 | [src/app/(public)/ai-report-cards-urdu-english/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(public)/ai-report-cards-urdu-english/page.tsx>) | Inspect this page individually: ProductPage header/nav/hero, feature cards, illustrative example, CTA/demo mail link, pricing/trust/login links, long content, mobile wrapping and reduced motion. Do not send email during visual checks. |
| R013 | `/ai-school-management-software` · SKO-378 | [src/app/(public)/ai-school-management-software/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(public)/ai-school-management-software/page.tsx>) | Inspect this page individually: ProductPage header/nav/hero, feature cards, illustrative example, CTA/demo mail link, pricing/trust/login links, long content, mobile wrapping and reduced motion. Do not send email during visual checks. |
| R014 | `/ai-student-performance-analytics` · SKO-378 | [src/app/(public)/ai-student-performance-analytics/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(public)/ai-student-performance-analytics/page.tsx>) | Inspect this page individually: ProductPage header/nav/hero, feature cards, illustrative example, CTA/demo mail link, pricing/trust/login links, long content, mobile wrapping and reduced motion. Do not send email during visual checks. |
| R015 | `/human-review-policy` · SKO-378 | [src/app/(public)/human-review-policy/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(public)/human-review-policy/page.tsx>) | Inspect this page individually: TrustPage header/nav/content sections, active links, long legal/governance text, keyboard/focus, mobile/RTL wrapping and reduced-motion background. |
| R016 | `/multi-campus-school-erp` · SKO-378 | [src/app/(public)/multi-campus-school-erp/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(public)/multi-campus-school-erp/page.tsx>) | Inspect this page individually: ProductPage header/nav/hero, feature cards, illustrative example, CTA/demo mail link, pricing/trust/login links, long content, mobile wrapping and reduced motion. Do not send email during visual checks. |
| R017 | `/pricing` · SKO-378 | [src/app/(public)/pricing/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(public)/pricing/page.tsx>) | All plan cards, monthly/annual period, limits/features/AI-credit copy, demo/checkout CTA behavior actually present, currency/localization, comparison overflow and hover/focus states. |
| R018 | `/privacy` · SKO-378 | [src/app/(public)/privacy/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(public)/privacy/page.tsx>) | Inspect this page individually: TrustPage header/nav/content sections, active links, long legal/governance text, keyboard/focus, mobile/RTL wrapping and reduced-motion background. |
| R019 | `/school-fee-management-software` · SKO-378 | [src/app/(public)/school-fee-management-software/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(public)/school-fee-management-software/page.tsx>) | Inspect this page individually: ProductPage header/nav/hero, feature cards, illustrative example, CTA/demo mail link, pricing/trust/login links, long content, mobile wrapping and reduced motion. Do not send email during visual checks. |
| R020 | `/security` · SKO-378 | [src/app/(public)/security/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(public)/security/page.tsx>) | Inspect this page individually: TrustPage header/nav/content sections, active links, long legal/governance text, keyboard/focus, mobile/RTL wrapping and reduced-motion background. |
| R021 | `/whatsapp-report-card-software` · SKO-378 | [src/app/(public)/whatsapp-report-card-software/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/(public)/whatsapp-report-card-software/page.tsx>) | Inspect this page individually: ProductPage header/nav/hero, feature cards, illustrative example, CTA/demo mail link, pricing/trust/login links, long content, mobile wrapping and reduced motion. Do not send email during visual checks. |
| R022 | `/403` · SKO-377 | [src/app/403/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/403/page.tsx>) | Forbidden content, role-appropriate home link, sign-out, unauthenticated case and return navigation; do not infer access from rendering. |
| R023 | `/account/security` · SKO-380 | [src/app/account/security/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/account/security/page.tsx>) | MFA enabled/disabled and replacement; password/code inputs, validation, session list, current/other session distinction, revocation busy/success/error and language switch. |
| R024 | `/accountant` · SKO-431 | [src/app/accountant/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/accountant/page.tsx>) | All 10 console sections below; navigation/access loading/denied/error; dashboard overview; each finance/payroll/leave form and confirmation; all subordinate tabs and empty/failed fetches. |
| R025 | `/admin` · SKO-379 | [src/app/admin/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/admin/page.tsx>) | All 32 console sections below; query view initialization, invalid view fallback, refresh and Back/Forward; module restrictions; all admission/class/staff/report dialogs, confirmation/busy/error states. |
| R087 | `/ai/exams/[id]` · SKO-411 | [src/app/ai/exams/[id]/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/ai/exams/[id]/page.tsx>) | Student readiness/start/autosave/reconnect/submit; staff moderation, accommodation and reviewed gradebook transfer |
| R086 | `/ai/exams` · SKO-408 | [src/app/ai/exams/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/ai/exams/page.tsx>) | Student list/return navigation and staff paper assignment; real synthetic roster and access denials |
| R085 | `/ai` · SKO-470 | [src/app/ai/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/ai/page.tsx>) | Staff workspace; explicit owner campus, teacher subject scope; setup, sources, curriculum/papers, academic/timetable/announcement/exam/invoice plans, setup follow-ups, work, policies and history. Shared plan/approval/run lifecycle: [SKO-470](https://linear.app/skoolee-ai-app/issue/SKO-470/095-school-ai-operational-plans-and-reviewed-run-lifecycle). |
| R089 | `/ai/studio-intro` · SKO-408 | [src/app/ai/studio-intro/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/ai/studio-intro/page.tsx>) | New untracked studio-intro probe: startup animation, skip, reduced-motion, session suppression and failure fallback. Temporary; exam-studio-shell not yet present. |
| R026 | `/corrections` · SKO-384 | [src/app/corrections/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/corrections/page.tsx>) | MARK/PAYMENT kinds; record selection, change preview and reviewed acknowledgement, request, pending/applied/rejected history, date filter, approver separation, family visibility, approval/rejection errors. |
| R027 | `/dashboard/analytics` · SKO-422 | [src/app/dashboard/analytics/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/analytics/page.tsx>) | Chart and tooltip layouts, no data/loading/error, basic-vs-enabled analytics state, subscription-paused message and upgrade links; distinguish rendered chart from gated AI analytics. |
| R028 | `/dashboard/billing` · SKO-373 | [src/app/dashboard/billing/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/billing/page.tsx>) | Subscription lifecycle and plan cards; period toggle, capabilities, invoice history, pending changes/cancel/resume; checkout success/error; suspension recovery. |
| R029 | `/dashboard/classes` · SKO-462 | [src/app/dashboard/classes/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/classes/page.tsx>) | Class/subject table, empty/loading; add-class and add-subject Dialog forms, teacher assignment, validation, save disabled/busy/error and long class/teacher labels. |
| R030 | `/dashboard/communications` · SKO-416 | [src/app/dashboard/communications/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/communications/page.tsx>) | Status/channel table, summary cards, filters, empty/loading/error, manual refresh and automation busy/result feedback; synthetic delivery outcomes only. |
| R031 | `/dashboard/fees` · SKO-431 | [src/app/dashboard/fees/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/fees/page.tsx>) | FeeManagementPanel data-ready state, Add fee trigger; invoice filters, fee structure form, generation dialog/job, payment recording, receipts/download and errors. |
| R032 | `/dashboard/guardians` · SKO-395 | [src/app/dashboard/guardians/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/guardians/page.tsx>) | Operations and permission gates; GuardianAccessManager invite/link/unlink and confirmation, child scope, allowed contacts and empty/loading/error states. |
| R033 | `/dashboard/marks` · SKO-424 | [src/app/dashboard/marks/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/marks/page.tsx>) | Exam/class selectors, new exam form, editable marks grid and keyboard flow, analytics, save and exam-status progress, locked/read-only marks, lock ConfirmAction and retry. |
| R034 | `/dashboard` · SKO-379 | [src/app/dashboard/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/page.tsx>) | Conditional role redirect versus legacy overview; statistics, recent records, AI usage and navigation; no-data/error state; suspended tenant destination. Record if legacy content is unreachable under valid sessions. |
| R035 | `/dashboard/reports` · SKO-375 | [src/app/dashboard/reports/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/reports/page.tsx>) | Exam selection, report list/analytics, empty/loading; edit Urdu/English remarks, tone/language selection, generate/review/publish/send/download actions, plan/role restrictions and partial failures. |
| R036 | `/dashboard/settings/members` · SKO-376 | [src/app/dashboard/settings/members/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/settings/members/page.tsx>) | Existing informational migration placeholder, text/spacing/accessibility and navigation. Record as placeholder; do not silently replace with /memberships functionality. |
| R037 | `/dashboard/settings` · SKO-402 | [src/app/dashboard/settings/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/settings/page.tsx>) | Editable profile card, institution settings vs restricted role, locale settings, save/validation/error/dirty-state and account-security link. |
| R038 | `/dashboard/staff-hierarchy` · SKO-399 | [src/app/dashboard/staff-hierarchy/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/staff-hierarchy/page.tsx>) | Org chart/departments/rank ladder tabs, position forms, node controls, zoom/overflow and read/write permission states. |
| R039 | `/dashboard/students` · SKO-394 | [src/app/dashboard/students/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/students/page.tsx>) | Search/class/status/sort filters, selection/pagination/table/cards, bulk actions/export, AdmissionForm and BulkImportDialog; attendance date/class/roster panel, loading/empty/error. |
| R040 | `/design-system` · SKO-379 | [src/app/design-system/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/design-system/page.tsx>) | Default component reference plus ?patterns=application and ?access=remote; controls, typography, state examples, keyboard/RTL/responsive; development-only availability and production 404. |
| R041 | `/jobs` · SKO-386 | [src/app/jobs/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/jobs/page.tsx>) | List and ?id= detail; query Back/Forward, kind/state/channel/campus/date/search filters; polling/progress, item selection, retry/cancel/reconcile actions when allowed, partial/failed/unknown outcomes, empty/error. |
| R042 | `/librarian` · SKO-436 | [src/app/librarian/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/librarian/page.tsx>) | All 4 local sections below; dashboard, library books/members/issues/categories, inventory and leave dialogs/forms; permissions, overdue/empty/loading/error states. |
| R043 | `/memberships` · SKO-376 | [src/app/memberships/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/memberships/page.tsx>) | Membership list, institution/campus scope, invite/edit/review confirmation; delegated purchase/manage controls, draft save/restore, revoke/deactivate consequences, self/owner restrictions and sign-in switching. |
| R044 | `/messages` · SKO-415 | [src/app/messages/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/messages/page.tsx>) | Conversation list/detail, search/directory/new-conversation dialog, participant controls/settings, composer/attachments, delivery/edit/read/typing states, empty/error/offline, dock-to-full-page transition; APP_OWNER redirect. |
| R045 | `/onboarding/package` · SKO-387 | [src/app/onboarding/package/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/onboarding/package/page.tsx>) | Catalogue loading/error/empty, plan/period/campus/enrollment selection, limits/pricing and delegation eligibility; busy checkout/quote request and provider failure; Suspense fallback. |
| R046 | `/onboarding/package/status` · SKO-387 | [src/app/onboarding/package/status/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/onboarding/package/status/page.tsx>) | Missing/invalid intent, pending settlement, settled/failed/cancelled state, bank-transfer instructions, polling/refresh/retry and return destination; provider fixtures only. |
| R047 | `/onboarding` · SKO-391 | [src/app/onboarding/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/onboarding/page.tsx>) | Every wizard step: school details/logo upload, campus add/edit/delete confirmation, academic baseline/calendar, final summary; DraftRecovery, field/error summary, back/next, saving/failure/retry and dirty navigation. |
| R048 | `/owner` · SKO-390 | [src/app/owner/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/owner/page.tsx>) | All 9 local sections below; school/user filtering/pagination, detail/provisioning/password dialogs, audits/sessions, pricing/payment configuration, support grants/session/action previews, subscription requests. |
| R049 | `/` · SKO-378 | [src/app/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/page.tsx>) | Splash animation, loading frame, reduced motion, forwarding to login, existing-session destination and back-button behavior. |
| R050 | `/parent/attendance` · SKO-405 | [src/app/parent/attendance/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/parent/attendance/page.tsx>) | Child-scoped attendance summary/history, present/absent/leave states, no records, long period data and guardian-denied attendance; loading/error/retry. |
| R051 | `/parent/fees` · SKO-431 | [src/app/parent/fees/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/parent/fees/page.tsx>) | Currency selector, fee rows/balances/paid/partial/overdue, pay action pending/failure/return and guardian-denied fees; empty/loading/error. |
| R052 | `/parent` · SKO-419 | [src/app/parent/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/parent/page.tsx>) | Child selector/scope and guardian permissions, overview stats/insights/calendar/results links, no child/multiple children, loading/error/retry; query scope retained on subnavigation. |
| R053 | `/parent/results` · SKO-375 | [src/app/parent/results/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/parent/results/page.tsx>) | Expandable exams/results, remark languages, download pending/failure, missing/unpublished/no results and guardian-denied results; loading/error/retry. |
| R054 | `/parent/timetable` · SKO-403 | [src/app/parent/timetable/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/parent/timetable/page.tsx>) | Class timetable and exam date sheet, weekend/calendar differences, long labels, no schedule/no exams, loading/error and child changes. |
| R055 | `/parent-invitations` · SKO-395 | [src/app/parent-invitations/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/parent-invitations/page.tsx>) | Pending/expired guardian invitations, institution/child context, acceptance/rejection/acknowledgement where rendered, empty/loading/error; non-parent redirect. |
| R056 | `/principal` · SKO-417 | [src/app/principal/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/principal/page.tsx>) | All 31 local sections below independently; roster/academic/fees/engagement permissions; all class/student/staff/import/AI/report dialogs and confirmations; no-data and failure states. |
| R057 | `/pupils/[id]` · SKO-394 | [src/app/pupils/[id]/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/pupils/[id]/page.tsx>) | Valid/missing/foreign-scope ID, enrollment timeline/source accordions, class/date/roll/reason form, impact preview/propose/confirm and reviewed acknowledgement; duplicate consolidation review plus typed identity confirmation; role restrictions. |
| R058 | `/receptionist` · SKO-466 | [src/app/receptionist/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/receptionist/page.tsx>) | All 7 local sections below; visitor/complaint/postal/phone/certificate/leave forms and row actions; validation, busy/confirmation, empty/loading/error and permission denial. |
| R059 | `/safepay` · SKO-431 | [src/app/safepay/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/safepay/page.tsx>) | Missing/malformed checkout query, card fields/validation, submitting/completed/error states, payment return destination, refresh/back; sandbox/test gateway only, no actual charge. |
| R088 | `/school-capture` · SKO-400 | [src/app/school-capture/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/school-capture/page.tsx>) | Expiring private phone handoff; same-user authentication, camera/source capture and return recovery |
| R060 | `/settings/locale` · SKO-392 | [src/app/settings/locale/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/settings/locale/page.tsx>) | Language/region/currency/timezone/calendar and inheritance controls actually offered; permission scopes, loading/save/error, EN/AR/UR switching and dashboard return; preserve package semantics. |
| R061 | `/student/attendance` · SKO-405 | [src/app/student/attendance/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/student/attendance/page.tsx>) | Month selector/calendar/list, attendance summary/alerts, date boundaries, no records and loading/error; parent/guardian restricted scope. |
| R062 | `/student/coursework` · SKO-409 | [src/app/student/coursework/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/student/coursework/page.tsx>) | Class/subjects/teacher/room details, performance bars, syllabus/subject cards, missing assignments and loading/error; narrow screens and long localized content. |
| R063 | `/student/fees` · SKO-431 | [src/app/student/fees/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/student/fees/page.tsx>) | Currency selection, invoice cards/payments, due/partial/paid/overdue, disabled/pending/failure payment and provider return; empty/loading/error and family authorization. |
| R064 | `/student` · SKO-418 | [src/app/student/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/student/page.tsx>) | Identity/enrollment context, dashboard stats/insights/calendar, upcoming papers and schedule, report printing/downloading, AI panel, missing records and loading/error; allowed parent view with correct child scope. |
| R065 | `/student/reports` · SKO-375 | [src/app/student/reports/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/student/reports/page.tsx>) | Report cards/grades/remarks/status/download, published visibility, no reports and loading/error; long Urdu/Arabic text and print/PDF entry points. |
| R066 | `/student/schedule` · SKO-403 | [src/app/student/schedule/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/student/schedule/page.tsx>) | Redirect-only alias: verify base URL and supported nested catchall URL where applicable; final destination /student/attendance; browser Back, direct load, authentication and suspension gates. No standalone content to migrate. |
| R067 | `/student/timetable` · SKO-403 | [src/app/student/timetable/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/student/timetable/page.tsx>) | Read-only class grid and exam date sheet, weekends/no slots/no exams, explicit timetable error/retry and responsive overflow. |
| R068 | `/subscription` · SKO-373 | [src/app/subscription/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/subscription/page.tsx>) | Purchase-delegation gate; plan/period cards and lifecycle, upgrade/downgrade/cancel/resume/invoices/checkout, queued/past-due/settled/error states and owner/member distinctions. |
| R069 | `/subscription-suspended` · SKO-373 | [src/app/subscription-suspended/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/subscription-suspended/page.tsx>) | Suspended notice, role-specific billing link, login/logout navigation, access-restricted non-purchaser case; recovered subscription return. |
| R070 | `/super/billing` · SKO-373 | [src/app/super/billing/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/super/billing/page.tsx>) | Redirect-only alias: verify base URL and supported nested catchall URL where applicable; final destination /super?view=billing; browser Back, direct load, authentication and suspension gates. No standalone content to migrate. |
| R071 | `/super` · SKO-402 | [src/app/super/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/super/page.tsx>) | All 6 local sections below; campus list/detail and nested fees, add-campus/invite modal, activity log, remove/cancel confirmation, support approvals, billing and plan limits. |
| R072 | `/teacher/ai` · SKO-460 | [src/app/teacher/ai/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/ai/page.tsx>) | AI action panel, query/feature filters, expandable insights, copy feedback, credit-exhausted/permission/error states; draft/review and no insights. |
| R073 | `/teacher/attendance` · SKO-405 | [src/app/teacher/attendance/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/attendance/page.tsx>) | Marking/monthly tabs, class/date/month, roster search, keyboard mode, copy previous, history accordion, unsaved prompt/StickySaveBar, loading/saving/error and no roster. |
| R074 | `/teacher/calendar` · SKO-403 | [src/app/teacher/calendar/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/calendar/page.tsx>) | AcademicCalendar month/list/navigation/filter/event detail interactions offered, no events/loading/error; role scope, dates/weekends and RTL. |
| R075 | `/teacher/classes` · SKO-462 | [src/app/teacher/classes/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/classes/page.tsx>) | Class cards, assignment role, links to students/marks/attendance, long subjects/class labels, no classes/loading/error and permissions. |
| R076 | `/teacher/insights` · SKO-422 | [src/app/teacher/insights/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/insights/page.tsx>) | Attendance/performance charts/tooltips, class distribution, no data/loading/error, credit/AI gates as rendered; non-color-only chart interpretation. |
| R077 | `/teacher/leave` · SKO-399 | [src/app/teacher/leave/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/leave/page.tsx>) | Balances, year/status filters, request list, Apply leave modal/date/reason validation, busy/success/error and cancel ConfirmAction; pending/approved/rejected/cancelled outcomes. |
| R078 | `/teacher/marks` · SKO-424 | [src/app/teacher/marks/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/marks/page.tsx>) | Exam query/selector and hidden/all exams, marks grid keyboard shortcuts, DraftRecovery and error summary, clear/fill/download, dirty save bar and exam-change confirmation, locked marks and grading modals. |
| R079 | `/teacher` · SKO-379 | [src/app/teacher/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/page.tsx>) | Today schedule/alerts/conflicts, self attendance busy/error/success, grading toolbar/modals, statistics/insights and no-assignment/loading/error states. |
| R080 | `/teacher/reports` · SKO-375 | [src/app/teacher/reports/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/reports/page.tsx>) | Class/student query scope, exam/status/search filters, show-all cards, generation busy/error, report detail modal, editing/saving/AI remarks/send/download and review/credit/permission states. |
| R081 | `/teacher/students` · SKO-394 | [src/app/teacher/students/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/students/page.tsx>) | Search/class/today filters, list/card view and sorting, table/pagination, StudentDetailModal sequence, contact/report/attendance links; empty/loading/error and scope. |
| R082 | `/teacher/tests` · SKO-413 | [src/app/teacher/tests/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/tests/page.tsx>) | ExamCycleManager creation/editing/stage transitions, exam detail dialogs, lock/review/publish restrictions, conflict/empty/loading/error states. |
| R083 | `/teacher/timetable` · SKO-403 | [src/app/teacher/timetable/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/timetable/page.tsx>) | Timetable grid/date sheet, conflict banners, no schedule/unassigned vs failed loading, long course/room names and weekend differences. |
| R084 | `/teacher-onboarding` · SKO-458 | [src/app/teacher-onboarding/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher-onboarding/page.tsx>) | Each profile/contact/professional wizard step, specialty add/remove and teaches-all, draft recovery, validation summary, back/next, save failure/success and final destination. |

## Role-console, School AI and nested screens

| ID | Context / screen | Owner | Specific state and interaction requirement |
|---|---|---|---|
| V001 | /admin → overview | SKO-379 | Overview cards/charts, quick links, zero/large values and module-access states. |
| V002 | /admin → leadership | SKO-376 | Admin/staff leadership roster, role-specific invitations, pending/expired invites, remove/resend/cancel confirmations. |
| V003 | /admin → classes | SKO-462 | AcademicPanel class/section hierarchy, create/edit class, subject and teacher assignment, class manager/detail dialogs. |
| V004 | /admin → teachers | SKO-399 | Faculty roster, teacher invite/detail/edit, specialty/subject assignment, pending invites and destructive confirmations. |
| V005 | /admin → staff-hierarchy | SKO-399 | Chart/departments/rank ladder; position/department/designation forms and long hierarchy overflow. |
| V006 | /admin → students | SKO-394 | StudentsPanel table/cards, search/filter/sort/pagination, admission/import, selection and student details. |
| V007 | /admin → admission-queries | SKO-398 | Enquiry list/filter, create/follow-up/detail and conversion to admission with prefilled fields. |
| V008 | /admin → student-setup | SKO-394 | Categories/groups setup, add/edit/delete and usage constraints. |
| V009 | /admin → promote-archive | SKO-404 | Promotion/year-end and archived student surfaces; preview, selective/bulk confirmation, restore and retained-history scope. |
| V010 | /admin → leave | SKO-399 | Requests/balances/types/allocation/review as role allows; application/cancel/approve/reject and dates. |
| V011 | /admin → permissions | SKO-377 | RolePermissionPanel module/action matrix, readonly/denied and save/rollback/error states. |
| V012 | /admin → attendance | SKO-405 | UnifiedAttendancePanel student/staff/date/month scopes, marking/history and save feedback. |
| V013 | /admin → ai | SKO-460 | AI actions, credit/role gates, generate/approve/reject/publish distinctions, draft and error recovery. |
| V014 | /admin → fees | SKO-431 | Fee panel hierarchy, invoices/payment/structure/report tabs, currencies, due/paid/overdue and permission gates. |
| V015 | /admin → timetable | SKO-403 | TimetableStudio class/teacher/room modes, density, slot editing, conflicts/suggestions and readonly state. |
| V016 | /admin → class-rooms | SKO-413 | Room list/form, capacity/unavailable data, create/edit/delete confirmations and conflicts. |
| V017 | /admin → period-setup | SKO-403 | Period labels/start/end/order and calendar boundaries, validation/save/error. |
| V018 | /admin → school-calendar | SKO-403 | Calendar navigation, event forms/detail, holidays and locale/weekend behavior. |
| V019 | /admin → year-cycle | SKO-393 | CycleManagementPanel and AcademicYearPanel; year/cycle selection, active/closed/setup states and closing gates. |
| V020 | /admin → teacher-performance | SKO-461 | TeacherPerformancePanel periods/filters/charts/empty data and denied scope. |
| V021 | /admin → exam-cycles | SKO-413 | ExamsWorkspace plan/datesheet/seating/marks/results steps and all transition dialogs. |
| V022 | /admin → grading-rules | SKO-393 | Grade thresholds/weight rules forms, invalid totals/overlap and saving/locked model states. |
| V023 | /admin → billing | SKO-373 | SubscriptionLifecyclePanel/PlansPanel, purchaser permission, period, checkout/cancel/resume, invoices and suspension. |
| V024 | /admin → report-cards | SKO-375 | Report listing/review/detail/edit, AI remarks, PDF/generation/delivery workflow and review lock states. |
| V025 | /admin → transport | SKO-437 | Routes/vehicles/rider assignments, detail/add/edit/delete and capacity/status. |
| V026 | /admin → dormitory | SKO-463 | Room types/rooms/allocations, occupancy and add/edit/delete constraints. |
| V027 | /admin → inventory | SKO-435 | Items/stores/suppliers/categories/transactions, stock actions, filters, forms and validation. |
| V028 | /admin → library | SKO-436 | Books/members/issues/categories, issue/return, overdue/unavailable books and forms. |
| V029 | /admin → academic-hub | SKO-397 | AcademicHub summary, setup prerequisites, progress and deep links. |
| V030 | /admin → year-setup | SKO-393 | YearSetupWizard each step, defaults, prerequisites, summary and save failure recovery. |
| V031 | /admin → academic-model | SKO-393 | AcademicModelPanel models/terms/assessment config, create/edit/apply and conflicts. |
| V032 | /admin → institution | SKO-402 | InstitutionSettingsPanel and LocaleSettingsPanel; scoped editing and confirmation/error. |
| V033 | /principal → overview | SKO-417 | Overview cards/charts, quick links, zero/large values and module-access states. |
| V034 | /principal → leadership | SKO-376 | Admin/staff leadership roster, role-specific invitations, pending/expired invites, remove/resend/cancel confirmations. |
| V035 | /principal → classes | SKO-462 | AcademicPanel class/section hierarchy, create/edit class, subject and teacher assignment, class manager/detail dialogs. |
| V036 | /principal → teachers | SKO-399 | Faculty roster, teacher invite/detail/edit, specialty/subject assignment, pending invites and destructive confirmations. |
| V037 | /principal → staff-hierarchy | SKO-399 | Chart/departments/rank ladder; position/department/designation forms and long hierarchy overflow. |
| V038 | /principal → students | SKO-394 | StudentsPanel table/cards, search/filter/sort/pagination, admission/import, selection and student details. |
| V039 | /principal → admission-queries | SKO-398 | Enquiry list/filter, create/follow-up/detail and conversion to admission with prefilled fields. |
| V040 | /principal → student-setup | SKO-394 | Categories/groups setup, add/edit/delete and usage constraints. |
| V041 | /principal → promote-archive | SKO-404 | Promotion/year-end and archived student surfaces; preview, selective/bulk confirmation, restore and retained-history scope. |
| V042 | /principal → leave | SKO-399 | Requests/balances/types/allocation/review as role allows; application/cancel/approve/reject and dates. |
| V043 | /principal → permissions | SKO-377 | RolePermissionPanel module/action matrix, readonly/denied and save/rollback/error states. |
| V044 | /principal → attendance | SKO-405 | UnifiedAttendancePanel student/staff/date/month scopes, marking/history and save feedback. |
| V045 | /principal → year-cycle | SKO-393 | CycleManagementPanel and AcademicYearPanel; year/cycle selection, active/closed/setup states and closing gates. |
| V046 | /principal → academic-hub | SKO-397 | AcademicHub summary, setup prerequisites, progress and deep links. |
| V047 | /principal → year-setup | SKO-393 | YearSetupWizard each step, defaults, prerequisites, summary and save failure recovery. |
| V048 | /principal → academic-model | SKO-393 | AcademicModelPanel models/terms/assessment config, create/edit/apply and conflicts. |
| V049 | /principal → exam-cycles | SKO-413 | ExamsWorkspace plan/datesheet/seating/marks/results steps and all transition dialogs. |
| V050 | /principal → grading-rules | SKO-393 | Grade thresholds/weight rules forms, invalid totals/overlap and saving/locked model states. |
| V051 | /principal → fees | SKO-431 | Fee panel hierarchy, invoices/payment/structure/report tabs, currencies, due/paid/overdue and permission gates. |
| V052 | /principal → timetable | SKO-403 | TimetableStudio class/teacher/room modes, density, slot editing, conflicts/suggestions and readonly state. |
| V053 | /principal → class-rooms | SKO-413 | Room list/form, capacity/unavailable data, create/edit/delete confirmations and conflicts. |
| V054 | /principal → period-setup | SKO-403 | Period labels/start/end/order and calendar boundaries, validation/save/error. |
| V055 | /principal → school-calendar | SKO-403 | Calendar navigation, event forms/detail, holidays and locale/weekend behavior. |
| V056 | /principal → teacher-performance | SKO-461 | TeacherPerformancePanel periods/filters/charts/empty data and denied scope. |
| V057 | /principal → report-cards | SKO-375 | Report listing/review/detail/edit, AI remarks, PDF/generation/delivery workflow and review lock states. |
| V058 | /principal → ai | SKO-460 | AI actions, credit/role gates, generate/approve/reject/publish distinctions, draft and error recovery. |
| V059 | /principal → engagement | SKO-416 | Parent communications summary, delivery status/channel and automation trigger/feedback. |
| V060 | /principal → transport | SKO-437 | Routes/vehicles/rider assignments, detail/add/edit/delete and capacity/status. |
| V061 | /principal → dormitory | SKO-463 | Room types/rooms/allocations, occupancy and add/edit/delete constraints. |
| V062 | /principal → library | SKO-436 | Books/members/issues/categories, issue/return, overdue/unavailable books and forms. |
| V063 | /principal → inventory | SKO-435 | Items/stores/suppliers/categories/transactions, stock actions, filters, forms and validation. |
| V064 | /super → schools | SKO-402 | School/campus list, search/filter/pagination, detail drilldown, add/provision/invite as applicable. |
| V065 | /super → billing | SKO-373 | SubscriptionLifecyclePanel/PlansPanel, purchaser permission, period, checkout/cancel/resume, invoices and suspension. |
| V066 | /super → fees | SKO-431 | Fee panel hierarchy, invoices/payment/structure/report tabs, currencies, due/paid/overdue and permission gates. |
| V067 | /super → settings | SKO-402 | Institution and locale settings, identity/logo/contact forms, inheritance, permissions and dirty/save states. |
| V068 | /super → curriculum-templates | SKO-443 | AcademicModelPanel template list/create/edit, terms/weights and clone/apply constraints. |
| V069 | /super → support | SKO-390 | Grant/request list, approval/expiry/denial, session start/end, scope/purpose/impact and action preview/confirmation. |
| V070 | /owner → schools | SKO-402 | School/campus list, search/filter/pagination, detail drilldown, add/provision/invite as applicable. |
| V071 | /owner → users | SKO-376 | User list filters/pagination, add-user and password dialogs, role/school scope and disabled account states. |
| V072 | /owner → audit | SKO-390 | Audit list, action/date filters, expandable payload, pagination and no results. |
| V073 | /owner → sessions | SKO-380 | Active/all session list, device details, terminate confirmation/busy/error and refresh. |
| V074 | /owner → billing | SKO-373 | SubscriptionLifecyclePanel/PlansPanel, purchaser permission, period, checkout/cancel/resume, invoices and suspension. |
| V075 | /owner → pricing | SKO-378 | Default/per-school pricing forms, numeric/currency validation, saved/error/dirty state. |
| V076 | /owner → payments | SKO-432 | Payment methods/configuration or received payments according to parent console; loading/configured/unconfigured and edit/receipt actions. |
| V077 | /owner → support | SKO-390 | Grant/request list, approval/expiry/denial, session start/end, scope/purpose/impact and action preview/confirmation. |
| V078 | /owner → subscription-requests | SKO-373 | Pending requests, detail/review, approve/reject reason, pending/success/failure and evidence. |
| V079 | /accountant → dashboard | SKO-379 | Role overview, metrics, quick links and no-data summaries. |
| V080 | /accountant → fee-overview | SKO-431 | Balance/collection overview, linked filter destinations and empty/multi-currency data. |
| V081 | /accountant → fee-structures | SKO-431 | Structure list/create/edit/assign and effective period validation. |
| V082 | /accountant → fee-layers | SKO-431 | Types/groups/master/assign/discounts/carry subordinate tabs, individual forms and balances. |
| V083 | /accountant → invoices | SKO-431 | Invoice filters/detail/generate/payment/print actions, selected/bulk and job result. |
| V084 | /accountant → payments | SKO-432 | Payment methods/configuration or received payments according to parent console; loading/configured/unconfigured and edit/receipt actions. |
| V085 | /accountant → fee-reports | SKO-431 | Collection/defaulter reports, date/class/currency filters, totals and export. |
| V086 | /accountant → accounts | SKO-468 | Chart/bank/method/ledger/profit views, financial forms and reconciliation errors. |
| V087 | /accountant → payroll | SKO-434 | Payroll period/run/line generation and report, pending/paid/locked and corrections. |
| V088 | /accountant → leave | SKO-399 | Requests/balances/types/allocation/review as role allows; application/cancel/approve/reject and dates. |
| V089 | /librarian → dashboard | SKO-379 | Role overview, metrics, quick links and no-data summaries. |
| V090 | /librarian → library | SKO-436 | Books/members/issues/categories, issue/return, overdue/unavailable books and forms. |
| V091 | /librarian → inventory | SKO-435 | Items/stores/suppliers/categories/transactions, stock actions, filters, forms and validation. |
| V092 | /librarian → leave | SKO-399 | Requests/balances/types/allocation/review as role allows; application/cancel/approve/reject and dates. |
| V093 | /receptionist → dashboard | SKO-379 | Role overview, metrics, quick links and no-data summaries. |
| V094 | /receptionist → visitors | SKO-466 | Visitor log/create/check-out, validation/search and empty/loading/error. |
| V095 | /receptionist → complaints | SKO-467 | Complaint create/detail/status/review, labels and follow-up feedback. |
| V096 | /receptionist → postal | SKO-464 | Incoming/outgoing postal records, add/edit/status and filters. |
| V097 | /receptionist → phone-calls | SKO-465 | Call log form/direction/reason/follow-up and table states. |
| V098 | /receptionist → certificates | SKO-469 | Student/certificate type selection, generation/preview/download and permission scope. |
| V099 | /receptionist → leave | SKO-399 | Requests/balances/types/allocation/review as role allows; application/cancel/approve/reject and dates. |
| AI01 | /ai → overview | SKO-408 | Guide evidence → blueprint → reviewed paper → accessible delivery → moderated marks → targeted recovery → reassessment receipt |
| AI02 | /ai → schoolSetup | SKO-397 | Turn school documents into proposed records with source citations; reviewer confirms ambiguous rows and resolves prerequisites |
| AI03 | /ai → schoolOperations | SKO-470 | Describe desired school operation, inspect deterministic proposed change and affected records, approve scoped plan, execute once and reconcile result |
| AI04 | /ai → financeOperations | SKO-470 | Describe desired school operation, inspect deterministic proposed change and affected records, approve scoped plan, execute once and reconcile result |
| AI05 | /ai → runs | SKO-470 | Describe desired school operation, inspect deterministic proposed change and affected records, approve scoped plan, execute once and reconcile result |
| AI06 | /ai → sources | SKO-400 | Choose subject/year before intake; show OCR extraction next to source; make search and provenance visible |
| AI07 | /ai → curriculum | SKO-406 | Map imported syllabus to approved learning objectives; show taught/assessed/mastered as separate evidence-backed statuses |
| AI08 | /ai → academicSetup | SKO-393 | Start with configurable school-approved models; preview term dates, grade rules and weighting on sample students before apply |
| AI09 | /ai → timetableSetup | SKO-403 | Drag or keyboard-edit slots; explain teacher/room/class conflicts at edit time; preview affected people before publish |
| AI10 | /ai → announcements | SKO-416 | Group events by actionable task; open exact record and show resolved status; distinguish read from completed |
| AI11 | /ai → examPlanning | SKO-413 | Schedule all papers with conflict explanations; show seat capacity and access accommodations before assigning; publish reviewed duty plan |
| AI12 | /ai → feeInvoices | SKO-431 | Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt |
| AI13 | /ai → setupTasks | SKO-397 | Turn school documents into proposed records with source citations; reviewer confirms ambiguous rows and resolves prerequisites |
| AI14 | /ai → work | SKO-408 | Guide evidence → blueprint → reviewed paper → accessible delivery → moderated marks → targeted recovery → reassessment receipt |
| AI15 | /ai → policies | SKO-383 | Select allowed provider/model by policy; show source scope and data treatment before upload; offer deterministic/manual path when unavailable |
| AI16 | /ai → knowledge | SKO-429 | Answer operational questions from current approved policy; show exact source/version and responsible office when uncertain |
| AI17 | /ai → history | SKO-470 | Describe desired school operation, inspect deterministic proposed change and affected records, approve scoped plan, execute once and reconcile result |
| T001 | src/components/fees/FeesPanel.tsx → overview | SKO-431 | Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt |
| T002 | src/components/fees/FeesPanel.tsx → structures | SKO-431 | Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt |
| T003 | src/components/fees/FeesPanel.tsx → invoices | SKO-431 | Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt |
| T004 | src/components/fees/FeesPanel.tsx → payments | SKO-431 | Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt |
| T005 | src/components/fees/FeesPanel.tsx → reports | SKO-431 | Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt |
| T006 | src/components/fees/FeesPanel.tsx → accounts | SKO-468 | Guide accountant from a transaction to coded entry and evidence; show currency-specific totals and reconciliation status |
| T007 | src/components/fees/FeeLayersTab.tsx → types | SKO-431 | Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt |
| T008 | src/components/fees/FeeLayersTab.tsx → groups | SKO-431 | Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt |
| T009 | src/components/fees/FeeLayersTab.tsx → master | SKO-431 | Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt |
| T010 | src/components/fees/FeeLayersTab.tsx → assign | SKO-431 | Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt |
| T011 | src/components/fees/FeeLayersTab.tsx → discounts | SKO-431 | Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt |
| T012 | src/components/fees/FeeLayersTab.tsx → carry | SKO-431 | Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt |
| T013 | src/components/fees/AccountsTab.tsx → chart | SKO-468 | Guide accountant from a transaction to coded entry and evidence; show currency-specific totals and reconciliation status |
| T014 | src/components/fees/AccountsTab.tsx → methods | SKO-468 | Guide accountant from a transaction to coded entry and evidence; show currency-specific totals and reconciliation status |
| T015 | src/components/fees/AccountsTab.tsx → banks | SKO-468 | Guide accountant from a transaction to coded entry and evidence; show currency-specific totals and reconciliation status |
| T016 | src/components/fees/AccountsTab.tsx → income | SKO-468 | Guide accountant from a transaction to coded entry and evidence; show currency-specific totals and reconciliation status |
| T017 | src/components/fees/AccountsTab.tsx → expense | SKO-468 | Guide accountant from a transaction to coded entry and evidence; show currency-specific totals and reconciliation status |
| T018 | src/components/fees/AccountsTab.tsx → profit | SKO-468 | Guide accountant from a transaction to coded entry and evidence; show currency-specific totals and reconciliation status |
| T019 | src/components/academic/exams/ExamsWorkspace.tsx → plan | SKO-413 | Schedule all papers with conflict explanations; show seat capacity and access accommodations before assigning; publish reviewed duty plan |
| T020 | src/components/academic/exams/ExamsWorkspace.tsx → datesheet | SKO-413 | Schedule all papers with conflict explanations; show seat capacity and access accommodations before assigning; publish reviewed duty plan |
| T021 | src/components/academic/exams/ExamsWorkspace.tsx → seating | SKO-413 | Schedule all papers with conflict explanations; show seat capacity and access accommodations before assigning; publish reviewed duty plan |
| T022 | src/components/academic/exams/ExamsWorkspace.tsx → marks | SKO-413 | Schedule all papers with conflict explanations; show seat capacity and access accommodations before assigning; publish reviewed duty plan |
| T023 | src/components/academic/exams/ExamsWorkspace.tsx → results | SKO-413 | Schedule all papers with conflict explanations; show seat capacity and access accommodations before assigning; publish reviewed duty plan |
| T024 | src/components/academic/exams/ExamDetailDialog.tsx → marks | SKO-408 | Guide evidence → blueprint → reviewed paper → accessible delivery → moderated marks → targeted recovery → reassessment receipt |
| T025 | src/components/academic/exams/ExamDetailDialog.tsx → papers | SKO-408 | Guide evidence → blueprint → reviewed paper → accessible delivery → moderated marks → targeted recovery → reassessment receipt |
| T026 | src/components/academic/exams/ExamDetailDialog.tsx → reports | SKO-408 | Guide evidence → blueprint → reviewed paper → accessible delivery → moderated marks → targeted recovery → reassessment receipt |
| T027 | src/components/staff/hierarchy-panel.tsx → chart | SKO-399 | Show responsibilities and current teaching load; offer accessible list equivalent to chart; preview hierarchy changes before save |
| T028 | src/components/staff/hierarchy-panel.tsx → departments | SKO-399 | Show responsibilities and current teaching load; offer accessible list equivalent to chart; preview hierarchy changes before save |
| T029 | src/components/staff/hierarchy-panel.tsx → ladder | SKO-399 | Show responsibilities and current teaching load; offer accessible list equivalent to chart; preview hierarchy changes before save |
| T030 | src/components/timetable/TimetableStudio.tsx → class | SKO-403 | Drag or keyboard-edit slots; explain teacher/room/class conflicts at edit time; preview affected people before publish |
| T031 | src/components/timetable/TimetableStudio.tsx → teacher | SKO-403 | Drag or keyboard-edit slots; explain teacher/room/class conflicts at edit time; preview affected people before publish |
| T032 | src/components/timetable/TimetableStudio.tsx → room | SKO-403 | Drag or keyboard-edit slots; explain teacher/room/class conflicts at edit time; preview affected people before publish |
| T033 | src/components/settings/SettingsModal.tsx → profile | SKO-402 | Edit existing school/campus in context; preview name/logo/contact changes; show inherited versus local configuration |
| T034 | src/components/settings/SettingsModal.tsx → language | SKO-402 | Edit existing school/campus in context; preview name/logo/contact changes; show inherited versus local configuration |
| T035 | src/components/settings/SettingsModal.tsx → security | SKO-402 | Edit existing school/campus in context; preview name/logo/contact changes; show inherited versus local configuration |
| T036 | src/components/operations/index.tsx → transport.routes | SKO-437 | Show planned versus boarded riders and route changes; reconcile missing handover with named staff action |
| T037 | src/components/operations/index.tsx → transport.vehicles | SKO-437 | Show planned versus boarded riders and route changes; reconcile missing handover with named staff action |
| T038 | src/components/operations/index.tsx → dormitory.types | SKO-463 | Show capacity, current residents and availability; assign learner with effective dates and guardian-approved context where required |
| T039 | src/components/operations/index.tsx → dormitory.rooms | SKO-463 | Show capacity, current residents and availability; assign learner with effective dates and guardian-approved context where required |
| T040 | src/components/operations/index.tsx → library.books | SKO-436 | Scan/search book and borrower, show availability/loan policy, confirm issue; on return offer next reservation |
| T041 | src/components/operations/index.tsx → library.members | SKO-436 | Scan/search book and borrower, show availability/loan policy, confirm issue; on return offer next reservation |
| T042 | src/components/operations/index.tsx → library.issues | SKO-436 | Scan/search book and borrower, show availability/loan policy, confirm issue; on return offer next reservation |
| T043 | src/components/operations/index.tsx → library.categories | SKO-436 | Scan/search book and borrower, show availability/loan policy, confirm issue; on return offer next reservation |
| T044 | src/components/operations/index.tsx → inventory.items | SKO-435 | Start from low stock or maintenance need; show approval and budget impact; receive items against order with discrepancy review |
| T045 | src/components/operations/index.tsx → inventory.transactions | SKO-435 | Start from low stock or maintenance need; show approval and budget impact; receive items against order with discrepancy review |
| T046 | src/components/operations/index.tsx → inventory.stores | SKO-435 | Start from low stock or maintenance need; show approval and budget impact; receive items against order with discrepancy review |
| T047 | src/components/operations/index.tsx → inventory.suppliers | SKO-435 | Start from low stock or maintenance need; show approval and budget impact; receive items against order with discrepancy review |
| T048 | src/components/operations/index.tsx → inventory.categories | SKO-435 | Start from low stock or maintenance need; show approval and budget impact; receive items against order with discrepancy review |

## Every observed overlay callsite

Each row is an opening context or implementation wrapper, not a claim of one distinct modal. Inspect each concrete trigger in each mounting role. All rows require open → correct focus → invalid/valid submission → pending → success/failure → close → return focus, plus phone keyboard, dirty-close, nested overlay and RTL checks. The JSON gives a specific QA flow and feature owner for every callsite. Generic wrappers inherit their consumer domain; test the real consumer before passing it.

| ID | Owner | Component / containing function / title | Source |
|---|---|---|---|
| O001 | SKO-394 | MoveStudentModal in CampusAdminDashboard: — | [src/app/admin/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/admin/page.tsx:1331>) |
| O002 | SKO-394 | StudentDetailModal in CampusAdminDashboard: — | [src/app/admin/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/admin/page.tsx:1385>) |
| O003 | SKO-399 | TeacherDetailModal in CampusAdminDashboard: — | [src/app/admin/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/admin/page.tsx:1404>) |
| O004 | SKO-396 | BulkImportDialog in CampusAdminDashboard: — | [src/app/admin/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/admin/page.tsx:1416>) |
| O005 | SKO-390 | ActivityLogModal in CampusAdminDashboard: — | [src/app/admin/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/admin/page.tsx:1425>) |
| O006 | SKO-379 | HelpModal in CampusAdminDashboard: — | [src/app/admin/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/admin/page.tsx:1428>) |
| O007 | SKO-379 | ConfirmAction in CampusAdminDashboard: {confirmAction?.title  /  /  ""} | [src/app/admin/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/admin/page.tsx:1430>) |
| O008 | SKO-408 | ExamDetailModal in CampusAdminDashboard: — | [src/app/admin/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/admin/page.tsx:1442>) |
| O009 | SKO-375 | ReportCardDetailModal in CampusAdminDashboard: — | [src/app/admin/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/admin/page.tsx:1451>) |
| O010 | SKO-462 | Dialog in ClassesPage: — | [src/app/dashboard/classes/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/classes/page.tsx:341>) |
| O011 | SKO-462 | Dialog in ClassesPage: — | [src/app/dashboard/classes/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/classes/page.tsx:385>) |
| O012 | SKO-424 | ConfirmAction in MarksEntryPage: "Lock this exam?" | [src/app/dashboard/marks/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/marks/page.tsx:587>) |
| O013 | SKO-388 | DraftRecovery in AdmissionForm: — | [src/app/dashboard/students/admission-form.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/students/admission-form.tsx:534>) |
| O014 | SKO-379 | Dialog in BulkImportDialog: — | [src/app/dashboard/students/bulk-import-dialog.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/students/bulk-import-dialog.tsx:128>) |
| O015 | SKO-396 | BulkImportDialog in StudentsPage: — | [src/app/dashboard/students/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/dashboard/students/page.tsx:697>) |
| O016 | SKO-415 | ChatSettingsDialog in MessagesWorkspace: — | [src/app/messages/messages-workspace.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/messages/messages-workspace.tsx:66>) |
| O017 | SKO-388 | DraftRecovery in OnboardingWizard: — | [src/app/onboarding/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/onboarding/page.tsx:608>) |
| O018 | SKO-391 | Dialog in OnboardingWizard: — | [src/app/onboarding/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/onboarding/page.tsx:1185>) |
| O019 | SKO-402 | SchoolDetailModal in SchoolsView: — | [src/app/owner/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/owner/page.tsx:779>) |
| O020 | SKO-376 | AddUserModal in UsersView: — | [src/app/owner/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/owner/page.tsx:871>) |
| O021 | SKO-380 | ChangePasswordModal in UsersView: — | [src/app/owner/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/owner/page.tsx:990>) |
| O022 | SKO-402 | Modal in SchoolDetailModal: {school.name} | [src/app/owner/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/owner/page.tsx:1943>) |
| O023 | SKO-380 | Modal in ChangePasswordModal: "Change Password" | [src/app/owner/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/owner/page.tsx:2168>) |
| O024 | SKO-394 | MoveStudentModal in PrincipalDashboard: — | [src/app/principal/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/principal/page.tsx:760>) |
| O025 | SKO-462 | ClassDetailModal in PrincipalDashboard: — | [src/app/principal/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/principal/page.tsx:762>) |
| O026 | SKO-394 | StudentDetailModal in PrincipalDashboard: — | [src/app/principal/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/principal/page.tsx:787>) |
| O027 | SKO-399 | TeacherDetailModal in PrincipalDashboard: — | [src/app/principal/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/principal/page.tsx:802>) |
| O028 | SKO-396 | BulkImportDialog in PrincipalDashboard: — | [src/app/principal/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/principal/page.tsx:834>) |
| O029 | SKO-390 | ActivityLogModal in PrincipalDashboard: — | [src/app/principal/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/principal/page.tsx:841>) |
| O030 | SKO-379 | HelpModal in PrincipalDashboard: — | [src/app/principal/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/principal/page.tsx:842>) |
| O031 | SKO-417 | ConfirmAction in PrincipalDashboard: {confirmAction?.title  /  /  ""} | [src/app/principal/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/principal/page.tsx:843>) |
| O032 | SKO-402 | ModalFrame in SuperAdminDashboard: {inviteLink ? "Invitation Sent" : Invite ${inviteRole === "CAMPUS_ADMIN" ? "Admin" : "Principal"}} | [src/app/super/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/super/page.tsx:692>) |
| O033 | SKO-402 | ModalFrame in SuperAdminDashboard: "Create campus" | [src/app/super/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/super/page.tsx:743>) |
| O034 | SKO-390 | ActivityLogModal in SuperAdminDashboard: — | [src/app/super/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/super/page.tsx:861>) |
| O035 | SKO-402 | ConfirmAction in SuperAdminDashboard: {confirmAction?.title  /  /  ""} | [src/app/super/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/super/page.tsx:863>) |
| O036 | SKO-402 | Modal in ModalFrame: {title} | [src/app/super/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/super/page.tsx:1012>) |
| O037 | SKO-390 | ModalFrame in ActivityLogModal: "Activity Log" | [src/app/super/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/super/page.tsx:1165>) |
| O038 | SKO-388 | NavGuardPrompt in AttendancePage: — | [src/app/teacher/attendance/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/attendance/page.tsx:625>) |
| O039 | SKO-424 | CreateAssessmentModal in GradingModals: — | [src/app/teacher/grading-tools.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/grading-tools.tsx:65>) |
| O040 | SKO-393 | GradeConfigModal in GradingModals: — | [src/app/teacher/grading-tools.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/grading-tools.tsx:76>) |
| O041 | SKO-424 | FinalGradesModal in GradingModals: — | [src/app/teacher/grading-tools.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/grading-tools.tsx:91>) |
| O042 | SKO-399 | ModalFrame in LeavePage: "Apply for Leave" | [src/app/teacher/leave/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/leave/page.tsx:380>) |
| O043 | SKO-399 | ConfirmAction in LeavePage: "Withdraw this leave request?" | [src/app/teacher/leave/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/leave/page.tsx:488>) |
| O044 | SKO-388 | DraftRecovery in MarksPage: — | [src/app/teacher/marks/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/marks/page.tsx:306>) |
| O045 | SKO-424 | ConfirmAction in MarksPage: "Change assessment?" | [src/app/teacher/marks/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/marks/page.tsx:671>) |
| O046 | SKO-424 | ConfirmAction in MarksPage: {Clear every mark in ${clearTarget?.subjectName ?? "this subject"}?} | [src/app/teacher/marks/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/marks/page.tsx:676>) |
| O047 | SKO-375 | ReportCardDetailModal in ReportsPage: — | [src/app/teacher/reports/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/reports/page.tsx:325>) |
| O048 | SKO-394 | StudentDetailModal in TeacherStudentsPage: — | [src/app/teacher/students/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/students/page.tsx:445>) |
| O049 | SKO-388 | DraftRecovery in TeacherOnboardingPage: — | [src/app/teacher-onboarding/page.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher-onboarding/page.tsx:421>) |
| O050 | SKO-395 | ModalSurface in GuardianAccessManager: — | [src/components/GuardianAccessManager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/GuardianAccessManager.tsx:240>) |
| O051 | SKO-403 | Modal in DayPopover: {tr("Events on {0}", [dayLabel])} | [src/components/academic/AcademicCalendar.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/AcademicCalendar.tsx:568>) |
| O052 | SKO-413 | Modal in AssignmentPopover: {subject?.name ?? "Schedule paper"} | [src/components/academic/DatesheetBuilder.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/DatesheetBuilder.tsx:538>) |
| O053 | SKO-408 | ConfirmMoveModal in ExamCycleManager: — | [src/components/academic/ExamCycleManager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/ExamCycleManager.tsx:1316>) |
| O054 | SKO-408 | RejectMarksModal in ExamCycleManager: — | [src/components/academic/ExamCycleManager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/ExamCycleManager.tsx:1325>) |
| O055 | SKO-408 | CreateExamModal in ExamCycleManager: — | [src/components/academic/ExamCycleManager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/ExamCycleManager.tsx:1336>) |
| O056 | SKO-408 | ExamDetailDialog in ExamCycleManager: — | [src/components/academic/ExamCycleManager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/ExamCycleManager.tsx:1348>) |
| O057 | SKO-408 | Modal in ConfirmMoveModal: {verdictLabel} | [src/components/academic/ExamCycleManager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/ExamCycleManager.tsx:1792>) |
| O058 | SKO-408 | Modal in RejectMarksModal: "Send marks back" | [src/components/academic/ExamCycleManager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/ExamCycleManager.tsx:1872>) |
| O059 | SKO-408 | Modal in CreateExamModal: {role === "TEACHER" ? "Create Test" : "Create Exam"} | [src/components/academic/ExamCycleManager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/ExamCycleManager.tsx:2066>) |
| O060 | SKO-393 | Modal in RulesEditor: {group.className} | [src/components/academic/GradingRulesPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/GradingRulesPanel.tsx:363>) |
| O061 | SKO-413 | Modal in RoomsManager: {Remove room ${deleting.roomNumber}?} | [src/components/academic/RoomsManager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/RoomsManager.tsx:295>) |
| O062 | SKO-413 | Modal in RoomEditor: {room ? Room ${room.roomNumber} : "Add a room"} | [src/components/academic/RoomsManager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/RoomsManager.tsx:496>) |
| O063 | SKO-404 | Modal in YearEndPanel: "Archive Academic Year" | [src/components/academic/YearEndPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/YearEndPanel.tsx:247>) |
| O064 | SKO-379 | Modal in ExamDetailDialog: {exam.title} | [src/components/academic/exams/ExamDetailDialog.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/exams/ExamDetailDialog.tsx:95>) |
| O065 | SKO-413 | ExamDetailDialog in ExamsWorkspace: — | [src/components/academic/exams/ExamsWorkspace.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/exams/ExamsWorkspace.tsx:513>) |
| O066 | SKO-413 | Modal in ExamsWorkspace: {Remove "${deleting.title}"?} | [src/components/academic/exams/ExamsWorkspace.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/exams/ExamsWorkspace.tsx:523>) |
| O067 | SKO-413 | Modal in ExamDutyControl: {t.duties} | [src/components/academic/exams/ExamsWorkspace.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/exams/ExamsWorkspace.tsx:943>) |
| O068 | SKO-413 | PlacePaperModal in MasterDatesheet: — | [src/components/academic/exams/MasterDatesheet.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/exams/MasterDatesheet.tsx:507>) |
| O069 | SKO-413 | Modal in MasterDatesheet: {Remove ${removing.name}?} | [src/components/academic/exams/MasterDatesheet.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/exams/MasterDatesheet.tsx:523>) |
| O070 | SKO-413 | Modal in PlacePaperModal: {subject.name} | [src/components/academic/exams/MasterDatesheet.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/exams/MasterDatesheet.tsx:658>) |
| O071 | SKO-413 | RoomAssignModal in SeatingPlanner: — | [src/components/academic/exams/SeatingPlanner.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/exams/SeatingPlanner.tsx:489>) |
| O072 | SKO-413 | Modal in SeatingPlanner: "Seating plan built" | [src/components/academic/exams/SeatingPlanner.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/exams/SeatingPlanner.tsx:502>) |
| O073 | SKO-413 | Modal in RoomAssignModal: {${classLabel(paper.exam.class)} — ${paper.subject.name}} | [src/components/academic/exams/SeatingPlanner.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/exams/SeatingPlanner.tsx:642>) |
| O074 | SKO-413 | Modal in SessionWizard: "Schedule an exam" | [src/components/academic/exams/SessionWizard.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/exams/SessionWizard.tsx:202>) |
| O075 | SKO-404 | Modal in AcademicYearPanel: "Class History" | [src/components/academic-year/AcademicYearPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic-year/AcademicYearPanel.tsx:419>) |
| O076 | SKO-404 | Modal in AcademicYearPanel: {             promoteStep === "source" ? "Select Source Class" :             promoteStep === "review" ? "Review Students & Results" :             promoteStep === "target" ? "Select Target & Preview" :             "Promotion Complete"           } | [src/components/academic-year/AcademicYearPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic-year/AcademicYearPanel.tsx:490>) |
| O077 | SKO-380 | Modal in ChangeAuthenticatorDialog: {mode === "change" ? t.changeTitle : t.enableTitle} | [src/components/account-security/ChangeAuthenticatorDialog.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/account-security/ChangeAuthenticatorDialog.tsx:173>) |
| O078 | SKO-380 | Modal in DisableTwoFactorDialog: {t.disableTitle} | [src/components/account-security/DisableTwoFactorDialog.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/account-security/DisableTwoFactorDialog.tsx:66>) |
| O079 | SKO-380 | Modal in RegenerateCodesDialog: {t.regenerateTitle} | [src/components/account-security/RegenerateCodesDialog.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/account-security/RegenerateCodesDialog.tsx:74>) |
| O080 | SKO-380 | ChangePasswordDialog in SecuritySettingsPanel: — | [src/components/account-security/SecuritySettingsPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/account-security/SecuritySettingsPanel.tsx:157>) |
| O081 | SKO-380 | ChangeAuthenticatorDialog in SecuritySettingsPanel: — | [src/components/account-security/SecuritySettingsPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/account-security/SecuritySettingsPanel.tsx:159>) |
| O082 | SKO-380 | RegenerateCodesDialog in SecuritySettingsPanel: — | [src/components/account-security/SecuritySettingsPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/account-security/SecuritySettingsPanel.tsx:162>) |
| O083 | SKO-380 | DisableTwoFactorDialog in SecuritySettingsPanel: — | [src/components/account-security/SecuritySettingsPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/account-security/SecuritySettingsPanel.tsx:163>) |
| O084 | SKO-431 | Dialog in FeeManagementPanel: — | [src/components/billing/FeeManagementPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/billing/FeeManagementPanel.tsx:414>) |
| O085 | SKO-431 | Dialog in FeeManagementPanel: — | [src/components/billing/FeeManagementPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/billing/FeeManagementPanel.tsx:462>) |
| O086 | SKO-431 | Dialog in FeeManagementPanel: — | [src/components/billing/FeeManagementPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/billing/FeeManagementPanel.tsx:509>) |
| O087 | SKO-373 | Modal in PlansPanel: "Bank Transfer" | [src/components/billing/PlansPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/billing/PlansPanel.tsx:405>) |
| O088 | SKO-379 | Modal in ChatSettingsDialog: "Messaging policy" | [src/components/chat/chat-settings-dialog.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/chat/chat-settings-dialog.tsx:114>) |
| O089 | SKO-415 | NewConversationDialog in ChatWorkspace: — | [src/components/chat/chat-workspace.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/chat/chat-workspace.tsx:86>) |
| O090 | SKO-379 | motion.div in NewConversationDialog: — | [src/components/chat/new-conversation-dialog.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/chat/new-conversation-dialog.tsx:173>) |
| O091 | SKO-379 | Modal in ApplicationPatternsReference: "Feedback example dialog" | [src/components/design-system/ApplicationPatternsReference.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/design-system/ApplicationPatternsReference.tsx:71>) |
| O092 | SKO-379 | Dialog in DesignSystemReference: — | [src/components/design-system/DesignSystemReference.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/design-system/DesignSystemReference.tsx:157>) |
| O093 | SKO-468 | ModalFrame in ChartPanel: {editing ? tr("Edit Account") : tr("New Account")} | [src/components/fees/AccountsTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/AccountsTab.tsx:227>) |
| O094 | SKO-468 | ConfirmAction in ChartPanel: {tr("Delete account?")} | [src/components/fees/AccountsTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/AccountsTab.tsx:246>) |
| O095 | SKO-468 | ModalFrame in MethodsPanel: {editing ? tr("Edit Payment Method") : tr("New Payment Method")} | [src/components/fees/AccountsTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/AccountsTab.tsx:407>) |
| O096 | SKO-468 | ConfirmAction in MethodsPanel: {tr("Delete payment method?")} | [src/components/fees/AccountsTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/AccountsTab.tsx:416>) |
| O097 | SKO-468 | ModalFrame in BanksPanel: {editing ? tr("Edit Bank Account") : tr("New Bank Account")} | [src/components/fees/AccountsTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/AccountsTab.tsx:606>) |
| O098 | SKO-468 | ConfirmAction in BanksPanel: {tr("Delete bank account?")} | [src/components/fees/AccountsTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/AccountsTab.tsx:618>) |
| O099 | SKO-468 | ModalFrame in EntriesPanel: {kind === "INCOME" ? tr("Record Income") : tr("Record Expense")} | [src/components/fees/AccountsTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/AccountsTab.tsx:808>) |
| O100 | SKO-468 | ConfirmAction in EntriesPanel: {tr("Delete entry?")} | [src/components/fees/AccountsTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/AccountsTab.tsx:837>) |
| O101 | SKO-431 | InvoiceDetailModal in FeeInvoicesTab: — | [src/components/fees/FeeInvoicesTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeInvoicesTab.tsx:354>) |
| O102 | SKO-431 | GenerateInvoicesModal in FeeInvoicesTab: — | [src/components/fees/FeeInvoicesTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeInvoicesTab.tsx:363>) |
| O103 | SKO-431 | ConfirmAction in InvoiceDetailModal: {tr("Mark as Overdue")} | [src/components/fees/FeeInvoicesTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeInvoicesTab.tsx:406>) |
| O104 | SKO-431 | ConfirmAction in InvoiceDetailModal: {tr("Cancel Invoice")} | [src/components/fees/FeeInvoicesTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeInvoicesTab.tsx:415>) |
| O105 | SKO-431 | Modal in InvoiceDetailModal: {tr("Invoice Detail")} | [src/components/fees/FeeInvoicesTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeInvoicesTab.tsx:424>) |
| O106 | SKO-431 | Modal in GenerateInvoicesModal: {tr("Generate Invoices")} | [src/components/fees/FeeInvoicesTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeInvoicesTab.tsx:598>) |
| O107 | SKO-431 | ConfirmAction in TypesPanel: {tr("Delete Fee Type")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:202>) |
| O108 | SKO-431 | ModalFrame in TypesPanel: {editing ? tr("Edit Fee Type") : tr("New Fee Type")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:218>) |
| O109 | SKO-431 | ConfirmAction in GroupsPanel: {tr("Delete Fee Group")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:355>) |
| O110 | SKO-431 | ModalFrame in GroupsPanel: {editing ? tr("Edit Fee Group") : tr("New Fee Group")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:380>) |
| O111 | SKO-431 | ConfirmAction in MasterPanel: {tr("Delete Master Line")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:539>) |
| O112 | SKO-431 | ModalFrame in MasterPanel: {editing ? tr("Edit Master Line") : tr("Add Master Line")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:556>) |
| O113 | SKO-431 | ConfirmAction in AssignPanel: {tr("Remove Assignment")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:691>) |
| O114 | SKO-431 | ModalFrame in AssignPanel: {tr("Assign Fee Group")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:707>) |
| O115 | SKO-431 | ConfirmAction in DiscountsPanel: {tr("Delete Discount")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:938>) |
| O116 | SKO-431 | ModalFrame in DiscountsPanel: {editing ? tr("Edit Discount") : tr("New Discount")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:954>) |
| O117 | SKO-431 | ModalFrame in DiscountsPanel: {tr("Assign: {0}", [assigning.name])} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:983>) |
| O118 | SKO-431 | ConfirmAction in CarryPanel: {tr("Delete Carry-Forward")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:1182>) |
| O119 | SKO-431 | ModalFrame in CarryPanel: {tr("New Carry-Forward")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:1198>) |
| O120 | SKO-431 | ModalFrame in FineRulesPanel: {editing ? tr("Edit Fine Rule") : tr("New Fine Rule")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:1419>) |
| O121 | SKO-431 | ConfirmAction in FineRulesPanel: {tr("Delete fine rule?")} | [src/components/fees/FeeLayersTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeLayersTab.tsx:1447>) |
| O122 | SKO-432 | PaymentModal in FeePaymentsTab: — | [src/components/fees/FeePaymentsTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeePaymentsTab.tsx:264>) |
| O123 | SKO-432 | BankImportModal in FeePaymentsTab: — | [src/components/fees/FeePaymentsTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeePaymentsTab.tsx:272>) |
| O124 | SKO-432 | Modal in PaymentModal: {tr("Record Payment")} | [src/components/fees/FeePaymentsTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeePaymentsTab.tsx:422>) |
| O125 | SKO-432 | Modal in BankImportModal: {tr("Import Bank Statement")} | [src/components/fees/FeePaymentsTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeePaymentsTab.tsx:726>) |
| O126 | SKO-431 | StructureModal in LegacyStructuresTab: — | [src/components/fees/FeeStructuresTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeStructuresTab.tsx:232>) |
| O127 | SKO-431 | ConfirmAction in StructureCard: {tr("Deactivate Structure")} | [src/components/fees/FeeStructuresTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeStructuresTab.tsx:286>) |
| O128 | SKO-431 | Modal in StructureModal: {editing ? tr("Edit Fee Structure") : tr("New Fee Structure")} | [src/components/fees/FeeStructuresTab.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/fees/FeeStructuresTab.tsx:441>) |
| O129 | SKO-416 | div in Header: — | [src/components/layout/header.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/layout/header.tsx:324>) |
| O130 | SKO-402 | Modal in Shell: {title} | [src/components/owner/provisioning-modals.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/owner/provisioning-modals.tsx:67>) |
| O131 | SKO-416 | div in RoleHeader: — | [src/components/role-dashboard/RoleHeader.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/role-dashboard/RoleHeader.tsx:344>) |
| O132 | SKO-379 | ModalSurface in RoleSidebar: — | [src/components/role-dashboard/RoleSidebar.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/role-dashboard/RoleSidebar.tsx:114>) |
| O133 | SKO-388 | NavGuardPrompt in WorkspaceDraftBoundary: — | [src/components/school-ai/draft-safety.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/school-ai/draft-safety.tsx:27>) |
| O134 | SKO-388 | ConfirmAction in WorkspaceDraftBoundary: {c.unsavedTitle} | [src/components/school-ai/draft-safety.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/school-ai/draft-safety.tsx:27>) |
| O135 | SKO-411 | ModalSurface in ExamPlayer: — | [src/components/school-ai/exam-player.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/school-ai/exam-player.tsx:145>) |
| O136 | SKO-411 | ModalSurface in ExamPlayer: — | [src/components/school-ai/exam-player.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/school-ai/exam-player.tsx:146>) |
| O137 | SKO-413 | ModalSurface in ProctorSessionList: — | [src/components/school-ai/exam-proctor-sessions.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/school-ai/exam-proctor-sessions.tsx:18>) |
| O138 | SKO-397 | ModalSurface in GuidedSetup: — | [src/components/school-ai/guided-setup.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/school-ai/guided-setup.tsx:97>) |
| O139 | SKO-400 | ModalSurface in PhoneCaptureButton: — | [src/components/school-ai/phone-capture.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/school-ai/phone-capture.tsx:16>) |
| O140 | SKO-408 | ConfirmAction in RevisionInspector: {h.restoreTitle} | [src/components/school-ai/revision-history.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/school-ai/revision-history.tsx:130>) |
| O141 | SKO-415 | ModalSurface in ScanComposer: — | [src/components/school-ai/scan-composer.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/school-ai/scan-composer.tsx:86>) |
| O142 | SKO-380 | Modal in ChangePasswordDialog: {t("Change Password")} | [src/components/settings/ChangePasswordDialog.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/settings/ChangePasswordDialog.tsx:63>) |
| O143 | SKO-402 | SchoolDialog in InstitutionSettingsPanel: — | [src/components/settings/InstitutionSettingsPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/settings/InstitutionSettingsPanel.tsx:215>) |
| O144 | SKO-402 | CampusDialog in InstitutionSettingsPanel: — | [src/components/settings/InstitutionSettingsPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/settings/InstitutionSettingsPanel.tsx:218>) |
| O145 | SKO-402 | Modal in SchoolDialog: {tr("Edit school details")} | [src/components/settings/InstitutionSettingsPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/settings/InstitutionSettingsPanel.tsx:288>) |
| O146 | SKO-388 | DraftRecovery in SchoolDialog: — | [src/components/settings/InstitutionSettingsPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/settings/InstitutionSettingsPanel.tsx:307>) |
| O147 | SKO-402 | Modal in CampusDialog: {tr("Edit campus")} | [src/components/settings/InstitutionSettingsPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/settings/InstitutionSettingsPanel.tsx:421>) |
| O148 | SKO-388 | DraftRecovery in CampusDialog: — | [src/components/settings/InstitutionSettingsPanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/settings/InstitutionSettingsPanel.tsx:440>) |
| O149 | SKO-379 | ModalSurface in SettingsModal: — | [src/components/settings/SettingsModal.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/settings/SettingsModal.tsx:47>) |
| O150 | SKO-402 | SettingsModal in Host: — | [src/components/settings/SettingsModalHost.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/settings/SettingsModalHost.tsx:54>) |
| O151 | SKO-462 | div in SettingsDrawer: {${classLabel(section)} settings} | [src/components/shared-admin/class-manager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/class-manager.tsx:255>) |
| O152 | SKO-462 | ModalSurface in ClassManager: — | [src/components/shared-admin/class-manager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/class-manager.tsx:1688>) |
| O153 | SKO-462 | ModalSurface in CreateClassWizard: — | [src/components/shared-admin/create-class-wizard.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/create-class-wizard.tsx:358>) |
| O154 | SKO-408 | Modal in ExamDetailModal: {exam.title} | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:876>) |
| O155 | SKO-408 | ModalFrame in ExamCreateModal: "New Exam Cycle" | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:1184>) |
| O156 | SKO-394 | ModalFrame in MoveStudentModal: "Move Student" | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:2088>) |
| O157 | SKO-462 | ModalFrame in ClassDetailModal: {classLabel(cls)} | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:2270>) |
| O158 | SKO-394 | ModalFrame in StudentDetailModal: {student.fullName} | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:2888>) |
| O159 | SKO-388 | DraftRecovery in StudentDetailModal: — | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:2995>) |
| O160 | SKO-394 | ConfirmAction in StudentDetailModal: {statusChange ? STUDENT_STATUS_CHANGES[statusChange].title : ""} | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:3255>) |
| O161 | SKO-399 | ModalFrame in TeacherDetailModal: {teacher.fullName} | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:3915>) |
| O162 | SKO-379 | Modal in ModalFrame: {title} | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:4512>) |
| O163 | SKO-390 | ModalFrame in ActivityLogModal: "Activity Log" | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:5422>) |
| O164 | SKO-379 | ModalFrame in HelpModal: "Help Center" | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:5517>) |
| O165 | SKO-394 | TagFormModal in StudentSetupPanel: — | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:5840>) |
| O166 | SKO-394 | ConfirmAction in StudentSetupPanel: {Delete ${deleting?.kind === "category" ? "category" : "group"}?} | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:5852>) |
| O167 | SKO-394 | ModalFrame in TagFormModal: {item ? Edit ${kind === "category" ? "category" : "group"} : New ${kind === "category" ? "category" : "group"}} | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:6029>) |
| O168 | SKO-398 | NewQueryModal in AdmissionQueriesPanel: — | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:6624>) |
| O169 | SKO-398 | QueryDetailModal in AdmissionQueriesPanel: — | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:6636>) |
| O170 | SKO-398 | ModalFrame in NewQueryModal: "New Admission Enquiry" | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:6740>) |
| O171 | SKO-398 | ModalFrame in QueryDetailModal: {query.name} | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:6873>) |
| O172 | SKO-399 | ModalFrame in LeaveManagementPanel: "Add Leave Type" | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:7930>) |
| O173 | SKO-399 | ModalFrame in LeaveManagementPanel: "Add Leave Allocation" | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:7944>) |
| O174 | SKO-379 | ConfirmAction in RolePermissionsPanel: "Copy permissions" | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:8910>) |
| O175 | SKO-403 | ConfirmAction in PeriodsPanel: {Delete period ${confirmPeriod?.periodNumber ?? ""}?} | [src/components/shared-admin/index.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/index.tsx:9250>) |
| O176 | SKO-462 | ModalSurface in QuickCreateClass: — | [src/components/shared-admin/quick-create-class.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/quick-create-class.tsx:415>) |
| O177 | SKO-394 | BulkTagModal in StudentsPanel: — | [src/components/shared-admin/students-panel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/students-panel.tsx:808>) |
| O178 | SKO-394 | Modal in StudentsPanel: "Review enrollment changes" | [src/components/shared-admin/students-panel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/students-panel.tsx:827>) |
| O179 | SKO-394 | ConfirmAction in StudentsPanel: {confirmArchive === "archived" ? "Archive these students?" : "Restore these students?"} | [src/components/shared-admin/students-panel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/students-panel.tsx:833>) |
| O180 | SKO-379 | Modal in BulkSheet: {title} | [src/components/shared-admin/students-panel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/students-panel.tsx:1036>) |
| O181 | SKO-379 | ModalSurface in WizardShell: — | [src/components/shared-admin/wizard-shell.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/shared-admin/wizard-shell.tsx:53>) |
| O182 | SKO-399 | ConfirmAction in DepartmentManager: {pendingRemoval ? Remove ${pendingRemoval.name}? : ""} | [src/components/staff/department-manager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/staff/department-manager.tsx:387>) |
| O183 | SKO-399 | Modal in DepartmentManager: {draft.id ? Edit ${draft.name  /  /  "unit"} : "New unit"} | [src/components/staff/department-manager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/staff/department-manager.tsx:403>) |
| O184 | SKO-399 | Modal in MemberPicker: {People in ${unit.name}} | [src/components/staff/department-manager.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/staff/department-manager.tsx:508>) |
| O185 | SKO-399 | ConfirmAction in DesignationLadder: {pendingRemoval ? (pendingRemoval.staffCount > 0 ? Retire ${pendingRemoval.name}? : Delete ${pendingRemoval.name}?) : ""} | [src/components/staff/designation-ladder.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/staff/designation-ladder.tsx:344>) |
| O186 | SKO-399 | Modal in DesignationLadder: "Start from a preset" | [src/components/staff/designation-ladder.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/staff/designation-ladder.tsx:361>) |
| O187 | SKO-399 | Modal in DesignationLadder: {draft.id ? Edit ${draft.name  /  /  "rank"} : "New rank"} | [src/components/staff/designation-ladder.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/staff/designation-ladder.tsx:407>) |
| O188 | SKO-399 | PositionDialog in StaffHierarchyPanel: — | [src/components/staff/hierarchy-panel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/staff/hierarchy-panel.tsx:198>) |
| O189 | SKO-379 | Modal in PositionDialog: {node.fullName} | [src/components/staff/position-dialog.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/staff/position-dialog.tsx:305>) |
| O190 | SKO-379 | div in TeacherCommandPalette: "Quick switcher" | [src/components/teacher/command-palette.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/teacher/command-palette.tsx:153>) |
| O191 | SKO-379 | Modal in ModalFrame: {title} | [src/components/teacher/teacher-components.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/teacher/teacher-components.tsx:179>) |
| O192 | SKO-424 | ModalFrame in CreateAssessmentModal: "Create Assessment" | [src/components/teacher/teacher-components.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/teacher/teacher-components.tsx:316>) |
| O193 | SKO-393 | ModalFrame in GradeConfigModal: "Grade Weight Configuration" | [src/components/teacher/teacher-components.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/teacher/teacher-components.tsx:441>) |
| O194 | SKO-424 | ModalFrame in FinalGradesModal: "Final Grades" | [src/components/teacher/teacher-components.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/teacher/teacher-components.tsx:572>) |
| O195 | SKO-394 | ModalFrame in StudentDetailModal: {student.fullName} | [src/components/teacher/teacher-components.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/teacher/teacher-components.tsx:706>) |
| O196 | SKO-375 | ModalFrame in ReportCardDetailModal: {${viewReport.student?.fullName  /  /  "Student"} \u2014 Report Card} | [src/components/teacher/teacher-components.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/teacher/teacher-components.tsx:959>) |
| O197 | SKO-375 | ConfirmAction in ReportCardDetailModal: "Send this report card?" | [src/components/teacher/teacher-components.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/teacher/teacher-components.tsx:1204>) |
| O198 | SKO-379 | Modal in AddPeriodDialog: {c.title} | [src/components/timetable/AddPeriodDialog.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/AddPeriodDialog.tsx:46>) |
| O199 | SKO-403 | Modal in PeriodChangeReview: {c.title} | [src/components/timetable/PeriodChangeReview.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/PeriodChangeReview.tsx:15>) |
| O200 | SKO-403 | ConfirmAction in TimetablePanel: {scopeCopy.changeTitle} | [src/components/timetable/TimetablePanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/TimetablePanel.tsx:502>) |
| O201 | SKO-403 | AddPeriodDialog in TimetablePanel: — | [src/components/timetable/TimetablePanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/TimetablePanel.tsx:503>) |
| O202 | SKO-403 | PeriodConfigModal in TimetablePanel: — | [src/components/timetable/TimetablePanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/TimetablePanel.tsx:959>) |
| O203 | SKO-403 | SlotEditorModal in TimetablePanel: — | [src/components/timetable/TimetablePanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/TimetablePanel.tsx:976>) |
| O204 | SKO-403 | Modal in PeriodConfigModal: "Configure Periods" | [src/components/timetable/TimetablePanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/TimetablePanel.tsx:1041>) |
| O205 | SKO-403 | Modal in SlotEditorModal: {${dayName} — Period ${slot.periodNumber}} | [src/components/timetable/TimetablePanel.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/TimetablePanel.tsx:1173>) |
| O206 | SKO-403 | Modal in PeriodConfigModal: "Configure Periods" | [src/components/timetable/TimetableStudio.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/TimetableStudio.tsx:271>) |
| O207 | SKO-403 | Modal in SlotEditorModal: {${dayName} — Period ${slot.periodNumber}} | [src/components/timetable/TimetableStudio.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/TimetableStudio.tsx:419>) |
| O208 | SKO-403 | ConfirmAction in TimetableStudio: {scopeCopy.changeTitle} | [src/components/timetable/TimetableStudio.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/TimetableStudio.tsx:964>) |
| O209 | SKO-403 | AddPeriodDialog in TimetableStudio: — | [src/components/timetable/TimetableStudio.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/TimetableStudio.tsx:965>) |
| O210 | SKO-403 | PeriodConfigModal in TimetableStudio: — | [src/components/timetable/TimetableStudio.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/TimetableStudio.tsx:1365>) |
| O211 | SKO-403 | SlotEditorModal in TimetableStudio: — | [src/components/timetable/TimetableStudio.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/timetable/TimetableStudio.tsx:1382>) |
| O212 | SKO-379 | Modal in ConfirmAction: {title} | [src/components/ui/confirm-action.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/confirm-action.tsx:83>) |
| O213 | SKO-388 | ConfirmAction in NavGuardPrompt: {copy.leaveTitle} | [src/components/ui/confirm-action.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/confirm-action.tsx:156>) |
| O214 | SKO-379 | ModalSurface in DatePicker: — | [src/components/ui/date-picker.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/date-picker.tsx:119>) |
| O215 | SKO-379 | ModalSurface in DialogContent: — | [src/components/ui/dialog.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/dialog.tsx:107>) |
| O216 | SKO-388 | NavGuardPrompt in DraftRecovery: — | [src/components/ui/draft-recovery.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/draft-recovery.tsx:23>) |
| O217 | SKO-388 | Modal in DraftRecovery: "Recover your work" | [src/components/ui/draft-recovery.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/draft-recovery.tsx:24>) |
| O218 | SKO-388 | DiscardChangesPrompt in dialog: — | [src/components/ui/modal.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/modal.tsx:659>) |
| O219 | SKO-388 | ModalSurface in DiscardChangesPrompt: — | [src/components/ui/modal.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/modal.tsx:680>) |
| O220 | SKO-379 | ModalSurface in Modal: — | [src/components/ui/modal.tsx](</Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/modal.tsx:771>) |

## Canonical feature UX, acceptance and QA contracts

These are proposed acceptance contracts, not assertions of completed delivery. A feature without mapped UI may have backend code; source absence here only means no dedicated UI surface was assigned in this audit. Each card should include the matching surface IDs, feature-specific criteria below, shared state/accessibility protocol and evidence links. Avoid creating hundreds of duplicate implementation tickets for primitive wrappers.

### SKO-379 — [001] Shared design system and role-based navigation

**Screens/dialogs:** Role Today page, shared header, navigation drawer, global task switcher and every page shell.

**Flow:** Show the next three relevant tasks, a persistent school/campus context and one primary action; group the full directory behind Workspaces.

**Acceptance:** Refresh and Back preserve workspace; no inaccessible shortcut or restricted-data flash; keyboard switcher has role-filtered results.

**QA:** As a teacher in two campuses, open attendance from Today, return with Back, switch campus and verify roster and cached search results clear.

**Current source surface IDs:** R025, R034, R040, R079, V001, V079, V089, V093, O006, O007, O014, O030, O064, O088, O090, O091, O092, O132, O149, O162, O164, O174, O180, O181, O189, O190, O191, O198, O212, O214, O215, O220, N004, N005, N014, N017, N020, N021, N022, N023, N026, N027, N062, N063, N064, N067, N069, N070, N071, N072, N073, N076, N077, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014, B015, B016, B017, B018, B019, B020, B021, B022, B023, B024, B025, B026, B027, B028, B029, B030, B031, B032, B033, B034, B035, B036, B037, B038, B039, B040, B041, B042, B043.

### SKO-377 — [002] Shared authorization and tenant/campus/child ownership rules

**Screens/dialogs:** Access-denied state, campus/child switcher and permission explanation on every protected screen.

**Flow:** Resolve scope before rendering data; explain missing permission with the responsible school contact and a safe return action.

**Acceptance:** Direct links, exports, attachments and cached responses enforce the same scope; family fields are permission-filtered independently.

**QA:** Open another campus pupil URL, change a child ID and reuse an attachment URL after revocation; UI and APIs deny without disclosing names.

**Current source surface IDs:** R022, V011, V043.

### SKO-376 — [003] Role assignment, invitations and institution membership UX

**Screens/dialogs:** Membership list, invite wizard, acceptance summary, delegation editor and revoke confirmation.

**Flow:** Choose institution/campus, role and permissions; show a readable access summary before invite; show pending, accepted, expired and revoked independently.

**Acceptance:** Self-removal and last-owner rules are explicit; duplicate invitations resolve to the existing pending invitation; cancellation states explain access consequences.

**QA:** Invite one teacher twice, expire and reissue, accept the newest link, then revoke during an open session and verify access loss.

**Current source surface IDs:** R001, R036, R043, V002, V034, V071, O020, N001.

### SKO-380 — [004] Reliable account lifecycle and administrator MFA

**Screens/dialogs:** Security settings, MFA enrollment/replacement/recovery dialogs and session list.

**Flow:** Enable MFA through verify then save recovery codes; mark current session; revoke a selected other device with consequence text.

**Acceptance:** Recovery code is one-use; changing authenticator requires proof; sensitive state never appears in logs/toasts; lost-authenticator route is recoverable.

**QA:** Enroll MFA, use a recovery code twice, replace authenticator, revoke a second browser and verify current session survives.

**Current source surface IDs:** R005, R023, V073, O021, O023, O077, O078, O079, O080, O081, O082, O083, O142, N003.

### SKO-375 — [005] Approved report versions and publication gates

**Screens/dialogs:** Report review inbox, side-by-side version comparison, publication confirmation and delivery receipt.

**Flow:** Review marks and source-grounded comments, approve a numbered report version, select audience, publish, then send approved content.

**Acceptance:** Draft and published versions have distinct banners; publication invalidates when source marks change; delivered historical version remains inspectable.

**QA:** Edit a mark after approval and ensure publish blocks until re-review; parent sees only the approved published version in UI and PDF.

**Current source surface IDs:** R035, R053, R065, R080, V024, V057, O009, O047, O196, O197, N006, N007.

### SKO-378 — [006] Truthful marketing and synchronized pricing entitlements

**Screens/dialogs:** Public product pages, pricing comparison, demo CTA and trust pages.

**Flow:** Lead with an authentic exam-to-reassessment story and evidence; compare capabilities and effective price using the same entitlement data as checkout.

**Acceptance:** Clearly distinguish shipped, pilot and planned functions; no unsupported security, uniqueness or funding promises; sample labels persist.

**QA:** Compare every advertised capability and total against checkout for annual/monthly, extra campus and exhausted AI allowance.

**Current source surface IDs:** R011, R012, R013, R014, R015, R016, R017, R018, R019, R020, R021, R049, V075.

### SKO-381 — [007] Backups, restore rehearsals and migration checks

**Screens/dialogs:** Operator backup evidence, restore rehearsal report and migration readiness detail (proposed).

**Flow:** Show last successful backup and separately last verified restore; select a rehearsal, see row counts and evidence, export an operator receipt.

**Acceptance:** Never show a backup as a successful restore; failed rehearsal has owner and next action; production identifiers/secrets redacted.

**QA:** Simulate unavailable backup, restore a synthetic tenant in isolation, compare record/link counts and verify failure blocks release evidence.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-384 — [008] Auditable grade and finance corrections

**Screens/dialogs:** Corrections queue with MARK/PAYMENT tabs, before/after preview, approval and immutable history.

**Flow:** Select authoritative record, propose reasoned change, show affected reports/balance, request independent approval, apply once.

**Acceptance:** Requestor cannot approve own restricted correction; stale record forces new preview; family sees approved consequence without internal notes.

**QA:** Request a mark change, modify original concurrently, reject stale approval; retry payment correction and verify a single ledger effect.

**Current source surface IDs:** R026.

### SKO-383 — [009] AI provider policy, privacy and evaluation gateway

**Screens/dialogs:** AI policy readiness, provider health, usage/cost explanation and evaluation evidence.

**Flow:** Select allowed provider/model by policy; show source scope and data treatment before upload; offer deterministic/manual path when unavailable.

**Acceptance:** AI draft, human approved and published are distinct; no raw prompt/student data in provider error UI; unknown confidence triggers review.

**QA:** Use an unsupported language, unavailable provider, exhausted allowance and malicious source instruction; ensure useful failure and no unauthorized action.

**Current source surface IDs:** AI15.

### SKO-382 — [010] Durable event outbox and job orchestration

**Screens/dialogs:** Background job progress ribbon and delivery outbox detail.

**Flow:** Acknowledge durable enqueue before showing queued; expose per-item status and safe retry from the owning workflow.

**Acceptance:** Retry preserves idempotency; a partial batch stays partial; accepted job is not reported as delivered.

**QA:** Submit a 30-recipient job, fail after 12, reconnect and retry only eligible items; check no duplicate side effects.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-387 — [011] Package comparison, trial and checkout during registration

**Screens/dialogs:** Registration package comparison, cost estimator, delegated purchase and checkout return.

**Flow:** Choose school shape and country, preview included capacity and complete total, compare plans, then continue checkout with return intent.

**Acceptance:** Currency and tax assumptions are explicit; trial end and charged period visible; provider return is pending until verified settlement.

**QA:** Change campus/student counts, use a delegated purchaser, cancel at provider, retry and verify original registration draft and quote persist.

**Current source surface IDs:** R045, R046, N010, N011.

### SKO-373 — [012] Subscription lifecycle, group billing and entitlement enforcement

**Screens/dialogs:** Subscription overview, entitlement meter, change/cancel/resume review and invoice history.

**Flow:** Show current access, next invoice, grace dates and impact of plan changes; route suspended users directly to authorized recovery.

**Acceptance:** Payment settlement, renewal and access are separate states; downgrades explain over-limit data; no destructive removal on downgrade.

**QA:** Simulate a duplicate webhook, failed renewal and late settlement; verify entitlement recovers once and retained student data remains intact.

**Current source surface IDs:** R028, R068, R069, R070, V023, V065, V074, V078, O087, N025.

### SKO-386 — [013] Job status, retries and delivery receipts

**Screens/dialogs:** Jobs list, filterable detail, failed-item review and retry/reconcile confirmation.

**Flow:** Show queued/running/succeeded/partial/failed/unknown with timestamps; open the item that needs action rather than generic toast.

**Acceptance:** Unknown provider outcome requires reconciliation before retry; counts reconcile with items; actor permissions gate cancel/retry.

**QA:** Interrupt a payment/message job after provider acceptance and verify Unknown plus reconcile action prevents blind resend.

**Current source surface IDs:** R041.

### SKO-388 — [014] Draft recovery, consistent navigation and accessibility

**Screens/dialogs:** Dirty-form guard, local draft recovery, route back action and accessible dialogs.

**Flow:** Save recoverable drafts by user+tenant+record; returning to a workflow restores location and offers explicit restore/discard.

**Acceptance:** Never restore one user's draft to another; browser Back and modal close use the same guard; offline drafts do not masquerade as saved records.

**QA:** Edit marks, change exam, cancel guard, reload and restore; switch account and ensure old draft inaccessible; keyboard/RTL focus returns correctly.

**Current source surface IDs:** O013, O017, O038, O044, O049, O133, O134, O146, O148, O159, O213, O216, O217, O218, O219, N080.

### SKO-389 — [015] Safe deletion, archival and restore

**Screens/dialogs:** Archive preview, dependency impact, restore list and irreversible deletion confirmation.

**Flow:** Prefer reversible archive; list affected enrollments, invoices and access; offer restore with audit explanation.

**Acceptance:** Required historical references survive; restore validates conflicts; bulk operation reports individual outcomes.

**QA:** Archive an enrolled student with paid invoice, verify historical report still renders, then restore amid a roll-number conflict.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-390 — [016] Audited support access and service operations

**Screens/dialogs:** Support request, scope/time approval, active-session banner and action review.

**Flow:** School approves purpose, scope and expiry; operator sees explicit support mode and previews sensitive actions.

**Acceptance:** Expired grant closes access; every sensitive action records actor and school approver; support never silently impersonates user.

**QA:** Approve read-only support for one campus, attempt write/other campus access, expire session and verify both denied and auditable.

**Current source surface IDs:** R048, V069, V072, V077, O005, O029, O034, O037, O163, N012.

### SKO-391 — [017] Separate standalone and school-group onboarding with resumable setup

**Screens/dialogs:** School-versus-group start screen, onboarding stepper, draft recovery and launch summary.

**Flow:** Ask school/group intent once; derive minimum next steps; defer optional setup; show readiness checklist with why each prerequisite matters.

**Acceptance:** Changing school shape previews affected campuses/pricing; completion is durable; no false-ready state when setup job failed.

**QA:** Begin a group, add two campuses, lose network at academic setup, return in another session and complete without duplicate campuses.

**Current source surface IDs:** R047, O018.

### SKO-392 — [018] Language, RTL, timezone, calendar and currency packages

**Screens/dialogs:** Personal language, school locale, campus calendar/timezone and currency display preferences.

**Flow:** Preview exact dates, amounts, week start and language before save; separate display preference from transaction currency.

**Acceptance:** Timezone/day boundaries are stored and displayed correctly; bidi handles email/IDs; translation gaps disclose fallback language.

**QA:** Compare an exam across Asia/Karachi and America/New_York DST change; AR/UR RTL at 320px; show JPY/KWD precision without changing balance.

**Current source surface IDs:** R060.

### SKO-393 — [019] Configurable curriculum, grading and term structures

**Screens/dialogs:** Curriculum model list/editor, term and grade-scale preview, controlled apply dialog.

**Flow:** Start with configurable school-approved models; preview term dates, grade rules and weighting on sample students before apply.

**Acceptance:** Reject overlapping bands/terms and invalid totals; version effective dates; historical grades remain linked to original rules.

**QA:** Use IB-style criterion scale, numeric percentage and letter scale fixtures; edit a historical scale and verify issued report unchanged.

**Current source surface IDs:** V019, V022, V030, V031, V045, V047, V048, V050, AI08, O040, O060, O193, N036, N037, N038, N039.

### SKO-394 — [020] Permanent student identity and enrollment history

**Screens/dialogs:** Permanent pupil page, enrollment timeline, current profile drawer and consolidation review.

**Flow:** Separate person identity from campus/year enrollment; show current placement first with historical tabs and traceable source records.

**Acceptance:** Transfer does not create a new person; consolidation previews conflicts and preserves references; same-name students stay distinct.

**QA:** Move a pupil across campus/year then compare attendance, invoices and reports; consolidate verified duplicate and reject conflicting unverified IDs.

**Current source surface IDs:** R039, R057, R081, V006, V008, V038, V040, O001, O002, O024, O026, O048, O156, O158, O160, O165, O166, O167, O177, O178, O179, O195, N008, N009, N075.

### SKO-395 — [021] Multiple guardians and granular access/consent

**Screens/dialogs:** Guardian access list, link/invite editor, per-child permission matrix and revoke dialog.

**Flow:** Show relationship and which child/data/actions the guardian can access; explain consent separately from account access.

**Acceptance:** Separated guardians can have different permissions; revoked access affects attachments and sessions; restricted contact info remains hidden.

**QA:** Link two guardians with different fee/results permissions, revoke one while PDF open and verify new downloads and API calls are denied.

**Current source surface IDs:** R032, R055, O050.

### SKO-396 — [022] Reversible imports and clear validation

**Screens/dialogs:** Import upload, column mapping, validation grid, dry-run impact, commit receipt and rollback.

**Flow:** Show sample values and recoverable row errors; download error rows; preview creates/updates/skips before confirmation.

**Acceptance:** Malformed files and duplicate IDs never silently overwrite; rollback explains committed downstream dependencies; retries do not duplicate.

**QA:** Import mixed valid/invalid bilingual roster, correct rejected rows, retry same file, then roll back a batch with new attendance dependencies.

**Current source surface IDs:** O004, O015, O028.

### SKO-397 — [023] Guided school setup and import reconciliation

**Screens/dialogs:** Readiness dashboard, source intake/reconciliation workbench and setup-task queue.

**Flow:** Turn school documents into proposed records with source citations; reviewer confirms ambiguous rows and resolves prerequisites.

**Acceptance:** No silent student/class creation from OCR; ready count reflects accepted records; unresolved differences have owners.

**QA:** Upload conflicting rosters and schedule, inspect cited conflicts, approve a subset, resume later and verify only approved records created.

**Current source surface IDs:** V029, V046, AI02, AI13, O138, N058, N059.

### SKO-398 — [024] Configurable admission forms and enquiry pipeline

**Screens/dialogs:** Admission enquiry board, follow-up detail, configurable application and convert-to-student review.

**Flow:** Track next contact/date; progressively ask required identity/contact fields; keep country/school-required fields configurable.

**Acceptance:** Conversion is idempotent and preserves enquiry history; duplicate person match requires confirmation; inaccessible optional fields do not block.

**QA:** Convert an enquiry twice, use same-name sibling, enter international phone/address and verify correct identity and country validation.

**Current source surface IDs:** V007, V039, O168, O169, O170, O171.

### SKO-399 — [025] Staff hierarchy, workload and absence cover

**Screens/dialogs:** Staff directory, hierarchy/chart/list, position editor, workload and absence-cover queue.

**Flow:** Show responsibilities and current teaching load; offer accessible list equivalent to chart; preview hierarchy changes before save.

**Acceptance:** Prevent reporting cycles and invalid campus assignment; retiring ranks preserves historical staff records; confidential fields hidden.

**QA:** Move a teacher between units, attempt circular manager assignment and cover an absent period without double booking.

**Current source surface IDs:** R038, R077, V004, V005, V010, V036, V037, V042, V088, V092, V099, T027, T028, T029, O003, O027, O042, O043, O161, O172, O173, O182, O183, O184, O185, O186, O187, O188, N068.

### SKO-400 — [026] Learning resource and document library

**Screens/dialogs:** Library of sources/resources, upload/phone scan, preview, permissions and version history.

**Flow:** Choose subject/year before intake; show OCR extraction next to source; make search and provenance visible.

**Acceptance:** Unsupported or unreadable pages require correction; permission changes affect download URLs; source replacement keeps cited version.

**QA:** Upload rotated bilingual PDF and duplicate file; verify legible preview/citations, denied cross-campus access and versioned replacement.

**Current source surface IDs:** R088, AI06, O139.

### SKO-401 — [027] Global search and reliable directory filters

**Screens/dialogs:** Global search, people directory filters, saved views and empty-result recovery.

**Flow:** Search names, IDs and tasks within current scope; show active filter chips and exact result count; one-click clear.

**Acceptance:** On-roll and classes-with-students filters change results, not labels only; pagination/search state survives Back; no data leakage in suggestions.

**QA:** Apply two known filters to seeded students, navigate pages and Back, search identical names in another campus and verify scoped results.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-402 — [028] School and campus lifecycle editing

**Screens/dialogs:** School/campus list and detail, identity editor, capacity context and archive review.

**Flow:** Edit existing school/campus in context; preview name/logo/contact changes; show inherited versus local configuration.

**Acceptance:** International email/phone validation; changing timezone previews scheduled effects; existing campuses remain editable at plan limit.

**QA:** Create then edit campus with long Arabic name and overseas phone; hit plan limit and verify edit stays allowed but additional creation blocked.

**Current source surface IDs:** R037, R071, V032, V064, V067, V070, T033, T034, T035, O019, O022, O032, O033, O035, O036, O130, O143, O144, O145, O147, O150, N013.

### SKO-403 — [029] Teaching timetable conflicts and publication

**Screens/dialogs:** Timetable class/teacher/room modes, slot editor, conflict drawer and publication review.

**Flow:** Drag or keyboard-edit slots; explain teacher/room/class conflicts at edit time; preview affected people before publish.

**Acceptance:** Published and draft schedules separate; no silent collision; holidays/weekends and campus timezone respected.

**QA:** Book same teacher in two rooms, revise a period length, preview conflicts and publish only validated version; parent sees latest published schedule.

**Current source surface IDs:** R054, R066, R067, R074, R083, V015, V017, V018, V052, V054, V055, AI09, T030, T031, T032, O051, O175, O199, O200, O201, O202, O203, O204, O205, O206, O207, O208, O209, O210, O211, N015, N016, N060, N061, N078, N079.

### SKO-405 — [030] Attendance accuracy and exception handling

**Screens/dialogs:** Attendance roster, quick marking, exception review and monthly history.

**Flow:** Default to unmarked; offer explicit mark-all-present plus exception pass; show saved count and timestamps; explain lateness separately.

**Acceptance:** Never infer absence from missing submission; prevent duplicate day/student entries; corrections retain actor/reason.

**QA:** Mark 35 students, disconnect at save, reconnect and retry; verify no duplicate records and unmarked students do not trigger absence alerts.

**Current source surface IDs:** R050, R061, R073, V012, V044.

### SKO-404 — [031] Year-end rollover and promotion review

**Screens/dialogs:** Year-end readiness, promotion preview, exceptions and archive/restore receipt.

**Flow:** Choose source year and target classes, review retained/withdrawn/promoted students and balances before bulk commit.

**Acceptance:** Closed years remain readable; transfers preserve identity; missing target class or unresolved exam blocks relevant items.

**QA:** Promote mixed cohort with retained/withdrawn pupils and unpaid balance; retry partial job and verify exactly one target enrollment each.

**Current source surface IDs:** V009, V041, O063, O075, O076.

### SKO-406 — [032] Curriculum and learning objective map

**Screens/dialogs:** Curriculum objective map, coverage view and source-linked objective editor.

**Flow:** Map imported syllabus to approved learning objectives; show taught/assessed/mastered as separate evidence-backed statuses.

**Acceptance:** AI mappings remain proposals; unsupported objectives flagged; version changes surface affected assessments.

**QA:** Map an ambiguous standard, reject AI suggestion, revise syllabus version and verify only affected question mappings require review.

**Current source surface IDs:** AI07, N043.

### SKO-407 — [033] Reviewed question bank and assessment blueprints

**Screens/dialogs:** Question bank, blueprint builder, item editor and approval comparison.

**Flow:** Filter by curriculum/objective/language; construct coverage/difficulty blueprint before generation; review answer key and source per item.

**Acceptance:** Avoid duplicate/retired items; item revision invalidates dependent approval; accessibility and language reviewed separately.

**QA:** Assemble two equivalent variants, edit answer key after approval, verify paper re-review; detect duplicated question and missing citation.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-408 — [034] AI Exam Studio: flagship assessment, secure delivery and learning recovery

**Screens/dialogs:** Exam Studio dashboard, evidence tray, blueprint/review canvas, delivery choice, control room and learning-recovery board.

**Flow:** Guide evidence → blueprint → reviewed paper → accessible delivery → moderated marks → targeted recovery → reassessment receipt.

**Acceptance:** Each stage shows prerequisites and next action; live attempt cannot be interrupted by decoration; AI never silently publishes grades or messages.

**QA:** Run bilingual class assessment online and on paper, reconnect a student, review uncertain marking, assign a targeted intervention and compare reassessment evidence.

**Current source surface IDs:** R086, R089, AI01, AI14, T024, T025, T026, O008, O053, O054, O055, O056, O057, O058, O059, O140, O154, O155, N018, N042, N047, N053, N054.

### SKO-409 — [035] Assignments, submissions and rubrics

**Screens/dialogs:** Assignment list, task composer, student submission and rubric feedback review.

**Flow:** Provide one submission checklist with due time, accepted formats and rubric; preserve attachment progress; return actionable feedback.

**Acceptance:** Late/extension states explicit; replacing submitted file records version; student sees only released rubric feedback.

**QA:** Submit from phone on weak network, replace file before cutoff, request extension and release reviewed feedback without exposing other pupils.

**Current source surface IDs:** R062.

### SKO-410 — [036] Assessment accommodations and accessible materials

**Screens/dialogs:** Accommodation profile, assessment-specific approval and student preflight.

**Flow:** Apply approved extra time, breaks, font/layout and assistive technology settings before start; show student a plain-language summary.

**Acceptance:** Adjustment is per learner/assessment with limited disclosure; no diagnostic label in roster; timer and paper export use same approved policy.

**QA:** Give extra time and screen-reader mode to one pupil; resume attempt after break and verify timer, accessible paper and privacy.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-411 — [037] Focused exam session with autosave and recovery

**Screens/dialogs:** Exam readiness, active question view, reconnect/recovery sheet, submit review and receipt.

**Flow:** Use distraction-free single task; show last server save and local pending changes; allow review flagged questions before submit.

**Acceptance:** Server authority controls timing; retry cannot create duplicate attempt; uncertainty is visible; receipt proves acknowledged submission.

**QA:** Lose connection during answer, refresh and reopen on second device; reconcile conflict, submit once and match receipt answers/timing.

**Current source surface IDs:** R087, O135, O136.

### SKO-413 — [038] Exam scheduling, room capacity and invigilation

**Screens/dialogs:** Exam session wizard, datesheet, room allocation, invigilator assignment and live duty desk.

**Flow:** Schedule all papers with conflict explanations; show seat capacity and access accommodations before assigning; publish reviewed duty plan.

**Acceptance:** Avoid student/teacher/room overlap; effective capacity accounts for spacing; changed published date alerts relevant people through approved delivery.

**QA:** Schedule two papers sharing cohort and invigilator, reduce room capacity, resolve conflicts and compare print datesheet with student timezone view.

**Current source surface IDs:** R082, V016, V021, V049, V053, AI11, T019, T020, T021, T022, T023, O052, O061, O062, O065, O066, O067, O068, O069, O070, O071, O072, O073, O074, O137, N019, N044, N045, N046.

### SKO-412 — [039] Paper marks scan with teacher-approved import

**Screens/dialogs:** Scan batch intake, identity matching, page order, OCR uncertainty review and gradebook import preview.

**Flow:** Pair script with verified candidate ID; review low-confidence marks beside scan; show before/after gradebook diff and explicit approval.

**Acceptance:** No auto-import uncertain identity/marks; duplicate scan/page detected; re-scan keeps provenance; published grade corrections use approval workflow.

**QA:** Upload out-of-order pages with wrong QR and overwritten score; resolve student, review uncertain number and retry import without duplicate marks.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-414 — [040] Lesson plans and differentiated activity groups

**Screens/dialogs:** Lesson preparation canvas, source/objective picker, activity groups and share review.

**Flow:** Generate practical lesson draft tied to taught objectives; allow teacher to adjust duration/materials and groups before save.

**Acceptance:** Sensitive student labels never exposed to group; resource claims cite available sources; teacher approves differentiated activities.

**QA:** Plan mixed-attainment bilingual lesson with unavailable materials, edit groups and verify private rationale not shown on student handout.

**Current source surface IDs:** N052.

### SKO-415 — [041] Messaging and attachment reliability

**Screens/dialogs:** Conversation list, message thread, attachment composer, policy settings and delivery detail.

**Flow:** Make attachment uploading/retry/remove explicit; retain draft and thread position; distinguish sent/delivered/read by channel capability.

**Acceptance:** No lost typed text on reconnect; unauthorized recipients/files blocked; deletion/edit policy clear; uncertain send avoids blind duplicate.

**QA:** Attach phone photo and PDF, fail one upload, retry it, switch dock/full-page and verify same draft and a single delivered message.

**Current source surface IDs:** R044, O016, O089, O141.

### SKO-416 — [042] Actionable notification center

**Screens/dialogs:** Notification inbox, grouped task detail, preference controls and mark-read actions.

**Flow:** Group events by actionable task; open exact record and show resolved status; distinguish read from completed.

**Acceptance:** Quiet hours respect recipient timezone; no sensitive lock-screen preview; stale links have safe recovery; acting resolves related event.

**QA:** Receive duplicate grade alerts, complete task in another browser, reopen notification and verify resolved state without duplicate action.

**Current source surface IDs:** R030, V059, AI10, O129, O131, N040, N041.

### SKO-417 — [043] Principal action queue

**Screens/dialogs:** Principal Today action queue, evidence side panel, assign/snooze/resolve controls.

**Flow:** Prioritize exceptions with due date, owner, evidence and one next action; show reason for ranking and let principal override.

**Acceptance:** AI risk is a review cue, not a label; acknowledgement is not resolution; queues scoped to campus.

**QA:** Surface absent class submission and unreviewed marks; assign different staff, resolve evidence, verify queue clears only after underlying task completes.

**Current source surface IDs:** R056, V033, O031.

### SKO-418 — [044] Student Today page

**Screens/dialogs:** Student Today, weekly plan, next lesson, due work and exam entry.

**Flow:** Show now/next and a maximum of three priorities; one-tap continue saved work; localize dates and explain blocked prerequisites.

**Acceptance:** No teacher-only data; due work respects extension; no competitive risk score; empty day offers optional practice.

**QA:** Use student with two overdue tasks, extension and scheduled exam; verify ordering, correct timezone and attempt resume link.

**Current source surface IDs:** R064.

### SKO-419 — [045] Family action inbox across siblings

**Screens/dialogs:** Family action inbox across children, child switcher, fee/result/action details.

**Flow:** Merge siblings into one prioritized inbox with clear child chips; separate pay, consent, read and discuss actions.

**Acceptance:** Actions always display child/campus; permissions can differ per sibling; completed work does not reappear as unread task.

**QA:** Switch between siblings in different campuses/currencies, consent for one, pay another and verify no cross-child action or information leak.

**Current source surface IDs:** R052.

### SKO-421 — [046] Absence explanation, leave and trip consent

**Screens/dialogs:** Absence explanation, leave request, trip consent detail and acknowledgement receipt.

**Flow:** Pre-fill affected child/date; show policy, required documents and decision status; parent can view submitted version.

**Acceptance:** No medical detail in general notifications; cutoff/revocation rules explicit; required guardian authority enforced.

**QA:** Submit overlapping leave, edit after review, attempt expired consent and verify school acknowledgement plus restricted attachments.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-423 — [047] Weekly family digest and short home practice

**Screens/dialogs:** Weekly family digest preview, teacher review, channel choice and home-practice card.

**Flow:** Summarize evidence, celebrate specific progress and propose one small activity; include child-specific source and translation review.

**Acceptance:** No invented performance statements; avoid deficit labels; opt-out and quiet hours respected; sibling boundaries retained.

**QA:** Generate digest with missing marks and conflicting attendance, ensure abstention; approve translation and compare delivered content to versioned preview.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-420 — [048] Parent-teacher meeting booking and follow-up

**Screens/dialogs:** Teacher availability, parent slot picker, meeting confirmation and follow-up notes.

**Flow:** Show guardian timezone and campus time; choose interpreter/online option if configured; capture agreed action after meeting.

**Acceptance:** Prevent double booking; shared/private notes separate; cancellation/reschedule informs both through tracked delivery.

**QA:** Two guardians book final slot concurrently, cross DST boundary, reschedule and verify one reservation and correct calendar times.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-422 — [049] Question-level misconception and item review

**Screens/dialogs:** Item analysis, misconception evidence drawer and question-quality review.

**Flow:** Separate low score from plausible misconception; show student response evidence, sample size and uncertainty; teacher validates interpretation.

**Acceptance:** Small cohorts not overgeneralized; defective question flags precede learner conclusions; no unsupported causal claims.

**QA:** Use wrong answer key and ambiguous item fixtures, verify review marks item unreliable before suggesting remediation.

**Current source surface IDs:** R027, R076.

### SKO-424 — [050] Marking moderation and regrade workflow

**Screens/dialogs:** Anonymous moderation queue, rubric comparison, disagreement resolution and regrade request.

**Flow:** Show evidence side by side; record original, AI suggestion and final human mark; route disputed cases to authorized reviewer.

**Acceptance:** Reviewer separation where policy requires; published change uses correction trail; moderation thresholds transparent.

**QA:** Two markers disagree, regrade after publication and verify stable original evidence, approved final score and revised family-visible report.

**Current source surface IDs:** R033, R078, O012, O039, O041, O045, O046, O192, O194.

### SKO-425 — [051] Intervention ownership and reassessment

**Screens/dialogs:** Intervention board, learner evidence, owner/date/action editor and reassessment review.

**Flow:** Assign a small specific action linked to an objective and measured reassessment; record delivery and outcome separately.

**Acceptance:** No automated punitive action; overdue task has owner; improvement claim uses comparable assessment and minimum evidence.

**QA:** Assign misconception practice to five pupils, record attendance/delivery, reassess and distinguish no participation from no improvement.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-426 — [052] Practice with hints and spaced review

**Screens/dialogs:** Practice session, progressive hint ladder, spaced review queue and reflection.

**Flow:** Start short curriculum-grounded practice; hints teach next step before revealing answer; adapt schedule from reviewed evidence.

**Acceptance:** Practice scores do not overwrite grades; accessible alternatives; pauses retain progress; avoid manipulative streak pressure.

**QA:** Answer wrongly twice, request hints, resume next day and verify review timing and no gradebook mutation.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-427 — [053] Feedback and improvement portfolio

**Screens/dialogs:** Learner portfolio, evidence upload/reflection, teacher feedback and share controls.

**Flow:** Collect selected work and revision evidence; let learner explain progress; show original and improved version.

**Acceptance:** Audience explicit per artifact; revoked shares expire; feedback not exposed before release; safe handling of personal data.

**QA:** Upload evidence, request feedback, share with one guardian, revoke and verify old link no longer opens.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-428 — [054] Source-grounded student study assistant

**Screens/dialogs:** Student study assistant, source picker, cited answer and hint mode.

**Flow:** Answer from authorized learning materials with page references; ask clarifying questions when unclear; help reasoning before final answer.

**Acceptance:** Active assessment answers withheld by policy; unsupported response says so; age-appropriate safety and teacher escalation.

**QA:** Ask an unsupported fact and live exam question, inject instructions in source, verify abstention/cited hints and no other-class material.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-429 — [055] School policy assistant with cited answers

**Screens/dialogs:** School policy assistant, document/version citation and escalate-to-staff action.

**Flow:** Answer operational questions from current approved policy; show exact source/version and responsible office when uncertain.

**Acceptance:** Superseded policy marked; restricted policy not disclosed; no guessed medical/legal decision.

**QA:** Ask policy question spanning two contradictory versions and a restricted safeguarding file; surface conflict/escalation without leaking content.

**Current source surface IDs:** AI16.

### SKO-430 — [056] Pilot adoption and value measurement

**Screens/dialogs:** Pilot value dashboard, baseline capture, outcome definitions and evidence export.

**Flow:** Record baseline before AI use; report time saved, assessment reliability, adoption and recovery completion with sample/context.

**Acceptance:** Measured versus self-reported values labeled; no funding/learning guarantee; denominators and exclusions visible.

**QA:** Compare a teacher timing sample with event telemetry, remove incomplete session and verify metric denominator updates reproducibly.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-431 — [057] Secure fee statements, installments and receipts

**Screens/dialogs:** Fee statement, installment schedule, payment launch, pending return and receipt detail.

**Flow:** Show exact child, currency, due amount and installment breakdown; return to verifiable payment status; download numbered receipt.

**Acceptance:** Partial, overdue, pending and paid are distinct; no conversion of ledger currency; receipt tied to verified transaction.

**QA:** Pay partial installment, revisit provider return before webhook, verify pending then one receipt and correct remaining balance.

**Current source surface IDs:** R024, R031, R051, R059, R063, V014, V051, V066, V080, V081, V082, V083, V085, AI12, T001, T002, T003, T004, T005, T007, T008, T009, T010, T011, T012, O084, O085, O086, O101, O102, O103, O104, O105, O106, O107, O108, O109, O110, O111, O112, O113, O114, O115, O116, O117, O118, O119, O120, O121, O126, O127, O128, N024, N028, N029, N030, N048, N049.

### SKO-432 — [058] Payment reconciliation and duplicate prevention

**Screens/dialogs:** Reconciliation workbench, bank import, possible-match review and duplicate warning.

**Flow:** Match provider/bank entries to invoices with evidence; preview uncertain matches and require explicit resolution.

**Acceptance:** One external transaction cannot settle twice; manual matches recorded; unknown outcomes cannot be blindly retried.

**QA:** Import same bank row twice, receive duplicate webhook and race manual allocation; verify exactly one balance change and explain conflict.

**Current source surface IDs:** V076, V084, O122, O123, O124, O125, N031.

### SKO-433 — [059] Refunds, credit notes, waivers and approval separation

**Screens/dialogs:** Refund/credit/waiver request, impact preview, independent approval and provider result.

**Flow:** Choose adjustment type/reason, preview invoice/ledger/family statement, approve separately, then reconcile execution.

**Acceptance:** Cannot refund beyond settled amount; unknown provider result blocks resend; credit note and cash refund distinguished.

**QA:** Request refund greater than paid, approve allowed partial amount, interrupt callback and reconcile without duplicate refund.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-434 — [060] Payroll provider interfaces and local rules

**Screens/dialogs:** Payroll run, exception review, provider export/import and payslip visibility.

**Flow:** Review period/staff changes and local rule package; resolve missing bank/tax inputs before approved export.

**Acceptance:** Do not imply universal payroll compliance; effective local package disclosed; sensitive amounts scoped; locked run corrections traceable.

**QA:** Run cross-country staff fixtures, reject unsupported tax package, import provider failure and verify selective retry and private payslips.

**Current source surface IDs:** V087.

### SKO-435 — [061] Inventory, purchasing, budgets and asset maintenance

**Screens/dialogs:** Inventory overview, purchase request, supplier/order, stock transaction and maintenance queue.

**Flow:** Start from low stock or maintenance need; show approval and budget impact; receive items against order with discrepancy review.

**Acceptance:** No negative stock by race; unit/currency conversion explicit; asset history retained; disposal approval visible.

**QA:** Two staff issue final item concurrently, receive partial order in another currency and verify discrepancy and audit trail.

**Current source surface IDs:** V027, V063, V091, T044, T045, T046, T047, T048, N032, N033, N034, N035.

### SKO-436 — [062] Library catalogue, issue/return, reservations and fine policy

**Screens/dialogs:** Library catalogue, member lookup, issue/return, reservation queue and fine review.

**Flow:** Scan/search book and borrower, show availability/loan policy, confirm issue; on return offer next reservation.

**Acceptance:** Duplicate barcode and concurrent loan prevented; fines have configured policy/version; lost/returned states separate.

**QA:** Issue last copy to two borrowers concurrently, return late, apply approved waiver and notify only next eligible reservation.

**Current source surface IDs:** R042, V028, V062, V090, T040, T041, T042, T043.

### SKO-437 — [063] Transport routes, fleet, rider assignments and safe handover records

**Screens/dialogs:** Transport routes/vehicles, rider assignment, boarding and handover log.

**Flow:** Show planned versus boarded riders and route changes; reconcile missing handover with named staff action.

**Acceptance:** No live tracking claim without integration; authorized rider/guardian scope; offline events preserve time and reconcile conflicts.

**QA:** Record boarding offline, switch bus with approval, reconnect and reject duplicate event; unresolved missing handover remains prominent.

**Current source surface IDs:** V025, V060, T036, T037.

### SKO-438 — [064] Authorized QR pickup

**Screens/dialogs:** Pickup authorization, time-bound QR, staff scanner and exception verification.

**Flow:** Guardian grants a named collector for date/window; staff sees minimum identity match and records handover.

**Acceptance:** QR is single-use and scoped; expired/revoked collector denied; offline fallback explicitly supervised, no silent acceptance.

**QA:** Screenshot/reuse QR, revoke before scan, scan at wrong campus and verify fail-safe denial plus supervised exception audit.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-439 — [065] Restricted clinic and safeguarding workflows

**Screens/dialogs:** Restricted clinic/safeguarding intake, confidential case queue and escalation receipt.

**Flow:** Separate urgent care from confidential safeguarding; show locally configured escalation path and limited need-to-know access.

**Acceptance:** No AI diagnosis or automated allegation; general staff see only necessary accommodation; audit every sensitive access.

**QA:** Attempt clinic record from ordinary teacher role, escalate synthetic urgent case and verify restricted notes absent from family/general notifications.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-441 — [066] Facilities requests and internal service desk

**Screens/dialogs:** Facilities request form, triage board, work-order detail and closure confirmation.

**Flow:** Capture location/photo/urgency quickly; assign accountable person; requester confirms work completed.

**Acceptance:** Safety-critical report routes to real escalation contact; no fabricated SLA; attachment scope retained.

**QA:** Submit inaccessible-room issue with photo, reassign contractor, fail attachment upload and close only with verified completion evidence.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-440 — [067] Clubs, sports, trips and participation

**Screens/dialogs:** Activity/trip catalogue, signup/waitlist, consent/payment checklist and attendance.

**Flow:** Show eligibility, capacity, total cost and consent requirements before signup; unify trip departure checklist.

**Acceptance:** Avoid overbooking; medical detail restricted; cancellation/refund rules shown; required consent cannot be bypassed.

**QA:** Two students take final place concurrently, guardian withdraws consent and verify roster and refund workflow update correctly.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-442 — [068] Substitute teacher and missed-lesson recovery

**Screens/dialogs:** Absence-cover queue, suggested substitutes, workload/conflict preview and missed-lesson plan.

**Flow:** Prioritize uncovered lessons; show candidate availability and qualifications; confirm assignment then recover missed objective.

**Acceptance:** AI recommendation cannot override conflict/approval; notify only confirmed substitute; missed lesson remains until rescheduled/completed.

**QA:** Teacher calls absent after timetable publication, chosen substitute becomes unavailable, reassign and verify one current duty and recovery plan.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-443 — [069] School-group policy templates with controlled local overrides

**Screens/dialogs:** School-group template library, campus difference view and override approval.

**Flow:** Compare inherited policy with local changes; approve exception with reason/expiry; preview rollout impact.

**Acceptance:** Do not overwrite lawful local variation; version/ownership explicit; failed campus rollout remains visible.

**QA:** Publish grading template to two campuses with one approved exception; revise group template and verify protected override and conflict review.

**Current source surface IDs:** V068.

### SKO-444 — [070] Country-specific tax and invoice packages

**Screens/dialogs:** Country package selector, invoice preview, tax configuration and effective-date review.

**Flow:** Show supported legal entity/country package and configured requirements; preview invoice before issue; block unsupported certified claims.

**Acceptance:** Immutable issued document identifiers; effective tax version; no assumption one provider supports every country.

**QA:** Issue test invoices under two configured packages, change tax date and verify historical invoice stable and unsupported jurisdiction blocked.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-445 — [071] Versioned APIs, webhooks and integration monitoring

**Screens/dialogs:** Integration catalogue, credential scope, webhook delivery and replay detail.

**Flow:** Show connection owner, allowed data, sync status and actionable failure; preview replay impact.

**Acceptance:** Secrets masked; versioned contract and idempotent replay; revoked credentials stop immediately.

**QA:** Rotate key during failed sync, replay same event, verify no duplicate records and revoked key rejected.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-446 — [072] School identity integration and roster exchange

**Screens/dialogs:** Identity connection wizard, roster dry-run, external-ID match and conflict resolution.

**Flow:** Connect school IdP/SIS, preview imported roster changes and access consequences, approve scoped sync.

**Acceptance:** Do not match users solely on name; protected local fields survive; deprovisioning preview explicit.

**QA:** Import identical names with different external IDs, remove staff upstream and review revoked access without deleting historical records.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-447 — [073] Regional hosting and data lifecycle controls

**Screens/dialogs:** Hosting/data settings, residency disclosure, export/deletion request and retention review.

**Flow:** Show actual configured processing/storage locations and subprocessors; explain retention by record category; track request state.

**Acceptance:** No universal compliance badge; tenant migration needs validated plan; legal holds distinct from ordinary deletion.

**QA:** Export synthetic learner, apply retention policy with a hold, verify deletion receipt and actual storage/provider route match disclosed region.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-448 — [074] Low-bandwidth operation and conflict-aware offline capture

**Screens/dialogs:** Offline queue badge, saved-on-device state, conflict comparison and sync receipt.

**Flow:** Allow only supported offline actions; show pending counts and last server acknowledgement; resolve conflicting field changes.

**Acceptance:** No false success; local cache scoped/expired; critical financial/exam authority server-driven.

**QA:** Take attendance offline, change same record online, reconnect and explicitly resolve; clear shared device session and verify cache isolation.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-449 — [075] Safe Exam Browser integration

**Screens/dialogs:** Exam browser requirement, device check, configuration download and launch receipt.

**Flow:** Explain supported environment and fallback policy before exam day; test setup without consuming attempt time.

**Acceptance:** Browser restriction is not proof of cheating prevention; no automated misconduct verdict; accommodations preserved.

**QA:** Use unsupported device, tamper configuration and relaunch with accommodation; verify clear block/fallback and no lost exam time.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-450 — [076] Improvement and accreditation evidence workspace

**Screens/dialogs:** Accreditation evidence workspace, requirement map, reviewer request and export package.

**Flow:** Link dated evidence to standards, owners and review dates; show missing/stale evidence; retain reviewer feedback.

**Acceptance:** Evidence quality separate from checklist completion; exported material respects student permissions; no accreditation guarantee.

**QA:** Map same document to two requirements, expire it, export redacted review package and verify both show stale evidence.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-451 — [077] Peak-load performance and tenant fairness

**Screens/dialogs:** Operations capacity dashboard, load-test receipt and tenant fairness diagnostics.

**Flow:** Show user-visible service status and evidence at expected exam concurrency; prioritize active assessment saves fairly.

**Acceptance:** No unverified scalability claim; per-tenant quotas prevent noisy neighbor; recovery objectives linked to test evidence.

**QA:** Run two synthetic tenants with one flooding generation during concurrent exams; measure save latency, errors and fairness against declared budgets.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-452 — [078] LEAP demo, case studies and launch readiness

**Screens/dialogs:** Demo scenario launcher, synthetic school reset, proof drawer and investor evidence room.

**Flow:** Tell one verified school outcome story end to end; show evidence behind every claim; recover live demo interruption gracefully.

**Acceptance:** No production child data; shipped versus prototype obvious; funding target is aspiration; evidence dates/sample sizes visible.

**QA:** Rehearse 8-minute exam-to-recovery story, disconnect mid-demo, recover with truthful status and verify all claimed metrics have source receipts.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-453 — [079] Capacity and staffing scenario planning

**Screens/dialogs:** Scenario planner, baseline assumptions, editable constraints and comparison.

**Flow:** Explore enrollment/staff/room changes with transparent assumptions and cost ranges; save scenario without operational writes.

**Acceptance:** Simulation not a schedule or forecast guarantee; no automatic staff termination; reveal sensitivity and data gaps.

**QA:** Compare two staffing options, remove cost input and verify unknown range instead of invented saving; apply requires separate reviewed workflow.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-454 — [080] Teacher question-quality review network

**Screens/dialogs:** Question review network, submission anonymization, reviewer rubric and licensing detail.

**Flow:** Share opted-in de-identified items with provenance/license; peer review improves quality before school adopts revision.

**Acceptance:** Student answers/private curriculum excluded without authority; reviewer conflict and rights documented; local version stable until accepted.

**QA:** Submit item containing learner name, verify redaction/block; reject license mismatch and adopt reviewed revision without overwriting active paper.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-455 — [081] Careers, counseling and alumni pathways

**Screens/dialogs:** Counseling/career pathway, appointment/referral, alumni consent and opportunity detail.

**Flow:** Support student exploration with sourced options and counselor review; let alumni control sharing/mentoring participation.

**Acceptance:** No deterministic career ranking or sensitive trait inference; counseling notes private; opportunities dated/verified.

**QA:** Ask for unsupported admission probability, verify uncertainty and counselor referral; revoke alumni consent and remove contact access.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-456 — [082] Optional canteen, boarding and specialist school packages

**Screens/dialogs:** Optional-package catalogue, eligibility preview, activation checklist and disable review.

**Flow:** Offer canteen/boarding/specialist modules only when school needs them; preview added navigation, data and costs.

**Acceptance:** Disabled modules do not clutter core tasks; package requirements/configuration explicit; historic records retained on disable.

**QA:** Activate boarding for one campus, check irrelevant campuses unchanged, disable with occupied rooms and verify safe impact review.

**Current source surface IDs:** No dedicated UI surface mapped; proposed contract.

### SKO-457 — [083] Sign-in, sign-up, verification and password recovery journeys

**Screens/dialogs:** Login, registration, verification, password reset, invitation acceptance and expired-session recovery.

**Flow:** Keep one clear task per screen; reveal field errors near input and summary; preserve safe intended destination after login/MFA.

**Acceptance:** No identity enumeration in recovery; expired/reused token guidance actionable; translated error messages remain visible at mobile keyboard height.

**QA:** Use expired invitation, missing password confirmation, incorrect MFA and malicious return URL; verify accessible errors and safe role home.

**Current source surface IDs:** R002, R003, R004, R006, R007, R008, R009, R010, N002.

### SKO-458 — [084] Teacher first-login onboarding and profile completion

**Screens/dialogs:** Teacher profile wizard, subject/specialty selection, draft resume and ready-to-teach summary.

**Flow:** Collect minimum profile once, prefill invitation context and show classes/subjects awaiting assignment; defer optional biography.

**Acceptance:** Teaches-all and specialties have clear semantics; international names/phones accepted; completion cannot fabricate assignments.

**QA:** Leave halfway through bilingual profile, return on phone, restore and finish; verify no assigned classes produces helpful next action.

**Current source surface IDs:** R084.

### SKO-460 — [085] Recoverable multilingual AI chat and multimodal assistant workflow

**Screens/dialogs:** AI conversation, source/voice/image intake, editable transcript, draft review and recovery history.

**Flow:** Start with an outcome request, confirm source and scope, convert conversational result into structured reviewable work; preserve thread/draft.

**Acceptance:** Uncertain transcription marked; attached documents treated as evidence not instructions; cost and pending work visible.

**QA:** Dictate mixed-language assessment request, correct transcript, fail upload then reconnect; verify same draft and no unauthorized run.

**Current source surface IDs:** R072, V013, V058.

### SKO-461 — [086] Teacher performance analytics and review workflow

**Screens/dialogs:** Teacher performance review, evidence drilldown, contextual response and development plan.

**Flow:** Show multiple measures with coverage and contextual notes; teacher can inspect and respond before formal review.

**Acceptance:** Avoid simplistic teacher ranking from learner scores; small samples and confounders disclosed; access tightly scoped.

**QA:** Review teacher with missing attendance/assessment data, verify no fabricated score; allow response and approved development action.

**Current source surface IDs:** V020, V056.

### SKO-462 — [087] Class, section, subject and teaching assignment administration

**Screens/dialogs:** Class/section directory, guided create, subject assignment, teacher conflict and detail drawer.

**Flow:** Create class in context of year/campus; reuse approved subjects; show roster and teacher implications before save.

**Acceptance:** Duplicate class/section/year rejected; teacher must belong to scope; no hard deletion of populated class.

**QA:** Create class with international naming, assign teacher from another campus, try duplicate and delete populated class; verify precise recovery.

**Current source surface IDs:** R029, R075, V003, V035, O010, O011, O025, O151, O152, O153, O157, O176, N065, N066, N074.

### SKO-463 — [088] Dormitory rooms, occupancy and student allocation operations

**Screens/dialogs:** Dormitory room types, room inventory, occupancy and allocation review.

**Flow:** Show capacity, current residents and availability; assign learner with effective dates and guardian-approved context where required.

**Acceptance:** No over-capacity or overlapping allocation; restricted welfare information excluded; move retains history.

**QA:** Two staff allocate last bed concurrently, transfer learner mid-term and verify one active bed plus preserved prior occupancy.

**Current source surface IDs:** V026, V061, T038, T039.

### SKO-466 — [089] Reception visitor register and check-in/check-out

**Screens/dialogs:** Visitor quick check-in, host verification, badge and checkout queue.

**Flow:** Capture minimum visitor purpose/host; show current onsite visitors prominently; make checkout one action.

**Acceptance:** Host/visitor privacy; duplicate check-in warning; emergency roster uses current status; refused visitor is not admitted.

**QA:** Check in duplicate name with distinct identity, confirm host, check out twice and verify accurate onsite count and audit.

**Current source surface IDs:** R058, V094.

### SKO-467 — [090] Complaint intake, assignment, status and resolution tracking

**Screens/dialogs:** Complaint intake, assigned queue, private case detail and resolution acknowledgement.

**Flow:** Acknowledge receipt, assign owner/due date, collect evidence and let requester see appropriate progress.

**Acceptance:** Anonymous/confidential handling explicit; restricted complaints not leaked to accused parties; close requires resolution reason.

**QA:** Submit confidential complaint, reassign, miss due date and resolve; verify requester receipt and role-limited evidence.

**Current source surface IDs:** V095.

### SKO-464 — [091] Inbound and outbound postal/courier register

**Screens/dialogs:** Postal/courier intake, dispatch detail and handover receipt.

**Flow:** Record inbound/outbound item, recipient, tracking reference and next handover; show uncollected items first.

**Acceptance:** Tracking number alone does not prove delivery; recipient privacy and signature/evidence rules explicit.

**QA:** Record same parcel twice, hand to wrong recipient then correct with audit; verify one open item and traceable final handover.

**Current source surface IDs:** V096.

### SKO-465 — [092] Reception phone-call log and follow-up queue

**Screens/dialogs:** Phone-call quick log, callback queue and outcome detail.

**Flow:** Capture caller intent and responsible staff with minimal fields; schedule callback in local timezone; mark outcome separately from attempt.

**Acceptance:** Sensitive call notes restricted; repeated callbacks linked; no auto call/message without explicit approved action.

**QA:** Log urgent callback spanning timezones, attempt unsuccessfully, reschedule and verify it remains open until outcome recorded.

**Current source surface IDs:** V097.

### SKO-469 — [093] Student certificates and identity-card generation

**Screens/dialogs:** Certificate/ID template, pupil selection, preview, approval and download receipt.

**Flow:** Preview exact legal name/year/photo in output; require authorized signatory; show version and issued serial.

**Acceptance:** Wrong pupil/photo cannot silently merge; revoked/reissued document traceable; RTL and long names readable.

**QA:** Generate bilingual certificate for long name and missing photo, correct preview, issue/reissue and verify distinct serial and old version status.

**Current source surface IDs:** V098.

### SKO-468 — [094] School chart of accounts, ledger entries and financial reporting

**Screens/dialogs:** Accounts chart, payment methods, banks, income/expense ledger and financial report.

**Flow:** Guide accountant from a transaction to coded entry and evidence; show currency-specific totals and reconciliation status.

**Acceptance:** No misleading sum across currencies; referenced accounts cannot disappear; reporting period and basis explicit.

**QA:** Record multi-currency income/expense, deactivate used account and rerun report; verify preserved history and separated currency totals.

**Current source surface IDs:** V086, T006, T013, T014, T015, T016, T017, T018, O093, O094, O095, O096, O097, O098, O099, O100.

### SKO-470 — [095] School AI operational plans and reviewed run lifecycle

**Screens/dialogs:** Operational plan intake, evidence/diff review, approval queue, run monitor and reconciliation receipt.

**Flow:** Describe desired school operation, inspect deterministic proposed change and affected records, approve scoped plan, execute once and reconcile result.

**Acceptance:** Approval tied to exact version/hash; changed source invalidates approval; rollback/compensation limits visible; failed partial run has owner.

**QA:** Approve timetable/invoice plan, mutate source before run and verify rejection; rerun valid partially failed plan and ensure only unapplied effects execute.

**Current source surface IDs:** R085, AI03, AI04, AI05, AI17, N050, N051, N055, N056, N057.

## Unclosed verification work

The source inventory is complete for page filenames and the documented static patterns. Runtime completeness remains open: permission-filtered tabs, data-generated action menus, confirmations whose title comes from state, native input popovers, imported generic wizard bodies and feature flags need traversal with seeded users. No new complete browser route matrix has been run for this inventory. In particular, the untracked Exam Studio probe is explicitly non-production and its comment says the production shell is not yet present; do not count the probe or animation as the flagship delivery.

The state-variant candidates and boundaries are preserved in JSON to avoid omitting hidden editing modes. There are zero unassigned current routes, and zero new runtime passes claimed. Future route/modal additions should fail the inventory completeness gate until assigned to a feature and a concrete QA flow.


## Implementation follow-up — 15 October 2026

The static baseline above contained 89 page files. The current code now adds `/ai/studio` (R090, SKO-408), bringing the current route inventory to 90. This is a staff-only shell over real scoped evidence, curriculum, paper/session-plan and history flows, with EN/AR/UR copy and a skippable per-user-session robot introduction. `/ai/studio-intro` remains an isolated development probe excluded from product navigation. Targeted browser checks confirmed source save/reload, workspace error/retry and Arabic/Urdu fit at 320px; this does not certify the full route matrix or all proposed Studio spaces.
