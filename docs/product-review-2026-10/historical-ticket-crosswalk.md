# Historical ticket triage and canonical ownership

Snapshot: 15 October 2026. All 469 downloaded issue records were parsed: 95 active canonical milestone owners and 374 archived records. This is an ownership/coverage audit, not a claim every historic defect was reproduced or every acceptance criterion passed. No Linear status, description or archive state was changed by this audit.

Exact title and stable primary feature-number matches identify successors. QA Validates references and exact embedded QA topic headings identify coverage. Older specific QA/bug titles yield explicitly provisional domain owners; ambiguous records remain manual review. Build-sequence numbers alone were not used as identity.

| Classification | Count |
| --- | ---: |
| non_product_tool_onboarding | 4 |
| manual_review_unmapped | 2 |
| legacy_domain_owner_proposal | 184 |
| manual_review_candidate | 5 |
| explicit_successor | 154 |
| qa_embedded_or_explicit_coverage | 24 |
| historical_index | 1 |
| active_canonical | 95 |

The 191 review-required records include legacy domain proposals; this does not mean all are unmapped. Those cases require current-contract review before execution, especially old hard-delete, single-parent, student-read-only, automatic report publication and blanket mandatory-medical assumptions.

SKO-208 → SKO-379 is the design-system lineage. SKO-233/SKO-336 → SKO-408 is the former AI generation lineage that has expanded into Exam Studio. No historical Done status is promoted into a new production-readiness claim.

## Records needing clarification rather than automatic assignment

