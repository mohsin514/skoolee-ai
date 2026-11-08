# Requirements Document

## Introduction

SKO-408 "[034] AI Exam Studio" turns the existing School AI assessment surfaces into the flagship assessment, secure-delivery and learning-recovery module of Skoolee AI. The feature covers the full chain from an assessment brief, through authored and AI-assisted items, a rehearsed and hash-sealed released form, locked candidate delivery with consented camera capture and factual integrity signals, staff moderation and immutable result versions, and ends in teacher-approved learning recovery with a later formative check.

Two facts shape every requirement below.

**This work supersedes an earlier scope decision.** `docs/school-ai/IMPLEMENTATION.md` records that on 12 October 2026 the user selected standard browser exams without device lockdown, and marks EXM-04 and EXM-05 OUT OF SCOPE. `assertSupportedExamMode()` in `src/lib/school-ai/exam.ts` enforces that decision today by throwing for `SECURE_BROWSER` and `PROCTORED`, and `src/lib/school-ai/exam-service.ts:74` converts that throw into HTTP 409. SKO-408 supersedes the earlier decision by **adding** Managed Exam Mode behind explicit validation gates. The standard browser path remains fully supported and is never silently replaced.

**No claim in this document asserts a cheat-proof exam.** Two lock tiers are specified separately and must be labelled separately in the interface: the app-level Exam Room boundary (server-enforced, in scope here, boundary owned by SKO-411) and Managed Exam Mode device lockdown (client owned by SKO-449, in scope here only as policy records, admission gating and honest interface state). Artificial intelligence in this module reports factual, timestamped integrity signals with stated uncertainty. A human being decides what a signal means.

**Implementation constraint on framework APIs.** `AGENTS.md` states that the installed Next.js 16.2.3 differs from model training data. The design and implementation phases must read the installed guides under `node_modules/next/dist/docs/` before writing routing, proxy, server-component, route-handler or caching code. This document deliberately states behavior and does not name Next.js APIs.

### Baseline reuse

The following capabilities already exist and are enhanced rather than rebuilt: curriculum, outcomes and taught coverage (`curriculumDataSchema`), blueprints, items, keys, rubrics, pinned items and bank provenance (`questionSchema`, `paperDataSchema`), whole-paper generation (`POST /api/school-ai/generate-paper`), deterministic validation (`validateBlueprint`, `validatePaperApproval`, `validateCurriculumApproval`), key-blind semantic review (`semanticReviewSchema`, `generatePaperSemanticReview`), reviewed figure crops (`paper-figures.ts`), exact-version approval with an immutable revision and a key-free candidate projection (`SchoolAiRecord`, `SchoolAiRevision`, `candidatePaper()`, `buildCandidatePaperHtml()`), delivery and attempts (`SchoolAiExamAssignment`, `SchoolAiExamAttempt`, `attemptDeadline()`, `examSaveDecision()`, the expiry sweep, accommodations, `SchoolAiProctorSession`, `SchoolAiProctorClip`), marking and results (`scoreObjectiveResponses`, written marking, moderation, `SchoolAiExamResultRevision`, `SchoolAiExamAppeal`, gradebook transfer, script QR and scan), the 17-tab workspace under `/ai`, and scope enforcement in `src/lib/school-ai/access.ts`.

## Glossary

### Product and workspace

- **Exam_Studio**: the complete SKO-408 feature, spanning authoring, release, delivery, integrity, results and recovery.
- **Studio_Workspace**: the staff-facing interface of Exam_Studio, composed from shared controls in `src/components/ui` under the contracts in `docs/ui-plan/component-contracts.md` and `docs/ui-plan/tokens-and-styles.md`.
- **Studio_Intro**: the entry motion sequence that plays when Exam_Studio opens and then transitions into Studio_Workspace.
- **Commercial_Evidence_Register**: the stored record that maps every externally stated Exam_Studio capability claim to a named repository artifact or an external gate record.
- **Studio_Access**: the authorization layer of Exam_Studio, extending `src/lib/school-ai/access.ts`.

### Authoring

- **Assessment_Brief**: the versioned set of decisions describing one intended assessment, covering subject, class, taught coverage, duration, total marks, language set, form count, delivery policy intent and accommodation intent.
- **Brief_Assistant**: the component that gathers missing Assessment_Brief decisions one question at a time.
- **Confirmed_Fact**: a value a named authorized human being confirmed, with actor, timestamp and scope.
- **Extracted_Suggestion**: a value proposed by a provider or derived from an approved source, carrying its source reference and an unreviewed state.
- **Open_Decision**: an Assessment_Brief decision with no Confirmed_Fact and no accepted Extracted_Suggestion.
- **Item_Workbench**: the per-item authoring surface presenting one item together with its evidence, key, rubric and review state.
- **Item_Review_State**: one of `DRAFT`, `NEEDS_SOURCE`, `NEEDS_CORRECTION`, `READY_FOR_REVIEW`, `APPROVED`, `CHANGED_AFTER_APPROVAL`.
- **Evidence_Drawer**: the panel that shows, for one item, the approved source excerpt, page and region, the outcome mapping, the generation record and the review history.
- **Generation_Service**: the Exam_Studio component that requests paper-level and item-level model output and reports progress.
- **Staleness_Tracker**: the component that marks dependent key, rubric, review, figure and approval state invalid when an upstream value changes.
- **Language_Review**: the side-by-side review of parallel language versions of one item or form.
- **Form_Set**: a group of parallel forms (for example A, B, C) released together from one Assessment_Brief.
- **Exposure_Ledger**: the record of which item appeared in which released form, for which cohort and on which date.

### Release

- **Rehearsal_Service**: the component that runs the full pre-release check suite over a saved form and reports blockers.
- **Rehearsal_Blocker**: a failed rehearsal check with a stated accountable owner and a named repair path.
- **Release_Service**: the component that seals an approved form.
- **Released_Form**: the immutable, approved, hash-sealed version of one form.
- **Content_Hash**: the digest computed over the canonical Released_Form content used to prove that browser delivery and print output carry identical content.
- **Candidate_Projection**: the key-free, rubric-free, note-free payload derived from a Released_Form for candidates and for print.
- **Protected_Key**: answer keys, rubrics, model answers, reviewer notes and semantic review output.

### Delivery

- **Attempt**: one candidate's session against one Released_Form, recorded as `SchoolAiExamAttempt`.
- **Acknowledged_Revision**: the highest attempt revision the server has committed and acknowledged to a client.
- **Attempt_Receipt**: the single durable record proving an Attempt reached a final state, with the final response digest, the authoritative time and the final state.
- **Exam_Room_Boundary**: the app-level, server-enforced restriction that, while an Attempt is active, confines the candidate to Exam_Studio attempt routes and attempt interfaces within Skoolee AI.
- **Exam_Room_Guard**: the Exam_Studio component that enforces Exam_Room_Boundary on every request.
- **Managed_Exam_Mode**: delivery through a maintained lockdown client external to Skoolee AI, for example Safe Exam Browser.
- **Managed_Mode_Service**: the component that stores Delivery_Policy, validates client configuration, decides admission and records release.
- **Delivery_Policy**: the versioned record describing the required delivery tier, the required client and configuration identity, the Supported_Device_Matrix reference, local release bounds and the emergency exit path.
- **Supported_Device_Matrix**: the recorded list of device, operating system, browser or client versions with a dated real-device test result.
- **Admission_Decision**: the recorded server decision to admit or refuse one client for one Attempt, with the reason code.
- **Local_Release**: the end of Managed_Exam_Mode restrictions on the candidate device after an Attempt ends.
- **Capture_Service**: the consented camera and screen recording component, built on `SchoolAiProctorSession` and `SchoolAiProctorClip`.

### Integrity, results and recovery

- **Integrity_Signal_Service**: the component that validates, records, classifies and retains Integrity_Signals, and that holds the queue of signal groups awaiting a human decision.
- **Integrity_Signal**: a factual, timestamped, attempt-scoped observation such as focus loss, visibility change, detected face count, additional display connection or a paste burst.
- **Signal_Severity**: the recorded `INFORMATION`, `ATTENTION` or `REVIEW` classification of an Integrity_Signal.
- **Signal_Uncertainty**: the recorded confidence bound, detection method and stated known false-positive causes of an Integrity_Signal.
- **Integrity_Review_Queue**: the staff queue of Integrity_Signal groups awaiting a human decision.
- **Control_Room**: the live staff view of readiness, active Attempts, last Acknowledged_Revision, Integrity_Signals and permitted interventions.
- **Incident_Service**: the component that issues Clarification_Notices during an Attempt and produces and applies Remedy_Proposals after an Attempt.
- **Clarification_Notice**: a versioned message issued to a defined candidate audience during an Attempt about a faulty item.
- **Remedy_Proposal**: a post-attempt proposal to correct a rubric, regrade or neutralize an item, requiring human authorization.
- **Recovery_Service**: the component that produces evidence-linked learner feedback, teacher-approved practice and a later formative check.
- **Practice_Set**: teacher-approved practice material derived from released items and approved sources.
- **Formative_Check**: a later, separately released assessment used to observe whether addressed outcomes changed.
- **Evidence_Pack_Service**: the component that assembles, manifests and audits Evidence_Pack exports.
- **Evidence_Pack**: an exported bundle of the versioned record chain for one assessment or one Attempt.
- **Integrity_Manifest**: the machine-verifiable list of file digests and record versions included in an Evidence_Pack.
- **Demo_Dataset_Script**: the opt-in script that writes synthetic Exam_Studio demonstration records to a deliberately named target.

### Roles

- **Author**: a teacher who authors items within an assigned subject and class.
- **Academic_Approver**: a manager role permitted to approve a saved version, as defined by `isSchoolAiManager` and `assertApprovalRole`.
- **Invigilator**: staff supervising an Attempt in the Control_Room.
- **Moderator**: staff reviewing marks and result versions.
- **Candidate**: the student taking an Attempt.
- **Guardian**: a parent or guardian of a Candidate.
- **Platform_Support**: Skoolee AI support staff acting under an audited support grant.

## Requirements

### Requirement 1: Evidence-backed flagship positioning

