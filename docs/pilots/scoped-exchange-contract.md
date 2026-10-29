# Scoped import/export contract for bounded pilots (SKAI-1015, D2-09)

Status: draft for school-owner agreement. Nothing here is agreed with a real school yet.

## Supported exchange
| Direction | Format | Route | Scope |
|---|---|---|---|
| Roster import | CSV, UTF-8 (BOM optional), RFC 4180 quoting, max 5 MB / 1000 rows | `POST /api/import-batches` (kind `STUDENT_ROSTER`) then review, then commit via the roster endpoint | caller's school + one campus; classes outside it are REJECTED |
| Bank statement import | CSV with date, amount, description columns | `POST /api/import-batches` (kind `BANK_STATEMENT`) | school + campus + currency |
| Roster export | CSV, UTF-8 with BOM, CRLF, formula-guarded cells | `GET /api/students/export` | staff with `students.view`; school + resolved campus |
| Ledger / visitors / activity history / school profile (support) | CSV, UTF-8 with BOM, formula-guarded | respective routes | school (+ campus where applicable) |

Roster column aliases (case/punctuation-insensitive): fullName|studentName|name, rollNo|rollNumber|registrationNo|regNo, className, classSection, gender, dateOfBirth|dob (YYYY-MM-DD), phone, studentEmail, guardianName|parentName, guardianPhone|parentPhone, guardianWhatsapp, guardianEmail, guardianRelationship, address, city, medicalNotes.

## Behaviour verified by `tests/pilots/scoped-exchange.test.ts`
- Preview never writes pupils. Rows are ACCEPTED, SKIPPED (same class + roll exists; never overwritten), UNRESOLVED (roll used in another class) or REJECTED (invalid, outside campus, repeated in file), each with a reason.
- Idempotency key = school, campus, kind, file fingerprint, target scope. Re-uploading the same file returns the same batch.
- Commit claims the batch STAGED -> COMMITTING inside the pupil-creating transaction. A network or provider interruption rolls back to STAGED, so retrying is safe; a retry after success returns the stored receipt (`idempotent: true`). A stale review token or a pupil created after preview answers 409, so nothing partially crosses.
- Exports neutralise `= + - @` / tab / CR leading cells (phone numbers excepted) and carry a BOM so Urdu/Arabic names open correctly in Excel.

## Limits (disclosed, not promised)
- No offline mode: imports and exports require a live connection; an interrupted upload must be re-sent (it de-duplicates).
- Live connectors to Noor, Madrasati, KHDA or any SIS/LMS are not available. None may be listed until authorised and covered by a separate end-to-end integration test.
- No ERP migration. Exit export = roster CSV + ledger CSV + activity history CSV; retention/deletion follows the trust review (SKAI-1016).

## Human-only (open)
- Observe each pilot school's devices, browsers, bandwidth and incumbent SIS; until then the above are assumptions.
- School owner agrees formats and column mapping; sign-off recorded with date and version.
