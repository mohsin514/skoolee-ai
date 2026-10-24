# New feature scope and duplication audit

Reviewed 15 October 2026 against the exact SKO-471, SKO-472 and SKO-473 descriptions in Linear, current schema and implementation. This is source inspection; no production, school, model-quality or interoperability test was performed. The workspace contains ongoing Exam Studio changes, so this is a dated baseline, not a frozen release certification.

All three can have a distinct boundary. SKO-472 has the closest and most urgent connection to the existing flagship. SKO-471 merits discovery with actual receiving schools. SKO-473 should remain optional discovery until teacher effort and accessibility value are established. None should create a second identity, grading, intervention, publication or job system.

| New owner | Existing capabilities that must be reused | Genuinely additional boundary | Recommendation |
| --- | --- | --- | --- |
| SKO-471 Learning Transfer Bridge | Permanent pupil identity/enrollment SKO-394; objective versions SKO-406; guardian permission SKO-395; roster identifiers SKO-446; source review; Learning Action SKO-425 | Authorized cross-institution evidence package, receiving-school transfer case, reviewed source-to-destination objective relations, and non-comparable/diagnostic decisions | Keep as a bounded discovery feature. Existing question reuse mapping is deliberately narrower and must not be relaxed into cross-tenant access. |
| SKO-472 Assessment Repair Map | Exam key correction/result revisions SKO-424; marks/payment corrections SKO-384; immutable reports SKO-375; outbox SKO-382; reviewed runs SKO-470 | Deterministic cross-domain dependency projection, stale downstream action state and a reviewed repair plan with reconciled receipts | Keep. Start with assessed result → gradebook mark → issued report, then add typed action/family dependencies when those owners exist. |
| SKO-473 Reasoning Replay | Submitted work/attempts SKO-409/SKO-411; rubric marking SKO-424; accommodations SKO-410; intake/transcription SKO-460; portfolio SKO-427 | Teacher-approved explanation session bound to a submission/rubric/objective version, visible transcript edits, accessible alternatives and bounded fresh application | Keep in optional discovery. A voice conversation or proctor clip is not already an assessed reasoning session. |

## SKO-471: mapping exists, but it is not a transfer bridge

`StudentEnrollment` and `EnrollmentProposal` in `prisma/schema.prisma:3620` and `:3644` retain school-owned placement and dated history. They do not establish a permissioned cross-school evidence exchange or equivalence between curriculum outcomes.

`src/lib/school-ai/question-bank.ts:37` already maps source outcomes to target outcomes when reusing a reviewed question. It requires the same subject, class and paper language; every source outcome maps once to a distinct current outcome, with exact quoted evidence present in the target curriculum. `src/lib/school-ai/question-bank-service.ts:80` also requires a current approved curriculum in the same campus. This is an important existing mapping primitive, but its one-to-one and same-scope constraints differ from the proposed bridge's one-to-many/no-match and cross-institution educational judgment.

`src/lib/school-ai/learning-service.ts:58` aggregates reviewed assessment evidence against one current curriculum version and authorized current class. It does not compare different curriculum versions semantically or import another school's mastery judgments. `InterventionPlan` currently stores summary/recommendations and approval; the observed AI routes create and approve it. The full typed action/reassessment loop still belongs to SKO-425 rather than being rebuilt by this transfer feature.

Recommended boundary refinements:

- Keep source-system identity, source institution, learner identity and target school's pupil identity distinct until a verified linking decision. A changed filename alone cannot defeat deduplication, but byte equality alone also must not merge two separate learners or transfer cases.
- Represent objective relations as reviewed assertions with source and target revisions, relation type, evidence excerpts, uncertainty and reviewer. Support prerequisite, partial, overlapping and not-comparable relations; do not convert grades into a universal mastery number.
- Use an explicitly permissioned export/import package or approved connection. Do not bypass tenant isolation to fetch another school's records. Guardian viewing permission alone is not evidence that all institution-owned curriculum or licensed assessment material may be exported.
- Revocation stops future access; it cannot recall downloaded documents. A corrected source should mark the dependent bridge decision stale and route a reviewed notice where authorized.

Additional release example: use two unrelated schools with identical pupil names and reused external IDs, import a permitted evidence package twice, confirm one intended case and no cross-link, then correct one source rubric. Only affected mappings/actions should become stale. A no-match outcome must lead to a reviewed diagnostic proposal, not invented placement or aptitude.

## SKO-472: strong new orchestration value over real correction primitives

`src/lib/school-ai/exam-results.ts:35` already validates a current result version, creates `SchoolAiExamResultRevision`, handles matching replay and resolves appeals against the predecessor. Its key-correction preview re-scores objective responses. It does not itself enumerate or repair all downstream marks, reports, family messages and intervention plans.

