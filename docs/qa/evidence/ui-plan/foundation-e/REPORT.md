# FOUNDATION E — feedback and mobile shell foundation

## Baseline recorded before implementation

Scope: one shared application toaster, its global visual contract, synthetic development examples/tests, and the missing mobile safe-area utility. Remaining shell/navigation/chat cases require their own integration checks.

The development application reference now has local-only success/error toast triggers and a dialog with a toast trigger. No backend requests or record mutations are involved. In the Codex browser at 1440×1000, triggering a success toast produced `data-type="success"` but computed background `rgba(255,255,255,.96)`, border `rgba(207,194,214,.4)` and text `rgb(31,26,35)`. Root layout inline styles override Sonner's rich-color appearance; the global important neutral border also overrides status borders. The global status variable selector uses `data-theme`, whereas the installed Sonner stylesheet uses `data-sonner-theme`.

Source observation: RoleSidebar uses `safe-area-pb`, but no such utility exists. This is not evidence of a real mobile-device safe-area test.

Proposed change: extract the single root configuration into AppToaster, consolidate presentation in CSS, allow installed Sonner status rules to own their status colors, correct the theme attribute selector, and define the already-referenced safe-area utility while preserving its existing 4px padding at zero inset.

Invariants: one toaster, bottom-center placement, three visible toasts, 5000ms default duration, current mobile offset, localized caller-authored messages, modal close/focus/stack policy, navigation destinations, all business behavior. Validate success/error appearance and modal footer accessibility at phone/desktop; record any overlap rather than assuming centering solves it. Native device keyboard/safe area, chat coexistence and role-specific shells remain unverified until separately exercised.

## Results

Implemented the shared AppToaster, CSS consolidation/status palette repair, the existing safe-area utility and toast clearance through the role navigation breakpoint. See [focused results](APP_TOASTER_REPORT.md) for 8 passing browser checks, computed colors/contrast and remaining body-overlap/accessibility/device gaps. The integrated suite passed all 46 browser cases; root typecheck, targeted lint and production build passed. Real shell/chat acceptance remains outstanding.