**User Story:** As the product owner preparing a USD 10M investment conversation, I want every Exam_Studio capability claim tied to an inspectable artifact, so that a technical reviewer can confirm each statement in the repository instead of trusting a slide.

#### Acceptance Criteria

1. THE Commercial_Evidence_Register SHALL record, for each stated Exam_Studio capability, the claim text, the requirement identifier, a cited repository artifact comprising file path and test or migration name, and a state of `BUILT`, `PARTIAL`, `EXTERNAL_GATE_OPEN` or `NOT_STARTED`.
2. IF a stated capability has no cited repository artifact and no dated external gate record, THEN THE Commercial_Evidence_Register SHALL record that capability with state `NOT_STARTED`.
3. WHERE a capability has state `EXTERNAL_GATE_OPEN`, THE Studio_Workspace SHALL display the capability with the named open gate and the gate owner.
4. WHEN Exam_Studio presents a numeric figure describing accuracy, detection, marking agreement, time saving or review effort, THE Studio_Workspace SHALL display the sample size, the date range and the measurement method recorded with that figure.
5. WHERE a numeric figure has no recorded measurement, THE Studio_Workspace SHALL display the text `not measured` in place of a figure.
6. THE Exam_Studio SHALL exclude testimonials, named-school references, competitor comparisons and market-share figures that the Commercial_Evidence_Register cannot cite.
7. THE Commercial_Evidence_Register SHALL describe the targeted market gap as a list of named differentiators, each mapped to a requirement identifier in this document.
8. THE Exam_Studio SHALL exclude the terms `cheat-proof`, `tamper-proof`, `fraud-proof` and `guaranteed detection` from interface copy, documentation and investor-facing material generated from this repository.
9. WHEN a reviewer requests the evidence summary, THE Commercial_Evidence_Register SHALL produce the complete claim list with every state and citation in a single export.

### Requirement 2: Roles and authority matrix

**User Story:** As a school principal, I want each role's authority stated explicitly, so that no participant gains assessment, key or recording access as a side effect of another permission.

#### Acceptance Criteria

1. THE Studio_Access SHALL grant an Author authoring and rehearsal rights limited to subjects and classes currently assigned to that Author, as resolved by `getAssignedWorkspaceSubjects`.
2. THE Studio_Access SHALL refuse an Author the rights to approve a saved version, to admit a client to Managed_Exam_Mode, to grant extra time, to decide an Integrity_Signal, to release a result version and to export an Evidence_Pack beyond that Author's own assigned subjects.
3. THE Studio_Access SHALL grant an Academic_Approver the rights to approve a saved version, to approve a Delivery_Policy revision, to authorize a Remedy_Proposal and to release a result version.
4. THE Studio_Access SHALL refuse an Academic_Approver approval of a version that Academic_Approver authored, when the school policy record requires separation of authoring and approval.
5. THE Studio_Access SHALL grant an Invigilator the rights to view readiness, active Attempts, last Acknowledged_Revision and Integrity_Signals, and to request extra time, a supervised pause and a Local_Release for Attempts within the Invigilator's assigned session.
6. THE Studio_Access SHALL refuse an Invigilator every read of a Protected_Key, of a Candidate response body and of a result before release.
7. THE Studio_Access SHALL grant a Moderator the rights to read responses, Protected_Key values and Integrity_Signals for Attempts under moderation, and to record a moderation decision.
8. THE Studio_Access SHALL refuse a Moderator the rights to edit a Released_Form, to admit a client and to delete an Integrity_Signal or a Capture_Service clip.
9. THE Studio_Access SHALL grant a Candidate read access only to the Candidate_Projection of the Released_Form assigned to that Candidate, to that Candidate's own responses and to that Candidate's own released result and Attempt_Receipt.
10. THE Studio_Access SHALL refuse a Candidate every read of a Protected_Key, of another Candidate's Attempt, of an Integrity_Signal and of a Released_Form before the assigned Attempt window opens.
11. THE Studio_Access SHALL grant a Guardian read access only to released results and released feedback for linked children, through the existing guardian relationship records.
12. THE Studio_Access SHALL refuse a Guardian every read of an Integrity_Signal, of a Capture_Service recording, of a Protected_Key and of an unreleased result.
13. WHERE Platform_Support holds an audited support grant, THE Studio_Access SHALL grant Platform_Support read access to configuration, Delivery_Policy, Admission_Decision reason codes and failure diagnostics.
14. THE Studio_Access SHALL refuse Platform_Support every read of a Protected_Key, of a Candidate response body and of a Capture_Service recording.
15. WHEN a permission grant for a role is revoked, THE Studio_Access SHALL refuse the next Exam_Studio read, write and execution request for that role using a permission snapshot loaded within the same request.
16. WHEN a role performs an action listed in this requirement, THE Studio_Access SHALL record actor identifier, role, school identifier, campus identifier, action, target record identifier, target record version and authoritative timestamp.

### Requirement 3: Conversational assessment brief

**User Story:** As a teacher starting a new exam, I want Exam_Studio to ask me for one missing decision at a time, so that I reach a complete brief without filling a long form and without the system inventing decisions for me.

#### Acceptance Criteria

1. WHEN an Author opens Exam_Studio for a subject and class that has no Assessment_Brief, THE Brief_Assistant SHALL present exactly one Open_Decision at a time, in the order recorded in the brief question sequence.
2. THE Brief_Assistant SHALL classify every Assessment_Brief value as exactly one of Confirmed_Fact, Extracted_Suggestion or Open_Decision, and SHALL display that classification with each value.
3. THE Brief_Assistant SHALL record, for each Confirmed_Fact, the confirming actor identifier, the authoritative confirmation timestamp and the scope comprising school, campus, class and subject.
4. THE Brief_Assistant SHALL record, for each Extracted_Suggestion, the source record identifier, the source version, the page or region reference and the exact source excerpt.
5. WHEN an Author accepts an Extracted_Suggestion, THE Brief_Assistant SHALL convert that value to a Confirmed_Fact and SHALL retain the original Extracted_Suggestion and the acceptance event in the brief history.
6. WHEN an Author answers `skip` or `unknown` for an Open_Decision, THE Brief_Assistant SHALL retain that decision as an Open_Decision and SHALL continue to the next Open_Decision.
7. WHERE a school default exists for an Open_Decision, THE Brief_Assistant SHALL present that default as an Extracted_Suggestion labelled as a school default.
8. THE Brief_Assistant SHALL present a readiness summary listing every remaining Open_Decision that blocks release.
9. WHEN an Author leaves Exam_Studio with unanswered Open_Decisions, THE Brief_Assistant SHALL persist every answered value as a server-side draft revision.
10. WHEN an Author returns to an Assessment_Brief with a persisted draft, THE Brief_Assistant SHALL resume at the first Open_Decision and SHALL display the previously answered values.
11. THE Brief_Assistant SHALL refuse to derive an Assessment_Brief value from conversation text alone, and SHALL require an explicit Author confirmation for every Confirmed_Fact.
12. IF an Author's answer fails the validation bound for that decision, THEN THE Brief_Assistant SHALL display the specific failed bound and SHALL retain the entered text for correction.
13. WHEN an Assessment_Brief is saved, THE Brief_Assistant SHALL write a new brief revision and SHALL preserve the previous revision as immutable.

### Requirement 4: Item workbench with evidence and per-item review states

**User Story:** As a teacher reviewing a generated paper, I want each question to carry its own evidence and its own review state, so that one unresolved item does not force me to re-review an entire paper.

#### Acceptance Criteria

1. THE Item_Workbench SHALL record an Item_Review_State for each item, independent of the review state of the enclosing record.
2. THE Item_Workbench SHALL set an item to `NEEDS_SOURCE` when that item has no `sourceRefs` entry referencing an approved source version.
3. THE Item_Workbench SHALL set an item to `NEEDS_CORRECTION` when a deterministic validation check or a semantic review observation for that item is unresolved.
4. WHEN an Author marks an item complete and every deterministic check for that item passes, THE Item_Workbench SHALL set that item to `READY_FOR_REVIEW`.
5. WHEN an Academic_Approver approves an item at a stated item revision, THE Item_Workbench SHALL set that item to `APPROVED` and SHALL record the approving actor, the authoritative timestamp and the approved item revision.
6. WHEN any of an approved item's prompt, options, marks, key, rubric, model answer, outcome mapping, figures or source references changes, THE Item_Workbench SHALL set that item to `CHANGED_AFTER_APPROVAL`.
7. THE Evidence_Drawer SHALL display, for the selected item, the approved source excerpt, the page or region reference, the outcome mapping, the generation record comprising provider model identifier and generation timestamp, and the complete item review history.
8. WHERE an item carries a `reusedFrom` origin, THE Evidence_Drawer SHALL display the originating paper identifier, paper version and question identifier.
9. THE Item_Workbench SHALL display the count of items in each Item_Review_State for the current form.
10. THE Item_Workbench SHALL refuse a release request while any item of the form is in `DRAFT`, `NEEDS_SOURCE`, `NEEDS_CORRECTION`, `READY_FOR_REVIEW` or `CHANGED_AFTER_APPROVAL`.
11. THE Item_Workbench SHALL present Protected_Key fields only to roles permitted by Requirement 2, and SHALL exclude Protected_Key fields from any Candidate-facing response payload.

### Requirement 5: Progressive generation, single-item regeneration and comparison

**User Story:** As a teacher generating a paper, I want visible progress and the ability to regenerate one question, so that a long request does not look frozen and one weak item does not cost me the whole paper.

#### Acceptance Criteria

