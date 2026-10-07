# F61 implementation and interaction contract

SKO-208 · sequence 001/082 · M1 / 01 Trust and shared UX · roadmap P0.
The restored manifest and specs-a.json remain authoritative. This supplement does not change feature identity, ownership, priority or dependency order. Synthetic references are local design/QA fixtures, not a new school module or evidence of deployment.

## Worldwide visual direction

Product direction confirmed by the user: a futuristic, appealing interface suitable for schools worldwide. Carry the shared design language through every role rather than restyling each module independently.

- Use precise typography, layered but restrained surfaces, distinctive task icons and clear primary actions. Motion should explain state changes and remain optional under reduced-motion preferences.
- Typography must respect the script: Arabic, Urdu and Persian need natural letter spacing and enough line height for connected letters and marks. Mark translated text with the correct language without mislabeling untranslated content.
- Layouts must support RTL, mixed-direction identifiers, long translated labels, 200% text, keyboard use and narrow touch screens. Labels and text feedback remain visible; color and icons supplement meaning.
- Locale, week start, numbering and time-zone settings belong to the user/school configuration. Separate displayed values from stored data. Calendar labels are injectable; the current DatePicker is explicitly Gregorian and stores YYYY-MM-DD regardless of display locale. Alternate calendar systems require deliberate support in F49.
- Keep the visual system lightweight: CSS effects and existing vector icons, useful hover/press/focus states, and native-browser fallbacks. A polished appearance must remain usable on slower devices and connections.

F61 now demonstrates configurable calendar locale, translated calendar copy, regional week starts, localized numerals and Arabic script-aware typography. This does not certify full translation, all writing systems, all regional calendars or all browsers. F49 still owns the full localization rollout and locale-specific QA; school/user locale settings must be connected by consuming features.

## Actor, scope and outcome

Primary actor: a campus staff member opening assigned work at the start of a school day. They need to find an authorized task, inspect its source, correct a draft and understand whether it was saved, approved or published. Prevent selecting an unavailable module, losing entered work after a recoverable failure, and confusing a draft save with family delivery.

Visible scope: institution, campus and academic period; class or pupil context belongs inside the selected task. The authoritative record is the domain API's stored, versioned record. Navigation never confers authority. Only the actor authorized by that domain may commit; other roles see a change only after its actual domain transition. F61 supplies shared presentation and interaction contracts; F01 supplies uniform membership/resource enforcement and F03 supplies report-version publication invariants.

## Grounded evidence and changes

