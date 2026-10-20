# First-login guide and campus launch

The shared guide introduces all eleven roles, explains preparation and review, and launches a permitted first workflow. Welcome acknowledgement is separate from institution/profile completion. Replay preserves saved setup.

Institution activation opens campus AI setup. Groups choose a campus explicitly; campus users remain scoped to their assignment. Existing interviews resume even when older than the default workspace page. Teacher profile and password completion retain priority.

The character walks in, continues gesturing and responds to Say hello. Shared brand tokens, the canonical wordmark and Button controls serve onboarding and the public `/showcase` presentation. The showcase cycles three scenes, supports browser full screen, pause/manual advance, and contains no account details or setup writes. Arabic and Urdu use `?lang=ar` and `?lang=ur`. Reduced motion disables animation and autoplay.

## Deployment

Migration `20261020150000_role_launch_guide` adds nullable `users.welcome_completed_at`. Existing accounts without acknowledgement see the guide on their next eligible landing page. Password, exam and deep-linked tasks are not intercepted.

On 20 October 2026, `prisma migrate deploy` successfully applied both pending migrations (`20261020020000_setup_generation_requests` and `20261020150000_role_launch_guide`) to the configured Supabase database. Its older `20260730000000_baseline` history entry was preserved. Fresh environments must also apply the repository migrations before deploying this code.

## Verification on 20 October 2026

- 13 browser tests passed, covering every role, campus isolation/resume, activation, replay, failed-save recovery, motion/pause, full screen, showcase loops, unsigned registration entry, focus and EN/AR/UR phone/desktop layouts.
- 16 onboarding unit tests and 5 design-system checks passed.
- Next route type generation, TypeScript, targeted ESLint and whitespace checks passed.
- Existing prototype generation regression: 2 passed; live-provider recovery skipped because this isolated run had no AI key.

Run `npm run test:onboarding`, `npm run check:ui`, and `npm run test:onboarding:launch`. Browser acceptance requires the isolated database and local server specified in the browser test/config. Set `ONBOARDING_RECORD_VIDEO=1` only when recordings are needed. Generated screenshots/videos stay in ignored `test-results/`.

Recordings, screenshots and detailed acceptance notes are attached to [SKO-397](https://linear.app/skoolee-ai-app/issue/SKO-397), with shared UI evidence on [SKO-379](https://linear.app/skoolee-ai-app/issue/SKO-379). Redundant local captures and logs are excluded from the source commit.
