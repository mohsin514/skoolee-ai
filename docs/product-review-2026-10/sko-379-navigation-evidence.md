# SKO-379 — shared navigation verification

Evidence date: 2026-10-15. Shared-component verification passed. The coordinating task owns the final production build and integrated role matrix.

The isolated shared-component browser checks use synthetic data with every network request intercepted. The final built-application and native Chrome sections separately identify their isolated local database checks. No live AI-provider calls were made.

## Changes

- Navigation access is fenced on the first render of a changed pathname or retry; a ten-second deadline exposes recovery; obsolete requests cannot restore prior access.
- Desktop Find a workspace and mobile More use the same searchable, role-filtered directory. Alt+Shift+K opens it outside editable controls. Existing modal stack, focus trap, Escape and focus return are reused.
- Search and destination rows share one scroll surface so enlarged Arabic/Urdu text does not consume all destination height at 320px.
- Teacher Ctrl+K results now filter sections, class actions and roster identities using current navigation access. Loading/error states close the palette presentation.
- Shared navigation accessible labels, loading/error/recovery copy and palette interface copy use EN / AR / UR catalogs.
- An allowlisted URL workspace hook preserves six previously local-only consoles through Back, Forward and Refresh. Super console replaceState-only overrides were removed.
- Teacher dashboard no longer uses an unscoped cross-mount cache. The server layout keys it by current actor, school, campus, role and accessVersion. Refresh starts closed; late or unmounted completions are ignored.

## Validation results

| Check | Result |
| --- | --- |
| Targeted ESLint | Passed across owned source and test files. |
| Whitespace diff check | Passed. |
| Pure navigation, recovery and adoption checks | 11 tests passed. |
| Isolated shared-navigation browser suite | Final run: 19 distinct cases passed in 21.4 seconds after query-access and mobile fixes. |
| Actual family/student wrapper browser suite | 12 cases passed in 12.0 seconds: two roles × EN/AR/UR × normal/200% text at 320×720. |
| Actual parent/student dashboard content browser suite | Final populated-data run: 18 cases passed in 52.9 seconds. Six exercise 200% text/cards/calendar/form; twelve sample immediate and settled root-text/CSS-zoom layouts across both roles and EN/AR/UR. |
| Additional table keyboard checks | Three targeted cases passed: English, Arabic and Urdu. |
| Responsive matrix | 320×720, 390×844, 768×1024 and 1440×1000 CSS pixels. |
| Language and direction | English/LTR, Arabic/RTL and Urdu/RTL. |
| Enlarged text and CSS zoom | 200% root text at 320×720, plus actual CSS zoom:2 at 640×1440 (320px document client width). Native Chrome toolbar 200% was subsequently verified on actual parent EN/AR and student UR journeys; see the native evidence section. |
| Reduced motion | Real media emulation; computed dialog animation duration checked. |
| Contrast and focus | Normal primary-gradient endpoints, disabled-button text and error text meet 4.5:1. Button/checkbox outlines and the invalid-field focus shadow were checked. |

Commands:

```sh
node --import tsx --test tests/design-system/navigation.test.ts tests/design-system/navigation-recovery.test.tsx tests/design-system/adoption.test.ts
npx playwright test --config tests/design-system/navigation-foundation/playwright.config.ts --output test-results/design-system/navigation-foundation-final
npx playwright test --config tests/design-system/navigation-foundation/playwright.config.ts --grep 'equivalent admission' --output test-results/design-system/navigation-foundation-rtl-tables
```

Logs:

- [Final full browser run](/private/tmp/sko379-navigation-final.log)
- [Earlier full browser run](/private/tmp/sko379-navigation-browser.log)
- [Targeted language-table run](/private/tmp/sko379-navigation-rtl-tables.log)

## Acceptance criteria mapping

