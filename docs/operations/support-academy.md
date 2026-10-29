# School onboarding and support academy — SKAI-925

Status: draft job aids for the people-owned service package. This is not a
published service offer, translation approval, or completed pilot. Existing
welcome stories, role tours, readiness checks and support grants remain the
product surfaces; this guide adds operating instructions and evidence forms.

## Before offering the service

The service owner must record and approve the following before a school pilot:

| Decision | Approval record |
| --- | --- |
| Named service owner and school administrator | Pending |
| Included setup tasks, training sessions and exclusions | Pending |
| Support channel, staffed hours, time zone and holiday coverage | Pending |
| Urgent escalation contact, backup and acknowledgement conditions | Pending |
| Chargeable bespoke work, quote and school approval process | Pending |
| Languages required by active users and named native reviewers | Pending |

Do not promise continuous availability, response times, translated coverage or
bespoke work until these fields are approved. Urgent safeguarding concerns follow
the school's existing safeguarding procedure; product support is not an emergency
service. Record the agreed escalation route before training begins.

## Prepare one active role and task

Use synthetic QA-01 records for rehearsal. Confirm the participant's school,
campus, role and enabled modules before selecting a task. Complete required
password/profile steps and review campus readiness with the administrator.
Use the existing role tour from Help; tour completion records orientation only.
It does not demonstrate that someone can perform a task independently.

### Teacher: submit a class register

1. Sign in with the teacher's own account and open Today at `/teacher`.
2. Check Today's lessons and choose **Take register**, or open **Attendance**
   if permitted. Confirm the intended class and date before editing.
3. Mark and review the synthetic register, then submit using the available action.
4. Reopen the register and confirm the saved state. Record whether the teacher
   completed this without facilitator prompts; capture no pupil identities.

If the class or pupils are missing, stop before submitting. Ask the administrator
to check campus, teacher assignments and roster readiness. Do not create duplicate
pupils, switch to another school's account or borrow an administrator login.
Recheck the same task once the prerequisite is corrected.

Source: [teacher tour](../../src/lib/onboarding/tours/teacher.ts),
[readiness service](../../src/lib/readiness/service.ts).

### Office: check a synthetic visitor in and out

1. Sign in with the receptionist's own account. Confirm the correct campus.
2. On the dashboard choose **Check in a visitor**, complete the required fields
   using synthetic visitor details, and submit.
3. Find that visitor in the same list and check them out.
4. Verify that the list reflects checkout. Record independent completion or the
   exact step where assistance was needed. Do not use child pickup as a rehearsal.

If the action is absent or denied, ask the administrator to verify the front-desk
module and assigned role. Do not change permissions merely to finish training.

Source: [receptionist tour](../../src/lib/onboarding/tours/receptionist.ts).

## Searchable recovery answers

| Search terms / symptom | Safe next step | Evidence to record |
| --- | --- | --- |
| Missing roster, empty class, missing assignment | Administrator checks school/campus, roster readiness and teacher assignment; retry the original register after correction | Task, prerequisite corrected, outcome; no pupil list |
| Revoked invite, expired invitation, cannot join | Stop using the old link; ask the authorized administrator to check status and arrange a valid invitation through the existing invitation flow | Error wording without link/token, role, resolution |
| Provider unavailable, AI failure, starter draft | Keep saved work; follow the displayed retry/recovery action. Clearly labelled starter drafts are not live-provider output; review drafts before apply/approval | Visible failure, saved-work outcome, fallback label; no prompts containing personal data |
| Permission denied, missing action | Confirm active role, campus and module with the administrator; escalate a reproducible mismatch | Route, expected role, denied action and synthetic reproduction |
| Support expired, support revoked | Stop work and request a new authorized grant if still needed; do not reuse cookies or another operator's session | Grant reference, stop time and audit-event reference |

Before distributing these answers, QA must reproduce each recovery on the deployed
version and replace any instruction that does not match the displayed flow.
See [onboarding launch](onboarding-launch.md),
[invitation entry](../../src/app/(auth)/accept-invite/page.tsx) and
[support access](../../src/lib/owner/support-access.ts).

## Support handling and access

Use existing scoped, time-bounded support grants with the minimum required actions.
Record the school authorization and grant reference. Never request a password,
OTP, session cookie or database copy. Check grant expiry before beginning work.
Stop when revoked or expired; retain the audit reference, not access credentials.
The support service checks actor, school, grant status and expiry; stopping a grant
cancels queued support actions and records revocation/expiry in the audit log.
These code paths still require deployment-specific acceptance evidence.

Maintain one support record per incident in the approved support system:

- Synthetic school/campus reference for QA; approved school reference for operations.
- Category: access, roster/setup, workflow, provider or training.
- Opened/resolved times, active handling minutes and waiting minutes separately.
- Role, task, minimal error wording, root cause (or explicitly unknown).
- Resolution, responsible owner, next action and escalation reference if unresolved.
- Grant and audit references where used; no child names, passwords or exported records.

Turn recurring issues into reviewed answers using the symptom, prerequisite,
resolution and version tested. Link the answer from the incident; do not copy raw
support transcripts into this repository.

## Language review and independent task evidence

Use the existing EN/AR/UR role-tour strings as the starting reference, not as proof
of native review. Translate only the approved job aid for each active role/task.
For each required language, a native user must verify labels, comprehension,
recovery wording and layout (including AR/UR right-to-left). Record reviewer,
version, date, corrections and approval in the approved evidence location.
Until then, this English draft must not be advertised as reviewed multilingual
training. No new translation claims are made by this document.

Run the teacher and office tasks with separate temporary QA-01 participants.
Facilitators may explain the goal, but must record every prompt during execution.
Use the following blank record for each role/language; do not fill it with estimates:

| Evidence field | Pilot result |
| --- | --- |
| Build/deployment, date, role, language and synthetic campus | Pending |
| Start/end time and active task minutes | Pending |
| Independent completion, prompts and failed step | Pending |
| Saved result verified by participant | Pending |
| Missing roster / revoked invite / provider failure recovery | Pending |
| Grant expiry/revocation denied; audit retained | Pending |
| EN and applicable AR/UR screenshots without personal data | Pending |
| Unresolved work, accountable owner and next review date | Pending |

## Administrator handover

- Confirm named school administrator, active campuses, roles and readiness gaps.
- Share only approved task guides and the reviewed repeated-error answers.
- Confirm included training, support hours, escalation contacts and exclusions.
- Review unresolved pilot work and agree an owner and review date for each item.
- Revoke rehearsal support access and verify the audit record remains available.
- Record training/task timings and independent success; do not substitute video
  views, tour completion or attendance for task success.
- Obtain service-owner and school sign-off on the offer and handover evidence.

SKAI-925 remains open for human service decisions, native-language review and
observed pilot evidence. A documentation PR alone does not satisfy those criteria.
