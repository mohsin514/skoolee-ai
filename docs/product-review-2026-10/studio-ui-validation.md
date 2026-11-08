# Exam Studio UI implementation and validation

As of 15 October 2026. This is an implementation slice of SKO-408, not completion of the complete proposed assessment product.

## Implemented surfaces

- `/ai/studio`: authorized staff shell with real campus/teacher scope, actual evidence/paper counts and records, and links to the existing evidence, curriculum and paper editors, session planning, revision history, exam delivery and results workflows. Operational SchoolAI panels are excluded from this shell. Its language follows the existing EN/AR/UR locale.
- Studio introduction: existing four-phase animation retains the brand palette and Sparkles accent, adds the installed Lucide robot outline, skips on input, respects reduced motion, and is suppressed after the first entry per user/browser session. It does not mount in an active candidate attempt.
- Candidate preflight: explicit required-camera disclosure, retention and consent; actual browser camera preview with no audio; readiness and the live stream must both pass before the required-camera start action. The same prepared stream is handed to the existing private clip recorder after the server creates the attempt.
- Candidate room: compact live preview, recording state and stop action remain visible. Privacy, retention and saved clips are expandable. A stopped/unavailable required camera displays a visible recovery action; answer entry, server save and submission remain available. A reload requires fresh sharing consent. The recorder and player use a monotonic elapsed-time clock anchored to server time. Returning from a hidden page rechecks server time without replacing answers.
- Staff recording choices: require-camera option enables the camera policy; disabling recording/camera also removes that requirement. The server freezes choices after the first attempt.
- Learner accommodations: individual camera exception with the existing approval reason and authorization workflow, before the learner starts. It does not change the whole class policy.
- Candidate navigation guard: fresh authenticated session checks on path/history/pageshow/focus/visibility and cross-tab session-change notifications return other Skoolee routes to the active exam. It does not reload the correct active room or patch global fetch. Server authorization remains decisive. No browser/OS lockdown claim is made.

## Verified browser flows

Isolated PostgreSQL on localhost:55438; development server on localhost:3106; synthetic users, answers and canvas video only. No real pupil media or remote model call was used.

Passed 19 distinct cases across the following suites:

- `exam-studio-shell.browser.spec.ts` — 5: real evidence and paper editors; unsaved source guard, real source persistence and reload; workspace 503/retry; Arabic and Urdu navigation at 320px; student denial from staff Studio.
- `exam-camera-required.browser.spec.ts` — 8: explicit consent and one-stream handoff; question focus/review markers/progress and answer save/submission after camera loss; denied camera blocks timer and recovers; reload preserves saved answers and asks for camera sharing again; staff policy and approved individual alternative; Arabic and Urdu preflight and active room at 320px; initial and mid-attempt ±1-hour device-clock changes preserve remaining time, recording and save behavior; native browser Back and an already-open second tab return to the active exam and require fresh sharing after a document reload.
- `exam-proctor.browser.spec.ts` — 6: optional capture never opens automatically; real encoded private video clip playback, review and deletion; screen revocation/submission cleanup; permission denial leaves answers usable; Arabic and Urdu optional recording at 360px.

The cached-history issue was diagnosed and fixed: Next development mode overwrote document `no-store` with `no-cache`, allowing the browser to reuse a consumed development bootstrap identifier. Production history navigation passed with document `no-store`; the development boundary now uses a fresh resume query. The permanent camera/history case passes against development as well. Cross-document traversal was not cancellable in the tested browser, so no Navigation API cancellation or history manipulation remains in the client guard.

Targeted ESLint, `npx tsc --noEmit`, and `npm run check:ui` (3 checks) passed before the isolated production build started. The subsequent monotonic-clock change passed all 8 required-camera browser cases; the root task owns the final build/typecheck. These are bounded checks, not a complete 90-route matrix pass.

## Visual evidence

- `test-results/school-ai/studio-home-en.png` — staff desktop Studio.
- `test-results/school-ai/studio-home-ar.png` and `studio-home-ur.png` — 320px Studio navigation.
- `test-results/school-ai/exam-room-en.png` — focus, review and saved answers.
- `test-results/school-ai/exam-room-ar.png` and `exam-room-ur.png` — compact camera and candidate room at 320px.
- `test-results/school-ai/exam-preflight-ar.png` and `exam-preflight-ur.png` — required-camera disclosure and readiness at 320px.

The capture tests exercise browser MediaStream/MediaRecorder with synthetic canvas tracks and actual private storage. Real device/browser permission variations, Safari/Firefox, assistive-technology review, and native Arabic/Urdu editorial review remain release checks. The camera signal is not hardware attestation or evidence of misconduct. Nothing automatically changes grades.


Root follow-up: the telemetry hook now uses the same server-aligned monotonic clock for observation timestamps and a monotonic debounce clock. The wall-clock regression also verifies `CAMERA_STARTED` and focus observations are accepted through initial and mid-attempt clock changes. That focused case passed against the development server before the final production build.
