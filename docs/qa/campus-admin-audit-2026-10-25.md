# Campus admin functional audit — 25 October 2026

Independent branch against dev. Synthetic PostgreSQL fixtures and a local browser were used; outbound delivery was disabled.

## Fixed
- Class settings now portal above the parent surface. Previously the apparent drawer could not receive pointer input.
- A rejected class save keeps the entered values and drawer open; retry persists the change without a false success toast.
- Concurrent section transfers retry serializable transaction conflicts and move each student once.
- Institution edit/archive requests survive asynchronous data loading and are consumed once.
- Explicit campus class-count questions in English, Arabic and Urdu execute a campus-scoped database read, including only active, unarchived classes.
- Quoted announcement bodies remain literal data. Embedded requests cannot introduce leave, fee or setup actions, including after clarification. Missing delivery details remain questions and sending still requires confirmation.

## Validation
- 12 distinct class browser cases passed (10 in the full run plus the two corrected selector/assertion rechecks). These cover create/edit, rejected-save retry, impact/transfer, concurrent replay, scoped teacher access, keyboard focus, EN/AR/UR and 320/390/768/1440 viewports.
- All 5 institution browser cases passed, including history, rejected saves, archive blockers and Arabic mobile.
- AI database suite: 202 passed initially; the previous unverified-answer test used the newly supported explicit count question. Its input was changed to an unsupported qualitative comparison and the assertion remains refusal. That case and the new campus cases passed on recheck (203 distinct cases).
- Two pure intent regression tests passed. Six previously failing live-provider campus cases passed: three class counts and three adversarial quoted announcements. Zero unauthorized writes and zero PII egress in those cases.
- Source TypeScript, targeted ESLint and capability inventory passed. Inventory still reports 660 unconnected capabilities and 29 handlers awaiting classification; these are not claimed implemented by this audit.
- Browser evidence is generated under /tmp/sko462-evidence and /tmp/sko402-evidence and is intentionally excluded from git.

## Limits
This is a focused functional regression audit, not certification of every product action. The cross-role live baseline was 106 cases, with 93.4% recall; remaining owner routing and generic model-format failures require follow-up. Real email/SMS, payment gateways and SSO were not exercised. No real school records were used.