1. WHILE Generation_Service is producing a paper, THE Studio_Workspace SHALL display the count of items produced, the count of items requested and the current generation stage.
2. WHEN Generation_Service produces an item during a paper request, THE Studio_Workspace SHALL display that item before the request completes.
3. WHEN an Author requests regeneration of a single item, THE Generation_Service SHALL replace only that item and SHALL preserve every other item byte-for-byte.
4. THE Generation_Service SHALL preserve every item marked `locked` across paper generation and item regeneration, as the existing locked-question merge already enforces.
5. WHEN Generation_Service returns a regenerated item, THE Studio_Workspace SHALL display the previous item and the regenerated item side by side with the differing fields marked.
6. WHEN an Author accepts a regenerated item, THE Item_Workbench SHALL set that item to `DRAFT` and SHALL record the superseded item in the item history.
7. WHEN an Author rejects a regenerated item, THE Generation_Service SHALL retain the previous item unchanged.
8. WHEN an Author reorders items within a section, THE Generation_Service SHALL preserve each item's identifier, key, rubric, figures, source references and Item_Review_State.
9. IF a generation request fails, times out or is cancelled, THEN THE Generation_Service SHALL retain every item produced before the failure and SHALL display the failure reason without a provider stack trace.
10. IF the configured provider is unavailable or document and audio egress is not approved, THEN THE Studio_Workspace SHALL keep manual authoring, manual key entry, manual rubric entry and manual review available.
11. THE Generation_Service SHALL refuse to write a `reusedFrom` bank origin from provider output.
12. WHEN an Author cancels an in-flight generation request, THE Generation_Service SHALL stop charging further provider calls for that request and SHALL record the cancellation with the authoritative timestamp.

### Requirement 6: Dependency staleness and invalidation

**User Story:** As an academic approver, I want an edit to invalidate everything downstream of that edit, so that I never approve a paper whose review belongs to an earlier version.

#### Acceptance Criteria

1. WHEN an item's prompt, options or marks change, THE Staleness_Tracker SHALL mark that item's key, rubric, semantic review observation and item approval invalid.
2. WHEN an item's figures change, THE Staleness_Tracker SHALL mark that item's figure completeness check and that item's approval invalid.
3. WHEN an approved source version is superseded, THE Staleness_Tracker SHALL mark every item referencing the superseded source version as `NEEDS_SOURCE`.
4. WHEN taught coverage for a section changes, THE Staleness_Tracker SHALL mark the coverage check of every form scoped to that section invalid.
5. WHEN any item of a form becomes invalid, THE Staleness_Tracker SHALL mark the form's rehearsal result invalid.
6. THE Staleness_Tracker SHALL retain every invalidated review observation as historical evidence, keyed by the record version that produced the observation.
7. WHEN a form's rehearsal result is invalid, THE Release_Service SHALL refuse a release request for that form.
8. THE Staleness_Tracker SHALL display, for each invalidated artifact, the triggering change, the triggering actor and the authoritative timestamp of the trigger.
9. THE Staleness_Tracker SHALL preserve an existing Released_Form unchanged when an upstream value changes after release.

### Requirement 7: Rehearsal before release

**User Story:** As a teacher about to release an exam, I want one rehearsal surface that exercises the real delivery path, so that candidates do not discover a broken question, a missing figure or a leaked key during the exam.

#### Acceptance Criteria

1. WHEN an Author requests a rehearsal of a saved form, THE Rehearsal_Service SHALL run the deterministic blueprint and paper checks, the key-blind semantic review, the figure and asset completeness check, the candidate and key separation check, the print pagination check, the keyboard navigation check and a synthetic save and submit rehearsal.
2. THE Rehearsal_Service SHALL run the synthetic save and submit rehearsal against the same attempt save, sequencing, deadline and receipt code path used by a Candidate Attempt.
3. THE Rehearsal_Service SHALL record each rehearsal result as a Rehearsal_Blocker or a pass, with the check name, the affected item identifiers, the accountable owner role and the named repair path.
4. THE Rehearsal_Service SHALL classify a Rehearsal_Blocker as `BLOCKING` or `ADVISORY`, and SHALL list each `BLOCKING` result as a release blocker.
5. THE Rehearsal_Service SHALL fail the candidate and key separation check when the Candidate_Projection of the form contains any Protected_Key value.
6. THE Rehearsal_Service SHALL fail the figure and asset completeness check when any item references a figure that has no approved reviewed crop.
7. THE Rehearsal_Service SHALL run the print pagination check for every language version of the form.
8. THE Rehearsal_Service SHALL delete every record created by the synthetic save and submit rehearsal, and SHALL exclude synthetic rehearsal responses from marks, results, gradebook transfer and Integrity_Signals.
9. WHEN an Author opens a Rehearsal_Blocker, THE Studio_Workspace SHALL navigate to the specific item or setting that the repair path names.
10. THE Rehearsal_Service SHALL record the rehearsal result against the exact form revision rehearsed.
11. IF the form revision changes after a rehearsal, THEN THE Rehearsal_Service SHALL mark the recorded rehearsal result invalid.
12. THE Rehearsal_Service SHALL present a rehearsal result as evidence of the named checks only, and SHALL exclude any statement that the form is certified, cheat-proof or guaranteed correct.

### Requirement 8: Sealed release with verifiable print and browser parity

**User Story:** As an academic approver, I want the released exam content sealed by a content hash, so that a printed paper and a browser paper can be proven identical and a later edit cannot pass as the released version.

#### Acceptance Criteria

1. WHEN an Academic_Approver releases a form, THE Release_Service SHALL compute a Content_Hash over the canonical Candidate_Projection of that form and SHALL store the Content_Hash with the Released_Form revision.
2. THE Release_Service SHALL compute the Content_Hash over a canonical serialization that is independent of key order and of insignificant whitespace.
3. WHEN Exam_Studio renders the browser Candidate_Projection of a Released_Form, THE Release_Service SHALL recompute the Content_Hash and SHALL refuse delivery when the recomputed Content_Hash differs from the stored Content_Hash.
4. WHEN Exam_Studio renders the print output of a Released_Form, THE Release_Service SHALL recompute the Content_Hash and SHALL refuse the print request when the recomputed Content_Hash differs from the stored Content_Hash.
5. THE Release_Service SHALL display the Content_Hash prefix and the approved version number on the staff release view and on the print output.
6. THE Release_Service SHALL exclude every Protected_Key value from the Content_Hash input and from both rendered outputs.
7. THE Release_Service SHALL store the Protected_Key of a Released_Form separately from the Candidate_Projection, with its own access check.
8. WHEN an Author edits a form after release, THE Release_Service SHALL create a new draft revision and SHALL preserve the Released_Form, its Content_Hash and its Protected_Key unchanged.
9. IF a release request names a form revision other than the currently reviewed revision, THEN THE Release_Service SHALL refuse the release request and SHALL report the revision mismatch.
10. THE Release_Service SHALL record the releasing actor, the authoritative release timestamp, the released revision, the Content_Hash and the rehearsal result identifier.

### Requirement 9: Parallel language versions

**User Story:** As a bilingual school's academic approver, I want to review the English, Arabic and Urdu versions of a question side by side, so that a translation does not change what the question asks or what it is worth.

#### Acceptance Criteria

1. THE Exam_Studio SHALL support an Assessment_Brief declaring more than one language from the set English, Arabic and Urdu.
2. WHERE an Assessment_Brief declares more than one language, THE Exam_Studio SHALL store one item group containing one item version per declared language, linked by a shared item group identifier.
3. THE Language_Review SHALL display two selected language versions of one item side by side with the shared outcome mapping, marks and key structure visible.
4. WHEN the marks of two language versions of one item differ, THE Language_Review SHALL report a `MARKS_MISMATCH` observation.
5. WHEN the option count, the correct option count or the numeric key value and tolerance of two language versions of one item differ, THE Language_Review SHALL report a `KEY_STRUCTURE_MISMATCH` observation.
6. WHEN a model comparison of two language versions reports a changed meaning, an added or removed negation, a changed unit or a changed notation, THE Language_Review SHALL record that observation with its Signal_Uncertainty and SHALL require an explicit human decision.
7. THE Language_Review SHALL refuse to change an item version automatically in response to a model comparison observation.
8. THE Release_Service SHALL refuse a release request while any `MARKS_MISMATCH` or `KEY_STRUCTURE_MISMATCH` observation for the form is unresolved.
9. THE Release_Service SHALL compute a separate Content_Hash per language version and SHALL record the language version identity with each Content_Hash.
10. WHEN a Candidate is assigned a Released_Form, THE Exam_Studio SHALL deliver the language version recorded on that Candidate's assignment.
11. THE Exam_Studio SHALL render each language version in its correct text direction in the browser and in print, as the existing candidate print path already does for English, Arabic and Urdu.

### Requirement 10: Parallel forms and item exposure

**User Story:** As an academic approver running an exam across sittings, I want parallel forms and a record of where each item has appeared, so that one leaked sitting does not compromise every sitting and a reused item does not reach the same cohort twice.

#### Acceptance Criteria

1. THE Exam_Studio SHALL support a Form_Set of up to a policy-configured maximum of parallel forms released from one Assessment_Brief.
2. THE Exam_Studio SHALL record, for each form in a Form_Set, the form label, the blueprint section mapping and the per-section item allocation.
3. THE Exam_Studio SHALL require every form in a Form_Set to satisfy the same blueprint section totals, marks total and outcome coverage before release.
4. IF a form in a Form_Set fails the blueprint parity check, THEN THE Release_Service SHALL refuse the release request for the whole Form_Set and SHALL name the failing form and the failing check.
5. WHEN a form is released, THE Exposure_Ledger SHALL record each item identifier, the item revision, the form label, the Released_Form revision, the assigned cohort identifiers and the exam date.
6. WHEN an Author adds an item to a form, THE Exposure_Ledger SHALL display every prior exposure of that item with the cohort and the date.
7. WHEN an item has a prior exposure to a cohort assigned to the current form, THE Exposure_Ledger SHALL report a `REPEAT_EXPOSURE` observation for that item.
8. WHEN a Candidate is assigned a Form_Set, THE Exam_Studio SHALL assign exactly one form to that Candidate and SHALL record the assigned form label on the assignment before the Attempt starts.
9. WHILE an Attempt is active, THE Exam_Studio SHALL deliver only the form recorded on that Candidate's assignment.
10. THE Exam_Studio SHALL refuse a request to change a Candidate's assigned form while an Attempt for that Candidate is active.
11. THE Exposure_Ledger SHALL restrict read access to Author, Academic_Approver and Moderator roles within the owning school and campus.

### Requirement 11: App-level Exam Room boundary

