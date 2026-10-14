# Verification success and redirect aliases — R007–R009, R011

2026-10-08. Owned application scope: `src/app/(auth)/verify-success/page.tsx` only. New fixtures are in `tests/design-system/auth-verification/`. No endpoint, token, query parsing, session, redirect destination, rate limit, email delivery or account-activation code was changed by this slice.

## Actual route and baseline

There is no `verify-email/page.tsx` in the route inventory. Registration step 3 already renders the email instructions. The existing email link targets `src/app/api/auth/verify/route.ts`: source inspection shows that its GET verifies a signed token, activates that account and redirects to `/verify-success` without creating a session. This endpoint was never invoked during these checks.

Initial anonymous navigation showed the existing proxy did not allow `/verify-success` or `/sign-in`. Root owns the narrow public-path correction and its policy regression tests. After that correction, the actual local informational page was available for the UI baseline. This report does not claim ownership of the proxy change.

`baseline-observations.json` and `baseline-{320,1440}.png` record the original UI. At 320×480 the fixed-height, centered scroll pane put the logo at y=-113.25 while its scrollTop was already zero, making top content unreachable. The page had a separate emerald action skin, no primary h1 and no countdown status semantics. Its copy claimed institutional authority, console access and encryption verification that this endpoint does not establish.

## Bounded implementation

The success page now uses normal document scrolling with min-height, a shared `buttonVariants` login link, a primary “Email verified” h1, truthful email-confirmation copy and an atomic status for the existing countdown. Decorative icons are hidden from assistive technology and the direction arrow supports RTL. Mobile spacing is smaller. The original visual asset and quote are retained.

The nonessential Framer scale entrance was removed. The spinner uses `motion-safe:animate-spin`, so the rendered markup is identical on server and client and reduced-motion browsers compute no spinner animation. An intermediate useReducedMotion-dependent initial markup produced an actual React hydration warning and retained the server's spinner class; that attempt was replaced, and the final test checks both computed CSS and absence of hydration warnings.

The five-second timer, interval cleanup, `router.push('/login')` and manual Link destination remain unchanged. Navigating manually to login and then registration does not leave a timer that redirects the user again.

## Read-only alias confirmation

| Existing source | Actual browser behavior |
| --- | --- |
| `src/app/(auth)/register-split/page.tsx` | `/register-split?fixture=1` redirects to `/register`. |
| `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` | Both `/sign-in?fixture=1` and `/sign-in/synthetic/callback?fixture=1` redirect to `/login`. |
| `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` | Both `/sign-up?fixture=1` and `/sign-up/synthetic/callback?fixture=1` redirect to `/register`. |

These aliases use static destinations; the queries and optional catch-all segments are not forwarded. No alias files were changed and no hypothetical route was added.

## Verification

- `npx playwright test --config tests/design-system/auth-verification/playwright.config.ts`: **12 passed** on the final source.
- Focused ESLint for owned registration/verification pages and fixtures: **passed**. `git diff --check` for those paths: **passed**.
- Browser cases cover countdown 5→4→login; keyboard manual login and timer cleanup; content and action reachability at 320×480, 390×844, 768×600 and 1440×900; reduced-motion CSS plus hydration checks; and the five exact alias redirects above.
- `after-{320,390,768,1440}.png` preserve the four resulting layouts. The 320px and 1440px captures were visually inspected. The Next development indicator appears in these local captures and is not production page content.

Every fixture aborts every POST and explicitly aborts `/api/auth/verify`, including GET requests. No real registration, verification, invitation or email action was performed. The page is tested anonymously against the existing local server after root's public-route correction. Backend token validity/errors, activation, mail delivery and all account states remain **UNVERIFIED**. English-only content is preserved; translations, physical device keyboard/autofill, screen-reader behavior, other browser engines, zoom and forced-colors are not certified. Root consolidates the global build/typecheck; this slice ran neither and started no server.

Current AGENTS.md, the route/execution/component plan, and the installed Next accessibility, Server and Client Components, useRouter and redirect guidance were read before the changes.