| Criterion | Shared-component outcome | Remaining integrated verification |
| --- | --- | --- |
| Documented primary navigation, visible active state, no unavailable module links | PASS filtered links/groups, active route, shared directory and teacher shortcut filtering | PASS final built-app matrix: all 11 roles at desktop/tablet/phone; see final verification below |
| Reference pages reuse shared headings/actions/validation/dialog/empty patterns | PASS shared components plus existing documented reference compositions; current tests exercise blank search, loading, denial, error/retry, form review and success | Do not count every discovered overlay as individually browser-certified |
| Contrast and focus in default, disabled and error states | PASS computed contrast and keyboard focus checks | No additional shared-component check identified. |
| Persistent labels/help/errors; keyboard table selection/actions | PASS shared validate/edit/review journeys, help+error associations, checkbox Space and row Enter in all three languages | No additional shared-component check identified. |
| Family/student narrow phones without horizontal page scroll | PASS two-module synthetic family at 320/390/tablet, enlarged text; directory results fully in viewport after keyboard focus | PASS final built-app parent/student pages with explicit published-child selection and populated report |
| New feature reviews name reused components and exceptions | PASS this change uses Button/Input/FormField/ModalSurface, current token/CSS system, existing nav guard behavior; ownership/contribution contracts already in docs/ui-plan | No additional shared-component check identified. |
| Refresh and Back preserve workspace | PASS allowlist, Back / Forward / Refresh and forged-view fallback in hook fixture | PASS actual accountant, librarian, receptionist, owner, super and principal Refresh/Back journeys |
| No inaccessible shortcut or restricted-data flash | PASS first-render route fence, timeout/retry, hidden teacher roster results, scope remount and late-response/rejected-refresh closure | Current server permissions and remaining three role context lifecycle checks owned by root/code_audit |
| Keyboard switcher role-filtered results | PASS EN / AR / UR workspace directory plus teacher palette restricted destinations and identities | No additional shared-component check identified. |

## QA flow mapping

| Flow | Observed result |
| --- | --- |
| Equivalent admissions/reports/fees create-edit-review | PASS synthetic shared-form pattern in each language; validation focus, edits preserved when review dismissed, scope/consequence shown, keyboard confirmation and focus return |
| Family account with only two enabled modules at phone and enlarged text | PASS synthetic reports+attendance; fees absent; shell-level record corrections remains available; no page overflow |
| Arabic task/form/dialog keyboard only | PASS directory shortcut, search, modal focus cycle/Escape/return; form validation, review, table selection and row action |
| Teacher campus change with cached search results | PASS actual provider remount lifecycle with synthetic North/South scopes; old response cannot populate new scope; denied refresh clears read model; actual server-scoped layout key inspected |

## Evidence boundaries

- RoleShell/RoleSidebar/NavigationAccess/TeacherCommandPalette and TeacherDataProvider are actual components.
- Current globals.css and imported CSS modules compiled from repository.
- Next pathname/link routing and server actions are synthetic browser boundaries; this suite does not certify server authorization or actual module saves.
- Equivalent admissions/report/fee forms demonstrate shared interaction consistency; they are not the domain transaction implementations.

The following are not claimed:

- Human task completion time or navigation-error research; ongoing product measurement, not an invented external approval gate.
- Live country/curriculum/payment/currency workflows; those remain their domain feature responsibilities.
- Deployment, all-screen accessibility certification, browser-chrome zoom, or database-backed create/edit/save transactions from this isolated suite.
- SKO-383 completion: previous partial reservation work is preserved and remains paused.

## Screenshots

These 15 original PNGs remain in the ignored test-output directories. They are linked here; no image files were added to Git.

1. [directory-ar-desktop.png — full suite](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-final/navigation-ar-directory-ke-ce7cd-stinations-and-focus-return/directory-ar-desktop.png)
2. [form-ar-desktop.png — full suite](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-final/navigation-ar-equivalent-a-8ce5b-lidate-edit-review-journeys/form-ar-desktop.png)
3. [directory-ar-320-large-text.png — full suite](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-final/navigation-ar-two-module-f-ed988-rge-text-and-reduced-motion/directory-ar-320-large-text.png)
4. [directory-ar-320.png — full suite](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-final/navigation-ar-two-module-f-ed988-rge-text-and-reduced-motion/directory-ar-320.png)
5. [directory-en-desktop.png — full suite](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-final/navigation-en-directory-ke-1ca55-stinations-and-focus-return/directory-en-desktop.png)
6. [form-en-desktop.png — full suite](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-final/navigation-en-equivalent-a-1c32d-lidate-edit-review-journeys/form-en-desktop.png)
7. [directory-en-320-large-text.png — full suite](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-final/navigation-en-two-module-f-5fee4-rge-text-and-reduced-motion/directory-en-320-large-text.png)
8. [directory-en-320.png — full suite](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-final/navigation-en-two-module-f-5fee4-rge-text-and-reduced-motion/directory-en-320.png)
9. [directory-ur-desktop.png — full suite](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-final/navigation-ur-directory-ke-43540-stinations-and-focus-return/directory-ur-desktop.png)
10. [form-ur-desktop.png — full suite](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-final/navigation-ur-equivalent-a-20cea-lidate-edit-review-journeys/form-ur-desktop.png)
11. [directory-ur-320-large-text.png — full suite](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-final/navigation-ur-two-module-f-6da28-rge-text-and-reduced-motion/directory-ur-320-large-text.png)
12. [directory-ur-320.png — full suite](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-final/navigation-ur-two-module-f-6da28-rge-text-and-reduced-motion/directory-ur-320.png)
13. [form-ar-desktop.png — language-table rerun](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-rtl-tables/navigation-ar-equivalent-a-8ce5b-lidate-edit-review-journeys/form-ar-desktop.png)
14. [form-en-desktop.png — language-table rerun](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-rtl-tables/navigation-en-equivalent-a-1c32d-lidate-edit-review-journeys/form-en-desktop.png)
15. [form-ur-desktop.png — language-table rerun](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/navigation-foundation-rtl-tables/navigation-ur-equivalent-a-20cea-lidate-edit-review-journeys/form-ur-desktop.png)