**User Story:** As a principal, I want the whole Skoolee AI application to lock down to the exam while a candidate is attempting it, so that the candidate cannot open fees, messages or another class's material until the attempt is submitted, finished or expired.

#### Acceptance Criteria

1. WHILE an Attempt for a Candidate is in progress, THE Exam_Room_Guard SHALL refuse every Skoolee AI page request from that Candidate's session other than the attempt page, the attempt support pages named in the Delivery_Policy and the sign-out path.
2. WHILE an Attempt for a Candidate is in progress, THE Exam_Room_Guard SHALL refuse every Skoolee AI interface request from that Candidate's session other than the attempt read, attempt save, attempt submit, attempt receipt, Integrity_Signal report, Capture_Service upload and sign-out requests.
3. THE Exam_Room_Guard SHALL enforce the Exam_Room_Boundary on the server for every request, and SHALL treat client-side navigation guards as an additional convenience rather than as the enforcement point.
4. WHEN the Exam_Room_Guard refuses a page request, THE Exam_Room_Guard SHALL return the candidate to the attempt page with a stated reason.
5. WHEN the Exam_Room_Guard refuses an interface request, THE Exam_Room_Guard SHALL return a refusal that names the active Attempt and SHALL exclude every Protected_Key value and every other Candidate's data from that refusal.
6. WHEN an Attempt reaches `SUBMITTED`, `EXPIRED` or another final state, THE Exam_Room_Guard SHALL restore that Candidate's ordinary route and interface access within the next request.
7. WHILE an Attempt is in progress, THE Exam_Room_Guard SHALL refuse a second concurrent writing session for the same Attempt and SHALL admit only the most recently admitted session as the writer.
8. WHEN the Exam_Room_Guard admits a new writing session for an Attempt, THE Exam_Room_Guard SHALL revoke the previous writing session immediately, including a save that the previous session submits after a period offline.
9. THE Exam_Room_Guard SHALL exclude staff roles, Guardian sessions and Platform_Support sessions from the Exam_Room_Boundary.
10. THE Studio_Workspace SHALL label the Exam_Room_Boundary in candidate and staff copy as an in-application restriction, and SHALL state that the Exam_Room_Boundary does not control other applications, other browser tabs outside Skoolee AI, other devices or screenshots.
11. THE Exam_Studio SHALL implement the Exam-Studio-facing contract of the focused session boundary owned by SKO-411, and SHALL record the dependency on SKO-411 for the shared session boundary behavior.
12. WHILE an Attempt is in progress, THE Exam_Room_Guard SHALL permit the Candidate to read the attempt save state and the remaining time at every point, including while a refusal is displayed.
13. IF the Exam_Room_Guard cannot determine whether an Attempt is in progress, THEN THE Exam_Room_Guard SHALL permit the attempt page, SHALL refuse unrelated writes and SHALL record the indeterminate state for staff review.

### Requirement 12: Managed Exam Mode behind validation gates

**User Story:** As an academic approver, I want to require a maintained lockdown client for a high-stakes exam and to know exactly which device and client combinations have been tested, so that an exam either runs on a validated configuration or does not start at all.

#### Acceptance Criteria

1. THE Exam_Studio SHALL supersede the 12 October 2026 standard-browser-only scope decision by adding Managed_Exam_Mode as an additional delivery tier, and SHALL preserve the standard browser tier as a fully supported tier.
2. THE Managed_Mode_Service SHALL store a Delivery_Policy as a versioned, approvable record containing the required delivery tier, the required client identity, the required client configuration identity, the Supported_Device_Matrix reference, the Local_Release bound in seconds, the emergency exit path and the permitted fallback tier.
3. THE Managed_Mode_Service SHALL require an Academic_Approver approval of a Delivery_Policy revision before that revision governs an Attempt.
4. WHEN a client requests admission to an Attempt whose Delivery_Policy requires Managed_Exam_Mode, THE Managed_Mode_Service SHALL verify the client identity and the client configuration identity against the approved Delivery_Policy revision and SHALL record an Admission_Decision with a reason code.
5. IF the requesting client is an ordinary browser, an unsupported client version, an unsupported device from the Supported_Device_Matrix, or a private or incognito browsing context, THEN THE Managed_Mode_Service SHALL refuse admission.
6. IF the Managed_Mode_Service refuses admission, THEN THE Exam_Studio SHALL withhold the Candidate_Projection, SHALL leave the Attempt unstarted and SHALL leave the authoritative deadline unset.
7. THE Managed_Mode_Service SHALL record an Admission_Decision reason code from a closed set covering client mismatch, configuration mismatch, unsupported device, unsupported version, private browsing context, expired policy and validation gate not passed.
8. WHILE the client and configuration validation gate for a Delivery_Policy has no dated pass result, THE Managed_Mode_Service SHALL refuse every admission under that Delivery_Policy.
9. WHILE the Supported_Device_Matrix contains no dated real-device test result for a device class, THE Managed_Mode_Service SHALL refuse admission for that device class.
10. WHILE the Local_Release path and the independent emergency exit path have no dated pass result for a client version, THE Managed_Mode_Service SHALL refuse every admission for that client version.
11. WHEN an Attempt under Managed_Exam_Mode reaches a final state, THE Managed_Mode_Service SHALL request Local_Release and SHALL record the Local_Release outcome with the elapsed seconds, against a target bound of 120 seconds recorded in the Delivery_Policy.
12. THE Managed_Mode_Service SHALL provide an emergency exit path that releases the candidate device independently of Skoolee AI availability, and SHALL record each emergency exit use with actor, Attempt identifier and authoritative timestamp.
13. THE Exam_Studio SHALL refuse a request to change an Attempt's effective delivery tier from Managed_Exam_Mode to the standard tier while that Attempt is in progress.
14. IF a Delivery_Policy requires Managed_Exam_Mode and an authorized Academic_Approver downgrades an unstarted Attempt to the standard tier, THEN THE Managed_Mode_Service SHALL record the downgrade with actor, reason, Attempt identifiers and authoritative timestamp.
15. WHERE an Attempt was downgraded from Managed_Exam_Mode to the standard tier, THE Studio_Workspace SHALL display that Attempt as standard tier together with the recorded downgrade actor and reason.
16. THE Studio_Workspace SHALL display the delivery tier of every Attempt using distinct labels for the Exam_Room_Boundary tier and the Managed_Exam_Mode tier.
17. WHILE a Managed_Exam_Mode validation gate is open, THE Studio_Workspace SHALL display Managed_Exam_Mode as unavailable with the named open gate.
18. WHILE a Managed_Exam_Mode validation gate is open, THE Studio_Workspace SHALL exclude every statement that device lockdown is active.
19. THE Exam_Studio SHALL implement the Exam-Studio-facing policy, admission and interface contract for the managed client owned by SKO-449, and SHALL record that the shipping claim for Managed_Exam_Mode depends on the SKO-449 gates passing on real devices.
20. THE Exam_Studio SHALL replace the current blanket refusal of non-standard modes with a Delivery_Policy-driven decision, and SHALL preserve a refusal for any mode whose validation gates have not passed.
21. THE Managed_Mode_Service SHALL apply the same Delivery_Policy to Attempts that carry accommodations, and SHALL record the accommodation-specific client requirements where an accommodation requires assistive technology.

### Requirement 13: Consented camera and screen capture

**User Story:** As a candidate, I want camera recording to be a separate, clearly explained choice, so that declining does not cost me marks, does not block my exam and does not quietly become an admission requirement.

#### Acceptance Criteria

1. THE Capture_Service SHALL request camera consent and screen consent as a separate decision from the Attempt start, with a recorded consent version.
2. WHEN a Candidate declines camera consent or screen consent, THE Exam_Studio SHALL start the Attempt, SHALL deliver the Candidate_Projection and SHALL set the authoritative deadline unchanged.
3. THE Exam_Studio SHALL exclude a consent decision from every marking, scoring, moderation and result computation.
4. THE Managed_Mode_Service SHALL exclude capture consent from the Admission_Decision, except where an approved Delivery_Policy revision explicitly records capture as required and the Studio_Workspace displays that requirement to the Candidate before the Attempt start.
5. IF a device has no camera, denies the camera permission or loses the camera permission during an Attempt, THEN THE Exam_Studio SHALL continue the Attempt and SHALL record a `CAPTURE_UNAVAILABLE` Integrity_Signal with `INFORMATION` severity.
6. THE Capture_Service SHALL store each recording as a private object outside any publicly served path, and SHALL serve each recording only to roles permitted by Requirement 2.
7. THE Capture_Service SHALL retain each recording for the retention days recorded on the approved policy, within the existing bound of 1 to 7 days.
8. WHEN the retention period of a recording expires, THE Capture_Service SHALL delete that recording and SHALL retain the deletion event with the authoritative timestamp.
9. WHEN a Candidate or an authorized staff member stops a capture session, THE Capture_Service SHALL end that session and SHALL retain every clip already stored under the existing retention rule.
10. THE Studio_Workspace SHALL display an unambiguous recording indicator to the Candidate while a capture session is active.
11. THE Capture_Service SHALL treat every uploaded recording as untrusted data, SHALL verify the container signature before storage and SHALL serve each recording with content-type sniffing disabled.
12. THE Capture_Service SHALL exclude capture recordings from Guardian access and from Platform_Support access.

### Requirement 14: Integrity signals without a misconduct conclusion

**User Story:** As a principal, I want the system to show me timestamped facts about an attempt with their uncertainty, so that I decide what happened instead of an algorithm deciding for me.

#### Acceptance Criteria

