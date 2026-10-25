# Accountant audit — 25 October 2026

Independent dev branch. Invoice and payment lists ignore superseded responses, including late failures and loading completion; fast filter changes can no longer replace the current view with stale data/error state. Invoice detail requests also ignore older responses. Payment-method and date filters have accessible names, and From/To dates have visible labels on mobile.

Validation: 4 browser cases passed, with a further mobile-filter recheck after label improvements. Coverage includes Arabic/Urdu keyboard tab navigation, current-load retry, older-failure suppression for both lists, and a real collection whose committed response is lost: retry returned the same receipt with exactly one payment and one ledger entry. 22 finance AI database cases passed (scope, separation of duties, handoffs and no unauthorized money writes). Source TypeScript and targeted lint passed. Earlier real-provider evaluation passed all 9 accountant cases. Reviewed screenshots remain outside git under /tmp/sko497-evidence and /tmp/sko432-evidence.

This audit targets collection/list recovery and finance AI authorization. It does not certify every payroll/tax rule, banking integration or real payment gateway. No real money moved.