## Changed runtime files

- [src/components/nav/NavigationAccess.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/nav/NavigationAccess.tsx)
- [src/components/nav/useWorkspaceView.ts](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/nav/useWorkspaceView.ts)
- [src/components/role-dashboard/RoleSidebar.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/role-dashboard/RoleSidebar.tsx)
- [src/components/teacher/command-palette.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/teacher/command-palette.tsx)
- [src/lib/navigation/items.ts](/Users/angular_dev_15/Downloads/skoolee-ai/src/lib/navigation/items.ts)
- [src/lib/navigation/workspace-view.ts](/Users/angular_dev_15/Downloads/skoolee-ai/src/lib/navigation/workspace-view.ts)
- [src/lib/locale/navigation-ui-messages.ts](/Users/angular_dev_15/Downloads/skoolee-ai/src/lib/locale/navigation-ui-messages.ts)
- [src/lib/locale/ui-messages.ts](/Users/angular_dev_15/Downloads/skoolee-ai/src/lib/locale/ui-messages.ts)
- [src/app/accountant/page.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/accountant/page.tsx)
- [src/app/librarian/page.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/librarian/page.tsx)
- [src/app/receptionist/page.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/receptionist/page.tsx)
- [src/app/owner/page.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/owner/page.tsx)
- [src/app/super/page.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/super/page.tsx)
- [src/app/principal/page.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/principal/page.tsx)
- [src/app/teacher/layout.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/layout.tsx)
- [src/app/teacher/teacher-data-context.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/teacher/teacher-data-context.tsx)

- [src/components/role-dashboard/RoleHeader.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/role-dashboard/RoleHeader.tsx)
- [src/components/chat/chat-dock.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/chat/chat-dock.tsx)
- [src/app/parent/parent-shell.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/parent/parent-shell.tsx)
- [src/app/student/student-shell.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/student/student-shell.tsx)
- [src/components/parent/parent-page.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/parent/parent-page.tsx)
- [src/components/student/student-page.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/student/student-page.tsx)

## Query-only workspace access follow-up

The final review found a real gap in the original pathname-only fence: the six local consoles now change `?view` through the native History API, so a permission change could leave a cached module visible until the next focus refresh. The provider now shares the workspace hook's existing navigation subscription and keys its request/result fence by both Next pathname and browser pathname/query. It also refreshes on `pageshow`. No additional History API wrapper is installed; existing draft guards still observe the public API.

Three focused browser regressions passed in 2.5 seconds:

- A same-path view change closes cached fee content on its first commit, before effects, while the fresh permission request is pending. A revoked response leaves it closed; Back preserves the mounted draft.
- Same-path Back requests fresh access and ignores an obsolete response that would have granted the former view.
- A restored page rechecks revoked access even when the URL is unchanged.

The eleven pure navigation/adoption/recovery checks and targeted source lint also passed after the change. These are synthetic request-boundary tests; the root's rebuilt application suite remains the server and actual-role integration gate.

```sh
npx playwright test --config tests/design-system/navigation-foundation/playwright.config.ts --grep 'same-path|restored page' --output test-results/design-system/navigation-query-access
```

[Query-access browser log](/private/tmp/sko379-navigation-query-access.log) · [Pure check log](/private/tmp/sko379-query-followup-pure.log)

## Family and student phone usability follow-up

The actual application's 320px / 200% text screenshot exposed gaps that the earlier synthetic two-module example had not caught: multiple child buttons expanded until they covered the page; long identifiers competed with names; fixed navigation and the floating chat launcher obscured content; header actions clipped.

The corrected shared layout now:

- Uses a single current-child button with a shared selection dialog. Same-name siblings retain full, wrapping roll numbers; the dialog supports keyboard choice and returns focus to the trigger.
- Uses one document scroll surface for family/student pages below 768px, retaining the existing inner workspace scroll on desktop.
- Lets header actions wrap; icon buttons keep 44px touch targets, with responsive notification/account menus.
- Measures the actual mobile navigation height and reserves that space, including enlarged translated labels.
- Hides the floating launcher on phones only when the current shell has an available Messages destination. Messaging remains in More; authenticated token-entry cases without that destination keep their launcher.

Twelve cases passed in **12.0 seconds** on 2026-10-15: parent/student × English/Arabic/Urdu × normal/200% root text, at 320×720. The tests run the actual ParentShell, StudentShell, ParentPage, StudentPage, RoleShell, header, CycleBadge, sidebar, child chooser and shared controls. Data contexts, server actions, notifications, settings and chat are synthetic boundaries. Consequently, launcher integration still needs the coordinating task's actual-app check.

Each case checks header control bounds and overlap, full identifier wrapping, the first record's viewport bounds, scrolling to the final primary action, the action staying above mobile navigation, `elementFromPoint` proving it is unobscured, keyboard activation, and the reachable Messages destination. Parent cases additionally use keyboard Tab/Enter to choose the second namesake child and verify focus restoration. The student summary includes the long roll number, matching the real dashboard. The fixture waits for actual dialog entrance animation completion before measuring.

```sh
npx eslint tests/design-system/family-mobile
npx playwright test --config tests/design-system/family-mobile/playwright.config.ts
```

ESLint passed. The browser result was terminal output (`12 passed (12.0s)`, session 28085), not a saved log. Thirty original PNGs remain in ignored test output:

| Language / role / text | Child chooser | Primary content/action | Messages directory |
| --- | --- | --- | --- |
| EN / parent / normal | [chooser](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-en-parent-at-79a14--and-Messages-remain-usable/parent-en-normal-chooser.png) | [content](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-en-parent-at-79a14--and-Messages-remain-usable/parent-en-normal-content.png) | [directory](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-en-parent-at-79a14--and-Messages-remain-usable/parent-en-normal-directory.png) |
| EN / parent / 200% | [chooser](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-en-parent-at-7020b--and-Messages-remain-usable/parent-en-large-chooser.png) | [content](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-en-parent-at-7020b--and-Messages-remain-usable/parent-en-large-content.png) | [directory](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-en-parent-at-7020b--and-Messages-remain-usable/parent-en-large-directory.png) |
| EN / student / normal | — | [content](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-en-student-a-14f6a--and-Messages-remain-usable/student-en-normal-content.png) | [directory](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-en-student-a-14f6a--and-Messages-remain-usable/student-en-normal-directory.png) |
| EN / student / 200% | — | [content](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-en-student-a-d548e--and-Messages-remain-usable/student-en-large-content.png) | [directory](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-en-student-a-d548e--and-Messages-remain-usable/student-en-large-directory.png) |
| AR / parent / normal | [chooser](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ar-parent-at-df181--and-Messages-remain-usable/parent-ar-normal-chooser.png) | [content](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ar-parent-at-df181--and-Messages-remain-usable/parent-ar-normal-content.png) | [directory](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ar-parent-at-df181--and-Messages-remain-usable/parent-ar-normal-directory.png) |
| AR / parent / 200% | [chooser](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ar-parent-at-4c30a--and-Messages-remain-usable/parent-ar-large-chooser.png) | [content](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ar-parent-at-4c30a--and-Messages-remain-usable/parent-ar-large-content.png) | [directory](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ar-parent-at-4c30a--and-Messages-remain-usable/parent-ar-large-directory.png) |
| AR / student / normal | — | [content](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ar-student-a-a0744--and-Messages-remain-usable/student-ar-normal-content.png) | [directory](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ar-student-a-a0744--and-Messages-remain-usable/student-ar-normal-directory.png) |
| AR / student / 200% | — | [content](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ar-student-a-a4e89--and-Messages-remain-usable/student-ar-large-content.png) | [directory](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ar-student-a-a4e89--and-Messages-remain-usable/student-ar-large-directory.png) |
| UR / parent / normal | [chooser](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ur-parent-at-18ed8--and-Messages-remain-usable/parent-ur-normal-chooser.png) | [content](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ur-parent-at-18ed8--and-Messages-remain-usable/parent-ur-normal-content.png) | [directory](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ur-parent-at-18ed8--and-Messages-remain-usable/parent-ur-normal-directory.png) |
| UR / parent / 200% | [chooser](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ur-parent-at-aa197--and-Messages-remain-usable/parent-ur-large-chooser.png) | [content](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ur-parent-at-aa197--and-Messages-remain-usable/parent-ur-large-content.png) | [directory](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ur-parent-at-aa197--and-Messages-remain-usable/parent-ur-large-directory.png) |
| UR / student / normal | — | [content](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ur-student-a-cc967--and-Messages-remain-usable/student-ur-normal-content.png) | [directory](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ur-student-a-cc967--and-Messages-remain-usable/student-ur-normal-directory.png) |
| UR / student / 200% | — | [content](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ur-student-a-a2915--and-Messages-remain-usable/student-ur-large-content.png) | [directory](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-mobile/family-mobile-ur-student-a-a2915--and-Messages-remain-usable/student-ur-large-directory.png) |