1. WHILE an Attempt is in progress, THE Integrity_Signal_Service SHALL record Integrity_Signals for window focus loss, document visibility change, Exam_Room_Boundary refusal, stale heartbeat, reconnect, detected face count change, additional display connection and clipboard paste burst, where the client can observe the event.
2. THE Integrity_Signal_Service SHALL record, for each Integrity_Signal, the Attempt identifier, the signal type, the authoritative server timestamp, the client-reported timestamp, the observed values, the detection method, the Signal_Severity and the Signal_Uncertainty.
3. THE Integrity_Signal_Service SHALL record, within Signal_Uncertainty, the stated known benign causes of that signal type.
4. THE Integrity_Signal_Service SHALL classify every Integrity_Signal as `INFORMATION`, `ATTENTION` or `REVIEW`, and SHALL exclude any classification expressing misconduct, cheating, guilt or dishonesty.
5. THE Integrity_Signal_Service SHALL refuse to change a mark, a score proposal, a result version or an Attempt state in response to an Integrity_Signal.
6. THE Integrity_Signal_Service SHALL refuse to zero, void, flag as invalid or withhold a result in response to an Integrity_Signal.
7. THE Integrity_Signal_Service SHALL refuse to extend time, to end an Attempt, to release a device and to notify a Guardian in response to an Integrity_Signal.
8. WHEN a stale heartbeat, a focus loss or a camera event occurs, THE Integrity_Signal_Service SHALL record the event as an Integrity_Signal only, and SHALL leave the Attempt state and the authoritative deadline unchanged.
9. WHEN the Integrity_Signal_Service groups Integrity_Signals for one Attempt, THE Integrity_Review_Queue SHALL present that group with the signal list, the Signal_Uncertainty of each signal and the available human decisions.
10. THE Integrity_Review_Queue SHALL require a human decision of `NO_CONCERN`, `NOTED`, `ESCALATE` or `REFER_TO_MODERATION`, with the deciding actor, a stated reason and the authoritative timestamp.
11. THE Integrity_Review_Queue SHALL record a decision as a decision about a signal group, and SHALL exclude a recorded conclusion of misconduct produced without a human decision.
12. THE Studio_Workspace SHALL display, with every Integrity_Signal group, the statement that a signal is an observation and not proof of misconduct.
13. THE Integrity_Signal_Service SHALL record a model-produced observation over Integrity_Signals as a proposal with its Signal_Uncertainty, and SHALL require a human decision before that proposal appears in a moderation record or a result record.
14. THE Integrity_Signal_Service SHALL restrict Integrity_Signal read access to Invigilator, Moderator, Academic_Approver and the Author of the released form, within the owning school and campus.
15. THE Integrity_Signal_Service SHALL accept client-reported Integrity_Signals as untrusted data, SHALL validate each report against a closed signal-type set and bounded field sizes, and SHALL record the server timestamp as authoritative.
16. THE Integrity_Signal_Service SHALL retain Integrity_Signals for the retention period recorded on the approved policy and SHALL record each deletion event.

### Requirement 15: Exam control room

**User Story:** As an invigilator running a sitting, I want one live view of who is ready, who is saving, who has an incident and what I am allowed to do, so that I can intervene correctly without ever seeing an answer key.

#### Acceptance Criteria

1. THE Control_Room SHALL display, for each Candidate in the selected sitting, the readiness state, the Attempt state, the last Acknowledged_Revision sequence, the authoritative time of that acknowledgement, the remaining time, the delivery tier, the Admission_Decision reason code where admission was refused and the open Integrity_Signal count.
2. THE Control_Room SHALL display the scope of the current view comprising school, campus, class, subject and sitting, and SHALL require an explicit scope confirmation before a bulk action.
3. WHEN an Invigilator requests extra time for a Candidate, THE Control_Room SHALL require a stated reason and SHALL apply a fixed extra-time value to that Candidate's authoritative deadline.
4. WHEN an Invigilator requests a supervised pause for a Candidate, THE Control_Room SHALL record the pause with actor, reason and authoritative timestamp and SHALL extend that Candidate's authoritative deadline by the recorded paused duration.
5. WHEN an Invigilator requests a Local_Release for a Candidate under Managed_Exam_Mode, THE Control_Room SHALL record the request and SHALL display the Local_Release outcome.
6. THE Control_Room SHALL refuse every Invigilator read of a Protected_Key, of a Candidate response body and of an unreleased result.
7. WHEN an Invigilator submits a bulk action carrying an idempotency key, THE Control_Room SHALL apply that action exactly once for each named Attempt and SHALL return the same outcome for a repeated submission of the same idempotency key.
8. WHEN a bulk action succeeds for some named Attempts and fails for others, THE Control_Room SHALL display the per-Attempt outcome for every named Attempt and SHALL record each outcome durably.
9. THE Control_Room SHALL display Candidates only from the Invigilator's school and campus, and only from sittings assigned to that Invigilator unless the actor holds a manager role.
10. WHILE the Control_Room cannot reach the server, THE Control_Room SHALL display the last successful refresh time and SHALL exclude a stale value presented as live.
11. THE Control_Room SHALL display the authoritative server time used for deadlines alongside the remaining time for each Attempt.
12. THE Exam_Studio SHALL record the integration contract with the scheduling and invigilation work owned by SKO-413 for sitting composition, room allocation and duty assignment, and SHALL read those records rather than reimplementing sitting scheduling.

### Requirement 16: Attempt durability, receipts and session takeover

**User Story:** As a candidate, I want every answer the server accepted to survive a disconnect, a reload and a session change, so that I never lose work and never see two contradictory submission results.

#### Acceptance Criteria

1. WHEN the server commits an Attempt save, THE Exam_Studio SHALL acknowledge that save with the committed revision sequence and the authoritative server time.
2. THE Exam_Studio SHALL preserve every response value in the newest Acknowledged_Revision across reconnect, reload, session takeover and deadline expiry.
3. WHEN an Attempt save arrives with a sequence lower than the current Acknowledged_Revision sequence, THE Exam_Studio SHALL refuse that save as stale and SHALL preserve the current Acknowledged_Revision.
4. WHEN an Attempt save arrives with a sequence equal to the current Acknowledged_Revision sequence, THE Exam_Studio SHALL treat that save as a replay and SHALL return the existing acknowledgement without changing stored responses.
5. WHEN an Attempt reaches a final state, THE Exam_Studio SHALL produce exactly one Attempt_Receipt containing the final state, the final response digest, the Content_Hash of the delivered form, the authoritative final time and the final revision sequence.
6. WHEN a submit request and a deadline expiry occur for the same Attempt within the same interval, THE Exam_Studio SHALL record exactly one final state and SHALL return the same Attempt_Receipt to every subsequent request.
7. WHEN a Candidate requests an Attempt_Receipt after the Attempt reached a final state, THE Exam_Studio SHALL return the identical Attempt_Receipt for every repeated request.
8. WHEN the Exam_Room_Guard admits a new writing session for an Attempt, THE Exam_Studio SHALL refuse every subsequent save from the previous writing session, including a save submitted after a period offline.
9. THE Exam_Studio SHALL compute every deadline from the authoritative server clock and SHALL exclude the client clock from deadline computation.
10. IF an Attempt record is unreadable or fails validation, THEN THE Exam_Studio SHALL report the fault to staff, SHALL preserve every stored response and SHALL withhold a grade for that Attempt.
11. THE Studio_Workspace SHALL display the Attempt save state as one of `SAVED`, `SAVING`, `UNSAVED` or `SAVE_FAILED`, with the authoritative time of the last acknowledged save.
12. THE Studio_Workspace SHALL persist an `UNSAVED` or `SAVE_FAILED` state as a visible, durable interface element until the next acknowledged save, and SHALL exclude a transient notification as the only record of that state.
13. WHEN a submission fails, THE Studio_Workspace SHALL display a persistent failure record with the failure reason and a retry action, and SHALL retain every entered response.
14. THE Exam_Studio SHALL record the integration contract with the sustained exam load verification owned by SKO-451, and SHALL exclude a production capacity claim from this feature's own evidence.

### Requirement 17: Faulty item clarification and remedy

**User Story:** As an academic approver, I want to correct a faulty question during or after a sitting through a recorded, authorized path, so that candidates receive one consistent clarification and marks change only by a human decision.

#### Acceptance Criteria

1. WHEN an Academic_Approver issues a Clarification_Notice during an active sitting, THE Incident_Service SHALL record the notice text, the notice version, the issuing actor, the authoritative timestamp and the defined audience comprising the named Attempts or the named sitting.
2. WHEN a Clarification_Notice is issued, THE Exam_Studio SHALL display that notice to every Candidate in the defined audience whose Attempt is in progress, and SHALL record the display acknowledgement per Attempt.
3. THE Incident_Service SHALL exclude every Candidate outside the defined audience from a Clarification_Notice.
4. WHEN an Academic_Approver revises a Clarification_Notice, THE Incident_Service SHALL create a new notice version, SHALL preserve the previous version and SHALL display the newest version to the defined audience.
5. THE Incident_Service SHALL exclude a change to the Released_Form, the Content_Hash and the Protected_Key when a Clarification_Notice is issued.
6. WHILE an Attempt is in progress, THE Incident_Service SHALL exclude an automatic change to marks, deadlines and item content in response to a reported faulty item.
7. WHEN staff report a faulty item after a sitting, THE Incident_Service SHALL produce a Remedy_Proposal of type `RUBRIC_CORRECTION`, `KEY_CORRECTION`, `REGRADE` or `ITEM_NEUTRALIZATION`, with the affected item, the affected Attempts and the computed mark change per affected Candidate.
8. WHEN a Remedy_Proposal is produced, THE Incident_Service SHALL display a preview listing every affected Candidate, the previous mark, the proposed mark and the proposed total, before any change is applied.
9. THE Incident_Service SHALL require an explicit Academic_Approver authorization naming the Remedy_Proposal identifier before applying a Remedy_Proposal.
10. WHEN an authorized Remedy_Proposal is applied, THE Incident_Service SHALL create a new immutable result version per affected Candidate and SHALL preserve every previous result version.
11. WHEN an authorized Remedy_Proposal is applied, THE Incident_Service SHALL record the applied proposal, the authorizing actor, the authoritative timestamp and the affected result versions.
12. IF applying a Remedy_Proposal fails partway, THEN THE Incident_Service SHALL report the per-Candidate outcome and SHALL leave every unprocessed Candidate's result version unchanged.
13. THE Exam_Studio SHALL record the integration contract with the moderation and regrade work owned by SKO-424 and the item review work owned by SKO-422, and SHALL route moderation decisions through those owners' records rather than duplicating them.

