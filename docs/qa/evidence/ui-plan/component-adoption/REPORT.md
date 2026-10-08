# Shared component adoption — owned component scope

Completed 2026-10-08. The owned inventory contains **91 TSX files** under `src/components`; **62 changed** in this batch. The excluded directories belong to other agents: `ui`, `design-system`, `shared-admin`, `marketing`, `fees`, `academic`, `locale`, and `settings`. `academic-year` is included. All 91 files, including reviewed files requiring no change, are enumerated in [coverage.md](coverage.md) and coverage.json (generated artifact removed during merge cleanup).

## Implemented changes

- Ordinary actions, fields and selection controls now use `Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `InputGroup` and `FieldAction` from the existing shared UI directory. Local standard action/field skins were removed so shared variants own those states. Layout and domain-specific status, chart, avatar and selection presentation remain where meaningful. Chat animation uses `motion.create(Button)`.
- Existing selection interactions use the shared `choice` variant with their controlled pressed/selected state. Provisioning, operation and guardian field wrappers associate labels, hints and errors through `FormField`. Existing IDs and native props are retained.
- Ordinary white cards use `sk-panel`. The role-dashboard `BrandButton` remains a thin canonical adapter. Existing domain visualizations and specialized timetable cells retain their own presentation.
- Guardian access preview now uses `ModalSurface` with its previous no-backdrop-dismiss behavior and busy dismissal lock. A stable ref to the asynchronous Review access trigger is passed as `returnFocusRef`. Preview failures appear within the active dialog; draft values remain when it closes.
- New-conversation and teacher-command-palette overlays retain their specialized layout and existing canonical `useDialogBehaviour` integration. They do not introduce a separate focus manager.
- Expanded sidebar/list actions explicitly keep start alignment; collapsed sidebar actions remain centered. Sidebar action icons retain the same 20px geometry as link icons. The parent reviewed reference screenshots after this correction; its remaining 107px difference was the intentional shared Collapse button treatment, not changed navigation alignment.
- The standalone interactive `StatCard` now uses a native shared Button. The existing Enter/Space handler prevents the default native activation before invoking its callback; the browser test proves one invocation for each Enter, Space and pointer action. The compound academic-year header keeps `div role="button"` because it contains an independently actionable Close Year button.

The only raw native controls in this owned inventory are two file-upload inputs, in the chat composer and profile image editor. Their browser upload contracts are preserved. No ordinary native button/input/select/textarea or `motion.button` remains in this inventory.

## Preservation checks

The pre-edit source was copied to a temporary backup before migration. [behavior-contracts.json](../../../../../tests/design-system/component-adoption/behavior-contracts.json) was generated from that backup, rather than reconstructed from the changed implementation. It contains **448 existing control contracts** and **165 fetch expressions** across all 91 files. The scoped source tests compare control count/order/kind, every captured existing value, bound, native option, handler, identifier, naming/state ARIA prop and fetch expression. Additive shared style/accessibility props are permitted. This checks preservation of the captured source contracts; it does not prove every asynchronous branch or backend outcome.

baseline-controls.json (generated artifact removed during merge cleanup), migrations.json (generated artifact removed during merge cleanup) and panels.json (generated artifact removed during merge cleanup) retain the initial inventory and automated-pass audit. Their counts describe that first pass, before subsequent checkbox, switch, label, panel and keyboard refinements. The final coverage files and contract snapshot are the complete owned-file inventory.

## Validation

All commands ran from the repository root:

| Check | Result |
| --- | --- |
| `node --import tsx --test tests/design-system/component-adoption/contracts.test.ts` | 91 passed; log (generated artifact removed during merge cleanup) |
| `npx playwright test --config tests/design-system/component-adoption/playwright.config.ts` | 9 passed in 8.6s, Chromium; final focused run on current shared modal source |
| ESLint on all 91 owned TSX files and the six scoped test files | Exit 0, no diagnostics; JSON (generated artifact removed during merge cleanup) |
| `git diff --check -- <owned files and scoped tests>` | Exit 0 |

The nine browser cases render the actual components and current global/shared styles in isolated fixtures:

1. Guardian fields at 390px: label association, checkbox payload, preview, pending dismissal guard, intercepted 409 feedback, retained draft and strict return focus to Review access.
2. Provisioning at 320px: required name association, Pro/Basic selection, contained horizontal layout, Escape dismissal and strict opener restoration despite descendant `autoFocus`.
3. The same provisioning interactions and focus check at 1440px.
4. Chat composer: Shift+Enter newline, Enter sends the same trimmed payload, pending disabled send, cleared input and restored composer focus.
5. New conversation: group tab state, selected member, same intercepted group payload, completion closure and Escape dismissal after reopening.
6. Chat settings: keyboard Space toggles the accessible switch, retains the same intercepted PATCH payload and has at least a 44px target.
7. Teacher save/navigation: Control+S activation, discard behavior and workspace current-page state.
8. Interactive StatCard: exactly one callback per Enter, Space and click.
9. Urdu guardian at 320px: RTL layout without horizontal document overflow, LTR email entry, linked translated help and keyboard checkbox activation.

Screenshots reviewed: Guardian 390px (generated artifact removed during merge cleanup), Urdu Guardian 320px (generated artifact removed during merge cleanup), Provisioning 320px (generated artifact removed during merge cleanup), Provisioning 1440px (generated artifact removed during merge cleanup). Fixture controls and identity data are synthetic. The displayed provisioning password is an unsubmitted locally generated fixture value.

## Shared integration and limits

The strict focus fixtures exposed opener capture problems in shared modal behavior. The parent implemented the central correction: explicit `returnFocusRef` support and inactive opener tracking from pointer/keyboard interaction rather than descendant `focusin`. Guardian needs its explicit trigger ref because the trigger is disabled during the asynchronous preview request. Provisioning now restores its default opener despite its first field's `autoFocus`. Both strict assertions pass on the corrected shared implementation. The parent separately owns the expanded shared-modal regression suite, shared Button icon selector and full application checks.

No real invitations, provisioning, account changes, messages or settings mutations were performed. Every fixture request is intercepted or aborted; provisioning is never submitted. No additional server, global build or global typecheck was started by this batch.

Coverage is complete for the 91-file source inventory and captured preservation contracts. Browser coverage is representative, covering eight actual component families with nine cases plus the parent's sidebar reference checks. This report does not claim visual or behavioral coverage for every console route, every modal state, backend permissions, real delivery, all languages or every domain workflow. Specialized charts, timetable interactions, compound headers and file pickers remain subject to their existing feature tests and the parent's integration validation.