Arabic enlarged chooser and Urdu enlarged primary-action captures were visually reviewed by this agent and the coordinating task. Actual full-page role screenshots and backend authorization remain separate coordinated evidence.

## Exam class scope regression follow-up

Peer review of the root-owned `CreateExamModal` change identified a first-render gap: after a campus prop change, the old selected class could remain eligible for submission before the reset effect ran. The corrected guard requires the class result to belong to the current campus, loading to finish, and the selected class to exist in that current result. No additional runtime edits were made during this test follow-up.

Four focused browser cases passed in 3.9 seconds, using the actual private component exported only inside the test bundle:

| Scenario | Observed result |
| --- | --- |
| Change campus with a selected class and entered title | The first commit, captured before passive effects, removes old class choices and disables submit. Fresh campus data clears class selection while preserving title; selecting the current class sends only its ID. |
| Resolve a previous-campus request after the current request | The old result cannot overwrite current choices, even when the synthetic transport intentionally ignores abort. Requests use `cache: no-store`. |
| Reopen in the same campus after access is revoked | A fresh request is required; no prior class list reappears. A 403 keeps submit disabled; Retry loads fresh choices. |
| Class request exceeds its deadline | The actual twenty-second timeout exposes the retry state and keeps submit disabled. Retry returns to a fresh, unselected list. |

The fixture intercepts every request and makes no server, database or AI-provider calls. Only unmounted board views and the academic-cycle boundary are stubbed; the actual modal, effects, request fencing, shared controls and current CSS run in Chromium. These checks establish browser state isolation; server permission enforcement remains covered by the coordinating task's authorization suite.

```sh
npx eslint tests/design-system/exam-class-scope
npx playwright test --config tests/design-system/exam-class-scope/playwright.config.ts
```

- [Focused browser log](/private/tmp/sko379-exam-class-scope.log)
- [Current campus selection](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/exam-class-scope/scope-campus-changes-fence-b095d-first-commit-before-effects/current-campus-selection.png)
- [Fresh class list after access retry](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/exam-class-scope/scope-remount-in-the-same--3582b-s-the-old-cached-class-list/fresh-class-after-access-retry.png)

Both original PNGs were visually inspected. They are additional to the fifteen navigation screenshots above and remain in ignored test output.

Adjacent baseline findings are recorded for the eligible exam-domain card and were not changed: the footer Cancel calls `onClose` directly instead of the shared dirty-close path; the office form initially stores `CLASS_TEST` although its permitted choices are `MID_TERM` and `FINAL`. These are separate from the scope-isolation correction.

## Actual dashboard content reflow follow-up

The integrated app screenshots exposed a further issue outside the synthetic wrapper records: fixed chart icon/action rows and padding that scaled with text size squeezed real headings to one or two letters per line. The calendar month grid and student AI form also needed narrow-viewport treatment. Passing page-width assertions alone had not established usability.

The shared InsightCard now wraps actions under the heading when needed, uses a fixed-size icon, and retains useful content width with compact phone padding. Shared parent/student panels and statistics use the same wrapping and compact-padding treatment. The existing Student AI form has a usable narrow layout; its request and provider behavior are unchanged.

Phones initially use the existing calendar agenda. A deliberate choice of Month or Agenda is stored independently of the viewport and survives resizing. Month remains available with a labelled, keyboard-focusable horizontal scroll region and day buttons at least 44×44 CSS pixels. Agenda titles wrap without truncation. No calendar feed or mutation behavior changed.

