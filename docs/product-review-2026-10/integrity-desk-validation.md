# Integrity review desk validation

15 October 2026, local development server on port 3106 and isolated PostgreSQL on port 55438. The browser fixtures created unique synthetic schools and removed only those schools afterward; existing browser fixtures were not reset. This is local evidence, not staging, school acceptance or real-device camera certification.

Independent review found and fixed four recovery issues in the newly added desk:

- Selected review state was derived from the current paginated list. Refreshing from a selected older-page event removed the form and hid its unsaved draft. The selected observation now has its own snapshot until explicitly closed or saved.
- A concurrent review returned 409 while preserving text but provided no usable path to compare the latest version. The desk now shows a conflict state, fetches the exact scoped event, displays the current saved decision/reason and requires an explicit acknowledgment before rebasing the preserved draft. Another concurrent change still returns 409.
- Changing observation or closing a dirty review could lose context. Shared confirmation now offers keep-editing or discard before switching.
- Competing list loads could replace newer state, and denied refreshes retained previously displayed protected data. Requests are fenced/aborted; denied/missing scope clears displayed observations and draft. Assignment changes remount the scoped desk.

`use-exam-integrity.ts` now aborts each stalled telemetry request after eight seconds. Its existing single retry retains the original event identity/body. Telemetry failure remains separate from answer saving and never changes marks or infers misconduct.

The exact-event GET support was implemented by the backend agent in the shared integrity service/route: `?eventId=...` returns one authorized observation, global scoped counts and no next cursor. Missing/cross-scope events are denied; eventId and cursor cannot be combined.

## Executed checks

`tests/school-ai/exam-integrity-desk.browser.spec.ts` contains eight browser cases:

1. Authorized staff save a real disposition/reason; database version/reviewer update, answers and marks remain unchanged; an unauthorized teacher cannot read or edit the queue.
2. A competing real PATCH creates a stale version; the UI preserves draft text, prevents immediate retry, compares latest evidence and saves the explicitly rebased draft.
3. Two hundred newer reviewed events precede an older pending event; pagination finds it, queue refresh retains its draft, and the final review updates the correct event.
4. Dirty selection requests confirmation; keep-editing retains text; revoking exam-view permission and refreshing removes student content and draft controls.
5–7. English, Arabic and Urdu complete the real save flow at 320px without horizontal overflow; RTL is asserted for Arabic/Urdu.
8. A deliberately stalled observation request times out, retries the same event ID once, commits one event, and permits answer saving during the stall.

Initial run: seven passed; the pagination fixture failed before browser execution because synthetic reviewed records omitted database-required reviewer/time metadata. The fixture was corrected and the pagination case passed. The three locale cases were then rerun to an isolated output directory and all passed. All eight cases have passing evidence; no assertion was weakened to bypass an application failure.

Targeted ESLint passed for the desk, copy, telemetry hook and new browser test. No additional broad regression result is claimed here; root/other agents own the combined release checks.

## Visual evidence

The three screenshots were inspected: no clipping or horizontal overflow in the desk; readable wrapping, consistent shared violet controls and correct direction were visible. Native educator review of Arabic/Urdu terminology remains separate from source translation and browser layout checks.

- `test-results/school-ai/integrity-desk/exam-integrity-desk.browse-af9f4-is-usable-on-a-narrow-phone/integrity-desk-en.png`
- `test-results/school-ai/integrity-desk/exam-integrity-desk.browse-97917-is-usable-on-a-narrow-phone/integrity-desk-ar.png`
- `test-results/school-ai/integrity-desk/exam-integrity-desk.browse-50eb1-is-usable-on-a-narrow-phone/integrity-desk-ur.png`

These are synthetic development screenshots. The test output directory is specific to this suite to avoid Playwright cleaning other agents' evidence.
