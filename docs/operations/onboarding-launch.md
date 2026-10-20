# First-login guide and campus launch

The shared guide introduces all eleven roles, explains preparation and review, and launches a permitted first workflow. Welcome acknowledgement is separate from institution/profile completion. Replay preserves saved setup.

Institution activation opens campus AI setup. Groups choose a campus explicitly; campus users remain scoped to their assignment. Existing interviews resume even when older than the default workspace page. Teacher profile and password completion retain priority.

The character stays mounted while changing from a welcoming wave to writing on a tablet and presenting the launch. Narration, cards and background details change with each scene. Say hello is temporary and never overrides a later chapter. Shared brand tokens, the canonical wordmark and Button controls serve onboarding and the public `/showcase` presentation. The showcase plays three scenes once, ends with a next-step action, and offers Watch again. Exhibition loop is an explicit opt-in for display stands. It supports browser full screen and pause/manual advance, and contains no account details or setup writes. The shared viewport frame keeps the stage and footer controls visible while long text scrolls separately; focus changes do not scroll the outer surface. At extreme zoom/short heights, it becomes a readable scrolling document. The shared Button hover no longer moves the pointer target, fixing a repeat-hover loop after error layout changes. Arabic and Urdu use `?lang=ar` and `?lang=ur`. Reduced motion disables animation and autoplay.

## From welcome to useful work

1. Owners complete institution details and create their first campus; activation continues to `/ai?setup=1`. Invited staff follow their assigned campus and permissions. Students and families open their own dashboard, not institution creation.
2. Campus leaders choose **Guide my campus setup with AI** to start or resume the interview. Answers are saved per campus. Finish the interview to prepare draft plans, open the results and review them before using approval/apply actions.
3. **Explore AI workflows** opens `/ai?workflow=overview`. The launch center shows setup instructions, available tools, prerequisites and saved progress. Expand **Explore all available workflows** for the complete permitted list. Each card opens its actual workspace; e.g. `/ai?workflow=academicSetup` opens academic setup.
4. Missing campus or teacher subject assignments explain what is needed. Read-only accounts can inspect permitted workspaces; creation stays disabled. Students and parents are not given staff AI authoring access.
5. Live AI availability is explicit. Without a configured provider, saved work and forms remain available; setup can prepare clearly labelled starter drafts. That fallback is not evidence of live-provider generation.

The private showcase ends at the workflow chooser; the public showcase ends at registration. Closing a saved interview removes the old setup intent, so changing campus does not unexpectedly reopen it. Explicit workflow links take precedence over stale setup links. Invalid or forbidden workflow links return to the permitted chooser.

## Deployment

Migration `20261020150000_role_launch_guide` adds nullable `users.welcome_completed_at`. Existing accounts without acknowledgement see the guide on their next eligible landing page. Password, exam and deep-linked tasks are not intercepted.

On 20 October 2026, `prisma migrate deploy` successfully applied both pending migrations (`20261020020000_setup_generation_requests` and `20261020150000_role_launch_guide`) to the configured Supabase database. Its older `20260730000000_baseline` history entry was preserved. Fresh environments must also apply the repository migrations before deploying this code.

## Verification on 20 October 2026

- 20 browser tests passed, covering every role, campus isolation/resume, activation, real workflow discovery/deep links, read-only scope, saved setup, replay, failed-save retry without pointer movement, motion/pause, full screen, finite completion and optional exhibition loops, unsigned registration entry, keyboard focus and EN/AR/UR layouts. Explicit short-screen coverage includes 1280×720, 1024×600, 390×667 and a 320×256 high-zoom fallback.
- 16 onboarding unit tests and 5 design-system checks passed.
- Next route type generation, TypeScript, targeted ESLint and whitespace checks passed.
- Existing prototype generation regression: 2 passed; live-provider recovery skipped because this isolated run had no AI key.

Run `npm run test:onboarding`, `npm run check:ui`, and `npm run test:onboarding:launch`. Browser acceptance requires the isolated database and local server specified in the browser test/config. Set `ONBOARDING_RECORD_VIDEO=1` only when recordings are needed. Generated screenshots/videos stay in ignored `test-results/`.

Recordings, screenshots and detailed acceptance notes are attached to [SKO-397](https://linear.app/skoolee-ai-app/issue/SKO-397), with shared UI evidence on [SKO-379](https://linear.app/skoolee-ai-app/issue/SKO-379). Redundant local captures and logs are excluded from the source commit.