Six focused cases passed in **7.4 seconds** on 2026-10-15. They mount the actual ParentOverviewPage or StudentDashboard inside its actual shell, using current CSS and synthetic data/API boundaries. Unlike the earlier wrapper suite, these tests run the real insight cards, chart table controls, academic calendar and Student AI input. All network requests are intercepted and no AI dispatch occurs.

| Check at 320×720 and 200% root text | Observed result |
| --- | --- |
| Results, attendance and exam insight headings | At least 150px wide and no more than three lines; no per-letter heading collapse. |
| Chart alternative | Keyboard table action exposes the actual Mathematics result. |
| Phone calendar default | Agenda selected before any user choice. |
| Explicit month navigation | Keyboard action opens a labelled overflow region; every rendered day has a 44px minimum target; focusing the final day scrolls it into view. |
| User choice across resize | Explicit Month remains selected after 320→768→320 resizing. |
| Agenda detail | Full synthetic holiday title is visible. |
| Student AI form | Input remains at least 180px wide; draft entry works; Run AI is in viewport and unobscured according to elementFromPoint; zero AI requests. |

```sh
npx playwright test --config tests/design-system/family-mobile/dashboard-playwright.config.ts
node --import tsx --test tests/design-system/navigation.test.ts tests/design-system/navigation-recovery.test.tsx tests/design-system/adoption.test.ts
```

The eleven pure checks and final targeted source/test ESLint also pass. [Dashboard browser log](/private/tmp/sko379-real-dashboard-layout.log) · [Pure check log](/private/tmp/sko379-dashboard-layout-pure.log) · [Targeted lint log](/private/tmp/sko379-dashboard-layout-final-lint.log)

Twenty-one original PNGs remain outside Git in ignored test output:

| Role / language | Insights | Agenda | Month | AI form |
| --- | --- | --- | --- | --- |
| parent / EN | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-parent-bc228--calendar-reflow-at320-200-/parent-en-insights.png) | [agenda](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-parent-bc228--calendar-reflow-at320-200-/parent-en-agenda.png) | [month](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-parent-bc228--calendar-reflow-at320-200-/parent-en-month.png) | — |
| parent / AR | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-parent-ff7bb--calendar-reflow-at320-200-/parent-ar-insights.png) | [agenda](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-parent-ff7bb--calendar-reflow-at320-200-/parent-ar-agenda.png) | [month](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-parent-ff7bb--calendar-reflow-at320-200-/parent-ar-month.png) | — |
| parent / UR | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-parent-c5b89--calendar-reflow-at320-200-/parent-ur-insights.png) | [agenda](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-parent-c5b89--calendar-reflow-at320-200-/parent-ur-agenda.png) | [month](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-parent-c5b89--calendar-reflow-at320-200-/parent-ur-month.png) | — |
| student / EN | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-studen-1c17c--calendar-reflow-at320-200-/student-en-insights.png) | [agenda](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-studen-1c17c--calendar-reflow-at320-200-/student-en-agenda.png) | [month](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-studen-1c17c--calendar-reflow-at320-200-/student-en-month.png) | [ai](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-studen-1c17c--calendar-reflow-at320-200-/student-en-ai.png) |
| student / AR | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-studen-33dbc--calendar-reflow-at320-200-/student-ar-insights.png) | [agenda](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-studen-33dbc--calendar-reflow-at320-200-/student-ar-agenda.png) | [month](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-studen-33dbc--calendar-reflow-at320-200-/student-ar-month.png) | [ai](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-studen-33dbc--calendar-reflow-at320-200-/student-ar-ai.png) |
| student / UR | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-studen-41470--calendar-reflow-at320-200-/student-ur-insights.png) | [agenda](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-studen-41470--calendar-reflow-at320-200-/student-ur-agenda.png) | [month](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-studen-41470--calendar-reflow-at320-200-/student-ur-month.png) | [ai](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-studen-41470--calendar-reflow-at320-200-/student-ur-ai.png) |

The English parent insight, Arabic parent agenda and Urdu student AI captures were visually reviewed. These synthetic checks prove the actual component layout with controlled content; the coordinating task must review fresh production app captures after rebuilding the final source. Earlier integrated 35/35 results preceded this last responsive correction and do not by themselves certify this revision.

Additional changed runtime files:

- [src/components/insights/chart-kit.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/insights/chart-kit.tsx)
- [src/components/academic/AcademicCalendar.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/academic/AcademicCalendar.tsx)
- [src/components/student/student-ui.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/student/student-ui.tsx)
- [src/components/parent/parent-components.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/parent/parent-components.tsx)
- [src/components/role-dashboard/AiActionPanel.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/role-dashboard/AiActionPanel.tsx)
- [src/app/parent/page.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/parent/page.tsx)
- [src/app/student/page.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/student/page.tsx)