### Requirement 18: Learning recovery loop

**User Story:** As a teacher, I want each student to receive evidence-linked feedback and approved practice after an exam, and a later check on whether the gap closed, so that the exam produces learning instead of only a grade.

#### Acceptance Criteria

1. WHEN a result version is released for a Candidate, THE Recovery_Service SHALL produce a feedback record listing the outcomes the Candidate addressed and the outcomes the Candidate missed, with the item identifiers and the awarded marks as evidence.
2. THE Recovery_Service SHALL link every feedback statement to the exact released item identifier, the awarded marks and the rubric criterion that evidence came from.
3. THE Recovery_Service SHALL exclude a feedback statement that no released item and no awarded mark supports.
4. THE Recovery_Service SHALL produce a Practice_Set derived only from released items, approved sources and approved curriculum outcomes.
5. THE Recovery_Service SHALL refuse to include an item from an unreleased form, an item scheduled in a future Form_Set and a Protected_Key value in a Practice_Set.
6. THE Recovery_Service SHALL require a teacher approval of a Practice_Set before that Practice_Set reaches a Candidate or a Guardian.
7. WHEN a teacher approves a Practice_Set, THE Recovery_Service SHALL record the approving actor, the authoritative timestamp and the approved Practice_Set revision.
8. WHEN a teacher schedules a Formative_Check for an addressed outcome, THE Recovery_Service SHALL release that Formative_Check through the same rehearsal, release and delivery path as any other form.
9. WHEN a Formative_Check result is released, THE Recovery_Service SHALL display the earlier outcome evidence and the later outcome evidence side by side, with the item count and the Candidate count for each observation.
10. THE Recovery_Service SHALL present a change between an earlier and a later outcome observation as an observation with its sample counts, and SHALL exclude every statement that the intervention caused the change.
11. THE Recovery_Service SHALL exclude a teacher ranking, a teacher effectiveness score and a Candidate behavioral inference from every feedback and recovery record.
12. WHERE a Candidate's result version is unreleased, THE Recovery_Service SHALL withhold the feedback record from that Candidate and that Candidate's Guardian.
13. THE Recovery_Service SHALL render feedback and Practice_Set content in the Candidate's recorded interface language from the set English, Arabic and Urdu.

### Requirement 19: Evidence pack export with a verifiable manifest

**User Story:** As a principal facing an appeal or an audit, I want one export containing the complete chain for an assessment with a manifest I can verify, so that a reviewer can confirm nothing was altered after the fact.

#### Acceptance Criteria

1. WHEN an Academic_Approver requests an Evidence_Pack for an assessment or an Attempt, THE Evidence_Pack_Service SHALL include the approved source versions, the taught coverage records, the Assessment_Brief revision, the blueprint revision, the item and key and rubric revisions, the Released_Form revision with the Content_Hash of that revision, the assignment and accommodation records, the Delivery_Policy revision, the Admission_Decisions, the Attempt revisions and Attempt_Receipt, the Integrity_Signals with decisions, the moderation decisions, the result versions and the release and appeal records.
2. THE Evidence_Pack_Service SHALL produce an Integrity_Manifest listing every included file, the digest of each file, the record identifier and the record version of each included record, and the digest algorithm name.
3. THE Evidence_Pack_Service SHALL produce an Integrity_Manifest that an independent verifier can check without access to Skoolee AI.
4. THE Evidence_Pack_Service SHALL record each Integrity_Manifest digest equal to the digest recomputed from the corresponding included file.
5. THE Evidence_Pack_Service SHALL exclude Protected_Key values from an Evidence_Pack unless the requesting actor holds a role permitted to read Protected_Key values under Requirement 2.
6. WHERE an Evidence_Pack includes Protected_Key values, THE Evidence_Pack_Service SHALL record that inclusion in the Integrity_Manifest and in the access audit record.
7. THE Evidence_Pack_Service SHALL exclude Capture_Service recordings from an Evidence_Pack by default, and SHALL include a recording only on an explicit, separately authorized request recorded with actor, reason and authoritative timestamp.
8. WHEN an Evidence_Pack is produced or downloaded, THE Evidence_Pack_Service SHALL record the requesting actor, the scope, the included record versions and the authoritative timestamp.
9. THE Evidence_Pack_Service SHALL restrict an Evidence_Pack to records within the requesting actor's school and campus scope.
10. THE Evidence_Pack_Service SHALL exclude a record from another school and another campus from every Evidence_Pack.
11. IF a requested record version is missing, THEN THE Evidence_Pack_Service SHALL record the gap in the Integrity_Manifest as a named missing record and SHALL complete the remaining export.

### Requirement 20: Exam Studio entry animation

**User Story:** As a teacher opening the Exam Studio, I want a distinctive assistant entry sequence that makes the module feel crafted, so that the flagship surface has a memorable first moment without ever getting in the way of an exam.

#### Acceptance Criteria

1. WHEN a staff member opens Exam_Studio, THE Studio_Intro SHALL play an assistant motion sequence and SHALL then transition into Studio_Workspace.
2. THE Studio_Intro SHALL complete within 1800 milliseconds and SHALL hand interaction to Studio_Workspace at completion.
3. WHEN a user activates any control, presses a key or scrolls during the Studio_Intro, THE Studio_Intro SHALL end immediately and SHALL present Studio_Workspace.
4. WHERE the user agent reports a reduced-motion preference, THE Studio_Intro SHALL present a single static assistant mark with no movement and no transform animation.
5. WHERE the user agent reports a reduced-motion preference, THE Studio_Intro SHALL complete within 200 milliseconds.
6. THE Studio_Intro SHALL play at most once per browser session per user, and SHALL be skippable from a user preference recorded on the account.
7. THE Studio_Intro SHALL exclude itself from the Candidate attempt page, the attempt start action, the Control_Room active view and the print output.
8. THE Studio_Intro SHALL exclude every delay to the Attempt start action, to an Attempt save, to an Attempt submit and to the authoritative deadline.
9. THE Studio_Intro SHALL exclude every overlay of the Attempt save state, the remaining time and the recording indicator.
10. THE Exam_Studio SHALL compute the authoritative deadline independently of the Studio_Intro, so that the Studio_Intro consumes no Attempt time.
11. THE Studio_Intro SHALL use the existing brand tokens, the existing assistant mark and the installed motion library, and SHALL exclude a new visual identity and a new font.
12. THE Studio_Intro SHALL expose no focusable element and SHALL mark every Studio_Intro decorative element as hidden from assistive technology.
13. WHILE the Studio_Intro plays, THE Studio_Workspace SHALL continue loading Studio_Workspace data.
14. THE Studio_Intro SHALL issue no data request.
15. IF the Studio_Intro fails to initialize, THEN THE Studio_Workspace SHALL render without the Studio_Intro.

### Requirement 21: Visual craft within the shared design system

**User Story:** As a designer maintaining Skoolee AI, I want the Exam Studio to be the most polished surface in the product while using the existing components and tokens, so that the flagship does not fork into a second component library.

#### Acceptance Criteria

1. THE Studio_Workspace SHALL compose every control from the existing shared components in `src/components/ui`, following the contracts in `docs/ui-plan/component-contracts.md`.
2. THE Studio_Workspace SHALL use the existing token values recorded in `docs/ui-plan/tokens-and-styles.md` for color, radius, shadow, spacing, type and motion duration.
3. THE Studio_Workspace SHALL exclude a new component library, a new icon set, a new font family and a new color identity.
4. WHERE Exam_Studio requires an interaction pattern that no existing shared component provides, THE Studio_Workspace SHALL add that pattern as a shared component under the existing contracts rather than as a feature-local fork.
5. THE Studio_Workspace SHALL use the existing focus behavior, and SHALL exclude a screen-level focus ring, focus border, focus outline and focus shadow override.
6. THE Studio_Workspace SHALL use the existing modal surface and its layer arithmetic for every dialog, including the full-screen rehearsal and Control_Room surfaces.
7. THE Studio_Workspace SHALL use the existing assessment domain tone for Exam_Studio surfaces and SHALL retain the brand hue for primary actions and active navigation.
8. WHERE the user agent reports a reduced-motion preference, THE Studio_Workspace SHALL remove every decorative animation, including animations driven by the motion library and by numeric count-up code.
9. THE Studio_Workspace SHALL pass the existing shared design-system adoption checks.
10. THE Studio_Workspace SHALL present Exam_Studio within the existing workspace navigation and SHALL preserve the existing permission filtering of workspace tabs.

### Requirement 22: Multilingual and bidirectional presentation

**User Story:** As a teacher in a bilingual school, I want every Exam Studio surface to work in English, Arabic and Urdu, including mathematics inside Arabic text, so that a translated exam reads correctly on screen and on paper.

#### Acceptance Criteria

1. THE Studio_Workspace SHALL present every interface label, accessible name, state label and error message in English, Arabic and Urdu.
2. THE Studio_Workspace SHALL set the document direction to right-to-left for Arabic and Urdu, and to left-to-right for English.
3. THE Studio_Workspace SHALL exclude a translation of a person name, a record identifier, an authored item text, a server code and a Candidate response.
4. THE Studio_Workspace SHALL isolate the direction of authored item text, option text, mathematical notation and code text within a surrounding interface of the opposite direction.
5. THE Exam_Studio SHALL render Arabic-Indic and Extended Arabic-Indic numerals in a Candidate numeric answer as the equivalent value, as the existing numeric answer parser already does.
6. THE Exam_Studio SHALL render each language version of a Released_Form in its correct direction in the browser and in the print output.
7. THE Exam_Studio SHALL render a long form in each of English, Arabic and Urdu across multiple A4 print pages with the page counter, the section headings and the item numbering intact.
8. THE Studio_Workspace SHALL use the existing locale provider and the existing translation message source, and SHALL add English, Arabic and Urdu copy for a new label together.
9. THE Studio_Workspace SHALL use the existing numbered placeholder convention for every composed message, and SHALL exclude concatenated English strings.
10. THE Studio_Workspace SHALL present a Clarification_Notice and an Attempt_Receipt in the Candidate's recorded interface language.

### Requirement 23: Accessibility