`src/lib/school-ai/exam-gradebook-service.ts:107` already previews a reviewed attempt-to-gradebook transfer. It hashes source and destination context, blocks incompatible state, creates marks with source audit provenance and stores a durable publication receipt containing assignment/paper/attempt/mark links. An existing publication blocks a fresh publication through that initial transfer path. Therefore a later attempt regrade must not be treated as an automatic gradebook/report update. The existing receipt is a useful dependency edge and the existing correction service is the proper owner of later marks changes.

`src/lib/academic/report-versions.ts` preserves immutable approved/published reports. `src/lib/corrections/service.ts` supplies reviewed correction primitives. `src/lib/school-ai/run-service.ts:54` already pins approved steps and preview hashes, checks current scope and records step receipts; `src/lib/queue/outbox.ts` handles transactional events and uncertain external effects. Reuse them where operations are supported. Adding new repair operations requires their own domain validation; the existing run mechanism does not prove those operation adapters already exist.

Recommended boundary refinements:

- Store or derive typed versioned edges: question/paper → attempt result → gradebook publication receipt/mark → report version → learning action → released family/practice artifact. Mark missing/unsupported edges explicitly. An AI-generated graph is not an authoritative dependency map.
- Begin with an accessible impact list and deterministic before/after values. An optional graph is a navigation aid, not a substitute for complete coverage and permissions. Do not reveal restricted counts or identities through aggregate edges.
- Maintain one owner for each action: SKO-424 revises attempt results; SKO-384 corrects imported marks; SKO-375 issues approved report successors; SKO-425 re-reviews affected learning actions; SKO-419/SKO-423 own released family action/digest updates.
- “Reversible” should mean draft cancellation or another auditable correction where permitted. It must not imply that delivered messages, external exports or prior legal/academic artifacts can be recalled or erased. Retain irreversible effects in the plan/receipt.

Highest-value QA: export an approved attempt to gradebook, publish its report, then correct its key. The impact map must find the stored mark link, create one authorized mark correction and approved report successor, preserve the old artifact and identify any external delivery. Interrupt after each domain commit and verify replay changes no mark twice. Regrade an unrelated item to demonstrate unaffected actions remain current.

## SKO-473: real new assessment mode, not existing voice chat

`SchoolAiExamAttempt` already records responses, sequence/deadline and review versions. `src/lib/school-ai/learning.ts` and `learning-service.ts` provide grounded lessons, semantic item review and reviewed item/outcome aggregates. These do not establish a learner explanation interview, prompt comparability or transfer evidence.

`src/lib/school-ai/conversations.ts:5` permits private WORKSPACE/SETUP conversations. `SchoolAiConversation` binds actor/role and private request history. `src/lib/school-ai/voice.ts` provides bounded speech-turn detection and language selection. These are useful input components; they are not a moderated student explanation session bound to an immutable work/rubric revision. The voice activity detector must not be reused as hesitation, attention or misconduct evidence. Existing proctor sessions/clips have a separate supervision purpose and are not a source of assessment speech evidence by default.

Recommended boundary refinements:

- Introduce a distinct typed session record only for the new lifecycle: original work/version, approved prompts, rubric/objective, permitted-AI policy, response modes, student submission, transcript revision history, review/release and retention references. Reuse storage, current authorization and job primitives rather than inventing another chat history.
- Freeze comparable prompt sets before release, or explicitly record authorized bounded adaptive follow-ups and their rationale. Do not claim that an adaptive conversation gives comparable scores without educator evaluation.
- Text and assisted modes must let the student demonstrate the intended objective. If oral language is itself the assessed objective, an equivalent accommodation requires educator design; a generic text toggle cannot automatically establish equivalence.
- Disclosed AI use is self-reported context, not proof of the learner's complete tool history. Missing explanation, accent, slow speech or transcription uncertainty must not become a cheating accusation or automatic mark penalty.
- Preserve original media according to the approved retention policy and preserve authorized transcript edits as separate versions. Media deletion/expiry should show an evidence-unavailable state, not allow the system to pretend a draft summary remains independently verifiable.

Additional pilot comparison: compare teacher review time and rubric agreement for a short teacher-led explanation versus the proposed system, including EN/AR/UR code-switching, text-only responses, speech impairment accommodations and microphone failure. A later fresh task can provide observed evidence; success on a repeated prompt or inability to explain does not prove transfer or misconduct.

## Scope decision

The three additions do not duplicate the existing primitives when kept within these boundaries. The largest avoidable duplication risks are rebuilding grade correction inside SKO-472, a second intervention plan in SKO-471, or treating private voice conversations/proctor footage as authoritative assessment records in SKO-473. Their unique value depends on correct joins, human review and useful follow-up, not new model calls or additional screens alone.