## Populated report regression and explicit zoom-mechanism audit

A subsequent integrated screenshot identified a persistent defect hidden by the earlier empty-report fixture. The actual parent report card used a fixed horizontal title/score row. With a published result and enlarged text, the score widened the page. The root also found that same-name synthetic siblings could select an empty report state, explaining an earlier intermittent integrated pass.

The isolated fixture now always supplies a **published 80% report with a long exam title**, and waits for that title before measurements. Before the correction, the same fixture reproduced a persistent **362px document scroll width in a 320px client width after three seconds**. The report row now wraps, allows the title to shrink/wrap, uses compact phone padding, and aligns the score logically for LTR/RTL. This final runtime correction is limited to `src/app/parent/page.tsx`.

The expanded final suite passed **18/18 cases in 52.9 seconds**. The six dashboard interaction cases now use populated reports. Twelve additional cases cross parent/student × EN/AR/UR × two zoom mechanisms:

| Mechanism | Exact setup | What it establishes |
| --- | --- | --- |
| Enlarged text | 320×720 Playwright viewport; mounted app then `document.documentElement.style.setProperty('font-size', '200%', 'important')`; final computed root font 32px | Text enlargement and reflow at a true 320px CSS viewport. |
| CSS zoom | 640×1440 Playwright viewport; mounted app then `document.documentElement.style.setProperty('zoom', '2', 'important')`; final computed zoom 2, root font 16px, document clientWidth 320px | Actual CSS scaling of text and controls with 320px document space. This is distinct from changing font size. |

CSS zoom preserves `window.innerWidth=640` and its media-query width; browser-toolbar zoom normally changes the layout viewport. Therefore these checks **do not claim browser-toolbar zoom coverage**. Overflow correctly compares document `scrollWidth` with document `clientWidth`, not `innerWidth`, which would conceal a CSS-zoom overflow up to 640px.

Each probe records the immediate sample, animation frames 1–4, and 100ms/1s/3s samples. In the final run, all twelve probes retained `scrollWidth == clientWidth` at every recorded sample. The navigation ResizeObserver updated its reserved height during the first frames, but that was not the persistent published-report overflow. The known decorative clipped span and intentionally scrollable month contents can extend outside their own viewport without widening the document; the diagnostic records them without misclassifying them as page overflow.

For each parent case, assertions verify that the full published title and 80% score stay within the viewport, the score wraps below the long title, and keyboard-focused View all results is unobscured according to `elementFromPoint`. English enlarged-report and Arabic CSS-zoom report captures were visually reviewed. The existing chart, calendar keyboard/target/resize and Student AI input checks also pass with the populated fixture.

```sh
npx playwright test --config tests/design-system/family-mobile/dashboard-playwright.config.ts --output test-results/design-system/family-dashboard-populated
npx eslint src/app/parent/page.tsx tests/design-system/family-mobile
```

[Pre-fix populated failure log](/private/tmp/sko379-dashboard-populated-before.log) · [Final 18-case browser log and measurements](/private/tmp/sko379-dashboard-populated.log) · [Final targeted lint log](/private/tmp/sko379-dashboard-populated-final-lint.log)

The earlier 21 dashboard screenshot links now point to the final populated run. The following additional 21 PNGs complete its 42 original captures:

| Role / language / mechanism | Insights | Published report |
| --- | --- | --- |
| parent / EN / root-text | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-parent-5a6f2-mmediate-and-settled-layout/parent-en-root-text-insights.png) | [published-report](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-parent-5a6f2-mmediate-and-settled-layout/parent-en-root-text-published-report.png) |
| parent / EN / css-zoom | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-parent-8c1f2-mmediate-and-settled-layout/parent-en-css-zoom-insights.png) | [published-report](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-parent-8c1f2-mmediate-and-settled-layout/parent-en-css-zoom-published-report.png) |
| parent / AR / root-text | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-parent-70f7d-mmediate-and-settled-layout/parent-ar-root-text-insights.png) | [published-report](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-parent-70f7d-mmediate-and-settled-layout/parent-ar-root-text-published-report.png) |
| parent / AR / css-zoom | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-parent-42ecd-mmediate-and-settled-layout/parent-ar-css-zoom-insights.png) | [published-report](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-parent-42ecd-mmediate-and-settled-layout/parent-ar-css-zoom-published-report.png) |
| parent / UR / root-text | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-parent-5b8c6-mmediate-and-settled-layout/parent-ur-root-text-insights.png) | [published-report](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-parent-5b8c6-mmediate-and-settled-layout/parent-ur-root-text-published-report.png) |
| parent / UR / css-zoom | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-parent-36f1d-mmediate-and-settled-layout/parent-ur-css-zoom-insights.png) | [published-report](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-parent-36f1d-mmediate-and-settled-layout/parent-ur-css-zoom-published-report.png) |
| student / EN / root-text | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-studen-a797c-mmediate-and-settled-layout/student-en-root-text-insights.png) | — |
| student / EN / css-zoom | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-studen-aeadf-mmediate-and-settled-layout/student-en-css-zoom-insights.png) | — |
| student / AR / root-text | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-studen-672c0-mmediate-and-settled-layout/student-ar-root-text-insights.png) | — |
| student / AR / css-zoom | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-studen-6f2d2-mmediate-and-settled-layout/student-ar-css-zoom-insights.png) | — |
| student / UR / root-text | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-studen-b4499-mmediate-and-settled-layout/student-ur-root-text-insights.png) | — |
| student / UR / css-zoom | [insights](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-studen-b0253-mmediate-and-settled-layout/student-ur-css-zoom-insights.png) | — |
| parent / EN / original interaction case | — | [published report](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-en-parent-bc228--calendar-reflow-at320-200-/parent-en-published-report.png) |
| parent / AR / original interaction case | — | [published report](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ar-parent-ff7bb--calendar-reflow-at320-200-/parent-ar-published-report.png) |
| parent / UR / original interaction case | — | [published report](/Users/angular_dev_15/Downloads/skoolee-ai/test-results/design-system/family-dashboard-populated/dashboard-layout-ur-parent-c5b89--calendar-reflow-at320-200-/parent-ur-published-report.png) |

The coordinating task owns the final rebuilt application matrix with an explicitly selected child whose report is published. No Linear completion is asserted by this isolated evidence.

## Remaining coordinated verification

- Final production build/type checks
- Integrated eleven-role navigation/responsive matrix
- Integrated six-console Refresh/Back flows
- Integrated family/student phone evidence
- Root to merge evidence and update Linear status only after required combined checks clear

This report records the isolated shared-component results available at handoff. Merge the final build and actual-role results before changing the Linear completion status.

## Final built-application verification after populated-report repair

The coordinated production build passed (`/private/tmp/sko-prereq-populated-final-build.log`). The final real application/PostgreSQL/loopback-storage suite passed **35/35 in 27.1 seconds** (`/private/tmp/sko-prereq-populated-auth-http.log`). The parent journey now explicitly selects the published-record child by its distinct roll number; it does not rely on tied same-name sibling ordering. The real 80% report, insight headings, Messages directory, all 11 roles and the principal read-only permission workspace were captured. Root visually checked the final parent insight viewport and full populated overview; the report score wraps inside the card and heading words remain readable. Native browser-toolbar zoom was subsequently verified separately from the root-text/CSS-layout scaling; see the native evidence section below.

## Native browser-toolbar 200% verification

Actual Chrome native 200% passed representative parent English/Arabic and student Urdu keyboard/reflow checks against the same frozen production build. The Chrome accessibility tree reported Zoom: 200%; original native-window images show the menu at 200%. No application CSS scaling was applied (CSS zoom 1, root font 16px). Final narrow captures used a 640×800 browser viewport override, producing innerWidth 320, innerHeight 400 and document clientWidth = scrollWidth = 314px. The focused parent results link and student Run AI action were unobscured above the bottom navigation. No AI request was submitted.

[Exact mechanism, measurements, fixture boundary and cleanup remarks](/private/tmp/sko379-native-zoom/remarks.md) · [Parent EN](/private/tmp/sko379-native-zoom/parent-en-native-200-toolbar.jpg) · [Parent AR report](/private/tmp/sko379-native-zoom/parent-ar-native-200-report-toolbar.jpg) · [Parent AR directory](/private/tmp/sko379-native-zoom/parent-ar-native-200-directory-toolbar.jpg) · [Student UR](/private/tmp/sko379-native-zoom/student-ur-native-200-ai-toolbar.jpg)

The exact disposable school was deleted successfully; normal UI logout, locale restoration, viewport reset and own-tab closure completed. Native zoom reset was initially paused by a locked Mac. After user-confirmed unlock, Chrome accessibility verified Zoom: 100% through the native reset shortcut; the disposable cleanup tab was closed. Browser cleanup is complete. Superseded clipped exports are outside the accepted evidence folder.