**User Story:** As a candidate who uses a keyboard and a screen reader, I want the exam and the studio to be fully operable, so that my accommodation does not depend on an inaccessible interface.

#### Acceptance Criteria

1. THE Exam_Studio SHALL make every control on the attempt page, the Item_Workbench, the rehearsal surface and the Control_Room operable by keyboard alone.
2. THE Exam_Studio SHALL expose an accessible name, a role and the current state for every control, including the Attempt save state, the remaining time and the recording indicator.
3. WHEN the Attempt save state changes, THE Exam_Studio SHALL announce the new state to assistive technology.
4. WHEN the Attempt remaining time crosses a configured warning threshold, THE Exam_Studio SHALL announce the remaining time to assistive technology.
5. THE Exam_Studio SHALL maintain a visible focus indicator on every focusable control, using the existing focus behavior.
6. THE Exam_Studio SHALL support the existing reader, scribe and large-text accommodations on the attempt page.
7. WHERE an Attempt carries a reader, scribe or large-text accommodation, THE Managed_Mode_Service SHALL apply the same approved Delivery_Policy and SHALL record the accommodation-specific client requirement.
8. THE Exam_Studio SHALL preserve every entered response when a Candidate changes the text size, the zoom level or the interface language during an Attempt.
9. THE Exam_Studio SHALL present every state conveyed by color with an additional text or icon indicator.
10. THE Exam_Studio SHALL record that complete assistive-technology and device acceptance requires manual testing with real assistive technology and an expert accessibility review, which this feature's automated checks do not replace.

### Requirement 24: Complete interface state coverage

**User Story:** As a teacher under time pressure, I want every Exam Studio surface to tell me plainly what is empty, loading, partly done, failed or forbidden, so that I never guess whether my work was saved.

#### Acceptance Criteria

1. THE Studio_Workspace SHALL present an empty state naming the next action for every list, queue and panel with no records.
2. WHILE a surface is loading, THE Studio_Workspace SHALL present a loading state using the existing skeleton component.
3. WHEN an operation succeeds for some named targets and fails for others, THE Studio_Workspace SHALL present the per-target outcome for every named target.
4. WHEN an operation fails, THE Studio_Workspace SHALL present the specific failure reason, SHALL retain the entered input and SHALL present a retry action.
5. WHEN an actor lacks a permission for a surface, THE Studio_Workspace SHALL present a permission state naming the required permission and SHALL exclude the restricted data from the response.
6. WHILE a client has lost its server connection, THE Studio_Workspace SHALL present a reconnect state with the time of the last successful exchange.
7. WHEN a client reconnects, THE Studio_Workspace SHALL present the recovery outcome comprising the restored revision sequence and any input the server refused.
8. THE Studio_Workspace SHALL present an unsaved answer, a failed save and a failed submission as a durable interface element that persists until resolution, and SHALL exclude a transient notification as the only record of those states.
9. WHEN a navigation would discard unsaved authoring input, THE Studio_Workspace SHALL present a confirmation naming the unsaved fields.
10. THE Studio_Workspace SHALL present a server-reported failure reason without a provider stack trace, a database error text and an internal file path.
11. THE Studio_Workspace SHALL present the state of each long-running operation, including generation, rehearsal, Evidence_Pack export and bulk Control_Room actions, as a server-recorded state readable after a page reload.

### Requirement 25: Versioned record chain and audit

**User Story:** As an auditor, I want every link from an approved source to a later intervention recorded as an immutable version, so that any result can be traced to the exact material and decisions that produced it.

#### Acceptance Criteria

1. THE Exam_Studio SHALL record the chain approved source version, taught coverage record, Assessment_Brief revision, blueprint revision, item and key and rubric revision, Released_Form revision with Content_Hash and separately protected Protected_Key, Candidate assignment with accommodations and Delivery_Policy revision, Admission_Decision, authoritative deadline, sequenced Attempt revisions and Attempt_Receipt, response and script evidence, moderation decision, immutable result version, result release, appeal record, reviewed intervention, and Formative_Check observation.
2. THE Exam_Studio SHALL store each link of the chain with its own identifier, version number, creating actor, authoritative timestamp and parent link version.
3. THE Exam_Studio SHALL preserve every superseded version as immutable.
4. WHEN a record is approved, THE Exam_Studio SHALL bind that approval to the exact reviewed version identifier.
5. IF an approval request names a version other than the current version, THEN THE Exam_Studio SHALL refuse that approval and SHALL report the version mismatch.
6. WHEN two actors write the same record concurrently, THE Exam_Studio SHALL accept one write using a compare-and-set on the current version and SHALL refuse the other with a conflict report.
7. WHEN an actor restores a historical version, THE Exam_Studio SHALL create a new unapproved draft revision and SHALL preserve the historical version unchanged.
8. THE Exam_Studio SHALL display the complete chain for a selected result version, with each link's version number and authoritative timestamp.
9. THE Exam_Studio SHALL record every approval, release, Admission_Decision, Integrity_Signal decision, Remedy_Proposal authorization, result release and Evidence_Pack export in an append-only audit record.
10. THE Exam_Studio SHALL preserve existing academic and financial records unchanged, and SHALL add new persistence through an additive migration.

### Requirement 26: Untrusted content and provider output isolation

**User Story:** As a security reviewer, I want source documents and model output treated as data, so that a crafted question or a crafted document cannot direct the system or reach a candidate as executable content.

#### Acceptance Criteria

1. THE Exam_Studio SHALL treat every uploaded source document, every extracted text region, every Candidate response and every provider output as untrusted data.
2. THE Exam_Studio SHALL exclude every instruction found inside a source document, an extracted region, a Candidate response and a provider output from the set of operations Exam_Studio performs.
3. THE Exam_Studio SHALL validate every provider output against a strict schema with bounded field sizes before storing that output.
4. IF a provider output fails schema validation, THEN THE Exam_Studio SHALL refuse that output, SHALL record the refusal and SHALL preserve the existing record unchanged.
5. THE Exam_Studio SHALL escape every authored text, option text, Candidate response, Clarification_Notice text and figure caption rendered into the browser output and the print output.
6. THE Exam_Studio SHALL store a Candidate code response as an answer value and SHALL exclude execution of that value.
7. THE Exam_Studio SHALL send provider requests only to an allowlisted provider destination using server-held credentials.
8. WHILE document and audio egress approval is absent from the environment configuration, THE Exam_Studio SHALL withhold document and audio content from every provider request and SHALL keep manual authoring and manual review available.
9. WHEN a provider request fails, THE Studio_Workspace SHALL present a generic provider failure message and SHALL exclude the provider response body and the credential from that message.
10. THE Exam_Studio SHALL refuse a provider output that names a record identifier, a school identifier, a campus identifier or a bank origin outside the requesting actor's current scope.
11. THE Exam_Studio SHALL record the integration contract with the provider policy work owned by SKO-383 and the multimodal intake work owned by SKO-460, and SHALL read those owners' provider and intake records rather than reimplementing provider selection and extraction.

### Requirement 27: Tenant, campus and subject isolation

**User Story:** As a multi-campus group administrator, I want every Exam Studio read and write bounded to the acting user's school, campus and assigned subjects, so that one school never sees another school's exam.

#### Acceptance Criteria

1. THE Studio_Access SHALL bound every Exam_Studio read, write and execution to the acting actor's school identifier.
2. THE Studio_Access SHALL bound every Exam_Studio read, write and execution for a non-super-administrator actor to that actor's campus identifier.
3. THE Studio_Access SHALL bound an Author's reads and writes to subjects and classes currently assigned to that Author.
4. WHEN a request names a record outside the acting actor's school, campus or assigned subject scope, THE Studio_Access SHALL refuse that request with a permission refusal and SHALL exclude the record contents from the refusal.
5. WHEN a subject assignment is removed from an Author, THE Studio_Access SHALL refuse that Author's next read and write for records scoped to the removed subject.
6. WHEN a campus selection changes during an in-flight request, THE Studio_Access SHALL discard a response produced under the previous campus scope.
7. THE Studio_Access SHALL exclude Protected_Key values from every response to a role not permitted to read Protected_Key values under Requirement 2.
8. THE Studio_Access SHALL exclude a Candidate response body, an Integrity_Signal and a Capture_Service recording from every cross-school and cross-campus response.
9. THE Studio_Access SHALL re-check the recorded permissions of a saved operation at execution time against the current permission snapshot.
10. IF a school subscription is suspended, THEN THE Exam_Studio SHALL refuse a new Attempt start and SHALL preserve every stored Attempt, result and Evidence_Pack record.

### Requirement 28: Demonstration dataset as an opt-in, reversible script

**User Story:** As the person demonstrating Exam Studio, I want a synthetic end-to-end dataset I can create and remove deliberately, so that a demonstration never writes invented records into a shared or production database.

#### Acceptance Criteria

1. THE Demo_Dataset_Script SHALL create a synthetic school, campus, class, subject, approved source, curriculum, Assessment_Brief, blueprint, items with keys and rubrics, a Released_Form with a Content_Hash, Candidate assignments, Attempts in several states, Integrity_Signals, moderation decisions, released result versions and a recovery record.
2. THE Demo_Dataset_Script SHALL require an explicit target argument naming the intended database and SHALL refuse to run without that argument.
3. THE Demo_Dataset_Script SHALL print the resolved target host and database name and SHALL require an explicit confirmation argument before writing.
4. THE Demo_Dataset_Script SHALL remain absent from the default database seed command and from the build command.
5. IF the resolved target is not explicitly confirmed, THEN THE Demo_Dataset_Script SHALL exit without writing.
6. THE Demo_Dataset_Script SHALL tag every created record with a recognizable synthetic marker and SHALL provide a reset path that removes exactly the records carrying that marker.
7. THE Demo_Dataset_Script SHALL exclude a write to a record it did not create.
8. THE Demo_Dataset_Script SHALL create a demonstration approver account holding a manager role with a working second factor, because manager roles require multi-factor authentication.
9. THE Demo_Dataset_Script SHALL create every Candidate, Guardian and staff identity as clearly synthetic, and SHALL exclude a real person's name, contact detail and identifier.
10. THE Demo_Dataset_Script SHALL exclude a live communication send, a live payment and a live provider document egress.
11. THE Demo_Dataset_Script SHALL record in its output that the created records are synthetic and are not evidence of a school outcome.
12. THE Exam_Studio SHALL record the integration contract with the demonstration work owned by SKO-452, and SHALL expose the Exam_Studio dataset through that owner's demonstration path where one exists.

