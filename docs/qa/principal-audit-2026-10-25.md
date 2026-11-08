# Principal audit — 25 October 2026

Independent dev branch. Fixed zero scores being omitted from class averages and graded counts. Unavailable/nonfinite marks remain excluded. Fixed the AI repair prompt's missing schema/context; repairs now receive the full output schema and the already-masked request, without relaxing capability or evidence checks or spending a second credit.

Validation: 9 action-queue browser/API cases passed (academic versus operations seats, assignment, snooze, history, source resolution, foreign-campus/teacher denial, English desktop and Arabic phone). 34 focused metric, queue and AI-planner tests passed. Source TypeScript and targeted lint passed. Two live AI cases that previously intermittently failed (Urdu admission and Arabic report approval) passed, with zero unauthorized writes or PII egress. Screenshots were reviewed under /tmp/sko417-evidence and are excluded from git.

Remaining product responsibilities include attendance oversight, teacher leave, current report-version review and academic follow-up; tested queues preserve those boundaries. This is a focused regression audit, not every possible academic workflow. Real delivery/payment integrations were not invoked. AI capability inventory gaps remain tracked separately.