| Historical issue | Candidate current owner | Reason |
| --- | --- | --- |
| [SKO-5](https://linear.app/skoolee-ai-app/issue/SKO-5/dummy-users-and-data) Dummy Users and Data | Unassigned | Read original evidence and clarify expected current behavior before assigning or creating work. Do not revive or delete automatically. |
| [SKO-167](https://linear.app/skoolee-ai-app/issue/SKO-167/verify-audit-log-entries-for-all-crud-operations) Verify audit log entries for all CRUD operations | Unassigned | Read original evidence and clarify expected current behavior before assigning or creating work. Do not revive or delete automatically. |
| [SKO-183](https://linear.app/skoolee-ai-app/issue/SKO-183/urdu-auto-text-not-generate-correct-delete-this-option-or-fix-with) Urdu auto text not generate correct, delete this option or fix with proper way | SKO-392, SKO-460 | Vague language-generation failure needs an exact Urdu input, expected output, model/prompt/source version and native review before acceptance. |
| [SKO-193](https://linear.app/skoolee-ai-app/issue/SKO-193/search-option) Search option | SKO-401 | Search option is vague; owner is a candidate only until failing route/query/expected result are captured. |
| [SKO-194](https://linear.app/skoolee-ai-app/issue/SKO-194/no-validiation) No validiation | SKO-388 | No validation is vague; capture route, field and malformed input before planning an implementation. |
| [SKO-199](https://linear.app/skoolee-ai-app/issue/SKO-199/in-forms-valid-values) In forms valid values | SKO-388 | In forms valid values is vague; capture actual field/rule and recovery behavior. |
| [SKO-206](https://linear.app/skoolee-ai-app/issue/SKO-206/student-category) Student category | SKO-398 | Student category needs institution-owned semantics and authorization; capture intended workflow before prescribing labels. |

## Complete ownership crosswalk

Every issue appears below. JSON supplies exact source path, snapshot state, mapping evidence, review flag and canonical titles. A proposed owner is not a duplicate declaration.

| Issue | Historical/current title | Class | Current owner(s) |
| --- | --- | --- | --- |
| [SKO-1](https://linear.app/skoolee-ai-app/issue/SKO-1/get-familiar-with-linear) | Get familiar with Linear | non_product_tool_onboarding | — |
| [SKO-2](https://linear.app/skoolee-ai-app/issue/SKO-2/connect-your-tools) | Connect your tools | non_product_tool_onboarding | — |
| [SKO-3](https://linear.app/skoolee-ai-app/issue/SKO-3/import-your-data) | Import your data | non_product_tool_onboarding | — |
| [SKO-4](https://linear.app/skoolee-ai-app/issue/SKO-4/set-up-your-teams) | Set up your teams | non_product_tool_onboarding | — |
| [SKO-5](https://linear.app/skoolee-ai-app/issue/SKO-5/dummy-users-and-data) | Dummy Users and Data | manual_review_unmapped | — |
| [SKO-6](https://linear.app/skoolee-ai-app/issue/SKO-6/verify-login-flow-with-valid-credentials-for-all-8-roles) | Verify login flow with valid credentials for all 8 roles | legacy_domain_owner_proposal | SKO-457, SKO-380 |
| [SKO-7](https://linear.app/skoolee-ai-app/issue/SKO-7/verify-login-rejects-invalid-emailpassword-combination) | Verify login rejects invalid email/password combination | legacy_domain_owner_proposal | SKO-457, SKO-380 |
| [SKO-8](https://linear.app/skoolee-ai-app/issue/SKO-8/verify-jwt-token-stored-in-cookie-after-successful-login) | Verify JWT token stored in cookie after successful login | legacy_domain_owner_proposal | SKO-457, SKO-380 |
| [SKO-9](https://linear.app/skoolee-ai-app/issue/SKO-9/verify-session-get-endpoint-returns-current-user-data) | Verify session GET endpoint returns current user data | legacy_domain_owner_proposal | SKO-457, SKO-380 |
| [SKO-10](https://linear.app/skoolee-ai-app/issue/SKO-10/verify-unauthorized-access-redirects-to-login-page) | Verify unauthorized access redirects to login page | legacy_domain_owner_proposal | SKO-457, SKO-380 |
| [SKO-11](https://linear.app/skoolee-ai-app/issue/SKO-11/verify-role-based-dashboard-redirection-after-login) | Verify role-based dashboard redirection after login | legacy_domain_owner_proposal | SKO-457, SKO-380 |
| [SKO-12](https://linear.app/skoolee-ai-app/issue/SKO-12/verify-session-expiry-and-auto-logout-behavior) | Verify session expiry and auto-logout behavior | legacy_domain_owner_proposal | SKO-457, SKO-380 |
| [SKO-13](https://linear.app/skoolee-ai-app/issue/SKO-13/verify-logout-clears-session-cookie-and-redirects) | Verify logout clears session cookie and redirects | legacy_domain_owner_proposal | SKO-457, SKO-380 |
| [SKO-14](https://linear.app/skoolee-ai-app/issue/SKO-14/verify-super-admin-can-access-all-campuses-and-data) | Verify SUPER_ADMIN can access all campuses and data | legacy_domain_owner_proposal | SKO-377 |
| [SKO-15](https://linear.app/skoolee-ai-app/issue/SKO-15/verify-campus-adminadmin-scoped-to-their-campus-only) | Verify CAMPUS_ADMIN/ADMIN scoped to their campus only | legacy_domain_owner_proposal | SKO-377 |
| [SKO-16](https://linear.app/skoolee-ai-app/issue/SKO-16/verify-principal-can-only-viewmanage-assigned-campus) | Verify PRINCIPAL can only view/manage assigned campus | legacy_domain_owner_proposal | SKO-377 |
| [SKO-17](https://linear.app/skoolee-ai-app/issue/SKO-17/verify-teacher-sees-only-assigned-classes-and-subjects) | Verify TEACHER sees only assigned classes and subjects | legacy_domain_owner_proposal | SKO-377 |
| [SKO-18](https://linear.app/skoolee-ai-app/issue/SKO-18/verify-parent-can-only-access-their-childs-data) | Verify PARENT can only access their child's data | legacy_domain_owner_proposal | SKO-377 |
| [SKO-19](https://linear.app/skoolee-ai-app/issue/SKO-19/verify-student-role-has-read-only-access-to-own-data) | Verify STUDENT role has read-only access to own data | legacy_domain_owner_proposal | SKO-377 |
| [SKO-20](https://linear.app/skoolee-ai-app/issue/SKO-20/verify-non-management-roles-cannot-perform-crud-operations) | Verify non-management roles cannot perform CRUD operations | legacy_domain_owner_proposal | SKO-377 |
| [SKO-21](https://linear.app/skoolee-ai-app/issue/SKO-21/verify-campus-creation-with-required-fields) | Verify campus creation with required fields | legacy_domain_owner_proposal | SKO-402 |
| [SKO-22](https://linear.app/skoolee-ai-app/issue/SKO-22/verify-campus-update-reflects-across-all-related-data) | Verify campus update reflects across all related data | legacy_domain_owner_proposal | SKO-402 |
| [SKO-23](https://linear.app/skoolee-ai-app/issue/SKO-23/verify-campus-scoped-data-isolation-between-campuses) | Verify campus-scoped data isolation between campuses | legacy_domain_owner_proposal | SKO-377 |
| [SKO-24](https://linear.app/skoolee-ai-app/issue/SKO-24/verify-super-admin-can-switch-between-campuses) | Verify SUPER_ADMIN can switch between campuses | legacy_domain_owner_proposal | SKO-379, SKO-377 |
| [SKO-25](https://linear.app/skoolee-ai-app/issue/SKO-25/verify-class-creation-with-single-section) | Verify class creation with single section | legacy_domain_owner_proposal | SKO-462 |
| [SKO-26](https://linear.app/skoolee-ai-app/issue/SKO-26/verify-class-creation-with-single-section) | Verify class creation with single section | legacy_domain_owner_proposal | SKO-462 |
| [SKO-27](https://linear.app/skoolee-ai-app/issue/SKO-27/verify-duplicate-classsectionyear-is-rejected) | Verify duplicate class+section+year is rejected | legacy_domain_owner_proposal | SKO-462 |
| [SKO-28](https://linear.app/skoolee-ai-app/issue/SKO-28/verify-class-teacher-assignment-during-creation) | Verify class teacher assignment during creation | legacy_domain_owner_proposal | SKO-462 |
| [SKO-29](https://linear.app/skoolee-ai-app/issue/SKO-29/verify-class-update-rename-change-section-reassign-teacher) | Verify class update (rename, change section, reassign teacher) | legacy_domain_owner_proposal | SKO-462 |
| [SKO-30](https://linear.app/skoolee-ai-app/issue/SKO-30/verify-class-deletion-blocked-when-students-exist) | Verify class deletion blocked when students exist | legacy_domain_owner_proposal | SKO-389, SKO-462 |
| [SKO-31](https://linear.app/skoolee-ai-app/issue/SKO-31/verify-class-deletion-succeeds-when-empty) | Verify class deletion succeeds when empty | legacy_domain_owner_proposal | SKO-389, SKO-462 |
| [SKO-32](https://linear.app/skoolee-ai-app/issue/SKO-32/verify-class-list-shows-student-count-and-subject-count) | Verify class list shows student count and subject count | legacy_domain_owner_proposal | SKO-462 |
| [SKO-33](https://linear.app/skoolee-ai-app/issue/SKO-33/verify-audit-log-created-for-class-crud-operations) | Verify audit log created for class CRUD operations | legacy_domain_owner_proposal | SKO-462 |
| [SKO-34](https://linear.app/skoolee-ai-app/issue/SKO-34/verify-subject-creation-for-a-class) | Verify subject creation for a class | legacy_domain_owner_proposal | SKO-462 |
| [SKO-35](https://linear.app/skoolee-ai-app/issue/SKO-35/verify-teacher-assignment-to-subject) | Verify teacher assignment to subject | legacy_domain_owner_proposal | SKO-462 |
| [SKO-36](https://linear.app/skoolee-ai-app/issue/SKO-36/verify-subject-teacher-must-belong-to-same-campus) | Verify subject teacher must belong to same campus | legacy_domain_owner_proposal | SKO-462 |
| [SKO-37](https://linear.app/skoolee-ai-app/issue/SKO-37/verify-subject-list-grouped-by-class) | Verify subject list grouped by class | legacy_domain_owner_proposal | SKO-462 |
| [SKO-38](https://linear.app/skoolee-ai-app/issue/SKO-38/verify-subject-deletion-and-cascade-effects) |  Verify subject deletion and cascade effects | legacy_domain_owner_proposal | SKO-389, SKO-462 |
| [SKO-39](https://linear.app/skoolee-ai-app/issue/SKO-39/verify-student-admission-with-all-required-fields) | Verify student admission with all required fields | legacy_domain_owner_proposal | SKO-398 |
| [SKO-40](https://linear.app/skoolee-ai-app/issue/SKO-40/verify-student-transfer-between-classes) | Verify student transfer between classes | legacy_domain_owner_proposal | SKO-394 |
| [SKO-41](https://linear.app/skoolee-ai-app/issue/SKO-41/verify-student-parent-linking-parentuserid) | Verify student-parent linking (parentUserId) | legacy_domain_owner_proposal | SKO-395 |
| [SKO-42](https://linear.app/skoolee-ai-app/issue/SKO-42/verify-student-profile-displays-complete-information) | Verify student profile displays complete information | legacy_domain_owner_proposal | SKO-394 |
| [SKO-43](https://linear.app/skoolee-ai-app/issue/SKO-43/verify-student-deletion-removes-related-data) | Verify student deletion removes related data | legacy_domain_owner_proposal | SKO-389 |
| [SKO-44](https://linear.app/skoolee-ai-app/issue/SKO-44/verify-student-list-pagination-and-search) | Verify student list pagination and search | legacy_domain_owner_proposal | SKO-401 |
| [SKO-45](https://linear.app/skoolee-ai-app/issue/SKO-45/verify-bulk-student-operations-if-supported) | Verify bulk student operations if supported | legacy_domain_owner_proposal | SKO-396 |
| [SKO-46](https://linear.app/skoolee-ai-app/issue/SKO-46/verify-teacher-addition-via-addteacher-action) | Verify teacher addition via addTeacher action | legacy_domain_owner_proposal | SKO-376 |
| [SKO-47](https://linear.app/skoolee-ai-app/issue/SKO-47/verify-staff-addition-via-addstaff-action) | Verify staff addition via addStaff action | legacy_domain_owner_proposal | SKO-376 |
| [SKO-48](https://linear.app/skoolee-ai-app/issue/SKO-48/verify-staff-invitation-via-email) |  Verify staff invitation via email | legacy_domain_owner_proposal | SKO-376 |
| [SKO-49](https://linear.app/skoolee-ai-app/issue/SKO-49/verify-invitation-acceptance-creates-active-user) | Verify invitation acceptance creates active user | legacy_domain_owner_proposal | SKO-376 |
| [SKO-50](https://linear.app/skoolee-ai-app/issue/SKO-50/verify-staff-removal-deactivates-user) | Verify staff removal deactivates user | legacy_domain_owner_proposal | SKO-376 |
| [SKO-51](https://linear.app/skoolee-ai-app/issue/SKO-51/verify-teacher-profile-shows-assigned-classessubjects) | Verify teacher profile shows assigned classes/subjects | legacy_domain_owner_proposal | SKO-399 |
| [SKO-52](https://linear.app/skoolee-ai-app/issue/SKO-52/verify-staff-list-filterable-by-role-and-campus) | Verify staff list filterable by role and campus | legacy_domain_owner_proposal | SKO-376 |
| [SKO-53](https://linear.app/skoolee-ai-app/issue/SKO-53/verify-duplicate-email-rejection-on-staff-creation) | Verify duplicate email rejection on staff creation | legacy_domain_owner_proposal | SKO-376 |
| [SKO-54](https://linear.app/skoolee-ai-app/issue/SKO-54/verify-attendance-marking-for-a-class-on-a-given-date) | Verify attendance marking for a class on a given date | legacy_domain_owner_proposal | SKO-405 |
| [SKO-55](https://linear.app/skoolee-ai-app/issue/SKO-55/verify-attendance-summary-view-dailyweeklymonthly) |  Verify attendance summary view (daily/weekly/monthly) | legacy_domain_owner_proposal | SKO-405 |
| [SKO-56](https://linear.app/skoolee-ai-app/issue/SKO-56/verify-attendance-prevents-duplicate-entry-for-same-date) | Verify attendance prevents duplicate entry for same date | legacy_domain_owner_proposal | SKO-405 |
| [SKO-57](https://linear.app/skoolee-ai-app/issue/SKO-57/verify-attendance-visible-to-parent-for-their-child) | Verify attendance visible to parent for their child | legacy_domain_owner_proposal | SKO-405 |
| [SKO-58](https://linear.app/skoolee-ai-app/issue/SKO-58/verify-attendance-report-generationexport) | Verify attendance report generation/export | legacy_domain_owner_proposal | SKO-405 |
| [SKO-59](https://linear.app/skoolee-ai-app/issue/SKO-59/verify-late-arrival-marking-and-distinction-from-present) |  Verify late arrival marking and distinction from present | legacy_domain_owner_proposal | SKO-405 |
| [SKO-60](https://linear.app/skoolee-ai-app/issue/SKO-60/verify-teacher-attendance-marking-by-adminprincipal) | Verify teacher attendance marking by admin/principal | legacy_domain_owner_proposal | SKO-405 |
| [SKO-61](https://linear.app/skoolee-ai-app/issue/SKO-61/verify-teacher-attendance-report-and-dashboard-stats) | Verify teacher attendance report and dashboard stats | legacy_domain_owner_proposal | SKO-405, SKO-461 |
| [SKO-62](https://linear.app/skoolee-ai-app/issue/SKO-62/verify-teacher-cannot-mark-own-attendance) | Verify teacher cannot mark own attendance | legacy_domain_owner_proposal | SKO-405 |
| [SKO-63](https://linear.app/skoolee-ai-app/issue/SKO-63/verify-exam-creation-with-title-class-date-max-marks) | Verify exam creation with title, class, date, max marks | legacy_domain_owner_proposal | SKO-413, SKO-408 |
| [SKO-64](https://linear.app/skoolee-ai-app/issue/SKO-64/verify-exam-status-lifecycle-draft-active-locked) | Verify exam status lifecycle (draft → active → locked) | legacy_domain_owner_proposal | SKO-375, SKO-408 |
| [SKO-65](https://linear.app/skoolee-ai-app/issue/SKO-65/verify-exam-locking-generates-report-cards) | Verify exam locking generates report cards | legacy_domain_owner_proposal | SKO-375, SKO-408 |
| [SKO-66](https://linear.app/skoolee-ai-app/issue/SKO-66/verify-locked-exam-prevents-further-mark-edits) | Verify locked exam prevents further mark edits | legacy_domain_owner_proposal | SKO-375, SKO-408 |
| [SKO-67](https://linear.app/skoolee-ai-app/issue/SKO-67/verify-exam-list-filtered-by-class-and-academic-year) | Verify exam list filtered by class and academic year | legacy_domain_owner_proposal | SKO-413, SKO-408 |
| [SKO-68](https://linear.app/skoolee-ai-app/issue/SKO-68/verify-exam-update-title-date-max-marks) | Verify exam update (title, date, max marks) | legacy_domain_owner_proposal | SKO-413, SKO-408 |
| [SKO-69](https://linear.app/skoolee-ai-app/issue/SKO-69/verify-marks-entry-for-all-students-in-a-classexam) | Verify marks entry for all students in a class/exam | legacy_domain_owner_proposal | SKO-424 |
| [SKO-70](https://linear.app/skoolee-ai-app/issue/SKO-70/verify-marks-validation-cannot-exceed-max-marks) | Verify marks validation (cannot exceed max marks) | legacy_domain_owner_proposal | SKO-424 |
| [SKO-71](https://linear.app/skoolee-ai-app/issue/SKO-71/verify-marks-update-for-previously-entered-values) | Verify marks update for previously entered values | legacy_domain_owner_proposal | SKO-424 |
| [SKO-72](https://linear.app/skoolee-ai-app/issue/SKO-72/verify-marks-visible-to-teacher-for-their-subjects-only) | Verify marks visible to teacher for their subjects only | legacy_domain_owner_proposal | SKO-377, SKO-424 |
| [SKO-73](https://linear.app/skoolee-ai-app/issue/SKO-73/verify-absent-student-marks-handling) | Verify absent student marks handling | legacy_domain_owner_proposal | SKO-393, SKO-424 |
| [SKO-74](https://linear.app/skoolee-ai-app/issue/SKO-74/verify-report-card-generation-for-an-exam) | Verify report card generation for an exam | legacy_domain_owner_proposal | SKO-375 |
| [SKO-75](https://linear.app/skoolee-ai-app/issue/SKO-75/verify-report-card-review-workflow) | Verify report card review workflow | legacy_domain_owner_proposal | SKO-375 |
| [SKO-76](https://linear.app/skoolee-ai-app/issue/SKO-76/verify-report-card-publishing-makes-it-visible-to-parents) | Verify report card publishing makes it visible to parents | legacy_domain_owner_proposal | SKO-375 |
| [SKO-77](https://linear.app/skoolee-ai-app/issue/SKO-77/verify-report-card-pdf-download) | Verify report card PDF download | legacy_domain_owner_proposal | SKO-375 |
| [SKO-78](https://linear.app/skoolee-ai-app/issue/SKO-78/verify-report-card-contains-correct-marks-and-grades) | Verify report card contains correct marks and grades | legacy_domain_owner_proposal | SKO-375 |
| [SKO-79](https://linear.app/skoolee-ai-app/issue/SKO-79/verify-report-card-remarks-and-teacher-comments) |  Verify report card remarks and teacher comments | legacy_domain_owner_proposal | SKO-375 |
| [SKO-80](https://linear.app/skoolee-ai-app/issue/SKO-80/verify-fee-structure-creation-for-a-class) | Verify fee structure creation for a class | legacy_domain_owner_proposal | SKO-431 |
| [SKO-81](https://linear.app/skoolee-ai-app/issue/SKO-81/verify-fee-structure-update-reflects-on-pending-invoices) | Verify fee structure update reflects on pending invoices | legacy_domain_owner_proposal | SKO-431 |
| [SKO-82](https://linear.app/skoolee-ai-app/issue/SKO-82/verify-fee-structure-per-academic-year-isolation) | Verify fee structure per academic year isolation | legacy_domain_owner_proposal | SKO-431 |
| [SKO-83](https://linear.app/skoolee-ai-app/issue/SKO-83/verify-invoice-generation-for-a-class) | Verify invoice generation for a class | legacy_domain_owner_proposal | SKO-431 |
| [SKO-84](https://linear.app/skoolee-ai-app/issue/SKO-84/verify-payment-recording-manual-entry) | Verify payment recording (manual entry) | legacy_domain_owner_proposal | SKO-432, SKO-431 |
| [SKO-85](https://linear.app/skoolee-ai-app/issue/SKO-85/verify-safepay-online-payment-integration) | Verify SafePay online payment integration | legacy_domain_owner_proposal | SKO-432, SKO-431 |
| [SKO-86](https://linear.app/skoolee-ai-app/issue/SKO-86/verify-invoice-amount-matches-fee-structure) | Verify invoice amount matches fee structure | legacy_domain_owner_proposal | SKO-431 |
| [SKO-87](https://linear.app/skoolee-ai-app/issue/SKO-87/verify-partial-payment-tracking-and-balance-calculation) | Verify partial payment tracking and balance calculation | legacy_domain_owner_proposal | SKO-432, SKO-431 |
| [SKO-88](https://linear.app/skoolee-ai-app/issue/SKO-88/verify-payment-receipt-generation) | Verify payment receipt generation | legacy_domain_owner_proposal | SKO-432, SKO-431 |
| [SKO-89](https://linear.app/skoolee-ai-app/issue/SKO-89/verify-fee-dashboard-shows-collection-summary) | Verify fee dashboard shows collection summary | legacy_domain_owner_proposal | SKO-431 |
| [SKO-90](https://linear.app/skoolee-ai-app/issue/SKO-90/verify-parent-can-view-fee-status-and-payment-history) | Verify parent can view fee status and payment history | legacy_domain_owner_proposal | SKO-431 |
| [SKO-91](https://linear.app/skoolee-ai-app/issue/SKO-91/verify-timetable-creation-for-a-class) | Verify timetable creation for a class | legacy_domain_owner_proposal | SKO-403 |
| [SKO-92](https://linear.app/skoolee-ai-app/issue/SKO-92/verify-timetable-publish-makes-it-visible-to-teachersstudents) | Verify timetable publish makes it visible to teachers/students | legacy_domain_owner_proposal | SKO-403 |
| [SKO-93](https://linear.app/skoolee-ai-app/issue/SKO-93/verify-timetable-slot-conflict-detection) | Verify timetable slot conflict detection | legacy_domain_owner_proposal | SKO-403 |
| [SKO-94](https://linear.app/skoolee-ai-app/issue/SKO-94/verify-timetable-update-reschedule-slots) | Verify timetable update (reschedule slots) | legacy_domain_owner_proposal | SKO-403 |
| [SKO-95](https://linear.app/skoolee-ai-app/issue/SKO-95/verify-timetable-deletion) | Verify timetable deletion | legacy_domain_owner_proposal | SKO-403 |
| [SKO-96](https://linear.app/skoolee-ai-app/issue/SKO-96/verify-teachers-personal-timetable-view) | Verify teacher's personal timetable view | legacy_domain_owner_proposal | SKO-403 |
| [SKO-97](https://linear.app/skoolee-ai-app/issue/SKO-97/verify-academic-year-creation) | Verify academic year creation | legacy_domain_owner_proposal | SKO-393 |
| [SKO-98](https://linear.app/skoolee-ai-app/issue/SKO-98/verify-academic-year-closing) | Verify academic year closing | legacy_domain_owner_proposal | SKO-404 |
| [SKO-99](https://linear.app/skoolee-ai-app/issue/SKO-99/verify-student-promotion-to-next-class) | Verify student promotion to next class | legacy_domain_owner_proposal | SKO-404 |
| [SKO-100](https://linear.app/skoolee-ai-app/issue/SKO-100/verify-academic-cycle-creation-and-status-changes) | Verify academic cycle creation and status changes | legacy_domain_owner_proposal | SKO-393 |
| [SKO-101](https://linear.app/skoolee-ai-app/issue/SKO-101/verify-promoted-students-appear-in-new-class-roster) | Verify promoted students appear in new class roster | legacy_domain_owner_proposal | SKO-404 |
| [SKO-102](https://linear.app/skoolee-ai-app/issue/SKO-102/verify-data-rollover-between-academic-years) | Verify data rollover between academic years | legacy_domain_owner_proposal | SKO-404 |
| [SKO-103](https://linear.app/skoolee-ai-app/issue/SKO-103/verify-sse-connection-establishes-on-page-load) | Verify SSE connection establishes on page load | legacy_domain_owner_proposal | SKO-416 |
| [SKO-104](https://linear.app/skoolee-ai-app/issue/SKO-104/verify-real-time-notification-appears-on-bell-icon) | Verify real-time notification appears on bell icon | legacy_domain_owner_proposal | SKO-416 |
| [SKO-105](https://linear.app/skoolee-ai-app/issue/SKO-105/verify-cross-tab-notification-sync) | Verify cross-tab notification sync | legacy_domain_owner_proposal | SKO-416 |
| [SKO-106](https://linear.app/skoolee-ai-app/issue/SKO-106/verify-notification-recipients-match-role-based-rules) | Verify notification recipients match role-based rules | legacy_domain_owner_proposal | SKO-416 |
| [SKO-107](https://linear.app/skoolee-ai-app/issue/SKO-107/verify-notification-badge-shows-correct-unread-count) | Verify notification badge shows correct unread count | legacy_domain_owner_proposal | SKO-416 |
| [SKO-108](https://linear.app/skoolee-ai-app/issue/SKO-108/verify-notification-dropdown-displays-title-message-time) | Verify notification dropdown displays title, message, time | legacy_domain_owner_proposal | SKO-416 |
| [SKO-109](https://linear.app/skoolee-ai-app/issue/SKO-109/verify-mark-single-notification-as-read-on-click) | Verify mark single notification as read on click | legacy_domain_owner_proposal | SKO-416 |
| [SKO-110](https://linear.app/skoolee-ai-app/issue/SKO-110/verify-mark-all-notifications-as-read) | Verify mark all notifications as read | legacy_domain_owner_proposal | SKO-416 |
| [SKO-111](https://linear.app/skoolee-ai-app/issue/SKO-111/verify-sse-auto-reconnect-after-connection-drop) | Verify SSE auto-reconnect after connection drop | legacy_domain_owner_proposal | SKO-416 |
| [SKO-112](https://linear.app/skoolee-ai-app/issue/SKO-112/verify-notifications-persist-after-page-refresh) | Verify notifications persist after page refresh | legacy_domain_owner_proposal | SKO-416 |
| [SKO-113](https://linear.app/skoolee-ai-app/issue/SKO-113/verify-self-notification-is-suppressed-actor-excluded) | Verify self-notification is suppressed (actor excluded) | legacy_domain_owner_proposal | SKO-416 |
| [SKO-114](https://linear.app/skoolee-ai-app/issue/SKO-114/verify-super-admin-receives-notifications-from-all-campuses) | Verify SUPER_ADMIN receives notifications from all campuses | legacy_domain_owner_proposal | SKO-416 |
| [SKO-115](https://linear.app/skoolee-ai-app/issue/SKO-115/verify-notification-pagination-cursor-based) | Verify notification pagination (cursor-based) | legacy_domain_owner_proposal | SKO-416 |
| [SKO-116](https://linear.app/skoolee-ai-app/issue/SKO-116/verify-empty-state-when-no-notifications-exist) | Verify empty state when no notifications exist | legacy_domain_owner_proposal | SKO-416 |
| [SKO-117](https://linear.app/skoolee-ai-app/issue/SKO-117/verify-heartbeat-keepalive-prevents-sse-timeout) | Verify heartbeat keepalive prevents SSE timeout | legacy_domain_owner_proposal | SKO-416 |
| [SKO-118](https://linear.app/skoolee-ai-app/issue/SKO-118/verify-whatsapp-notification-delivery-for-fee-reminders) | Verify WhatsApp notification delivery for fee reminders | legacy_domain_owner_proposal | SKO-416, SKO-431 |
| [SKO-119](https://linear.app/skoolee-ai-app/issue/SKO-119/verify-email-notification-delivery-for-report-card-publish) | Verify email notification delivery for report card publish | legacy_domain_owner_proposal | SKO-386, SKO-375 |
| [SKO-120](https://linear.app/skoolee-ai-app/issue/SKO-120/verify-absence-alert-notification-to-parent) | Verify absence alert notification to parent | legacy_domain_owner_proposal | SKO-405, SKO-416 |
| [SKO-121](https://linear.app/skoolee-ai-app/issue/SKO-121/verify-notification-queue-processing-bullmq) | Verify notification queue processing (BullMQ) | legacy_domain_owner_proposal | SKO-382 |
| [SKO-122](https://linear.app/skoolee-ai-app/issue/SKO-122/verify-notification-templates-render-correctly) | Verify notification templates render correctly | legacy_domain_owner_proposal | SKO-416, SKO-392 |
| [SKO-123](https://linear.app/skoolee-ai-app/issue/SKO-123/verify-notification-automation-cron-triggers) | Verify notification automation cron triggers | legacy_domain_owner_proposal | SKO-382, SKO-416 |
| [SKO-124](https://linear.app/skoolee-ai-app/issue/SKO-124/verify-class-created-notification-to-admins-and-principal) | Verify CLASS_CREATED notification to admins and principal | legacy_domain_owner_proposal | SKO-416 |
| [SKO-125](https://linear.app/skoolee-ai-app/issue/SKO-125/verify-class-updated-notification-includes-class-teacher) | Verify CLASS_UPDATED notification includes class teacher | legacy_domain_owner_proposal | SKO-416 |
| [SKO-126](https://linear.app/skoolee-ai-app/issue/SKO-126/verify-student-admitted-notification-to-class-teacher) | Verify STUDENT_ADMITTED notification to class teacher | legacy_domain_owner_proposal | SKO-416 |
| [SKO-127](https://linear.app/skoolee-ai-app/issue/SKO-127/verify-attendance-submitted-notification-to-principal) | Verify ATTENDANCE_SUBMITTED notification to principal | legacy_domain_owner_proposal | SKO-416 |
| [SKO-128](https://linear.app/skoolee-ai-app/issue/SKO-128/verify-exam-created-notification-to-class-teachers) | Verify EXAM_CREATED notification to class teachers | legacy_domain_owner_proposal | SKO-416 |
| [SKO-129](https://linear.app/skoolee-ai-app/issue/SKO-129/verify-exam-locked-notification-triggers-report-card-flow) | Verify EXAM_LOCKED notification triggers report card flow | legacy_domain_owner_proposal | SKO-416 |
| [SKO-130](https://linear.app/skoolee-ai-app/issue/SKO-130/verify-marks-entered-notification-to-principal) | Verify MARKS_ENTERED notification to principal | legacy_domain_owner_proposal | SKO-416 |
| [SKO-131](https://linear.app/skoolee-ai-app/issue/SKO-131/verify-payment-recorded-notification-to-admin) | Verify PAYMENT_RECORDED notification to admin | legacy_domain_owner_proposal | SKO-416 |
| [SKO-132](https://linear.app/skoolee-ai-app/issue/SKO-132/verify-invoices-generated-notification-with-count) | Verify INVOICES_GENERATED notification with count | legacy_domain_owner_proposal | SKO-416 |
| [SKO-133](https://linear.app/skoolee-ai-app/issue/SKO-133/verify-timetable-published-notification-to-affected-teachers) | Verify TIMETABLE_PUBLISHED notification to affected teachers | legacy_domain_owner_proposal | SKO-416 |
| [SKO-134](https://linear.app/skoolee-ai-app/issue/SKO-134/verify-academic-year-closed-notification-to-all-campus-staff) | Verify ACADEMIC_YEAR_CLOSED notification to all campus staff | legacy_domain_owner_proposal | SKO-416 |
| [SKO-135](https://linear.app/skoolee-ai-app/issue/SKO-135/verify-students-promoted-notification-with-count) | Verify STUDENTS_PROMOTED notification with count | legacy_domain_owner_proposal | SKO-416 |
| [SKO-136](https://linear.app/skoolee-ai-app/issue/SKO-136/verify-admin-dashboard-loads-all-summary-widgets) | Verify admin dashboard loads all summary widgets | legacy_domain_owner_proposal | SKO-379 |
| [SKO-137](https://linear.app/skoolee-ai-app/issue/SKO-137/verify-admin-attendance-panel-shows-todays-overview) | Verify admin attendance panel shows today's overview | legacy_domain_owner_proposal | SKO-405 |
| [SKO-138](https://linear.app/skoolee-ai-app/issue/SKO-138/verify-admin-can-switch-campus-context-super-admin) | Verify admin can switch campus context (SUPER_ADMIN) | legacy_domain_owner_proposal | SKO-379 |
| [SKO-139](https://linear.app/skoolee-ai-app/issue/SKO-139/verify-admin-quick-actions-navigate-to-correct-pages) | Verify admin quick actions navigate to correct pages | legacy_domain_owner_proposal | SKO-379 |
| [SKO-140](https://linear.app/skoolee-ai-app/issue/SKO-140/verify-admin-data-context-loads-without-errors) | Verify admin data context loads without errors | legacy_domain_owner_proposal | SKO-379 |
| [SKO-141](https://linear.app/skoolee-ai-app/issue/SKO-141/verify-principal-dashboard-shows-campus-scoped-data) | Verify principal dashboard shows campus-scoped data | legacy_domain_owner_proposal | SKO-417 |
| [SKO-142](https://linear.app/skoolee-ai-app/issue/SKO-142/verify-principal-attendance-panel-functionality) | Verify principal attendance panel functionality | legacy_domain_owner_proposal | SKO-405 |
| [SKO-143](https://linear.app/skoolee-ai-app/issue/SKO-143/verify-principal-can-view-all-classes-and-teachers) | Verify principal can view all classes and teachers | legacy_domain_owner_proposal | SKO-417 |
| [SKO-144](https://linear.app/skoolee-ai-app/issue/SKO-144/verify-teacher-dashboard-shows-assigned-classes-only) | Verify teacher dashboard shows assigned classes only | legacy_domain_owner_proposal | SKO-379, SKO-377 |
| [SKO-145](https://linear.app/skoolee-ai-app/issue/SKO-145/verify-teacher-can-mark-attendance-for-assigned-class) | Verify teacher can mark attendance for assigned class | legacy_domain_owner_proposal | SKO-405 |
| [SKO-146](https://linear.app/skoolee-ai-app/issue/SKO-146/verify-teacher-can-enter-marks-for-assigned-subjects) | Verify teacher can enter marks for assigned subjects | legacy_domain_owner_proposal | SKO-424 |
| [SKO-147](https://linear.app/skoolee-ai-app/issue/SKO-147/verify-teacher-timetable-view-shows-daily-schedule) | Verify teacher timetable view shows daily schedule | legacy_domain_owner_proposal | SKO-403 |
| [SKO-148](https://linear.app/skoolee-ai-app/issue/SKO-148/verify-parent-dashboard-shows-linked-childs-overview) | Verify parent dashboard shows linked child's overview | legacy_domain_owner_proposal | SKO-419, SKO-395 |
| [SKO-149](https://linear.app/skoolee-ai-app/issue/SKO-149/verify-parent-can-view-published-report-cards) | Verify parent can view published report cards | legacy_domain_owner_proposal | SKO-375 |
| [SKO-150](https://linear.app/skoolee-ai-app/issue/SKO-150/verify-parent-can-view-fee-invoices-and-payment-status) | Verify parent can view fee invoices and payment status | legacy_domain_owner_proposal | SKO-431 |
| [SKO-151](https://linear.app/skoolee-ai-app/issue/SKO-151/verify-parent-receives-real-time-notifications) | Verify parent receives real-time notifications | legacy_domain_owner_proposal | SKO-416 |
| [SKO-152](https://linear.app/skoolee-ai-app/issue/SKO-152/verify-student-dashboard-shows-personal-academic-data) | Verify student dashboard shows personal academic data | legacy_domain_owner_proposal | SKO-418 |
| [SKO-153](https://linear.app/skoolee-ai-app/issue/SKO-153/verify-student-can-view-own-timetable) | Verify student can view own timetable | legacy_domain_owner_proposal | SKO-403, SKO-418 |
| [SKO-154](https://linear.app/skoolee-ai-app/issue/SKO-154/verify-student-can-view-own-attendance-record) | Verify student can view own attendance record | legacy_domain_owner_proposal | SKO-405, SKO-418 |
| [SKO-155](https://linear.app/skoolee-ai-app/issue/SKO-155/verify-responsive-layout-on-mobile-375px) | Verify responsive layout on mobile (375px) | legacy_domain_owner_proposal | SKO-379, SKO-388 |
| [SKO-156](https://linear.app/skoolee-ai-app/issue/SKO-156/verify-skeleton-loaders-display-during-data-fetch) | Verify skeleton loaders display during data fetch | legacy_domain_owner_proposal | SKO-379, SKO-388 |
| [SKO-157](https://linear.app/skoolee-ai-app/issue/SKO-157/verify-responsive-layout-on-tablet-768px) | Verify responsive layout on tablet (768px) | legacy_domain_owner_proposal | SKO-379, SKO-388 |
| [SKO-158](https://linear.app/skoolee-ai-app/issue/SKO-158/verify-notification-bell-and-dropdown-on-mobile) | Verify notification bell and dropdown on mobile | legacy_domain_owner_proposal | SKO-416, SKO-379 |
| [SKO-159](https://linear.app/skoolee-ai-app/issue/SKO-159/verify-error-toast-messages-display-on-failed-operations) | Verify error toast messages display on failed operations | legacy_domain_owner_proposal | SKO-379, SKO-388 |
| [SKO-160](https://linear.app/skoolee-ai-app/issue/SKO-160/verify-loading-states-on-form-submissions) | Verify loading states on form submissions | legacy_domain_owner_proposal | SKO-379, SKO-388 |
| [SKO-161](https://linear.app/skoolee-ai-app/issue/SKO-161/verify-empty-states-across-all-list-views) | Verify empty states across all list views | legacy_domain_owner_proposal | SKO-379, SKO-388 |
| [SKO-162](https://linear.app/skoolee-ai-app/issue/SKO-162/verify-multi-tenant-data-isolation-schoolid-scoping) | Verify multi-tenant data isolation (schoolId scoping) | legacy_domain_owner_proposal | SKO-377 |
| [SKO-163](https://linear.app/skoolee-ai-app/issue/SKO-163/verify-concurrent-class-creation-doesnt-create-duplicates) | Verify concurrent class creation doesn't create duplicates | legacy_domain_owner_proposal | SKO-462 |
| [SKO-164](https://linear.app/skoolee-ai-app/issue/SKO-164/verify-cascading-deletes-dont-orphan-records) | Verify cascading deletes don't orphan records | legacy_domain_owner_proposal | SKO-389 |
| [SKO-165](https://linear.app/skoolee-ai-app/issue/SKO-165/verify-api-input-validation-rejects-malformed-data) | Verify API input validation rejects malformed data | legacy_domain_owner_proposal | SKO-388, SKO-377 |
| [SKO-166](https://linear.app/skoolee-ai-app/issue/SKO-166/verify-large-dataset-handling-100-students-per-class) | Verify large dataset handling (100+ students per class) | legacy_domain_owner_proposal | SKO-451 |
| [SKO-167](https://linear.app/skoolee-ai-app/issue/SKO-167/verify-audit-log-entries-for-all-crud-operations) | Verify audit log entries for all CRUD operations | manual_review_unmapped | — |
| [SKO-168](https://linear.app/skoolee-ai-app/issue/SKO-168/verify-unicode-support-in-names-and-text-fields) | Verify Unicode support in names and text fields | legacy_domain_owner_proposal | SKO-392 |
| [SKO-169](https://linear.app/skoolee-ai-app/issue/SKO-169/verify-safepay-webhook-callback-processes-payments) | Verify SafePay webhook callback processes payments | legacy_domain_owner_proposal | SKO-432 |
| [SKO-170](https://linear.app/skoolee-ai-app/issue/SKO-170/verify-all-api-endpoints-return-consistent-response-shape) | Verify all API endpoints return consistent response shape | legacy_domain_owner_proposal | SKO-445 |
| [SKO-171](https://linear.app/skoolee-ai-app/issue/SKO-171/verify-redis-connection-handles-reconnects-gracefully) | Verify Redis connection handles reconnects gracefully | legacy_domain_owner_proposal | SKO-382 |
| [SKO-172](https://linear.app/skoolee-ai-app/issue/SKO-172/verify-bullmq-job-queue-processes-notification-jobs) | Verify BullMQ job queue processes notification jobs | legacy_domain_owner_proposal | SKO-382 |
| [SKO-173](https://linear.app/skoolee-ai-app/issue/SKO-173/verify-prisma-query-performance-on-indexed-columns) | Verify Prisma query performance on indexed columns | legacy_domain_owner_proposal | SKO-451 |
| [SKO-174](https://linear.app/skoolee-ai-app/issue/SKO-174/onboarding-school-details-multiple-issues) | Onboarding – School Details Multiple Issues | legacy_domain_owner_proposal | SKO-391, SKO-402 |
| [SKO-175](https://linear.app/skoolee-ai-app/issue/SKO-175/add-campus-edit-option-missing-for-existing-campus) | Add Campus – Edit Option Missing for Existing Campus | legacy_domain_owner_proposal | SKO-402 |
| [SKO-176](https://linear.app/skoolee-ai-app/issue/SKO-176/add-campus-no-confirmation-alert-on-campus-deletion) | Add Campus – No Confirmation Alert on Campus Deletion | legacy_domain_owner_proposal | SKO-389, SKO-402 |
| [SKO-177](https://linear.app/skoolee-ai-app/issue/SKO-177/add-campus-missing-validation-for-phone-and-email-fields) | Add Campus – Missing Validation for Phone and Email Fields | legacy_domain_owner_proposal | SKO-402 |
| [SKO-178](https://linear.app/skoolee-ai-app/issue/SKO-178/basic-package-incorrect-alert-message-when-adding-multiple-campuses) | Basic Package – Incorrect Alert Message When Adding Multiple Campuses | legacy_domain_owner_proposal | SKO-373, SKO-387 |
| [SKO-179](https://linear.app/skoolee-ai-app/issue/SKO-179/add-new-school-error-occurs-after-entering-mandatory-data) | Add New School – Error Occurs After Entering Mandatory Data | legacy_domain_owner_proposal | SKO-402 |
| [SKO-180](https://linear.app/skoolee-ai-app/issue/SKO-180/campus-admin-and-principal-invitation-email-received-in-spam-folder) | Campus Admin and Principal Invitation Email Received in Spam Folder | legacy_domain_owner_proposal | SKO-376, SKO-386 |
| [SKO-181](https://linear.app/skoolee-ai-app/issue/SKO-181/notification-error) | Notification error | legacy_domain_owner_proposal | SKO-416 |
| [SKO-182](https://linear.app/skoolee-ai-app/issue/SKO-182/uploading-attachent-error-in-chats) | Uploading attach,ent error in chats | legacy_domain_owner_proposal | SKO-415 |
| [SKO-183](https://linear.app/skoolee-ai-app/issue/SKO-183/urdu-auto-text-not-generate-correct-delete-this-option-or-fix-with) | Urdu auto text not generate correct, delete this option or fix with proper way | manual_review_candidate | SKO-392, SKO-460 |
| [SKO-184](https://linear.app/skoolee-ai-app/issue/SKO-184/groups-option-in-student-new-registration-have-no-lists-like-hostel) | Groups option in student new registration have no lists like hostel transport etc | legacy_domain_owner_proposal | SKO-398, SKO-463, SKO-437 |
| [SKO-185](https://linear.app/skoolee-ai-app/issue/SKO-185/guardian-detailcontact-in-student-registration-form-should-be) | Guardian detail(Contact) in student registration form should be mandatory | legacy_domain_owner_proposal | SKO-398, SKO-395 |
| [SKO-186](https://linear.app/skoolee-ai-app/issue/SKO-186/in-new-admission-medical-and-adress-info-should-be-mandatory) | In new admission medical and adress info should be mandatory | legacy_domain_owner_proposal | SKO-398, SKO-439 |
| [SKO-187](https://linear.app/skoolee-ai-app/issue/SKO-187/parents-invitation-mail-is-go-in-spam-not-in-mail-box-so-its-may-b) | Parents invitation mail is go in spam not in mail box so its may b difficult for parents to locate that mail..mail should be sent in mail box | legacy_domain_owner_proposal | SKO-395, SKO-376, SKO-386 |
| [SKO-188](https://linear.app/skoolee-ai-app/issue/SKO-188/when-parent-accept-invitation-and-create-password-if-he-miss-any-thing) | when parent accept invitation and create password if he miss any thing there should bhe show error message that thing is missing for creating new password that error should be visible | legacy_domain_owner_proposal | SKO-457 |
| [SKO-189](https://linear.app/skoolee-ai-app/issue/SKO-189/the-first-two-filters-in-the-student-directory-are-not-working-the) | The first two filters in the student directory are not working; the results do not change when they are clicked. Those filters are 'students on roll' and 'classes with student'. | legacy_domain_owner_proposal | SKO-401 |
| [SKO-190](https://linear.app/skoolee-ai-app/issue/SKO-190/in-the-campus-command-centre-when-we-click-an-option-and-it-redirects) | In the Campus Command Centre, when we click an option and it redirects us to the same tab instead of opening a pop-up, there should be a separate 'Back' button to take us straight back to the Command Centre. This way, we won't have to keep reopening the Command Centre or rely on the Chrome back button | legacy_domain_owner_proposal | SKO-388 |
| [SKO-191](https://linear.app/skoolee-ai-app/issue/SKO-191/027-global-search-and-reliable-directory-filters) | [027] Global search and reliable directory filters | explicit_successor | SKO-401 |
| [SKO-192](https://linear.app/skoolee-ai-app/issue/SKO-192/new-school-adding-problem) | New school adding problem | legacy_domain_owner_proposal | SKO-402 |
| [SKO-193](https://linear.app/skoolee-ai-app/issue/SKO-193/search-option) | Search option | manual_review_candidate | SKO-401 |
| [SKO-194](https://linear.app/skoolee-ai-app/issue/SKO-194/no-validiation) | No validiation | manual_review_candidate | SKO-388 |
| [SKO-195](https://linear.app/skoolee-ai-app/issue/SKO-195/015-safe-deletion-archival-and-restore) | [015] Safe deletion, archival and restore | explicit_successor | SKO-389 |
| [SKO-196](https://linear.app/skoolee-ai-app/issue/SKO-196/014-draft-recovery-consistent-navigation-and-accessibility) | [014] Draft recovery, consistent navigation and accessibility | explicit_successor | SKO-388 |
| [SKO-197](https://linear.app/skoolee-ai-app/issue/SKO-197/066-facilities-requests-and-internal-service-desk) | [066] Facilities requests and internal service desk | explicit_successor | SKO-441 |
| [SKO-198](https://linear.app/skoolee-ai-app/issue/SKO-198/031-year-end-rollover-and-promotion-review) | [031] Year-end rollover and promotion review | explicit_successor | SKO-404 |
| [SKO-199](https://linear.app/skoolee-ai-app/issue/SKO-199/in-forms-valid-values) | In forms valid values | manual_review_candidate | SKO-388 |
| [SKO-200](https://linear.app/skoolee-ai-app/issue/SKO-200/028-school-and-campus-lifecycle-editing) | [028] School and campus lifecycle editing | explicit_successor | SKO-402 |
| [SKO-201](https://linear.app/skoolee-ai-app/issue/SKO-201/018-language-rtl-timezone-calendar-and-currency-packages) | [018] Language, RTL, timezone, calendar and currency packages | explicit_successor | SKO-392 |
| [SKO-202](https://linear.app/skoolee-ai-app/issue/SKO-202/043-principal-action-queue) | [043] Principal action queue | explicit_successor | SKO-417 |
| [SKO-203](https://linear.app/skoolee-ai-app/issue/SKO-203/042-actionable-notification-center) | [042] Actionable notification center | explicit_successor | SKO-416 |
| [SKO-204](https://linear.app/skoolee-ai-app/issue/SKO-204/026-learning-resource-and-document-library) | [026] Learning resource and document library | explicit_successor | SKO-400 |
| [SKO-205](https://linear.app/skoolee-ai-app/issue/SKO-205/024-configurable-admission-forms-and-enquiry-pipeline) | [024] Configurable admission forms and enquiry pipeline | explicit_successor | SKO-398 |
| [SKO-206](https://linear.app/skoolee-ai-app/issue/SKO-206/student-category) | Student category | manual_review_candidate | SKO-398 |
| [SKO-207](https://linear.app/skoolee-ai-app/issue/SKO-207/002-shared-authorization-and-tenantcampuschild-ownership-rules) | [002] Shared authorization and tenant/campus/child ownership rules | explicit_successor | SKO-377 |
| [SKO-208](https://linear.app/skoolee-ai-app/issue/SKO-208/001-shared-design-system-and-role-based-navigation) | [001] Shared design system and role-based navigation | explicit_successor | SKO-379 |
| [SKO-209](https://linear.app/skoolee-ai-app/issue/SKO-209/004-reliable-account-lifecycle-and-administrator-mfa) | [004] Reliable account lifecycle and administrator MFA | explicit_successor | SKO-380 |
| [SKO-210](https://linear.app/skoolee-ai-app/issue/SKO-210/005-approved-report-versions-and-publication-gates) | [005] Approved report versions and publication gates | explicit_successor | SKO-375 |
| [SKO-211](https://linear.app/skoolee-ai-app/issue/SKO-211/006-truthful-marketing-and-synchronized-pricing-entitlements) | [006] Truthful marketing and synchronized pricing entitlements | explicit_successor | SKO-378 |
| [SKO-212](https://linear.app/skoolee-ai-app/issue/SKO-212/007-backups-restore-rehearsals-and-migration-checks) | [007] Backups, restore rehearsals and migration checks | explicit_successor | SKO-381 |
| [SKO-213](https://linear.app/skoolee-ai-app/issue/SKO-213/008-auditable-grade-and-finance-corrections) | [008] Auditable grade and finance corrections | explicit_successor | SKO-384 |
| [SKO-214](https://linear.app/skoolee-ai-app/issue/SKO-214/009-ai-provider-policy-privacy-and-evaluation-gateway) | [009] AI provider policy, privacy and evaluation gateway | explicit_successor | SKO-383 |
| [SKO-215](https://linear.app/skoolee-ai-app/issue/SKO-215/016-audited-support-access-and-service-operations) | [016] Audited support access and service operations | explicit_successor | SKO-390 |
| [SKO-216](https://linear.app/skoolee-ai-app/issue/SKO-216/019-configurable-curriculum-grading-and-term-structures) | [019] Configurable curriculum, grading and term structures | explicit_successor | SKO-393 |
| [SKO-217](https://linear.app/skoolee-ai-app/issue/SKO-217/020-permanent-student-identity-and-enrollment-history) | [020] Permanent student identity and enrollment history | explicit_successor | SKO-394 |
| [SKO-218](https://linear.app/skoolee-ai-app/issue/SKO-218/073-regional-hosting-and-data-lifecycle-controls) | [073] Regional hosting and data lifecycle controls | explicit_successor | SKO-447 |
| [SKO-219](https://linear.app/skoolee-ai-app/issue/SKO-219/003-role-assignment-invitations-and-institution-membership-ux) | [003] Role assignment, invitations and institution membership UX | explicit_successor | SKO-376 |
| [SKO-220](https://linear.app/skoolee-ai-app/issue/SKO-220/010-durable-event-outbox-and-job-orchestration) | [010] Durable event outbox and job orchestration | explicit_successor | SKO-382 |
| [SKO-221](https://linear.app/skoolee-ai-app/issue/SKO-221/011-package-comparison-trial-and-checkout-during-registration) | [011] Package comparison, trial and checkout during registration | explicit_successor | SKO-387 |
| [SKO-222](https://linear.app/skoolee-ai-app/issue/SKO-222/012-subscription-lifecycle-group-billing-and-entitlement-enforcement) | [012] Subscription lifecycle, group billing and entitlement enforcement | explicit_successor | SKO-373 |
| [SKO-223](https://linear.app/skoolee-ai-app/issue/SKO-223/013-job-status-retries-and-delivery-receipts) | [013] Job status, retries and delivery receipts | explicit_successor | SKO-386 |
| [SKO-224](https://linear.app/skoolee-ai-app/issue/SKO-224/017-separate-standalone-and-school-group-onboarding-with-resumable) | [017] Separate standalone and school-group onboarding with resumable setup | explicit_successor | SKO-391 |
| [SKO-225](https://linear.app/skoolee-ai-app/issue/SKO-225/021-multiple-guardians-and-granular-accessconsent) | [021] Multiple guardians and granular access/consent | explicit_successor | SKO-395 |
| [SKO-226](https://linear.app/skoolee-ai-app/issue/SKO-226/022-reversible-imports-and-clear-validation) | [022] Reversible imports and clear validation | explicit_successor | SKO-396 |
| [SKO-227](https://linear.app/skoolee-ai-app/issue/SKO-227/023-guided-school-setup-and-import-reconciliation) | [023] Guided school setup and import reconciliation | explicit_successor | SKO-397 |
| [SKO-228](https://linear.app/skoolee-ai-app/issue/SKO-228/025-staff-hierarchy-workload-and-absence-cover) | [025] Staff hierarchy, workload and absence cover | explicit_successor | SKO-399 |
| [SKO-229](https://linear.app/skoolee-ai-app/issue/SKO-229/029-teaching-timetable-conflicts-and-publication) | [029] Teaching timetable conflicts and publication | explicit_successor | SKO-403 |
| [SKO-230](https://linear.app/skoolee-ai-app/issue/SKO-230/030-attendance-accuracy-and-exception-handling) | [030] Attendance accuracy and exception handling | explicit_successor | SKO-405 |
| [SKO-231](https://linear.app/skoolee-ai-app/issue/SKO-231/032-curriculum-and-learning-objective-map) | [032] Curriculum and learning objective map | explicit_successor | SKO-406 |
| [SKO-232](https://linear.app/skoolee-ai-app/issue/SKO-232/033-reviewed-question-bank-and-assessment-blueprints) | [033] Reviewed question bank and assessment blueprints | explicit_successor | SKO-407 |
| [SKO-233](https://linear.app/skoolee-ai-app/issue/SKO-233/034-ai-quiztest-generation-with-source-references) | [034] AI quiz/test generation with source references | explicit_successor | SKO-408 |
| [SKO-234](https://linear.app/skoolee-ai-app/issue/SKO-234/035-assignments-submissions-and-rubrics) | [035] Assignments, submissions and rubrics | explicit_successor | SKO-409 |
| [SKO-235](https://linear.app/skoolee-ai-app/issue/SKO-235/036-assessment-accommodations-and-accessible-materials) | [036] Assessment accommodations and accessible materials | explicit_successor | SKO-410 |
| [SKO-236](https://linear.app/skoolee-ai-app/issue/SKO-236/037-exam-attempts-with-autosave-and-recovery) | [037] Exam attempts with autosave and recovery | explicit_successor | SKO-411 |
| [SKO-237](https://linear.app/skoolee-ai-app/issue/SKO-237/038-exam-scheduling-room-capacity-and-invigilation) | [038] Exam scheduling, room capacity and invigilation | explicit_successor | SKO-413 |
| [SKO-238](https://linear.app/skoolee-ai-app/issue/SKO-238/039-paper-marks-scan-with-teacher-approved-import) | [039] Paper marks scan with teacher-approved import | explicit_successor | SKO-412 |
| [SKO-239](https://linear.app/skoolee-ai-app/issue/SKO-239/040-lesson-plans-and-differentiated-activity-groups) | [040] Lesson plans and differentiated activity groups | explicit_successor | SKO-414 |
| [SKO-240](https://linear.app/skoolee-ai-app/issue/SKO-240/041-messaging-and-attachment-reliability) | [041] Messaging and attachment reliability | explicit_successor | SKO-415 |
| [SKO-241](https://linear.app/skoolee-ai-app/issue/SKO-241/044-student-today-page) | [044] Student Today page | explicit_successor | SKO-418 |
| [SKO-242](https://linear.app/skoolee-ai-app/issue/SKO-242/045-family-action-inbox-across-siblings) | [045] Family action inbox across siblings | explicit_successor | SKO-419 |
| [SKO-243](https://linear.app/skoolee-ai-app/issue/SKO-243/046-absence-explanation-leave-and-trip-consent) | [046] Absence explanation, leave and trip consent | explicit_successor | SKO-421 |
| [SKO-244](https://linear.app/skoolee-ai-app/issue/SKO-244/047-weekly-family-digest-and-short-home-practice) | [047] Weekly family digest and short home practice | explicit_successor | SKO-423 |
| [SKO-245](https://linear.app/skoolee-ai-app/issue/SKO-245/048-parent-teacher-meeting-booking-and-follow-up) | [048] Parent-teacher meeting booking and follow-up | explicit_successor | SKO-420 |
| [SKO-246](https://linear.app/skoolee-ai-app/issue/SKO-246/049-question-level-misconception-and-item-review) | [049] Question-level misconception and item review | explicit_successor | SKO-422 |
| [SKO-247](https://linear.app/skoolee-ai-app/issue/SKO-247/050-marking-moderation-and-regrade-workflow) | [050] Marking moderation and regrade workflow | explicit_successor | SKO-424 |
| [SKO-248](https://linear.app/skoolee-ai-app/issue/SKO-248/051-intervention-ownership-and-reassessment) | [051] Intervention ownership and reassessment | explicit_successor | SKO-425 |
| [SKO-249](https://linear.app/skoolee-ai-app/issue/SKO-249/052-practice-with-hints-and-spaced-review) | [052] Practice with hints and spaced review | explicit_successor | SKO-426 |
| [SKO-250](https://linear.app/skoolee-ai-app/issue/SKO-250/053-feedback-and-improvement-portfolio) | [053] Feedback and improvement portfolio | explicit_successor | SKO-427 |
| [SKO-251](https://linear.app/skoolee-ai-app/issue/SKO-251/054-source-grounded-student-study-assistant) | [054] Source-grounded student study assistant | explicit_successor | SKO-428 |
| [SKO-252](https://linear.app/skoolee-ai-app/issue/SKO-252/055-school-policy-assistant-with-cited-answers) | [055] School policy assistant with cited answers | explicit_successor | SKO-429 |
| [SKO-253](https://linear.app/skoolee-ai-app/issue/SKO-253/056-pilot-adoption-and-value-measurement) | [056] Pilot adoption and value measurement | explicit_successor | SKO-430 |
| [SKO-254](https://linear.app/skoolee-ai-app/issue/SKO-254/057-secure-fee-statements-installments-and-receipts) | [057] Secure fee statements, installments and receipts | explicit_successor | SKO-431 |
| [SKO-255](https://linear.app/skoolee-ai-app/issue/SKO-255/058-payment-reconciliation-and-duplicate-prevention) | [058] Payment reconciliation and duplicate prevention | explicit_successor | SKO-432 |
| [SKO-256](https://linear.app/skoolee-ai-app/issue/SKO-256/059-refunds-credit-notes-waivers-and-approval-separation) | [059] Refunds, credit notes, waivers and approval separation | explicit_successor | SKO-433 |
| [SKO-257](https://linear.app/skoolee-ai-app/issue/SKO-257/060-payroll-provider-interfaces-and-local-rules) | [060] Payroll provider interfaces and local rules | explicit_successor | SKO-434 |
| [SKO-258](https://linear.app/skoolee-ai-app/issue/SKO-258/061-purchasing-budgets-and-asset-maintenance) | [061] Purchasing, budgets and asset maintenance | explicit_successor | SKO-435 |
| [SKO-259](https://linear.app/skoolee-ai-app/issue/SKO-259/062-library-reservations-barcode-issuereturn-and-fine-policy) | [062] Library reservations, barcode issue/return and fine policy | explicit_successor | SKO-436 |
| [SKO-260](https://linear.app/skoolee-ai-app/issue/SKO-260/063-bus-boarding-arrival-and-handover-records) | [063] Bus boarding, arrival and handover records | explicit_successor | SKO-437 |
| [SKO-261](https://linear.app/skoolee-ai-app/issue/SKO-261/064-authorized-qr-pickup) | [064] Authorized QR pickup | explicit_successor | SKO-438 |
| [SKO-262](https://linear.app/skoolee-ai-app/issue/SKO-262/065-restricted-clinic-and-safeguarding-workflows) | [065] Restricted clinic and safeguarding workflows | explicit_successor | SKO-439 |
| [SKO-263](https://linear.app/skoolee-ai-app/issue/SKO-263/067-clubs-sports-trips-and-participation) | [067] Clubs, sports, trips and participation | explicit_successor | SKO-440 |
| [SKO-264](https://linear.app/skoolee-ai-app/issue/SKO-264/068-substitute-teacher-and-missed-lesson-recovery) | [068] Substitute teacher and missed-lesson recovery | explicit_successor | SKO-442 |
| [SKO-265](https://linear.app/skoolee-ai-app/issue/SKO-265/069-school-group-policy-templates-with-controlled-local-overrides) | [069] School-group policy templates with controlled local overrides | explicit_successor | SKO-443 |
| [SKO-266](https://linear.app/skoolee-ai-app/issue/SKO-266/070-country-specific-tax-and-invoice-packages) | [070] Country-specific tax and invoice packages | explicit_successor | SKO-444 |
| [SKO-267](https://linear.app/skoolee-ai-app/issue/SKO-267/071-versioned-apis-webhooks-and-integration-monitoring) | [071] Versioned APIs, webhooks and integration monitoring | explicit_successor | SKO-445 |
| [SKO-268](https://linear.app/skoolee-ai-app/issue/SKO-268/072-school-identity-integration-and-roster-exchange) | [072] School identity integration and roster exchange | explicit_successor | SKO-446 |
| [SKO-269](https://linear.app/skoolee-ai-app/issue/SKO-269/074-low-bandwidth-operation-and-conflict-aware-offline-capture) | [074] Low-bandwidth operation and conflict-aware offline capture | explicit_successor | SKO-448 |
| [SKO-270](https://linear.app/skoolee-ai-app/issue/SKO-270/075-safe-exam-browser-integration) | [075] Safe Exam Browser integration | explicit_successor | SKO-449 |
| [SKO-271](https://linear.app/skoolee-ai-app/issue/SKO-271/076-improvement-and-accreditation-evidence-workspace) | [076] Improvement and accreditation evidence workspace | explicit_successor | SKO-450 |
| [SKO-272](https://linear.app/skoolee-ai-app/issue/SKO-272/077-peak-load-performance-and-tenant-fairness) | [077] Peak-load performance and tenant fairness | explicit_successor | SKO-451 |
| [SKO-273](https://linear.app/skoolee-ai-app/issue/SKO-273/078-leap-demo-case-studies-and-launch-readiness) | [078] LEAP demo, case studies and launch readiness | explicit_successor | SKO-452 |
| [SKO-274](https://linear.app/skoolee-ai-app/issue/SKO-274/079-capacity-and-staffing-scenario-planning) | [079] Capacity and staffing scenario planning | explicit_successor | SKO-453 |
| [SKO-275](https://linear.app/skoolee-ai-app/issue/SKO-275/080-teacher-question-quality-review-network) | [080] Teacher question-quality review network | explicit_successor | SKO-454 |
| [SKO-276](https://linear.app/skoolee-ai-app/issue/SKO-276/081-careers-counseling-and-alumni-pathways) | [081] Careers, counseling and alumni pathways | explicit_successor | SKO-455 |
| [SKO-277](https://linear.app/skoolee-ai-app/issue/SKO-277/082-optional-canteen-boarding-and-specialist-school-packages) | [082] Optional canteen, boarding and specialist school packages | explicit_successor | SKO-456 |
| [SKO-278](https://linear.app/skoolee-ai-app/issue/SKO-278/qa-shared-visual-system-navigation-and-page-states-across-roles) | [QA] Shared visual system, navigation and page states across roles | qa_embedded_or_explicit_coverage | SKO-388, SKO-379 |
| [SKO-279](https://linear.app/skoolee-ai-app/issue/SKO-279/qa-authentication-invitations-role-scope-and-cross-tenant-access) | [QA] Authentication, invitations, role scope and cross-tenant access | qa_embedded_or_explicit_coverage | SKO-377, SKO-380, SKO-376 |
| [SKO-280](https://linear.app/skoolee-ai-app/issue/SKO-280/qa-supported-languages-translation-and-arabic-rtl-coverage) | [QA] Supported languages, translation and Arabic RTL coverage | qa_embedded_or_explicit_coverage | SKO-392, SKO-379 |
| [SKO-281](https://linear.app/skoolee-ai-app/issue/SKO-281/qa-first-school-onboarding-from-empty-tenant-to-ready-campus) | [QA] First-school onboarding from empty tenant to ready campus | qa_embedded_or_explicit_coverage | SKO-387, SKO-391, SKO-397 |
| [SKO-282](https://linear.app/skoolee-ai-app/issue/SKO-282/qa-school-structure-academic-year-classes-subjects-and-staff) | [QA] School structure, academic year, classes, subjects and staff assignments | qa_embedded_or_explicit_coverage | SKO-402, SKO-393, SKO-399 |
| [SKO-283](https://linear.app/skoolee-ai-app/issue/SKO-283/qa-student-guardian-and-staff-directory-imports-with-reconciliation) | [QA] Student, guardian and staff directory imports with reconciliation | qa_embedded_or_explicit_coverage | SKO-394, SKO-395, SKO-396 |
| [SKO-284](https://linear.app/skoolee-ai-app/issue/SKO-284/qa-teacher-workspace-curriculum-sources-and-lesson-preparation) | [QA] Teacher workspace, curriculum sources and lesson preparation | qa_embedded_or_explicit_coverage | SKO-400, SKO-406, SKO-414 |
| [SKO-285](https://linear.app/skoolee-ai-app/issue/SKO-285/qa-timetable-calendar-date-sheet-and-seating-plan-constraints) | [QA] Timetable, calendar, date-sheet and seating-plan constraints | qa_embedded_or_explicit_coverage | SKO-413 |
| [SKO-286](https://linear.app/skoolee-ai-app/issue/SKO-286/qa-syllabus-and-past-paper-intake-by-upload-scan-chat-and-audio) | [QA] Syllabus and past-paper intake by upload, scan, chat and audio | qa_embedded_or_explicit_coverage | SKO-383, SKO-406, SKO-407 |
| [SKO-287](https://linear.app/skoolee-ai-app/issue/SKO-287/qa-ai-quiz-and-exam-paper-generation-with-teacher-review) | [QA] AI quiz and exam-paper generation with teacher review | qa_embedded_or_explicit_coverage | SKO-375, SKO-407, SKO-408 |
| [SKO-288](https://linear.app/skoolee-ai-app/issue/SKO-288/qa-student-and-guardian-learning-assignments-and-result-visibility) | [QA] Student and guardian learning, assignments and result visibility | qa_embedded_or_explicit_coverage | SKO-411, SKO-418, SKO-419, SKO-428 |
| [SKO-289](https://linear.app/skoolee-ai-app/issue/SKO-289/qa-results-report-cards-ai-feedback-and-publication-approval) | [QA] Results, report cards, AI feedback and publication approval | qa_embedded_or_explicit_coverage | SKO-375, SKO-422, SKO-424 |
| [SKO-290](https://linear.app/skoolee-ai-app/issue/SKO-290/qa-messaging-announcements-attachments-and-delivery-recovery) | [QA] Messaging, announcements, attachments and delivery recovery | qa_embedded_or_explicit_coverage | SKO-416, SKO-386, SKO-415 |
| [SKO-291](https://linear.app/skoolee-ai-app/issue/SKO-291/qa-marking-assistance-paper-scan-and-teacher-approved-marks-import) | [QA] Marking assistance, paper scan and teacher-approved marks import | qa_embedded_or_explicit_coverage | SKO-412, SKO-424 |
| [SKO-292](https://linear.app/skoolee-ai-app/issue/SKO-292/qa-tuition-fees-invoices-installments-receipts-and-reconciliation) | [QA] Tuition fees, invoices, installments, receipts and reconciliation | qa_embedded_or_explicit_coverage | SKO-384, SKO-431, SKO-432 |
| [SKO-293](https://linear.app/skoolee-ai-app/issue/SKO-293/qa-payroll-revenue-and-ai-assisted-finance-insights) | [QA] Payroll, revenue and AI-assisted finance insights | qa_embedded_or_explicit_coverage | SKO-383 |
| [SKO-294](https://linear.app/skoolee-ai-app/issue/SKO-294/qa-ai-provider-readiness-privacy-limits-and-failure-recovery) | [QA] AI provider readiness, privacy, limits and failure recovery | qa_embedded_or_explicit_coverage | SKO-375, SKO-377, SKO-383 |
| [SKO-295](https://linear.app/skoolee-ai-app/issue/SKO-295/qa-secure-exam-browser-claims-and-standard-browser-attempt-controls) | [QA] Secure exam browser claims and standard-browser attempt controls | qa_embedded_or_explicit_coverage | SKO-411, SKO-449 |
| [SKO-296](https://linear.app/skoolee-ai-app/issue/SKO-296/qa-integration-webhooks-background-jobs-and-recovery-receipts) | [QA] Integration webhooks, background jobs and recovery receipts | qa_embedded_or_explicit_coverage | SKO-382, SKO-386, SKO-445 |
| [SKO-297](https://linear.app/skoolee-ai-app/issue/SKO-297/qa-student-teacher-and-class-performance-insights-with-evidence) | [QA] Student, teacher and class performance insights with evidence | qa_embedded_or_explicit_coverage | SKO-422, SKO-425, SKO-430 |
| [SKO-298](https://linear.app/skoolee-ai-app/issue/SKO-298/qa-ai-supported-timetable-finance-and-school-risk-recommendations) | [QA] AI-supported timetable, finance and school-risk recommendations | qa_embedded_or_explicit_coverage | SKO-383 |
| [SKO-299](https://linear.app/skoolee-ai-app/issue/SKO-299/qa-ai-generated-announcements-translations-and-report-narratives) | [QA] AI-generated announcements, translations and report narratives | qa_embedded_or_explicit_coverage | SKO-392, SKO-375, SKO-415 |
| [SKO-300](https://linear.app/skoolee-ai-app/issue/SKO-300/qa-migration-backup-configuration-and-environment-readiness) | [QA] Migration, backup, configuration and environment readiness | qa_embedded_or_explicit_coverage | SKO-381, SKO-383, SKO-382, SKO-451 |
| [SKO-301](https://linear.app/skoolee-ai-app/issue/SKO-301/qa-full-school-leap-pilot-journey-and-release-evidence-review) | [QA] Full-school LEAP pilot journey and release evidence review | qa_embedded_or_explicit_coverage | SKO-452 |
| [SKO-302](https://linear.app/skoolee-ai-app/issue/SKO-302/prd-skoolee-ai-product-scope-and-execution-index) | [PRD] Skoolee AI product scope and execution index | historical_index | — |
| [SKO-303](https://linear.app/skoolee-ai-app/issue/SKO-303/001-shared-design-system-and-role-based-navigation) | [001] Shared design system and role-based navigation | explicit_successor | SKO-379 |
| [SKO-304](https://linear.app/skoolee-ai-app/issue/SKO-304/002-shared-authorization-and-tenantcampuschild-ownership-rules) | [002] Shared authorization and tenant/campus/child ownership rules | explicit_successor | SKO-377 |
| [SKO-305](https://linear.app/skoolee-ai-app/issue/SKO-305/003-role-assignment-invitations-and-institution-membership-ux) | [003] Role assignment, invitations and institution membership UX | explicit_successor | SKO-376 |
| [SKO-306](https://linear.app/skoolee-ai-app/issue/SKO-306/004-reliable-account-lifecycle-and-administrator-mfa) | [004] Reliable account lifecycle and administrator MFA | explicit_successor | SKO-380 |
| [SKO-307](https://linear.app/skoolee-ai-app/issue/SKO-307/005-approved-report-versions-and-publication-gates) | [005] Approved report versions and publication gates | explicit_successor | SKO-375 |
| [SKO-308](https://linear.app/skoolee-ai-app/issue/SKO-308/006-truthful-marketing-and-synchronized-pricing-entitlements) | [006] Truthful marketing and synchronized pricing entitlements | explicit_successor | SKO-378 |
| [SKO-309](https://linear.app/skoolee-ai-app/issue/SKO-309/007-backups-restore-rehearsals-and-migration-checks) | [007] Backups, restore rehearsals and migration checks | explicit_successor | SKO-381 |
| [SKO-310](https://linear.app/skoolee-ai-app/issue/SKO-310/008-auditable-grade-and-finance-corrections) | [008] Auditable grade and finance corrections | explicit_successor | SKO-384 |
| [SKO-311](https://linear.app/skoolee-ai-app/issue/SKO-311/009-ai-provider-policy-privacy-and-evaluation-gateway) | [009] AI provider policy, privacy and evaluation gateway | explicit_successor | SKO-383 |
| [SKO-312](https://linear.app/skoolee-ai-app/issue/SKO-312/010-durable-event-outbox-and-job-orchestration) | [010] Durable event outbox and job orchestration | explicit_successor | SKO-382 |
| [SKO-313](https://linear.app/skoolee-ai-app/issue/SKO-313/011-package-comparison-trial-and-checkout-during-registration) | [011] Package comparison, trial and checkout during registration | explicit_successor | SKO-387 |
| [SKO-314](https://linear.app/skoolee-ai-app/issue/SKO-314/012-subscription-lifecycle-group-billing-and-entitlement-enforcement) | [012] Subscription lifecycle, group billing and entitlement enforcement | explicit_successor | SKO-373 |
| [SKO-315](https://linear.app/skoolee-ai-app/issue/SKO-315/013-job-status-retries-and-delivery-receipts) | [013] Job status, retries and delivery receipts | explicit_successor | SKO-386 |
| [SKO-316](https://linear.app/skoolee-ai-app/issue/SKO-316/014-draft-recovery-consistent-navigation-and-accessibility) | [014] Draft recovery, consistent navigation and accessibility | explicit_successor | SKO-388 |
| [SKO-317](https://linear.app/skoolee-ai-app/issue/SKO-317/015-safe-deletion-archival-and-restore) | [015] Safe deletion, archival and restore | explicit_successor | SKO-389 |
| [SKO-318](https://linear.app/skoolee-ai-app/issue/SKO-318/016-audited-support-access-and-service-operations) | [016] Audited support access and service operations | explicit_successor | SKO-390 |
| [SKO-319](https://linear.app/skoolee-ai-app/issue/SKO-319/017-separate-standalone-and-school-group-onboarding-with-resumable) | [017] Separate standalone and school-group onboarding with resumable setup | explicit_successor | SKO-391 |
| [SKO-320](https://linear.app/skoolee-ai-app/issue/SKO-320/018-language-rtl-timezone-calendar-and-currency-packages) | [018] Language, RTL, timezone, calendar and currency packages | explicit_successor | SKO-392 |
| [SKO-321](https://linear.app/skoolee-ai-app/issue/SKO-321/019-configurable-curriculum-grading-and-term-structures) | [019] Configurable curriculum, grading and term structures | explicit_successor | SKO-393 |
| [SKO-322](https://linear.app/skoolee-ai-app/issue/SKO-322/020-permanent-student-identity-and-enrollment-history) | [020] Permanent student identity and enrollment history | explicit_successor | SKO-394 |
| [SKO-323](https://linear.app/skoolee-ai-app/issue/SKO-323/021-multiple-guardians-and-granular-accessconsent) | [021] Multiple guardians and granular access/consent | explicit_successor | SKO-395 |
| [SKO-324](https://linear.app/skoolee-ai-app/issue/SKO-324/022-reversible-imports-and-clear-validation) | [022] Reversible imports and clear validation | explicit_successor | SKO-396 |
| [SKO-325](https://linear.app/skoolee-ai-app/issue/SKO-325/023-guided-school-setup-and-import-reconciliation) | [023] Guided school setup and import reconciliation | explicit_successor | SKO-397 |
| [SKO-326](https://linear.app/skoolee-ai-app/issue/SKO-326/024-configurable-admission-forms-and-enquiry-pipeline) | [024] Configurable admission forms and enquiry pipeline | explicit_successor | SKO-398 |
| [SKO-327](https://linear.app/skoolee-ai-app/issue/SKO-327/025-staff-hierarchy-workload-and-absence-cover) | [025] Staff hierarchy, workload and absence cover | explicit_successor | SKO-399 |
| [SKO-328](https://linear.app/skoolee-ai-app/issue/SKO-328/026-learning-resource-and-document-library) | [026] Learning resource and document library | explicit_successor | SKO-400 |
| [SKO-329](https://linear.app/skoolee-ai-app/issue/SKO-329/027-global-search-and-reliable-directory-filters) | [027] Global search and reliable directory filters | explicit_successor | SKO-401 |
| [SKO-330](https://linear.app/skoolee-ai-app/issue/SKO-330/028-school-and-campus-lifecycle-editing) | [028] School and campus lifecycle editing | explicit_successor | SKO-402 |
| [SKO-331](https://linear.app/skoolee-ai-app/issue/SKO-331/030-attendance-accuracy-and-exception-handling) | [030] Attendance accuracy and exception handling | explicit_successor | SKO-405 |
| [SKO-332](https://linear.app/skoolee-ai-app/issue/SKO-332/031-year-end-rollover-and-promotion-review) | [031] Year-end rollover and promotion review | explicit_successor | SKO-404 |
| [SKO-333](https://linear.app/skoolee-ai-app/issue/SKO-333/029-teaching-timetable-conflicts-and-publication) | [029] Teaching timetable conflicts and publication | explicit_successor | SKO-403 |
| [SKO-334](https://linear.app/skoolee-ai-app/issue/SKO-334/032-curriculum-and-learning-objective-map) | [032] Curriculum and learning objective map | explicit_successor | SKO-406 |
| [SKO-335](https://linear.app/skoolee-ai-app/issue/SKO-335/033-reviewed-question-bank-and-assessment-blueprints) | [033] Reviewed question bank and assessment blueprints | explicit_successor | SKO-407 |
| [SKO-336](https://linear.app/skoolee-ai-app/issue/SKO-336/034-ai-quiztest-generation-with-source-references) | [034] AI quiz/test generation with source references | explicit_successor | SKO-408 |
| [SKO-337](https://linear.app/skoolee-ai-app/issue/SKO-337/035-assignments-submissions-and-rubrics) | [035] Assignments, submissions and rubrics | explicit_successor | SKO-409 |
| [SKO-338](https://linear.app/skoolee-ai-app/issue/SKO-338/036-assessment-accommodations-and-accessible-materials) | [036] Assessment accommodations and accessible materials | explicit_successor | SKO-410 |
| [SKO-339](https://linear.app/skoolee-ai-app/issue/SKO-339/037-exam-attempts-with-autosave-and-recovery) | [037] Exam attempts with autosave and recovery | explicit_successor | SKO-411 |
| [SKO-340](https://linear.app/skoolee-ai-app/issue/SKO-340/038-exam-scheduling-room-capacity-and-invigilation) | [038] Exam scheduling, room capacity and invigilation | explicit_successor | SKO-413 |
| [SKO-341](https://linear.app/skoolee-ai-app/issue/SKO-341/039-paper-marks-scan-with-teacher-approved-import) | [039] Paper marks scan with teacher-approved import | explicit_successor | SKO-412 |
| [SKO-342](https://linear.app/skoolee-ai-app/issue/SKO-342/040-lesson-plans-and-differentiated-activity-groups) | [040] Lesson plans and differentiated activity groups | explicit_successor | SKO-414 |
| [SKO-343](https://linear.app/skoolee-ai-app/issue/SKO-343/041-messaging-and-attachment-reliability) | [041] Messaging and attachment reliability | explicit_successor | SKO-415 |
| [SKO-344](https://linear.app/skoolee-ai-app/issue/SKO-344/042-actionable-notification-center) | [042] Actionable notification center | explicit_successor | SKO-416 |
| [SKO-345](https://linear.app/skoolee-ai-app/issue/SKO-345/043-principal-action-queue) | [043] Principal action queue | explicit_successor | SKO-417 |
| [SKO-346](https://linear.app/skoolee-ai-app/issue/SKO-346/044-student-today-page) | [044] Student Today page | explicit_successor | SKO-418 |
| [SKO-347](https://linear.app/skoolee-ai-app/issue/SKO-347/045-family-action-inbox-across-siblings) | [045] Family action inbox across siblings | explicit_successor | SKO-419 |
| [SKO-348](https://linear.app/skoolee-ai-app/issue/SKO-348/046-absence-explanation-leave-and-trip-consent) | [046] Absence explanation, leave and trip consent | explicit_successor | SKO-421 |
| [SKO-349](https://linear.app/skoolee-ai-app/issue/SKO-349/047-weekly-family-digest-and-short-home-practice) | [047] Weekly family digest and short home practice | explicit_successor | SKO-423 |
| [SKO-350](https://linear.app/skoolee-ai-app/issue/SKO-350/048-parent-teacher-meeting-booking-and-follow-up) | [048] Parent-teacher meeting booking and follow-up | explicit_successor | SKO-420 |
| [SKO-351](https://linear.app/skoolee-ai-app/issue/SKO-351/049-question-level-misconception-and-item-review) | [049] Question-level misconception and item review | explicit_successor | SKO-422 |
| [SKO-352](https://linear.app/skoolee-ai-app/issue/SKO-352/050-marking-moderation-and-regrade-workflow) | [050] Marking moderation and regrade workflow | explicit_successor | SKO-424 |
| [SKO-353](https://linear.app/skoolee-ai-app/issue/SKO-353/051-intervention-ownership-and-reassessment) | [051] Intervention ownership and reassessment | explicit_successor | SKO-425 |
| [SKO-354](https://linear.app/skoolee-ai-app/issue/SKO-354/052-practice-with-hints-and-spaced-review) | [052] Practice with hints and spaced review | explicit_successor | SKO-426 |
| [SKO-355](https://linear.app/skoolee-ai-app/issue/SKO-355/053-feedback-and-improvement-portfolio) | [053] Feedback and improvement portfolio | explicit_successor | SKO-427 |
| [SKO-356](https://linear.app/skoolee-ai-app/issue/SKO-356/054-source-grounded-student-study-assistant) | [054] Source-grounded student study assistant | explicit_successor | SKO-428 |
| [SKO-357](https://linear.app/skoolee-ai-app/issue/SKO-357/055-school-policy-assistant-with-cited-answers) | [055] School policy assistant with cited answers | explicit_successor | SKO-429 |
| [SKO-358](https://linear.app/skoolee-ai-app/issue/SKO-358/056-pilot-adoption-and-value-measurement) | [056] Pilot adoption and value measurement | explicit_successor | SKO-430 |
| [SKO-359](https://linear.app/skoolee-ai-app/issue/SKO-359/057-secure-fee-statements-installments-and-receipts) | [057] Secure fee statements, installments and receipts | explicit_successor | SKO-431 |
| [SKO-360](https://linear.app/skoolee-ai-app/issue/SKO-360/058-payment-reconciliation-and-duplicate-prevention) | [058] Payment reconciliation and duplicate prevention | explicit_successor | SKO-432 |
| [SKO-361](https://linear.app/skoolee-ai-app/issue/SKO-361/059-refunds-credit-notes-waivers-and-approval-separation) | [059] Refunds, credit notes, waivers and approval separation | explicit_successor | SKO-433 |
| [SKO-362](https://linear.app/skoolee-ai-app/issue/SKO-362/001-shared-design-system-and-role-based-navigation) | [001] Shared design system and role-based navigation | explicit_successor | SKO-379 |
| [SKO-363](https://linear.app/skoolee-ai-app/issue/SKO-363/002-shared-authorization-and-tenantcampuschild-ownership-rules) | [002] Shared authorization and tenant/campus/child ownership rules | explicit_successor | SKO-377 |
| [SKO-364](https://linear.app/skoolee-ai-app/issue/SKO-364/003-role-assignment-invitations-and-institution-membership-ux) | [003] Role assignment, invitations and institution membership UX | explicit_successor | SKO-376 |
| [SKO-365](https://linear.app/skoolee-ai-app/issue/SKO-365/004-reliable-account-lifecycle-and-administrator-mfa) | [004] Reliable account lifecycle and administrator MFA | explicit_successor | SKO-380 |
| [SKO-366](https://linear.app/skoolee-ai-app/issue/SKO-366/005-approved-report-versions-and-publication-gates) | [005] Approved report versions and publication gates | explicit_successor | SKO-375 |
| [SKO-367](https://linear.app/skoolee-ai-app/issue/SKO-367/006-truthful-marketing-and-synchronized-pricing-entitlements) | [006] Truthful marketing and synchronized pricing entitlements | explicit_successor | SKO-378 |
| [SKO-368](https://linear.app/skoolee-ai-app/issue/SKO-368/007-backups-restore-rehearsals-and-migration-checks) | [007] Backups, restore rehearsals and migration checks | explicit_successor | SKO-381 |
| [SKO-369](https://linear.app/skoolee-ai-app/issue/SKO-369/008-auditable-grade-and-finance-corrections) | [008] Auditable grade and finance corrections | explicit_successor | SKO-384 |
| [SKO-370](https://linear.app/skoolee-ai-app/issue/SKO-370/009-ai-provider-policy-privacy-and-evaluation-gateway) | [009] AI provider policy, privacy and evaluation gateway | explicit_successor | SKO-383 |
| [SKO-371](https://linear.app/skoolee-ai-app/issue/SKO-371/010-durable-event-outbox-and-job-orchestration) | [010] Durable event outbox and job orchestration | explicit_successor | SKO-382 |
| [SKO-372](https://linear.app/skoolee-ai-app/issue/SKO-372/011-package-comparison-trial-and-checkout-during-registration) | [011] Package comparison, trial and checkout during registration | explicit_successor | SKO-387 |
| [SKO-373](https://linear.app/skoolee-ai-app/issue/SKO-373/012-subscription-lifecycle-group-billing-and-entitlement-enforcement) | [012] Subscription lifecycle, group billing and entitlement enforcement | active_canonical | SKO-373 |
| [SKO-374](https://linear.app/skoolee-ai-app/issue/SKO-374/013-job-status-retries-and-delivery-receipts) | [013] Job status, retries and delivery receipts | explicit_successor | SKO-386 |
| [SKO-375](https://linear.app/skoolee-ai-app/issue/SKO-375/005-approved-report-versions-and-publication-gates) | [005] Approved report versions and publication gates | active_canonical | SKO-375 |
| [SKO-376](https://linear.app/skoolee-ai-app/issue/SKO-376/003-role-assignment-invitations-and-institution-membership-ux) | [003] Role assignment, invitations and institution membership UX | active_canonical | SKO-376 |
| [SKO-377](https://linear.app/skoolee-ai-app/issue/SKO-377/002-shared-authorization-and-tenantcampuschild-ownership-rules) | [002] Shared authorization and tenant/campus/child ownership rules | active_canonical | SKO-377 |
| [SKO-378](https://linear.app/skoolee-ai-app/issue/SKO-378/006-truthful-marketing-and-synchronized-pricing-entitlements) | [006] Truthful marketing and synchronized pricing entitlements | active_canonical | SKO-378 |
| [SKO-379](https://linear.app/skoolee-ai-app/issue/SKO-379/001-shared-design-system-and-role-based-navigation) | [001] Shared design system and role-based navigation | active_canonical | SKO-379 |
| [SKO-380](https://linear.app/skoolee-ai-app/issue/SKO-380/004-reliable-account-lifecycle-and-administrator-mfa) | [004] Reliable account lifecycle and administrator MFA | active_canonical | SKO-380 |
| [SKO-381](https://linear.app/skoolee-ai-app/issue/SKO-381/007-backups-restore-rehearsals-and-migration-checks) | [007] Backups, restore rehearsals and migration checks | active_canonical | SKO-381 |
| [SKO-382](https://linear.app/skoolee-ai-app/issue/SKO-382/010-durable-event-outbox-and-job-orchestration) | [010] Durable event outbox and job orchestration | active_canonical | SKO-382 |
| [SKO-383](https://linear.app/skoolee-ai-app/issue/SKO-383/009-ai-provider-policy-privacy-and-evaluation-gateway) | [009] AI provider policy, privacy and evaluation gateway | active_canonical | SKO-383 |
| [SKO-384](https://linear.app/skoolee-ai-app/issue/SKO-384/008-auditable-grade-and-finance-corrections) | [008] Auditable grade and finance corrections | active_canonical | SKO-384 |
| [SKO-385](https://linear.app/skoolee-ai-app/issue/SKO-385/012-subscription-lifecycle-group-billing-and-entitlement-enforcement) | [012] Subscription lifecycle, group billing and entitlement enforcement | explicit_successor | SKO-373 |
| [SKO-386](https://linear.app/skoolee-ai-app/issue/SKO-386/013-job-status-retries-and-delivery-receipts) | [013] Job status, retries and delivery receipts | active_canonical | SKO-386 |
| [SKO-387](https://linear.app/skoolee-ai-app/issue/SKO-387/011-package-comparison-trial-and-checkout-during-registration) | [011] Package comparison, trial and checkout during registration | active_canonical | SKO-387 |
| [SKO-388](https://linear.app/skoolee-ai-app/issue/SKO-388/014-draft-recovery-consistent-navigation-and-accessibility) | [014] Draft recovery, consistent navigation and accessibility | active_canonical | SKO-388 |
| [SKO-389](https://linear.app/skoolee-ai-app/issue/SKO-389/015-safe-deletion-archival-and-restore) | [015] Safe deletion, archival and restore | active_canonical | SKO-389 |
| [SKO-390](https://linear.app/skoolee-ai-app/issue/SKO-390/016-audited-support-access-and-service-operations) | [016] Audited support access and service operations | active_canonical | SKO-390 |
| [SKO-391](https://linear.app/skoolee-ai-app/issue/SKO-391/017-separate-standalone-and-school-group-onboarding-with-resumable) | [017] Separate standalone and school-group onboarding with resumable setup | active_canonical | SKO-391 |
| [SKO-392](https://linear.app/skoolee-ai-app/issue/SKO-392/018-language-rtl-timezone-calendar-and-currency-packages) | [018] Language, RTL, timezone, calendar and currency packages | active_canonical | SKO-392 |
| [SKO-393](https://linear.app/skoolee-ai-app/issue/SKO-393/019-configurable-curriculum-grading-and-term-structures) | [019] Configurable curriculum, grading and term structures | active_canonical | SKO-393 |
| [SKO-394](https://linear.app/skoolee-ai-app/issue/SKO-394/020-permanent-student-identity-and-enrollment-history) | [020] Permanent student identity and enrollment history | active_canonical | SKO-394 |
| [SKO-395](https://linear.app/skoolee-ai-app/issue/SKO-395/021-multiple-guardians-and-granular-accessconsent) | [021] Multiple guardians and granular access/consent | active_canonical | SKO-395 |
| [SKO-396](https://linear.app/skoolee-ai-app/issue/SKO-396/022-reversible-imports-and-clear-validation) | [022] Reversible imports and clear validation | active_canonical | SKO-396 |
| [SKO-397](https://linear.app/skoolee-ai-app/issue/SKO-397/023-guided-school-setup-and-import-reconciliation) | [023] Guided school setup and import reconciliation | active_canonical | SKO-397 |
| [SKO-398](https://linear.app/skoolee-ai-app/issue/SKO-398/024-configurable-admission-forms-and-enquiry-pipeline) | [024] Configurable admission forms and enquiry pipeline | active_canonical | SKO-398 |
| [SKO-399](https://linear.app/skoolee-ai-app/issue/SKO-399/025-staff-hierarchy-workload-and-absence-cover) | [025] Staff hierarchy, workload and absence cover | active_canonical | SKO-399 |
| [SKO-400](https://linear.app/skoolee-ai-app/issue/SKO-400/026-learning-resource-and-document-library) | [026] Learning resource and document library | active_canonical | SKO-400 |
| [SKO-401](https://linear.app/skoolee-ai-app/issue/SKO-401/027-global-search-and-reliable-directory-filters) | [027] Global search and reliable directory filters | active_canonical | SKO-401 |
| [SKO-402](https://linear.app/skoolee-ai-app/issue/SKO-402/028-school-and-campus-lifecycle-editing) | [028] School and campus lifecycle editing | active_canonical | SKO-402 |
| [SKO-403](https://linear.app/skoolee-ai-app/issue/SKO-403/029-teaching-timetable-conflicts-and-publication) | [029] Teaching timetable conflicts and publication | active_canonical | SKO-403 |
| [SKO-404](https://linear.app/skoolee-ai-app/issue/SKO-404/031-year-end-rollover-and-promotion-review) | [031] Year-end rollover and promotion review | active_canonical | SKO-404 |
| [SKO-405](https://linear.app/skoolee-ai-app/issue/SKO-405/030-attendance-accuracy-and-exception-handling) | [030] Attendance accuracy and exception handling | active_canonical | SKO-405 |
| [SKO-406](https://linear.app/skoolee-ai-app/issue/SKO-406/032-curriculum-and-learning-objective-map) | [032] Curriculum and learning objective map | active_canonical | SKO-406 |
| [SKO-407](https://linear.app/skoolee-ai-app/issue/SKO-407/033-reviewed-question-bank-and-assessment-blueprints) | [033] Reviewed question bank and assessment blueprints | active_canonical | SKO-407 |
| [SKO-408](https://linear.app/skoolee-ai-app/issue/SKO-408/034-ai-exam-studio-flagship-assessment-secure-delivery-and-learning) | [034] AI Exam Studio: flagship assessment, secure delivery and learning recovery | active_canonical | SKO-408 |
| [SKO-409](https://linear.app/skoolee-ai-app/issue/SKO-409/035-assignments-submissions-and-rubrics) | [035] Assignments, submissions and rubrics | active_canonical | SKO-409 |
| [SKO-410](https://linear.app/skoolee-ai-app/issue/SKO-410/036-assessment-accommodations-and-accessible-materials) | [036] Assessment accommodations and accessible materials | active_canonical | SKO-410 |
| [SKO-411](https://linear.app/skoolee-ai-app/issue/SKO-411/037-focused-exam-session-with-autosave-and-recovery) | [037] Focused exam session with autosave and recovery | active_canonical | SKO-411 |
| [SKO-412](https://linear.app/skoolee-ai-app/issue/SKO-412/039-paper-marks-scan-with-teacher-approved-import) | [039] Paper marks scan with teacher-approved import | active_canonical | SKO-412 |
| [SKO-413](https://linear.app/skoolee-ai-app/issue/SKO-413/038-exam-scheduling-room-capacity-and-invigilation) | [038] Exam scheduling, room capacity and invigilation | active_canonical | SKO-413 |
| [SKO-414](https://linear.app/skoolee-ai-app/issue/SKO-414/040-lesson-plans-and-differentiated-activity-groups) | [040] Lesson plans and differentiated activity groups | active_canonical | SKO-414 |
| [SKO-415](https://linear.app/skoolee-ai-app/issue/SKO-415/041-messaging-and-attachment-reliability) | [041] Messaging and attachment reliability | active_canonical | SKO-415 |
| [SKO-416](https://linear.app/skoolee-ai-app/issue/SKO-416/042-actionable-notification-center) | [042] Actionable notification center | active_canonical | SKO-416 |
| [SKO-417](https://linear.app/skoolee-ai-app/issue/SKO-417/043-principal-action-queue) | [043] Principal action queue | active_canonical | SKO-417 |
| [SKO-418](https://linear.app/skoolee-ai-app/issue/SKO-418/044-student-today-page) | [044] Student Today page | active_canonical | SKO-418 |
| [SKO-419](https://linear.app/skoolee-ai-app/issue/SKO-419/045-family-action-inbox-across-siblings) | [045] Family action inbox across siblings | active_canonical | SKO-419 |
| [SKO-420](https://linear.app/skoolee-ai-app/issue/SKO-420/048-parent-teacher-meeting-booking-and-follow-up) | [048] Parent-teacher meeting booking and follow-up | active_canonical | SKO-420 |
| [SKO-421](https://linear.app/skoolee-ai-app/issue/SKO-421/046-absence-explanation-leave-and-trip-consent) | [046] Absence explanation, leave and trip consent | active_canonical | SKO-421 |
| [SKO-422](https://linear.app/skoolee-ai-app/issue/SKO-422/049-question-level-misconception-and-item-review) | [049] Question-level misconception and item review | active_canonical | SKO-422 |
| [SKO-423](https://linear.app/skoolee-ai-app/issue/SKO-423/047-weekly-family-digest-and-short-home-practice) | [047] Weekly family digest and short home practice | active_canonical | SKO-423 |
| [SKO-424](https://linear.app/skoolee-ai-app/issue/SKO-424/050-marking-moderation-and-regrade-workflow) | [050] Marking moderation and regrade workflow | active_canonical | SKO-424 |
| [SKO-425](https://linear.app/skoolee-ai-app/issue/SKO-425/051-intervention-ownership-and-reassessment) | [051] Intervention ownership and reassessment | active_canonical | SKO-425 |
| [SKO-426](https://linear.app/skoolee-ai-app/issue/SKO-426/052-practice-with-hints-and-spaced-review) | [052] Practice with hints and spaced review | active_canonical | SKO-426 |
| [SKO-427](https://linear.app/skoolee-ai-app/issue/SKO-427/053-feedback-and-improvement-portfolio) | [053] Feedback and improvement portfolio | active_canonical | SKO-427 |
| [SKO-428](https://linear.app/skoolee-ai-app/issue/SKO-428/054-source-grounded-student-study-assistant) | [054] Source-grounded student study assistant | active_canonical | SKO-428 |
| [SKO-429](https://linear.app/skoolee-ai-app/issue/SKO-429/055-school-policy-assistant-with-cited-answers) | [055] School policy assistant with cited answers | active_canonical | SKO-429 |
| [SKO-430](https://linear.app/skoolee-ai-app/issue/SKO-430/056-pilot-adoption-and-value-measurement) | [056] Pilot adoption and value measurement | active_canonical | SKO-430 |
| [SKO-431](https://linear.app/skoolee-ai-app/issue/SKO-431/057-secure-fee-statements-installments-and-receipts) | [057] Secure fee statements, installments and receipts | active_canonical | SKO-431 |
| [SKO-432](https://linear.app/skoolee-ai-app/issue/SKO-432/058-payment-reconciliation-and-duplicate-prevention) | [058] Payment reconciliation and duplicate prevention | active_canonical | SKO-432 |
| [SKO-433](https://linear.app/skoolee-ai-app/issue/SKO-433/059-refunds-credit-notes-waivers-and-approval-separation) | [059] Refunds, credit notes, waivers and approval separation | active_canonical | SKO-433 |
| [SKO-434](https://linear.app/skoolee-ai-app/issue/SKO-434/060-payroll-provider-interfaces-and-local-rules) | [060] Payroll provider interfaces and local rules | active_canonical | SKO-434 |
| [SKO-435](https://linear.app/skoolee-ai-app/issue/SKO-435/061-inventory-purchasing-budgets-and-asset-maintenance) | [061] Inventory, purchasing, budgets and asset maintenance | active_canonical | SKO-435 |
| [SKO-436](https://linear.app/skoolee-ai-app/issue/SKO-436/062-library-catalogue-issuereturn-reservations-and-fine-policy) | [062] Library catalogue, issue/return, reservations and fine policy | active_canonical | SKO-436 |
| [SKO-437](https://linear.app/skoolee-ai-app/issue/SKO-437/063-transport-routes-fleet-rider-assignments-and-safe-handover-records) | [063] Transport routes, fleet, rider assignments and safe handover records | active_canonical | SKO-437 |
| [SKO-438](https://linear.app/skoolee-ai-app/issue/SKO-438/064-authorized-qr-pickup) | [064] Authorized QR pickup | active_canonical | SKO-438 |
| [SKO-439](https://linear.app/skoolee-ai-app/issue/SKO-439/065-restricted-clinic-and-safeguarding-workflows) | [065] Restricted clinic and safeguarding workflows | active_canonical | SKO-439 |
| [SKO-440](https://linear.app/skoolee-ai-app/issue/SKO-440/067-clubs-sports-trips-and-participation) | [067] Clubs, sports, trips and participation | active_canonical | SKO-440 |
| [SKO-441](https://linear.app/skoolee-ai-app/issue/SKO-441/066-facilities-requests-and-internal-service-desk) | [066] Facilities requests and internal service desk | active_canonical | SKO-441 |
| [SKO-442](https://linear.app/skoolee-ai-app/issue/SKO-442/068-substitute-teacher-and-missed-lesson-recovery) | [068] Substitute teacher and missed-lesson recovery | active_canonical | SKO-442 |
| [SKO-443](https://linear.app/skoolee-ai-app/issue/SKO-443/069-school-group-policy-templates-with-controlled-local-overrides) | [069] School-group policy templates with controlled local overrides | active_canonical | SKO-443 |
| [SKO-444](https://linear.app/skoolee-ai-app/issue/SKO-444/070-country-specific-tax-and-invoice-packages) | [070] Country-specific tax and invoice packages | active_canonical | SKO-444 |
| [SKO-445](https://linear.app/skoolee-ai-app/issue/SKO-445/071-versioned-apis-webhooks-and-integration-monitoring) | [071] Versioned APIs, webhooks and integration monitoring | active_canonical | SKO-445 |
| [SKO-446](https://linear.app/skoolee-ai-app/issue/SKO-446/072-school-identity-integration-and-roster-exchange) | [072] School identity integration and roster exchange | active_canonical | SKO-446 |
| [SKO-447](https://linear.app/skoolee-ai-app/issue/SKO-447/073-regional-hosting-and-data-lifecycle-controls) | [073] Regional hosting and data lifecycle controls | active_canonical | SKO-447 |
| [SKO-448](https://linear.app/skoolee-ai-app/issue/SKO-448/074-low-bandwidth-operation-and-conflict-aware-offline-capture) | [074] Low-bandwidth operation and conflict-aware offline capture | active_canonical | SKO-448 |
| [SKO-449](https://linear.app/skoolee-ai-app/issue/SKO-449/075-safe-exam-browser-integration) | [075] Safe Exam Browser integration | active_canonical | SKO-449 |
| [SKO-450](https://linear.app/skoolee-ai-app/issue/SKO-450/076-improvement-and-accreditation-evidence-workspace) | [076] Improvement and accreditation evidence workspace | active_canonical | SKO-450 |
| [SKO-451](https://linear.app/skoolee-ai-app/issue/SKO-451/077-peak-load-performance-and-tenant-fairness) | [077] Peak-load performance and tenant fairness | active_canonical | SKO-451 |
| [SKO-452](https://linear.app/skoolee-ai-app/issue/SKO-452/078-leap-demo-case-studies-and-launch-readiness) | [078] LEAP demo, case studies and launch readiness | active_canonical | SKO-452 |
| [SKO-453](https://linear.app/skoolee-ai-app/issue/SKO-453/079-capacity-and-staffing-scenario-planning) | [079] Capacity and staffing scenario planning | active_canonical | SKO-453 |
| [SKO-454](https://linear.app/skoolee-ai-app/issue/SKO-454/080-teacher-question-quality-review-network) | [080] Teacher question-quality review network | active_canonical | SKO-454 |
| [SKO-455](https://linear.app/skoolee-ai-app/issue/SKO-455/081-careers-counseling-and-alumni-pathways) | [081] Careers, counseling and alumni pathways | active_canonical | SKO-455 |
| [SKO-456](https://linear.app/skoolee-ai-app/issue/SKO-456/082-optional-canteen-boarding-and-specialist-school-packages) | [082] Optional canteen, boarding and specialist school packages | active_canonical | SKO-456 |
| [SKO-457](https://linear.app/skoolee-ai-app/issue/SKO-457/083-sign-in-sign-up-verification-and-password-recovery-journeys) | [083] Sign-in, sign-up, verification and password recovery journeys | active_canonical | SKO-457 |
| [SKO-458](https://linear.app/skoolee-ai-app/issue/SKO-458/084-teacher-first-login-onboarding-and-profile-completion) | [084] Teacher first-login onboarding and profile completion | active_canonical | SKO-458 |
| [SKO-460](https://linear.app/skoolee-ai-app/issue/SKO-460/085-recoverable-multilingual-ai-chat-and-multimodal-assistant-workflow) | [085] Recoverable multilingual AI chat and multimodal assistant workflow | active_canonical | SKO-460 |
| [SKO-461](https://linear.app/skoolee-ai-app/issue/SKO-461/086-teacher-performance-analytics-and-review-workflow) | [086] Teacher performance analytics and review workflow | active_canonical | SKO-461 |
| [SKO-462](https://linear.app/skoolee-ai-app/issue/SKO-462/087-class-section-subject-and-teaching-assignment-administration) | [087] Class, section, subject and teaching assignment administration | active_canonical | SKO-462 |
| [SKO-463](https://linear.app/skoolee-ai-app/issue/SKO-463/088-dormitory-rooms-occupancy-and-student-allocation-operations) | [088] Dormitory rooms, occupancy and student allocation operations | active_canonical | SKO-463 |
| [SKO-464](https://linear.app/skoolee-ai-app/issue/SKO-464/091-inbound-and-outbound-postalcourier-register) | [091] Inbound and outbound postal/courier register | active_canonical | SKO-464 |
| [SKO-465](https://linear.app/skoolee-ai-app/issue/SKO-465/092-reception-phone-call-log-and-follow-up-queue) | [092] Reception phone-call log and follow-up queue | active_canonical | SKO-465 |
| [SKO-466](https://linear.app/skoolee-ai-app/issue/SKO-466/089-reception-visitor-register-and-check-incheck-out) | [089] Reception visitor register and check-in/check-out | active_canonical | SKO-466 |
| [SKO-467](https://linear.app/skoolee-ai-app/issue/SKO-467/090-complaint-intake-assignment-status-and-resolution-tracking) | [090] Complaint intake, assignment, status and resolution tracking | active_canonical | SKO-467 |
| [SKO-468](https://linear.app/skoolee-ai-app/issue/SKO-468/094-school-chart-of-accounts-ledger-entries-and-financial-reporting) | [094] School chart of accounts, ledger entries and financial reporting | active_canonical | SKO-468 |
| [SKO-469](https://linear.app/skoolee-ai-app/issue/SKO-469/093-student-certificates-and-identity-card-generation) | [093] Student certificates and identity-card generation | active_canonical | SKO-469 |
| [SKO-470](https://linear.app/skoolee-ai-app/issue/SKO-470/095-school-ai-operational-plans-and-reviewed-run-lifecycle) | [095] School AI operational plans and reviewed run lifecycle | active_canonical | SKO-470 |
