# Role-specific AI setup and execution

The campus questionnaire and AI Workflows use durable automatic jobs. Confirmed answers drive permitted operations; missing information pauses execution. Role-specific interviews are available for all eleven roles. This is not complete coverage of every app feature.

## Execution and deployment

- Jobs persist progress, clarification questions/answers, pending actions and domain receipts. Replays reuse action identities.
- Every step rechecks current role, campus, permissions, access version and questionnaire version. Typed services retain their required domain approvals.
- Run `npm run worker:outbox` to continue jobs without an open browser. The progress screen can also advance jobs. A job is bounded to 30 actions.
- Unsupported requests are blocked explicitly. An informational answer, saved plan and completed operational change have distinct outcomes; reads and plans do not prove operational creation.
- Student creation reuses native roster validation, capacity and duplicate controls. It does not silently create accounts or send invitations.
- No new database migration is required.

## Current role coverage

| Role | Automatic capabilities |
| --- | --- |
| APP_OWNER | Institution inspection and name/city/website updates; own profile and private plans |
| SUPER_ADMIN | Campus creation, permitted saved governance plans; no campus student/class creation |
| ADMIN / CAMPUS_ADMIN | Students, academic setup and permitted campus operations; library catalogue creation and call logging; academic/finance fallback follows existing seat rules |
| PRINCIPAL | Authorized academic, curriculum, timetable and oversight operations |
| TEACHER | Own professional profile and permitted saved teaching plans |
| ACCOUNTANT | Existing typed finance operations and invoice generation, with required approvals |
| LIBRARIAN | Book catalogue creation and private plans |
| RECEPTIONIST | Call logging and private plans |
| STUDENT / PARENT | Own preferences, informational responses and private learning/family plans |

The dispatcher exposes 12 tool types and the existing 15 typed school operation identifiers. Exact access is resolved at runtime, including explicit permission revocations and assignment constraints.

## Remaining coverage

Voice/documents and live media acceptance remain deferred. Missing adapters include teacher assignments/marks, family requests and scoped learning reads, library circulation, broader front-desk actions, payroll, inventory/purchasing/transport/boarding, group delegation and owner subscription/security administration. Add typed adapters reusing native services and test their role/scope boundaries; do not expose generic AI-selected HTTP or database writes.

Staff invitations require acceptance before teachers become active. Missing roster facts, assignments, source references and mandatory approvals can pause dependent setup. A complete full-school provisioning journey and every role/language/device combination have not received live acceptance.

## Validation

- Automatic execution: 18 isolated database acceptance tests and five focused schema/completion tests passed.
- School AI suite: 419 passed. Focused role/navigation/onboarding/UI suite including automation checks: 55 passed, two existing live-HTTP checks skipped.
- TypeScript, changed-file ESLint and whitespace checks passed.
- Live configured AI created five classes and one student; the ordinary Classes and Students consoles were verified after fixing locale loading.
- Live unsupported library circulation stopped explicitly. A clarified request created a catalogue title with two available copies, verified in the database.
- Nine locale tests passed, including registration country metadata compatibility while preserving strict locale-edit validation.
