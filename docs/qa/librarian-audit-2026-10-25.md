# Librarian audit — 25 October 2026

Independent dev branch. Failed initial desk loads now have loading feedback and an explicit retry that clears the failure on recovery. Older overview responses are ignored. If a completed issue/renew/return/lost action is followed by a reader-refresh failure, its saved receipt remains visible, stale reader actions are removed, and the librarian is told to scan the card again. Narrow scan/return fields now fit 320px screens.

Validation: all 10 library browser/database cases passed: scan/issue/return and replay, failed initial load/retry, saved issue plus failed refresh, copy uniqueness, two desks competing for one copy, limits, rule versions, closure/grace/capped fines, waiver permissions, reservation order, renewal restrictions, lost copies and fees handoff. Nine desk/library AI database cases passed; all 10 librarian cases passed in the earlier live-provider baseline. Source TypeScript and targeted lint passed. English desktop, Arabic 390px and recovery at 320px were captured; reviewed evidence is under /tmp/sko436-evidence and excluded from git.

The waiver fixture now uses the campus operations seat, matching current policy; no role grants changed. Hardware scanners/printers and external fees settlement were not exercised. This is a focused desk audit, not certification of every library configuration.