- `src/components/role-dashboard/RoleSidebar.tsx`: prior navigation used buttons for URLs, prefix matching could select unrelated paths, mobile drawer had no dialog semantics or focus management. It now shares ModalSurface focus/escape/scroll behavior, uses links for URLs, logical edges, wrapping labels, explicit current state, and prunes unavailable items/empty groups.
- `src/components/role-dashboard/RoleShell.tsx`: neutral surface, logical sidebar offset, dynamic viewport height and skip link; access failures offer retry and retain mounted draft state. Single-character sidebar shortcut requires Alt+Shift+[ so text/navigation keys are not hijacked.
- `src/components/nav/WorkspaceSubnav.tsx`: teacher, pupil, guardian, operations and campus section navigation use one keyboard-operable, wrapping composition. No drag-only or direction-sensitive arrow strip.
- `src/app/api/navigation/access/route.ts`: reads only the signed-in caller's effective module visibility through existing auth/permission services. No-store response. Parent token navigation reuses the existing resolved child scope via `src/app/api/parent/data/route.ts`; it does not invent an identity relationship.
- `src/lib/navigation/modules.ts`: stable route/view-to-module mapping, including distinct transport, dormitory, inventory and library permissions. Unmapped shell-level destinations retain their existing behavior. No translated label is used as a permission key.
- `src/components/ui`: Button/Input/Select/Textarea use shared semantic tokens; disabled text is solid, native labels remain visible, FormField connects control/hint/error IDs and retains help alongside errors. The compound Dialog title now supplies the shared surface’s accessible-name ID (including existing fee/admission dialogs). Table uses logical alignment; TaskHeader, TaskFeedback, TaskLoading and TaskStatus standardize task surfaces.
- `docs/qa/evidence/UX-UI-A11Y-audit.md` is historical local evidence. Its contrast/layout warning informed the new tests; its findings are not treated as staging verification.

## Navigation matrix

Role destinations are selected by each existing console; module visibility is the intersection of those destinations and effective server permissions. An optional `available: false` on an item also hides a school-disabled capability. Parents on a portal token never gain a Messages link. Landing pages remain available as a return path.

| Role | Primary destinations | Scope / authority boundary |
|---|---|---|
| APP_OWNER | Existing platform console: school/service administration | Vendor operations, never synonymous with school ownership |
| SUPER_ADMIN | Existing network console: institutions/campuses, people, reports, settings | Authorized school group; purchasing follows current payer checks |
| ADMIN / CAMPUS_ADMIN | Workspace; Students; Academics; Staff; Attendance; Fees; Operations; Messages | Campus/institution from session. Equal display labels do not establish equal membership |
| PRINCIPAL | Workspace; Students; Academics; Staff; Attendance; operational work | Existing campus authority; rank is not a permission grant |
| TEACHER | Dashboard; Classes; Timetable; Students; Attendance; Marks; Assessments; Reports; Insights; Calendar; Leave; AI; Messages | Assigned work only, filtered by effective module visibility |
| ACCOUNTANT | Dashboard; fee overview/structures/layers; invoices/payments; reports; accounts; payroll; leave; messages | School finance, not automatic group subscription ownership |
| LIBRARIAN | Dashboard; Library; Inventory; Leave; Messages | Effective library/inventory permissions |
| RECEPTIONIST | Dashboard; Visitors; Complaints; Postal; Calls; Certificates; Leave; Messages | Effective front-desk/record permissions |
| STUDENT | Dashboard; Coursework; Attendance; Timetable; Reports; Fees; Messages | Linked pupil and released information |
| PARENT | Overview; Results; Attendance; Timetable; Fees; Messages for signed-in users | Explicit linked child; token keeps its existing single-child scope |

Group labels and ordering are stable. A denied direct-link task displays a generic unavailable-workspace message, never a pupil identity. APIs still enforce their own record policy. Links are not an authorization boundary.

## Smallest complete journey

1. Enter the role shell with visible institution/campus/period; retain landing navigation during access checks.
2. Filter assigned work, select rows with native checkboxes, open the source task. Selection is not approval.
3. Edit labeled fields; help and inline errors stay attached. Validate before opening review. Focus the first invalid field and offer a linked error summary.
4. Save draft explicitly; say where it was saved and that nothing was published. Recoverable errors retain all entered values.
5. Review scope, version and effect before a consequential commit. Keep editing returns to the intact form.
6. Commit through the domain service. A stale version must block overwrite, retain the draft and offer comparison against the current record.
7. Show the precise receipt and source version. Return to the preserved task filters. Approval, publication, send acceptance, delivery and acknowledgement remain separate.

The synthetic fixture's Save example changes is local simulation only. It does not implement a report approval service or demonstrate a concurrency guarantee.

## Screen 1 — staff task queue

Purpose: identify the next actionable task. Scope: Northstar School / North campus / Autumn 2026 (synthetic). Hierarchy: scope → title/explanation → Review next → search/period/responsibility → assigned table → stage explanation. Primary action: Review next. Secondary: open a particular source row. Back from the form returns to the same search and selection.

Rows: REF-021 Review report batch / Academic office / Today / Needs review; REF-022 Check attendance / Class teacher / 09:00 / One class missing; REF-023 Resolve delivery / School office / Today / Delivery unconfirmed. These expose review, incomplete capture and uncertain delivery rather than three completed rows.

On phones the table becomes labeled cards, retaining owner, due, state and task action. Selecting a row is keyboard-operable and never invokes a mutation. School configuration must supply language, period and dates; fixture dates are explicitly synthetic.

## Screen 2 — draft review and recovery

Purpose: resolve incomplete scope and review consequences before saving. Scope remains visible. Hierarchy: draft explanation → linked validation summary → persistent fields → impact/source version → Review changes / Save draft. Missing campus is a substantive recovery case, not another happy-path table.

Fields: record name, permitted campus, effective date, reason. Review describes one example record changing v3 → v4, who sees it and that families see no change. A stale-version simulation keeps fields and explains comparison is required; no successful receipt is shown. A real domain integration must implement authoritative re-fetch/compare and version preconditions before enabling commit. This is explicitly an integration gate, not a claimed backend feature.

Family secondary reference: published learning-summary action, selected pupil/class/period, next step and missing-guardian-link recovery. A summary opening is not an acknowledgement. The example enables reports and attendance only; Fees is absent.

## State and interaction contract

| State | Required behavior |
|---|---|
| Empty | Say whether there is no work or no filter match; offer an authorized next step or clear search |
| Loading | Keep scope/navigation; content-shaped skeleton; one polite status announcement |
| Error | Specific task failure, retry, no input/filter loss or raw provider/server error |
| Permission | Hide denied module links; generic direct-link denial, no unrelated identity disclosure |
| Success | Actual action and source/version receipt; no claim about downstream publication/delivery |
| Draft | Explicit persistence boundary and save result. Blocked browser storage keeps values in memory |
| Review | Visible scope, previous/current version and impact; bounded modal only for final review |
| Stale | Keep edits; require authoritative comparison before a domain commit |

Dialogs trap Tab, close with Escape and restore focus to a surviving trigger. Mobile navigation closes on local-view selection, route change and desktop breakpoint. Focus indicators use a solid semantic ring. Controls target at least 44px for routine interaction. Error summary targets fields. Native checkbox state and text status labels do not depend on color. Reduced motion disables movement and smooth scroll.

RTL: logical offsets, padding and borders; directional collapse icon mirrors. IDs and dates use `bdi`; names wrap. Arabic fixture headers and long context exercise direction, but this ticket does not claim a fully translated product or Arabic PDF verification (F49). Mobile 200% text must not cause horizontal page scrolling. Mixed-direction domain content still requires F49's full localization QA.

Final copy: “Choose a campus to continue.” / “Example draft saved in this tab. Nothing has been published.” Real integrations replace “Example” only when the corresponding persistence is verified.

## Ownership and contribution

Shared UX maintenance belongs to the maintainers of `src/components/ui`, `src/components/nav` and `src/components/role-dashboard`; this names a code responsibility, not a new roadmap assignee. Domain maintainers own business permissions, scope, versions, persistence and final copy. Changes must list reused components, include a meaningful exception/recovery surface, and explain any deviation with its task benefit and reviewer decision. Do not create a parallel dialog, notification status vocabulary or hardcoded text-opacity palette.

Use semantic surface/text/primary/status tokens from globals.css; 4px spacing increments, 12px control gap, 24px task gap, 14px body minimum, 24px task heading. Reserve violet for primary action, selected navigation and brand. Status always has words. New pattern adoption starts with these shared primitives in admissions, report and fee forms; their independent transaction semantics remain in their existing services.

## Acceptance and targeted QA

1. Staff equivalent task: navigate admissions, reports and fees under representative permissions; compare primary action, required label/error wiring, review and return behavior. The synthetic fixture automates the common edit → error → draft → stale → review → receipt behavior. Live domain transaction comparison still requires staging fixtures.
2. Family: only reports/attendance enabled; no Fees destination; phone 360px and 200% text; missing-link recovery; keyboard open/close navigation and focus restoration.
3. Arabic direction: staff queue → form → bounded review with keyboard; logical sidebar placement, readable isolated IDs, full loading/empty/error/permission/success state set; preserve search after error.

Automated scripts: `node --import tsx --test tests/design-system/navigation.test.ts`; local server on port 3005 plus `npx playwright test --config tests/design-system/playwright.config.ts`; `npx next typegen` then `npx tsc --noEmit --incremental false`; targeted ESLint. Browser checks first assert a non-zero rendered heading so a blank page cannot pass.

Success observation: in each pilot session, record attempted/completed target tasks, incorrect navigation selections, recoverable errors and lost drafts; compare the same scripted tasks before/after. Track shared component imports and accessibility regressions in code review/CI. These are proposed measures, not invented customer results.

## Readiness and exclusions

No dependencies precede F61. Downstream manifest references: F79 role/membership UX, F62 marketing/entitlements, F08 draft recovery, F49 localization and F71 notifications. Preserve their identities and native Linear blocking links.

No new identity model, school-module enablement table, subscription ownership grant, report approval invariant or claim of regulatory compliance is introduced. The current schema has module permissions and limited commercial feature entitlements, not a general independent module catalogue. `available` supplies the explicit integration point; a school enablement source must be agreed alongside F62/F01 before claiming arbitrary per-school modules are configured. Purchasing remains a separate Settings → Billing & plan product requirement, not school Fees.

Ready for local code review only when recorded checks pass. School/staging certification, authenticated all-role journey coverage, full Arabic translation/PDF checks and downstream server invariants remain release gates; a polished reference is not evidence they passed.


## Final implementation and review notes

The reference uses one reusable PageCard around headings, filters, task tables, forms, feedback and family content. Shared controls retain native input/ref semantics, consistent label clearance, visible hover/focus states and reduced-motion support. A native branded Checkbox, configurable Gregorian DatePicker, role navigation and shared modal surfaces supply reusable interaction patterns.

The staff workspace includes an informational workflow strip, task icons, labelled open actions and persistent selected-row feedback. The form puts impact/source context beside draft fields on wide screens and stacks it on phones. Arabic examples mark translated text with language metadata and use script-appropriate typography, local calendar messages/digits, configurable week starts and RTL keyboard behavior. Calendar display localization does not change stored ISO dates.

The enhanced Select popup uses progressive browser support for `appearance: base-select`; other browsers retain their native menu. DatePicker and PageCard are adopted by the reference and available for further module migration. This does not mean every application screen already uses them.

### Reproducible verification

Final review checks: five navigation/recovery tests and eight browser tests passed; TypeScript and production build passed; targeted ESLint reports no errors and one pre-existing unused suppression warning. Parent data-load failures now expose the existing retry UI while protected records remain closed.

- Navigation tests: `node --import tsx --test tests/design-system/*.test.ts*`.
- Start the local app on port 3005, then run `npx playwright test --config tests/design-system/playwright.config.ts`.
- TypeScript: `npx next typegen && npx tsc --noEmit --incremental false`.
- Production bundle: `npm run build`.
- Targeted ESLint covers changed source and test files.

The browser suite exercises staff validation/draft/stale/review recovery, phone navigation and focus return, permission failure/retry, Arabic layouts, contrast, native high-contrast fallback, keyboard calendar selection including leap-year boundaries, localized dates and enlarged text. Reviewed desktop snapshot baselines are maintained in `tests/design-system/reference.spec.ts-snapshots/`.

Disposable screenshots and browser reports are generated only under ignored `test-results/design-system/`; they are not committed. The two earlier Linear screenshot attachments illustrate the earlier iteration. Current reviewed visuals are the test baselines and running local reference. Temporary upload helpers, debug scripts, logs and the retired development-cache copy were removed before handoff.

The restored manifest and product/specification documents are preserved. Feature identities, priorities and dependency links remain unchanged. The reference is development-only; no deployment, all-role school validation or full localization certification is claimed. See the readiness and exclusions above for release gates.
