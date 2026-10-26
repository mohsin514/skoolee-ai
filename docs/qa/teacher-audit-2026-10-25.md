# Teacher audit — 25 October 2026

Independent dev branch. Failed attendance lookups no longer masquerade as an unmarked day: an accessible localized retry state replaces the check-in action until the status is known. The attendance query, fallback clock and next-register lesson ordering now use school time, including midnight and daylight saving changes. Superseded lookups cannot update the page.

Validation: 5 browser/time regressions passed, covering desktop and phone scope, English/Arabic singular/plural counts, failed attendance recovery, midnight and daylight saving. 37 database-backed AI teacher tests passed across attendance, assessment, teaching and staff workflows, including confirmation, replay, scope denial and handoffs. Source TypeScript and targeted lint passed. The earlier cross-role real-provider baseline passed all 21 teacher cases. Evidence under /tmp/sko479-evidence is excluded from git. The browser fixture now preserves MFA sessions and checks the current mobile scope line rather than a deliberately hidden desktop badge.

The teacher's expected responsibilities remain assigned-class register, work/assessment, feedback and staff requests. This focused audit does not certify every exam delivery mode or external notification provider; no real school data or outbound messages were used.
