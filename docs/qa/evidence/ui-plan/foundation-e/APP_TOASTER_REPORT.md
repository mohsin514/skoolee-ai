# FOUNDATION E — root toast extraction and focused feedback checks

Date: 2026-10-08. Base commit `bcd66035365201e90f9768dcfd612771cceab0aa`; tested shared working tree includes concurrent foundation changes. This is a focused component/integration result, not full app acceptance.

## Changes and ownership

Added `src/components/ui/app-toaster.tsx` and `tests/design-system/app-toaster.spec.ts`. The coordinating agent integrated the component into `src/app/layout.tsx`, corrected/consolidated its visual rules in `src/app/globals.css`, and added synthetic controls to `ApplicationPatternsReference.tsx`.

The shared component preserves bottom-center position, three visible notifications, default duration 5000ms, rich colors, and a close button. It has one `skoolee-toast` class with CSS-owned visuals; no inline font, color, radius, or shadow configuration. Its mobile offset remains `calc(74px + env(safe-area-inset-bottom, 0px))`. The coordinating CSS extends bottom clearance through 767px to match the role navigation breakpoint; Sonner's own mobile breakpoint ends at 600px.

The root toaster is outside page LocaleProviders. `useSyncExternalStore` observes document `lang`/`dir` attributes, which the existing LocaleRoot updates. A stable EN/LTR server snapshot matches the existing root document and avoids a new provider/fetch. Arabic and Urdu notification-region and close-button labels are local to this component; the observer is disconnected on unmount. Existing toast message content continues to come from callers.

## Browser checks

The spec runs installed Chromium/Playwright against the actual development app at `http://localhost:3000/design-system?patterns=application`, including the real root font, stylesheet, toaster, and modal. Only synthetic feedback buttons are used; no authentication, record changes, or persistence. Shared Playwright configuration requests reduced motion.

```text
TEST_BASE_URL=http://localhost:3000 npx playwright test --config tests/design-system/playwright.config.ts app-toaster.spec.ts --reporter=list
8 passed (8.7s)

npx eslint src/components/ui/app-toaster.tsx tests/design-system/app-toaster.spec.ts
PASS (exit 0)

git diff --check -- src/components/ui/app-toaster.tsx tests/design-system/app-toaster.spec.ts
PASS (exit 0)
```

The sandbox initially blocked Chromium launch with a Mach port permission error. The authorized local browser check succeeded with process escalation. The first launched run passed six cases; two locale cases used an incorrect visibility assertion on Sonner's zero-size containing section. The final tests check presence of the named accessibility region and visibility of its fixed-position toast separately. No product change was needed for that test correction.

| Check | Evidence | Result |
|---|---|---|
| Single root toaster | One `[data-sonner-toaster]` when showing success | PASS |
| Success status | Computed background `#ecfdf5`, border `#10b981`, text `#065f46`; foreground/background contrast 7.29:1 | PASS |
| Error status | Computed background `#fef2f2`, border `#ef4444`, text `#991b1b`; foreground/background contrast 7.60:1 | PASS |
| Keyboard dismissal | Focus success close button and press Enter; notification removed | PASS |
| Modal coexistence | At 390, 601, 767, 768, and 1440px widths (900px height), footer center is topmost by hit testing and a real click closes the dialog | PASS |
| Bottom clearance | Computed toaster bottom at least 74px below 768px; at least 24px from 768px | PASS |
| Pointer dismissal | Close remaining toast after dialog exit; notification removed at all five widths | PASS |
| Arabic/Urdu document contract | Change HTML attributes to each locale/RTL; named region and localized close button update; close works; EN/LTR restoration updates direction/label | PASS |

Color contrast uses actual computed RGB values and the standard sRGB luminance formula. It verifies notification foreground on notification background, not every border/icon/focus-ring pairing. Synthetic feedback fixtures deliberately override duration to 15000ms for inspection, so these tests do not verify the production default's automatic timeout.

## Visual evidence

Saved under `app-toaster/` beside this report:

- `error-palette.png`
- `dialog-toast-390.png`
- `dialog-toast-601.png`
- `dialog-toast-767.png`
- `dialog-toast-768.png`
- `dialog-toast-1440.png`

Phone and desktop screenshots were inspected. At 390px the notification occupies part of the modal body while its footer remains usable; this is not a claim that all modal content stays unobscured. The development server indicator also appears in screenshots and is not production UI. Primary evidence for footer access is hit testing plus a successful real click, rather than screenshots alone.

## Remaining acceptance and limitations

- Locale tests reproduce LocaleRoot's HTML-attribute contract. They are not login/role navigation tests and do not translate the English reference page or example message body. The page's local RTL toggle only affects its main element and intentionally is not treated as root locale state.
- Actual phone safe-area values, native screen readers/live announcements, three-toast stacking, long translated toast bodies, automatic timeout/pause behavior, normal-motion animation, and Safari/Firefox are **UNVERIFIED**.
- Keyboard navigation from an open trapped modal to the independently mounted notification is **UNVERIFIED**. This change does not add toast branches to modal focus containment or change the existing background-inert gap.
- Toast close-target size, general body-content overlap, dark-theme feedback, and all real callers remain separate acceptance items. The scope preserves current sizing/theme behavior.
- The coordinating agent owns repository-wide type/build checks and final cross-foundation verification.
