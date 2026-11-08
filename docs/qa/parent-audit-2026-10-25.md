# Parent audit — 25 October 2026

Independent dev branch. Parent child selection now follows client-side student query changes in a persistent layout (including payment returns). Inbox network failures are caught, clear stale child actions and offer retry; late responses and unmount cannot restore obsolete actions. Retired portal-token parameters no longer change an authenticated inbox's scope, and anonymous legacy links remain denied.

Validation: 6 browser/API cases passed across sibling campuses and per-child permissions, co-guardian deduplication, explanation/clarification/review, retired tokens, child deep links, query navigation, network failure/retry, desktop and Arabic phone. 10 family/parent AI database cases passed; all 9 parent cases passed in the earlier real-provider baseline. Source TypeScript and targeted lint passed. Reviewed screenshots are under /tmp/sko419-evidence and excluded from git.

The old fixture incorrectly expected anonymous portal links to work after their retirement; it now asserts refusal. Its reviewer now uses the campus operations seat with attendance edit permission, rather than the principal's view-only default. No role permissions were expanded. This is focused validation of family requests and scope, not certification of external payment or delivery providers.
