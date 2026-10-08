# FOUNDATION C — scoped modal dismissal and dirty-focus correction

Date: 2026-10-08. Base commit `bcd66035365201e90f9768dcfd612771cceab0aa`; tested working tree includes uncommitted concurrent foundation changes. This is a focused behavioral result, not an app-wide or full FOUNDATION C acceptance claim.

## Scope and result

Changed `src/components/ui/modal.tsx`, `dialog.tsx`, and `confirm-action.tsx`. Added `tests/design-system/modal-foundation.fixture.tsx` and `modal-foundation.spec.ts`. No app route, reference component, global stylesheet, business mutation, authentication, or permission logic was edited by this subtask.

`Modal` and `ModalSurface` now accept optional `dismissible` (default true) and `initialFocusRef`. The compound `DialogContent` forwards both. The shell consistently blocks Escape, backdrop, header-close, compound close, and sheet drag when not dismissible. `ConfirmAction` opts into this policy while busy, initially focuses its Cancel action, and links its description to the alertdialog. Other feature modals must explicitly opt into `dismissible={!busy}` when their operation is noninterruptible; this patch does not claim every existing busy feature has been migrated.

Dirty close requests now open a child `ModalSurface` alertdialog with safe Keep editing focus, a Tab/Shift+Tab loop, top-layer Escape handling, and focus restoration into the original form. Discard clears the prompt and schedules exactly one parent exit. The child reuses stack and refcounted scroll locks and is never dirty, preventing recursive discard prompts. It uses the standard desktop dialog / phone sheet placement, replacing the former untrapped overlay within the parent panel. Existing 180ms exit timing is unchanged. Close timers are cleared on unmount.

The decorative modal backdrop now has `pointer-events-none`, allowing a fresh backdrop press to reach the wrapper's intentional `target === currentTarget` check. A mousedown starting in the form and released outside still does not close the dialog.

## Reproduction and checks

The synthetic fixture bundles the actual three components and compiles the current `globals.css` with the existing Tailwind tooling. It runs real Chromium through installed Playwright 1.62.1 with no backend calls, no authentication, no records, and no persistence. It deliberately omits Next's root layout/font loading. It proves the listed component interactions, not full route integration, native-device safe areas, or branded-font appearance.

Before implementation the first five tests failed as expected: busy confirmation escaped at 390px and 1440px; dirty prompt did not receive focus; nested confirmation focused Close instead of Cancel; compound dialog did not yet support the proposed dismissal policy. The last is a new API acceptance case, not a claim that a current feature already supplied that unsupported prop.

Final commands and results:

```text
npx playwright test --config tests/design-system/playwright.config.ts modal-foundation.spec.ts --reporter=list
8 passed (6.6s)

npx eslint src/components/ui/modal.tsx src/components/ui/dialog.tsx src/components/ui/confirm-action.tsx tests/design-system/modal-foundation.spec.ts tests/design-system/modal-foundation.fixture.tsx
PASS (exit 0)

git diff --check -- src/components/ui/modal.tsx src/components/ui/dialog.tsx src/components/ui/confirm-action.tsx tests/design-system/modal-foundation.spec.ts tests/design-system/modal-foundation.fixture.tsx
PASS (exit 0)
```

| Case | Viewport / direction | Actual result | Status |
|---|---|---|---|
| Busy confirmation: Escape, backdrop, disabled cancel; release then Escape | 390×900 EN/LTR; 1440×900 EN/LTR | Stays open while busy, closes after release, returns focus to trigger | PASS |
| Busy sheet drag | 390×900 EN/LTR | Drag does not dismiss during operation | PASS |
| Dirty prompt: initial focus, reverse/forward Tab, Escape, reopen/discard | 1440×900 EN/LTR | Safe focus; prompt loop; original input/value restored; one close; body scroll restored | PASS |
| Nested confirm | 390×900 `lang=ur`/RTL, English fixture chrome | Cancel receives focus; Escape closes only child; trigger/parent scroll lock preserved | PASS |
| Compound Dialog opt-in | 1440×900 EN/LTR | Escape blocked and close disabled while busy; release enables dismissal | PASS |
| Text selection release outside vs fresh backdrop press | 1440×900 EN/LTR | Release does not close; fresh outside press does | PASS |
| Idle mobile drag | 390×900 EN/LTR | Dismisses and unmounts | PASS |
| Keep editing by click with Urdu input | 390×900 RTL | Prompt closes, input focus and synthetic Urdu draft survive | PASS |

RTL rows verify direction and mixed-script input retention. Their English fixture chrome does **not** count as translated Urdu UI coverage.

## Reviewable screenshots

- `baseline/dirty-prompt.png`: old dirty prompt with focus left on the input.
- `baseline/busy-escaped-phone.png`: confirmation incorrectly gone after busy Escape.
- `after/dirty-prompt.png`: safe action receives focus in a stacked prompt.
- `after/busy-phone.png` and `after/busy-desktop.png`: confirmation remains visible during blocked dismissal.

Interaction assertions and reproduction steps are in the new spec; screenshots alone do not establish focus behavior. The coordinating agent separately captured the actual development-reference Dialog baseline and owns app integration checks, build/type checking, and the overall checklist.

## Remaining acceptance and limitations

- App routes/roles, all modal wrappers, real delayed mutations, date-picker nesting, 639/640 placement transitions, long-content scrolling, and tablet integration remain **UNVERIFIED** for this subtask.
- Background inert/virtual-cursor isolation is not implemented by this patch. The existing trap handles Tab; screen-reader behavior and background programmatic focus require their own focused acceptance and possible inert manager.
- Existing internal English close/discard/confirmation strings were preserved. Arabic/Urdu translated chrome and label defaults remain **UNVERIFIED**; no translation catalog was edited without coordination.
- Safari/WebKit, Firefox, touch-device gestures, screen readers, software keyboard, real safe-area hardware, and normal-motion exit visuals remain **UNVERIFIED**. The suite uses Chromium with the configured reduced-motion preference and synthetic mouse pointer drag.
- No new generic Drawer, Menu, Popover, portal focus-branch infrastructure, or default positioning change was introduced.
