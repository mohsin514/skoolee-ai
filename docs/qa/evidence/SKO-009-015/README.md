# Done UI audit: SKO-214, SKO-220, SKO-221, SKO-223, SKO-196, SKO-195

Audit run: 2026-10-08. All browser fixtures used synthetic labels, mocked route data, a local Next.js dev server, and/or an empty temporary loopback database. No `.env`, production account, production record, or remote database was used. The listed screenshots are from the current checkout after the scoped changes.

## Screen coverage

| Issue | Specified screen/page | Result | Current checks and limits |
|---|---|---|---|
| SKO-214 | AI policy and evaluation release are optional operator reference/runbook material; no application route or customer-facing screen is required. | No UI screen | Checked issue scope against the implementation surfaces; operational review is outside visual browser coverage. |
| SKO-220 | Workflow reconciliation report and recovery runbook use existing job tooling; no new in-app console is required. | No UI screen | Checked issue scope; operational tooling is outside visual browser coverage. |
| SKO-221 | `/onboarding/package` — choose/compare packages | Pass for tested browser matrix | Synthetic catalogue in en/ar/ur at 1280×900, 820×1180, and 390×844. Verified page language and direction, no horizontal overflow, content and key actions translated, first control receives a visible keyboard focus ring, and no page errors. PKR and order/catalogue identifiers remain left-to-right. Phone screenshots: [en](screenshots/skoolee-package-en.png), [ar](screenshots/skoolee-package-ar.png), [ur](screenshots/skoolee-package-ur.png). No checkout/payment was initiated. |
| SKO-221 | `/onboarding/package/status` — payment and setup status | Pass for tested browser matrix | Synthetic pending-settlement state in en/ar/ur at 1280×900, 820×1180, and 390×844. Same checks as package page, including LTR amount and order ID; no real provider interaction. Phone screenshots: [en](screenshots/skoolee-status-en.png), [ar](screenshots/skoolee-status-ar.png), [ur](screenshots/skoolee-status-ur.png). |
| SKO-223 | `/jobs` — job activity list | Partial | Synthetic job list rendered at desktop/tablet/phone widths with no horizontal overflow or browser page errors. Current visual captures: [desktop](screenshots/skoolee-jobs-list-desktop.png), [tablet](screenshots/skoolee-jobs-list-tablet.png), [phone](screenshots/skoolee-jobs-list-phone.png). Locale remained English; Arabic/Urdu and screen-reader review are unverified. |
| SKO-223 | `/jobs?id=…` — delivery/recovery detail, selection and retry/cancel controls | Partial | Opened detail from list at desktop/tablet/phone widths; checked no horizontal overflow, no browser page errors, and keyboard Space toggles the failed-item checkbox. Current captures: [desktop](screenshots/skoolee-jobs-desktop.png), [tablet](screenshots/skoolee-jobs-tablet.png), [phone](screenshots/skoolee-jobs-phone.png). Locale remained English; AR/UR, pointer hover/pressed appearance, screen-reader review, and live retry/cancel outcomes are unverified. |
| SKO-196 | `/dashboard/students` — admission form and recover-draft dialog | Unverified in this run | The checked-in workflow’s email/password login returned 401. A disposable synthetic signed JWT plus matching `LoginSession` row reached `/dashboard/students`, but “Add Student” stayed disabled because its class list did not populate. A follow-up browser setup with an explicit synthetic class fixture redirected to `/login` before rendering. Fixture cleanup succeeded on the checked-in workflow; the separate browser setup also removed records in its `finally` block. Existing SKO-196 checked-in QA artifacts document an earlier run; they are historical evidence and are not counted as this browser pass. Current desktop/tablet/phone and en/ar/ur behavior remain unverified here. |
| SKO-195 | `/principal` — review class dependencies and archive with a reason | Unverified in this run; source gap fixed | Current code now previews dependent records and calls the supported class archive endpoint, with confirmation text that says history is preserved. The previous principal action called a nonexistent `/api/classes/:id` route and described archive as delete. Browser viewports, modal keyboard behavior, and API confirmation were not exercised in this run. |
| SKO-195 | `/dashboard/students` — archived pupil list and restore/conflict review | Unverified in this run; known UI gap remains | The route was not reached in a current browser run. The restore API reports identifier conflicts, but the current flow does not provide an in-context edit/review of replacement identifiers; the user must resolve IDs elsewhere and retry. Desktop/tablet/phone, locale, keyboard, and focus states remain unverified. |

## Changes in this audit

- SKO-221 package comparison and payment-status copy now have route-specific en/ar/ur catalogs, including plan names, actions, status labels, and known catalogue features. The catalogue can provide arbitrary future feature strings; values outside the translated known catalogue still fall back to their source text and should be localized when new offers are authored.
- SKO-223 job controls/cards now use semantic surface, field, and status tokens. Job cards expose hover, pressed, reduced-motion, and visible keyboard-focus states; action buttons use the shared button component.
- SKO-195 principal class handling now previews impacts and uses the supported archive endpoint. The shared-admin class manager no longer claims the action permanently deletes class data.

## Validation

- Playwright/Chromium synthetic browser run: SKO-221 both routes × 3 locales × 3 viewports; SKO-223 list-to-detail at 3 viewports and keyboard checkbox selection.
- `eslint` on the six scoped source files: passed.
- `tsc --noEmit --pretty false`: passed.
- `git diff --check`: passed.
- `next build --webpack`: previously attempted with synthetic local settings; blocked when the build could not resolve Google Fonts (`ENOTFOUND fonts.googleapis.com`). No build pass is claimed.
- SKO-196 synthetic workflow: standard fixture login returned 401; signed-token retry reached the page but could not open the admission dialog because the class picker was empty; an explicit class fixture follow-up redirected to login. Synthetic fixture cleanup was run. This is not a page validation pass.
