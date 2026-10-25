# Student audit — 25 October 2026

Independent dev branch. Removed the unscoped persistent Today cache: another learner's shared-device data can no longer be restored after a failed request. A last good copy exists only in the mounted identity-scoped page; legacy local storage is deleted. Authorization failures clear cached work and next actions. Exam locks clear the copy. Superseded responses cannot replace a newer day, and unmount clears the page's reported next action.

Validation: all 5 Today browser/API cases passed: own released work, extensions, actual submission, closed work, school-day/holiday behavior, source deep links, unavailable tasks, offline refresh within the same page, Arabic mobile, legacy-copy isolation, refusal clearing and active-exam boundary. 13 family/student AI tests passed; the earlier live baseline passed all 9 student cases. Source TypeScript and targeted lint passed. Screenshots reviewed under /tmp/sko418-evidence, excluded from git.

Offline behavior is intentionally limited to a currently mounted page after a temporary network/server failure. Private learner work is no longer retained across reloads/sign-ins. This audit does not certify every exam delivery mode or external integration.