### Requirement 29: Integration contracts with neighbouring work

**User Story:** As a delivery lead coordinating several cards, I want SKO-408 to state what it consumes from each neighbouring owner, so that two cards do not implement the same record twice and a shipping claim names its real dependencies.

#### Acceptance Criteria

1. THE Exam_Studio SHALL consume the question bank and blueprint records owned by SKO-407 through that owner's records, and SHALL add per-item review state, staleness and exposure records as Exam_Studio concerns.
2. THE Exam_Studio SHALL consume the accommodation records owned by SKO-410, and SHALL add the Delivery_Policy interaction for accommodations as an Exam_Studio concern.
3. THE Exam_Studio SHALL consume the focused session boundary owned by SKO-411, and SHALL implement the Exam_Room_Boundary decision, the candidate-facing refusal behavior and the honest boundary labelling as Exam_Studio concerns.
4. THE Exam_Studio SHALL consume the managed client validation owned by SKO-449, and SHALL implement Delivery_Policy storage, Admission_Decision, honest interface state and release recording as Exam_Studio concerns.
5. THE Exam_Studio SHALL consume the sitting scheduling and invigilation records owned by SKO-413, and SHALL add the Control_Room live view as an Exam_Studio concern.
6. THE Exam_Studio SHALL consume the scanned script and mark capture records owned by SKO-412 for paper-based evidence.
7. THE Exam_Studio SHALL consume the moderation and regrade records owned by SKO-424 and the item review records owned by SKO-422 for mark changes after an Attempt.
8. THE Exam_Studio SHALL consume the sustained load verification owned by SKO-451 as the source of any delivery capacity statement.
9. THE Exam_Studio SHALL record, for each consumed contract, the owning ticket, the consumed record or decision, and the Exam_Studio behavior when that record is absent.
10. WHERE a consumed owner's gate is open, THE Commercial_Evidence_Register SHALL record the dependent Exam_Studio capability with state `EXTERNAL_GATE_OPEN` and SHALL name the owning ticket.
11. THE Exam_Studio SHALL exclude a duplicate implementation of a record owned by a neighbouring ticket.

### Requirement 30: Verification and implementation constraints

**User Story:** As an engineer picking up this feature, I want the verification obligations and the framework constraints stated up front, so that the implementation is checked the same way the rest of this repository is checked.

#### Acceptance Criteria

1. THE Exam_Studio SHALL add new persistence through an additive migration under the existing migration directory, and SHALL preserve every existing academic, financial and School AI record.
2. THE Exam_Studio SHALL add pure-domain test coverage for every deterministic rule stated in this document, runnable through the existing School AI test command.
3. THE Exam_Studio SHALL add database test coverage for scope, version, approval, concurrency, Attempt save ordering, receipt uniqueness and retention rules, runnable through the existing School AI database test command.
4. THE Exam_Studio SHALL add browser test coverage for the attempt lifecycle, the Exam_Room_Boundary refusal, the Control_Room, the rehearsal surface, the Studio_Intro reduced-motion behavior and the English, Arabic and Urdu surfaces, runnable through the existing School AI browser test configuration.
5. THE Exam_Studio SHALL reuse the existing School AI test fixtures for assessment, browser and proctor scenarios.
6. THE Exam_Studio SHALL pass the existing build command, including type checking, the shared interface adoption check and the commercial contract check.
7. THE Exam_Studio SHALL exclude a live communication send, a live payment, a live financial posting and a write to a shared remote database from every automated test.
8. THE design and implementation phases SHALL read the installed framework guides under `node_modules/next/dist/docs/` before writing routing, proxy, server-component, route-handler and caching code for Exam_Studio.
9. THE Exam_Studio SHALL record every unverifiable claim as an open external gate rather than as a passing check.
10. WHEN a verification result is recorded, THE Commercial_Evidence_Register SHALL record the check name, the command, the date and the observed counts.

## Correctness Properties

These properties are stated for the design phase to turn into property-based tests. Each names the generated input space and the invariant that must hold for every generated case. Properties marked `EXAMPLE` vary little with input and belong in example or integration tests instead.

| ID | Property | Form | Generated input | Requirements |
| --- | --- | --- | --- | --- |
| P1 | No lost acknowledged answer | Invariant | Any interleaving of save, reconnect, reload, takeover and expiry events over a bounded response map | 16.2, 16.3, 16.4 |
| P2 | Newest acknowledged revision wins | Invariant | Any permutation and duplication of save requests with arbitrary sequence numbers | 16.3, 16.4 |
| P3 | Exactly one final receipt | Invariant | Any interleaving of submit requests, duplicate submits and deadline expiry within one interval | 16.5, 16.6, 16.7 |
| P4 | Receipt idempotence | Round trip | Repeated receipt reads after any final state | 16.7 |
| P5 | Takeover revokes the previous writer | Invariant | Any sequence of session admissions with a delayed offline save from a superseded session | 11.7, 11.8, 16.8 |
| P6 | Candidate payload carries no protected value | Invariant | Any generated paper with keys, rubrics, model answers, reviewer notes and semantic review output | 4.11, 8.6, 15.6, 19.5 |
| P7 | Content hash round trip | Round trip | Any released form serialized, re-parsed and re-hashed, with key reordering and whitespace variation | 8.1, 8.2, 8.3, 8.4 |
| P8 | Print and browser parity | Metamorphic | Any released form rendered to both outputs in each of English, Arabic and Urdu | 8.3, 8.4, 22.6 |
| P9 | No cross-tenant or cross-campus read | Invariant | Any pair of schools and campuses with overlapping identifiers across every Exam_Studio read | 27.1, 27.2, 27.4, 19.10 |
| P10 | No silent managed downgrade | Invariant | Any admission request sequence against a managed Delivery_Policy, including ordinary, unsupported and private-context clients | 12.5, 12.6, 12.13, 12.14 |
| P11 | Integrity signals never change an outcome | Invariant | Any generated Integrity_Signal stream over an Attempt with marks and a result version | 14.5, 14.6, 14.7, 14.8 |
| P12 | Consent refusal is outcome-neutral | Metamorphic | Any Attempt replayed with capture consent granted and refused, holding responses constant | 13.2, 13.3 |
| P13 | Locked and unselected items are preserved | Invariant | Any paper with a generated subset of locked items under paper generation, item regeneration and reorder | 5.3, 5.4, 5.8 |
| P14 | Staleness is transitively complete | Invariant | Any edit applied to any upstream field of an approved item or source | 6.1, 6.2, 6.3, 6.5, 6.7 |
| P15 | Approval binds to the reviewed version | Invariant | Any concurrent edit and approval ordering on one record | 25.4, 25.5, 25.6 |
| P16 | Deadline is clock-authoritative | Invariant | Any client-reported time, including times before the start and after the deadline | 16.9, 20.10 |
| P17 | Language versions agree on marks and key structure | Invariant | Any multi-language item group with generated mark and option variations | 9.4, 9.5, 9.8 |
| P18 | One candidate receives one form | Invariant | Any Form_Set assignment across a generated cohort | 10.8, 10.9, 10.10 |
| P19 | Practice sets never leak secured future items | Invariant | Any Practice_Set generated against a bank containing unreleased and future-scheduled items | 18.4, 18.5 |
| P20 | Evidence manifest verifies | Round trip | Any Evidence_Pack export, re-digested by an independent verifier | 19.2, 19.3, 19.4 |
| P21 | Bulk control actions are idempotent | Idempotence | Any repeated bulk action submission with one idempotency key over a generated Attempt set | 15.7, 15.8 |
| P22 | Numeric answer parsing round trip | Round trip | Any numeric value formatted in Western, Arabic-Indic and Extended Arabic-Indic numerals | 22.5 |
| P23 | Rehearsal leaves no residue | Invariant | Any rehearsal run against any saved form | 7.8 |
| P24 | Remedy application is all-or-recorded | Invariant | Any Remedy_Proposal with a generated partial failure point | 17.10, 17.12 |
| P25 | Intro never delays the attempt | `EXAMPLE` | Attempt start with the intro enabled, disabled and under reduced motion | 20.8, 20.10 |
| P26 | Managed client validation gating | `EXAMPLE` | Admission attempts against a policy with each gate open and closed | 12.8, 12.9, 12.10 |

## Out of Scope

1. A certified device lockdown claim. Managed_Exam_Mode ships as policy, admission gating and honest interface state only. The lockdown claim depends on the SKO-449 gates passing on real devices.
2. Operating-system level control of other applications, other devices, screenshots and camera-based room scanning as a blocking control.
3. An automatic misconduct determination, an automatic result void and an automatic family notification.
4. Reimplementation of question bank storage, provider policy, multimodal intake, accommodation records, sitting scheduling, scanned-script marking, moderation and regrade records, and item review records. Those remain with their owning tickets.
5. A production capacity certification. Delivery load evidence comes from SKO-451.
6. A measured school outcome claim. Measurement requires a school pilot.

## Release Gates Requiring External Evidence

The following gates cannot be closed by code or by synthetic tests, and each must appear in the Commercial_Evidence_Register with state `EXTERNAL_GATE_OPEN` until dated evidence exists.

1. Managed client and configuration validation, the Supported_Device_Matrix, the Local_Release bound and the independent emergency exit, each on real devices (SKO-449).
2. Educational calibration of generation, semantic review and marking proposals against representative, properly authorized English, Arabic and Urdu material with independently reviewed expectations.
3. Camera, microphone, screen, printer, browser and assistive-technology device acceptance, including the documented manual path when a device is unsupported.
4. Private storage permissions, recording retention and deletion, backup and restore, and worker dispatch monitoring in the intended environment.
5. Sustained realistic exam load (SKO-451) and a measured school pilot for any setup, review or correction effort figure.
