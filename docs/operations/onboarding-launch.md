# First-login guide and campus launch

The shared guide introduces all eleven roles, explains preparation and review, and launches a permitted first workflow. Welcome acknowledgement is separate from institution/profile completion. Replay preserves saved setup.

Each role has its own welcome, preparation, three-scene narrative and next-step framing in English, Arabic and Urdu. Students see learning, parents see linked family records, teachers see teaching preparation, and school leaders see their own operational or academic responsibilities. Finance, library, reception and platform roles have distinct narratives too. The shared animated character changes outfit, accessories and task props for the role, including its planning tablet and ready-state symbol. These are illustrations of the person's work, not inferred personal appearance or fabricated account progress.

The private demonstration retains that role's narrative and character without displaying account identity. The public showcase retains the general product presentation. The same character follows teachers into profile setup and leaders into institution/campus setup. Role presentation never grants access; the server-filtered workflow choices remain authoritative.

Institution activation opens campus AI setup. Groups choose a campus explicitly; campus users remain scoped to their assignment. Existing interviews resume even when older than the default workspace page. Teacher profile and password completion retain priority.

The character stays mounted while changing from a welcoming wave to writing on a tablet and presenting the launch. Narration, cards and background details change with each scene. Say hello is temporary and never overrides a later chapter. Shared brand tokens, the canonical wordmark and Button controls serve onboarding and the public `/showcase` presentation. The showcase plays three scenes once, ends with a next-step action, and offers Watch again. Exhibition loop is an explicit opt-in for display stands. It supports browser full screen and pause/manual advance, and contains no account details or setup writes. The shared viewport frame keeps the stage and footer controls visible while long text scrolls separately; focus changes do not scroll the outer surface. At extreme zoom/short heights, it becomes a readable scrolling document. The shared Button hover no longer moves the pointer target, fixing a repeat-hover loop after error layout changes. Arabic and Urdu use `?lang=ar` and `?lang=ur`. Reduced motion disables animation and autoplay.

## From welcome to useful work

1. Owners complete institution details and create their first campus; activation continues to `/ai?setup=1`. Invited staff follow their assigned campus and permissions. Students and families open their own dashboard, not institution creation.
2. Campus leaders choose **Guide my campus setup with AI** to start or resume the interview. Answers are saved per campus. Finish the interview to prepare draft plans, open the results and review them before using approval/apply actions.
3. **Explore AI workflows** opens `/ai?workflow=overview`. The launch center shows setup instructions, available tools, prerequisites and saved progress. Expand **Explore all available workflows** for the complete permitted list. Each card opens its actual workspace; e.g. `/ai?workflow=academicSetup` opens academic setup.
4. Missing campus or teacher subject assignments explain what is needed. Read-only accounts can inspect permitted workspaces; creation stays disabled. Students and parents are not given staff AI authoring access.
5. Live AI availability is explicit. Without a configured provider, saved work and forms remain available; setup can prepare clearly labelled starter drafts. That fallback is not evidence of live-provider generation.

The guide opens on the private showcase by default; "Return to my guide" (or Escape) leads into the personal chapters, and finishing the showcase lands on the workflow chooser. Both wear the Front Desk look of sign-in and registration: the stage is the shared plum ink cover (`.sk-ink-cover`) with the masthead, a spotlit cameo, letterhead scene cards and the embossed seal, and the story uses the shared editorial heading (`InkHeading`, `.sk-ink-heading`) with the berry swash, dot-leader feature index and folio chapters.

The embedded private showcase ends at the workflow chooser. The standalone `/showcase` resolves its continuation from the current session: existing accounts return to their personal onboarding or workspace; confirmed guests may register. The button rechecks the session when clicked, respects mandatory password/setup and suspension recovery, and sends expired or lost member sessions to sign-in. If a student starts an exam in another tab, continuation follows the active-exam boundary back to the candidate room. A failed continuation request shows retry rather than falling through to registration. Closing a saved interview removes the old setup intent, so changing campus does not unexpectedly reopen it. Explicit workflow links take precedence over stale setup links. Invalid or forbidden workflow links return to the permitted chooser.

## Deployment

