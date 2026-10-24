# Exam Studio robot introduction — integrated browser verification

2026-10-15. Six Playwright cases passed in 12.9 seconds against the existing local application at port 3106 and isolated PostgreSQL at port 55438. The suite uses freshly created synthetic school, staff and learner records, fresh authenticated sessions, real `/ai/studio` and `/ai/exams/[id]` routes, and removes only its own fixtures. No development-server rebuild or shared-fixture reset was performed. The existing `exam-studio-intro.browser.spec.ts` probe suite was preserved.

| Case | Observed result |
| --- | --- |
| Normal motion | Real robot SVG and two rings; visible painted frames; opacity and transform progression; 1100.7 ms from overlay insertion to removal, below the 1800 ms ceiling; decorative markup has no focusable descendants. |
| Pointer skip | Native pointer input removed the visible overlay before the input finished propagating; total overlay lifetime 104.7 ms. |
| Keyboard, wheel, scroll | Native keyboard and wheel input, and a native scroll on the real short-viewport scrolling surface, removed the visible overlay in the same event; lifetimes 113.4, 135.0 and 116.7 ms. These values are total overlay lifetime, not input latency. |
| Reduced motion | Static DOM branch only, zero rings, no transforms or running animations, 4.9 ms lifetime. The static frame was removed during the shell's initial permission check, so this run does not claim that the brief mark was visibly painted. No animated branch was observed. |
| Session isolation | Reload and an interactive Evidence action did not replay the same user's intro. A second authenticated staff account in the same browser tab received its own intro and separate session-storage key. |
| Active exam | A real student attempt mounted no intro. Selecting an answer saved successfully to the server and persisted the expected response in the isolated database. |

Implementation: `tests/school-ai/exam-studio-intro-integrated.browser.spec.ts`. JSON timing/frame/event evidence is saved in `test-results/school-ai/intro-integrated-verified/` under each test's directory. Targeted ESLint passed. These are local Chromium integration checks, not production deployment or cross-browser certification.

The harness waits for actual overlay visibility before motion/input checks because `RoleShell` initially hides content while resolving navigation permissions. Earlier harness attempts used window scrolling or the nearest overflow container before that container became visible; the final passing run operates on the visible, scrollable ancestor. No application code change was required by this validation.