Migration `20261020150000_role_launch_guide` adds nullable `users.welcome_completed_at`. Existing accounts without acknowledgement see the guide on their next eligible landing page. Password, exam and deep-linked tasks are not intercepted.

On 20 October 2026, `prisma migrate deploy` successfully applied both pending migrations (`20261020020000_setup_generation_requests` and `20261020150000_role_launch_guide`) to the configured Supabase database. Its older `20260730000000_baseline` history entry was preserved. Fresh environments must also apply the repository migrations before deploying this code.

## Verification on 20 October 2026

- 20 browser tests passed, covering every role, campus isolation/resume, activation, real workflow discovery/deep links, read-only scope, saved setup, replay, failed-save retry without pointer movement, motion/pause, full screen, finite completion and optional exhibition loops, unsigned registration entry, keyboard focus and EN/AR/UR layouts. Explicit short-screen coverage includes 1280×720, 1024×600, 390×667 and a 320×256 high-zoom fallback.
- 11 additional showcase-entry browser tests passed: current-account onboarding/workspace destinations, password and suspension priority, expired/revoked sessions (including the student proxy boundary), sign-in/out in another tab, failure/retry and genuine guest registration. The active-exam handoff test checks the existing 409 response/navigation contract with a mocked response; it does not create an exam attempt.
- 17 additional browser scenarios passed using password login and browser-driven MFA for all eleven roles, including new institution-owner and teacher setup routes. Coverage includes automatic launch on the default overview query, an 11.5-second welcome response, initial-load retry, preserved workflow links and persisted welcome acknowledgement. The full campus interview confirmed 17 answers, saved nine prototype drafts and opened academic setup. The combined run passed 47 scenarios; a response-body diagnostic in the remaining test was corrected and its rerun passed, alongside the strengthened owner/teacher cases (48 distinct passing scenarios overall).
- 17 onboarding unit tests and 5 design-system checks passed.
- Next route type generation, TypeScript, targeted ESLint and whitespace checks passed.
- Existing prototype generation regression: 2 passed; live-provider recovery skipped because this isolated run had no AI key.
- Manual verification in the existing authenticated Supabase campus-admin session confirmed automatic launch on `/admin?view=overview`, welcome acknowledgement, the AI workflow launch center and resumed campus interview. Actual account setup answers were preserved. Automated password/MFA and draft-generation tests use the isolated local database, not Supabase user records.

Default dashboard, supported language and campaign query parameters permit automatic welcome launch. Explicit task links keep priority. Slow welcome requests have a 30-second timeout and a visible retry instead of silently hiding the guide; acknowledgement uses the same timeout. These changes require no additional migration.

Run `npm run test:onboarding`, `npm run check:ui`, and `npm run test:onboarding:launch`. Browser acceptance requires the isolated database and local server specified in the browser test/config. Set `ONBOARDING_RECORD_VIDEO=1` only when recordings are needed. Generated screenshots/videos stay in ignored `test-results/`.

## Role personalization verification

- 19 role-personalization browser scenarios passed across the main run and targeted rechecks: all eleven role stories, greetings, changing scenes, private showcase and replay; distinct accessory geometry for every role; parent/student phone layouts in EN/AR/UR; and the generic public showcase. The admin recheck followed a wording change during the initial run.
- All 48 existing browser regressions passed again with personalized title/character assertions and companion continuity through owner, teacher and campus setup. Combined coverage is 67 distinct passing browser scenarios. Password/MFA, campus prototype drafts, session boundaries, motion, pause and replay remained covered.
- 18 onboarding unit tests, 5 shared UI checks, TypeScript and targeted ESLint passed.
- Role characters were visually checked together and in wave, planning and ready poses. Captures include five role welcomes and twelve localized phone views.

The main launch browser command includes these scenarios. To run only role personalization, use `npx playwright test --config tests/onboarding/role-persona.config.ts`. The same isolated database guard applies. This change has no database migration.

Recordings, screenshots and detailed acceptance notes are attached to [SKO-397](https://linear.app/skoolee-ai-app/issue/SKO-397), with shared UI evidence on [SKO-379](https://linear.app/skoolee-ai-app/issue/SKO-379). Redundant local captures and logs are excluded from the source commit.
