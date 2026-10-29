# Open Linear items crosswalk (SKAI-1055, D6-02)

Snapshot 29 October 2026. 349 open Linear issues (status type not completed or canceled), grouped by Linear project. Titles only; descriptions are deliberately not copied (SKO-5 holds plaintext test passwords).

"Suggested SKAI home" names the PRD cross-role journey (docs/product-review-2026-10/prd-revised.md, "Key cross-role journeys") or product area the item belongs under when it is raised in Jira. It is a suggestion for triage, not a commitment. Before creating a SKAI ticket, check docs/product-review-2026-10/historical-ticket-crosswalk.md: many [NNN] epics already have SKAI equivalents.

Duplicate [NNN] roadmap items (the same number appears under two SKO ids) are flagged "duplicate of" the lower id. SKO-559, SKO-560 and SKO-561 are truncated duplicates of PM-01, already delivered as SKAI-52 to SKAI-55, and are marked superseded.

## (no project) (15)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-1](https://linear.app/skoolee-ai-app/issue/SKO-1/get-familiar-with-linear) | Get familiar with Linear | Close: Linear onboarding placeholder (no migration) |
| [SKO-2](https://linear.app/skoolee-ai-app/issue/SKO-2/connect-your-tools) | Connect your tools | Close: Linear onboarding placeholder (no migration) |
| [SKO-3](https://linear.app/skoolee-ai-app/issue/SKO-3/import-your-data) | Import your data | Close: Linear onboarding placeholder (no migration) |
| [SKO-4](https://linear.app/skoolee-ai-app/issue/SKO-4/set-up-your-teams) | Set up your teams | Close: Linear onboarding placeholder (no migration) |
| [SKO-5](https://linear.app/skoolee-ai-app/issue/SKO-5/dummy-users-and-data) | Dummy Users and Data | Triage in SKAI |
| [SKO-182](https://linear.app/skoolee-ai-app/issue/SKO-182/uploading-attachent-error-in-chats) | Uploading attach,ent error in chats | Chat and AI input |
| [SKO-183](https://linear.app/skoolee-ai-app/issue/SKO-183/urdu-auto-text-not-generate-correct-delete-this-option-or-fix-with) | Urdu auto text not generate correct, delete this option or fix with proper way | Chat and AI input |
| [SKO-184](https://linear.app/skoolee-ai-app/issue/SKO-184/groups-option-in-student-new-registration-have-no-lists-like-hostel) | Groups option in student new registration have no lists like hostel transport etc | School and teacher onboarding |
| [SKO-189](https://linear.app/skoolee-ai-app/issue/SKO-189/the-first-two-filters-in-the-student-directory-are-not-working-the) | The first two filters in the student directory are not working; the results do not change when they are clicked. Those filters are 'students on roll' and 'classes with student'. | Assessment and exams (AI Exam Studio flagship) |
| [SKO-190](https://linear.app/skoolee-ai-app/issue/SKO-190/in-the-campus-command-centre-when-we-click-an-option-and-it-redirects) | In the Campus Command Centre, when we click an option and it redirects us to the same tab instead of opening a pop-up, there should be a separate 'Back' button to take us straight back to the Command Centre. This way, we won't have to keep reopening the Command Centre or rely on the Chrome back button | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-192](https://linear.app/skoolee-ai-app/issue/SKO-192/new-school-adding-problem) | New school adding problem | School and teacher onboarding |
| [SKO-193](https://linear.app/skoolee-ai-app/issue/SKO-193/search-option) | Search option | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-194](https://linear.app/skoolee-ai-app/issue/SKO-194/no-validiation) | No validiation | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-199](https://linear.app/skoolee-ai-app/issue/SKO-199/in-forms-valid-values) | In forms valid values | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-206](https://linear.app/skoolee-ai-app/issue/SKO-206/student-category) | Student category | School and teacher onboarding |

## Authentication & Session (7)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-6](https://linear.app/skoolee-ai-app/issue/SKO-6/verify-login-flow-with-valid-credentials-for-all-8-roles) | Verify login flow with valid credentials for all 8 roles | Account creation and access |
| [SKO-7](https://linear.app/skoolee-ai-app/issue/SKO-7/verify-login-rejects-invalid-emailpassword-combination) | Verify login rejects invalid email/password combination | Account creation and access |
| [SKO-8](https://linear.app/skoolee-ai-app/issue/SKO-8/verify-jwt-token-stored-in-cookie-after-successful-login) | Verify JWT token stored in cookie after successful login | Account creation and access |
| [SKO-9](https://linear.app/skoolee-ai-app/issue/SKO-9/verify-session-get-endpoint-returns-current-user-data) | Verify session GET endpoint returns current user data | Account creation and access |
| [SKO-10](https://linear.app/skoolee-ai-app/issue/SKO-10/verify-unauthorized-access-redirects-to-login-page) | Verify unauthorized access redirects to login page | Account creation and access |
| [SKO-11](https://linear.app/skoolee-ai-app/issue/SKO-11/verify-role-based-dashboard-redirection-after-login) | Verify role-based dashboard redirection after login | Account creation and access |
| [SKO-12](https://linear.app/skoolee-ai-app/issue/SKO-12/verify-session-expiry-and-auto-logout-behavior) | Verify session expiry and auto-logout behavior | Account creation and access |

## Role-Base Access Control (7)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-14](https://linear.app/skoolee-ai-app/issue/SKO-14/verify-super-admin-can-access-all-campuses-and-data) | Verify SUPER_ADMIN can access all campuses and data | Account creation and access |
| [SKO-15](https://linear.app/skoolee-ai-app/issue/SKO-15/verify-campus-adminadmin-scoped-to-their-campus-only) | Verify CAMPUS_ADMIN/ADMIN scoped to their campus only | Account creation and access |
| [SKO-16](https://linear.app/skoolee-ai-app/issue/SKO-16/verify-principal-can-only-viewmanage-assigned-campus) | Verify PRINCIPAL can only view/manage assigned campus | Account creation and access |
| [SKO-17](https://linear.app/skoolee-ai-app/issue/SKO-17/verify-teacher-sees-only-assigned-classes-and-subjects) | Verify TEACHER sees only assigned classes and subjects | Account creation and access |
| [SKO-18](https://linear.app/skoolee-ai-app/issue/SKO-18/verify-parent-can-only-access-their-childs-data) | Verify PARENT can only access their child's data | Account creation and access |
| [SKO-19](https://linear.app/skoolee-ai-app/issue/SKO-19/verify-student-role-has-read-only-access-to-own-data) | Verify STUDENT role has read-only access to own data | Account creation and access |
| [SKO-20](https://linear.app/skoolee-ai-app/issue/SKO-20/verify-non-management-roles-cannot-perform-crud-operations) | Verify non-management roles cannot perform CRUD operations | Account creation and access |

## Campus Management (4)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-21](https://linear.app/skoolee-ai-app/issue/SKO-21/verify-campus-creation-with-required-fields) | Verify campus creation with required fields | School and teacher onboarding |
| [SKO-22](https://linear.app/skoolee-ai-app/issue/SKO-22/verify-campus-update-reflects-across-all-related-data) | Verify campus update reflects across all related data | School and teacher onboarding |
| [SKO-23](https://linear.app/skoolee-ai-app/issue/SKO-23/verify-campus-scoped-data-isolation-between-campuses) | Verify campus-scoped data isolation between campuses | School and teacher onboarding |
| [SKO-24](https://linear.app/skoolee-ai-app/issue/SKO-24/verify-super-admin-can-switch-between-campuses) | Verify SUPER_ADMIN can switch between campuses | School and teacher onboarding |

## Class Management (9)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-25](https://linear.app/skoolee-ai-app/issue/SKO-25/verify-class-creation-with-single-section) | Verify class creation with single section | Academic cycle |
| [SKO-26](https://linear.app/skoolee-ai-app/issue/SKO-26/verify-class-creation-with-single-section) | Verify class creation with single section | Academic cycle; duplicate of SKO-25 |
| [SKO-27](https://linear.app/skoolee-ai-app/issue/SKO-27/verify-duplicate-classsectionyear-is-rejected) | Verify duplicate class+section+year is rejected | Academic cycle |
| [SKO-28](https://linear.app/skoolee-ai-app/issue/SKO-28/verify-class-teacher-assignment-during-creation) | Verify class teacher assignment during creation | Academic cycle |
| [SKO-29](https://linear.app/skoolee-ai-app/issue/SKO-29/verify-class-update-rename-change-section-reassign-teacher) | Verify class update (rename, change section, reassign teacher) | Academic cycle |
| [SKO-30](https://linear.app/skoolee-ai-app/issue/SKO-30/verify-class-deletion-blocked-when-students-exist) | Verify class deletion blocked when students exist | Academic cycle |
| [SKO-31](https://linear.app/skoolee-ai-app/issue/SKO-31/verify-class-deletion-succeeds-when-empty) | Verify class deletion succeeds when empty | Academic cycle |
| [SKO-32](https://linear.app/skoolee-ai-app/issue/SKO-32/verify-class-list-shows-student-count-and-subject-count) | Verify class list shows student count and subject count | Academic cycle |
| [SKO-33](https://linear.app/skoolee-ai-app/issue/SKO-33/verify-audit-log-created-for-class-crud-operations) | Verify audit log created for class CRUD operations | Academic cycle |

## Subject Management (5)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-34](https://linear.app/skoolee-ai-app/issue/SKO-34/verify-subject-creation-for-a-class) | Verify subject creation for a class | Academic cycle |
| [SKO-35](https://linear.app/skoolee-ai-app/issue/SKO-35/verify-teacher-assignment-to-subject) | Verify teacher assignment to subject | Academic cycle |
| [SKO-36](https://linear.app/skoolee-ai-app/issue/SKO-36/verify-subject-teacher-must-belong-to-same-campus) | Verify subject teacher must belong to same campus | Academic cycle |
| [SKO-37](https://linear.app/skoolee-ai-app/issue/SKO-37/verify-subject-list-grouped-by-class) | Verify subject list grouped by class | Academic cycle |
| [SKO-38](https://linear.app/skoolee-ai-app/issue/SKO-38/verify-subject-deletion-and-cascade-effects) | Verify subject deletion and cascade effects | Academic cycle |

## Student Management (7)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-39](https://linear.app/skoolee-ai-app/issue/SKO-39/verify-student-admission-with-all-required-fields) | Verify student admission with all required fields | School and teacher onboarding |
| [SKO-40](https://linear.app/skoolee-ai-app/issue/SKO-40/verify-student-transfer-between-classes) | Verify student transfer between classes | School and teacher onboarding |
| [SKO-41](https://linear.app/skoolee-ai-app/issue/SKO-41/verify-student-parent-linking-parentuserid) | Verify student-parent linking (parentUserId) | School and teacher onboarding |
| [SKO-42](https://linear.app/skoolee-ai-app/issue/SKO-42/verify-student-profile-displays-complete-information) | Verify student profile displays complete information | School and teacher onboarding |
| [SKO-43](https://linear.app/skoolee-ai-app/issue/SKO-43/verify-student-deletion-removes-related-data) | Verify student deletion removes related data | School and teacher onboarding |
| [SKO-44](https://linear.app/skoolee-ai-app/issue/SKO-44/verify-student-list-pagination-and-search) | Verify student list pagination and search | School and teacher onboarding |
| [SKO-45](https://linear.app/skoolee-ai-app/issue/SKO-45/verify-bulk-student-operations-if-supported) | Verify bulk student operations if supported | School and teacher onboarding |

## Teacher & Staff Management (8)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-46](https://linear.app/skoolee-ai-app/issue/SKO-46/verify-teacher-addition-via-addteacher-action) | Verify teacher addition via addTeacher action | Staffing |
| [SKO-47](https://linear.app/skoolee-ai-app/issue/SKO-47/verify-staff-addition-via-addstaff-action) | Verify staff addition via addStaff action | Staffing |
| [SKO-48](https://linear.app/skoolee-ai-app/issue/SKO-48/verify-staff-invitation-via-email) | Verify staff invitation via email | Staffing |
| [SKO-49](https://linear.app/skoolee-ai-app/issue/SKO-49/verify-invitation-acceptance-creates-active-user) | Verify invitation acceptance creates active user | Staffing |
| [SKO-50](https://linear.app/skoolee-ai-app/issue/SKO-50/verify-staff-removal-deactivates-user) | Verify staff removal deactivates user | Staffing |
| [SKO-51](https://linear.app/skoolee-ai-app/issue/SKO-51/verify-teacher-profile-shows-assigned-classessubjects) | Verify teacher profile shows assigned classes/subjects | Staffing |
| [SKO-52](https://linear.app/skoolee-ai-app/issue/SKO-52/verify-staff-list-filterable-by-role-and-campus) | Verify staff list filterable by role and campus | Staffing |
| [SKO-53](https://linear.app/skoolee-ai-app/issue/SKO-53/verify-duplicate-email-rejection-on-staff-creation) | Verify duplicate email rejection on staff creation | Staffing |

## Student Attendance (6)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-54](https://linear.app/skoolee-ai-app/issue/SKO-54/verify-attendance-marking-for-a-class-on-a-given-date) | Verify attendance marking for a class on a given date | Attendance |
| [SKO-55](https://linear.app/skoolee-ai-app/issue/SKO-55/verify-attendance-summary-view-dailyweeklymonthly) | Verify attendance summary view (daily/weekly/monthly) | Attendance |
| [SKO-56](https://linear.app/skoolee-ai-app/issue/SKO-56/verify-attendance-prevents-duplicate-entry-for-same-date) | Verify attendance prevents duplicate entry for same date | Attendance |
| [SKO-57](https://linear.app/skoolee-ai-app/issue/SKO-57/verify-attendance-visible-to-parent-for-their-child) | Verify attendance visible to parent for their child | Attendance |
| [SKO-58](https://linear.app/skoolee-ai-app/issue/SKO-58/verify-attendance-report-generationexport) | Verify attendance report generation/export | Attendance |
| [SKO-59](https://linear.app/skoolee-ai-app/issue/SKO-59/verify-late-arrival-marking-and-distinction-from-present) | Verify late arrival marking and distinction from present | Attendance |

## Teacher Attendance (3)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-60](https://linear.app/skoolee-ai-app/issue/SKO-60/verify-teacher-attendance-marking-by-adminprincipal) | Verify teacher attendance marking by admin/principal | Attendance |
| [SKO-61](https://linear.app/skoolee-ai-app/issue/SKO-61/verify-teacher-attendance-report-and-dashboard-stats) | Verify teacher attendance report and dashboard stats | Attendance |
| [SKO-62](https://linear.app/skoolee-ai-app/issue/SKO-62/verify-teacher-cannot-mark-own-attendance) | Verify teacher cannot mark own attendance | Attendance |

## Exam Management (6)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-63](https://linear.app/skoolee-ai-app/issue/SKO-63/verify-exam-creation-with-title-class-date-max-marks) | Verify exam creation with title, class, date, max marks | Assessment and exams (AI Exam Studio flagship) |
| [SKO-64](https://linear.app/skoolee-ai-app/issue/SKO-64/verify-exam-status-lifecycle-draft-active-locked) | Verify exam status lifecycle (draft → active → locked) | Assessment and exams (AI Exam Studio flagship) |
| [SKO-65](https://linear.app/skoolee-ai-app/issue/SKO-65/verify-exam-locking-generates-report-cards) | Verify exam locking generates report cards | Assessment and exams (AI Exam Studio flagship) |
| [SKO-66](https://linear.app/skoolee-ai-app/issue/SKO-66/verify-locked-exam-prevents-further-mark-edits) | Verify locked exam prevents further mark edits | Assessment and exams (AI Exam Studio flagship) |
| [SKO-67](https://linear.app/skoolee-ai-app/issue/SKO-67/verify-exam-list-filtered-by-class-and-academic-year) | Verify exam list filtered by class and academic year | Assessment and exams (AI Exam Studio flagship) |
| [SKO-68](https://linear.app/skoolee-ai-app/issue/SKO-68/verify-exam-update-title-date-max-marks) | Verify exam update (title, date, max marks) | Assessment and exams (AI Exam Studio flagship) |

## Marks Entry (5)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-69](https://linear.app/skoolee-ai-app/issue/SKO-69/verify-marks-entry-for-all-students-in-a-classexam) | Verify marks entry for all students in a class/exam | Assessment and exams (AI Exam Studio flagship) |
| [SKO-70](https://linear.app/skoolee-ai-app/issue/SKO-70/verify-marks-validation-cannot-exceed-max-marks) | Verify marks validation (cannot exceed max marks) | Assessment and exams (AI Exam Studio flagship) |
| [SKO-71](https://linear.app/skoolee-ai-app/issue/SKO-71/verify-marks-update-for-previously-entered-values) | Verify marks update for previously entered values | Assessment and exams (AI Exam Studio flagship) |
| [SKO-72](https://linear.app/skoolee-ai-app/issue/SKO-72/verify-marks-visible-to-teacher-for-their-subjects-only) | Verify marks visible to teacher for their subjects only | Assessment and exams (AI Exam Studio flagship) |
| [SKO-73](https://linear.app/skoolee-ai-app/issue/SKO-73/verify-absent-student-marks-handling) | Verify absent student marks handling | Assessment and exams (AI Exam Studio flagship) |

## Report Cards (6)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-74](https://linear.app/skoolee-ai-app/issue/SKO-74/verify-report-card-generation-for-an-exam) | Verify report card generation for an exam | Assessment and exams (AI Exam Studio flagship) |
| [SKO-75](https://linear.app/skoolee-ai-app/issue/SKO-75/verify-report-card-review-workflow) | Verify report card review workflow | Assessment and exams (AI Exam Studio flagship) |
| [SKO-76](https://linear.app/skoolee-ai-app/issue/SKO-76/verify-report-card-publishing-makes-it-visible-to-parents) | Verify report card publishing makes it visible to parents | Assessment and exams (AI Exam Studio flagship) |
| [SKO-77](https://linear.app/skoolee-ai-app/issue/SKO-77/verify-report-card-pdf-download) | Verify report card PDF download | Assessment and exams (AI Exam Studio flagship) |
| [SKO-78](https://linear.app/skoolee-ai-app/issue/SKO-78/verify-report-card-contains-correct-marks-and-grades) | Verify report card contains correct marks and grades | Assessment and exams (AI Exam Studio flagship) |
| [SKO-79](https://linear.app/skoolee-ai-app/issue/SKO-79/verify-report-card-remarks-and-teacher-comments) | Verify report card remarks and teacher comments | Assessment and exams (AI Exam Studio flagship) |

## Fee Structure (3)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-80](https://linear.app/skoolee-ai-app/issue/SKO-80/verify-fee-structure-creation-for-a-class) | Verify fee structure creation for a class | Finance |
| [SKO-81](https://linear.app/skoolee-ai-app/issue/SKO-81/verify-fee-structure-update-reflects-on-pending-invoices) | Verify fee structure update reflects on pending invoices | Finance |
| [SKO-82](https://linear.app/skoolee-ai-app/issue/SKO-82/verify-fee-structure-per-academic-year-isolation) | Verify fee structure per academic year isolation | Finance |

## Fee Invoices & Payments (8)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-83](https://linear.app/skoolee-ai-app/issue/SKO-83/verify-invoice-generation-for-a-class) | Verify invoice generation for a class | Finance |
| [SKO-84](https://linear.app/skoolee-ai-app/issue/SKO-84/verify-payment-recording-manual-entry) | Verify payment recording (manual entry) | Finance |
| [SKO-85](https://linear.app/skoolee-ai-app/issue/SKO-85/verify-safepay-online-payment-integration) | Verify SafePay online payment integration | Finance |
| [SKO-86](https://linear.app/skoolee-ai-app/issue/SKO-86/verify-invoice-amount-matches-fee-structure) | Verify invoice amount matches fee structure | Finance |
| [SKO-87](https://linear.app/skoolee-ai-app/issue/SKO-87/verify-partial-payment-tracking-and-balance-calculation) | Verify partial payment tracking and balance calculation | Finance |
| [SKO-88](https://linear.app/skoolee-ai-app/issue/SKO-88/verify-payment-receipt-generation) | Verify payment receipt generation | Finance |
| [SKO-89](https://linear.app/skoolee-ai-app/issue/SKO-89/verify-fee-dashboard-shows-collection-summary) | Verify fee dashboard shows collection summary | Finance |
| [SKO-90](https://linear.app/skoolee-ai-app/issue/SKO-90/verify-parent-can-view-fee-status-and-payment-history) | Verify parent can view fee status and payment history | Finance |

## Timetable (6)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-91](https://linear.app/skoolee-ai-app/issue/SKO-91/verify-timetable-creation-for-a-class) | Verify timetable creation for a class | Academic cycle |
| [SKO-92](https://linear.app/skoolee-ai-app/issue/SKO-92/verify-timetable-publish-makes-it-visible-to-teachersstudents) | Verify timetable publish makes it visible to teachers/students | Academic cycle |
| [SKO-93](https://linear.app/skoolee-ai-app/issue/SKO-93/verify-timetable-slot-conflict-detection) | Verify timetable slot conflict detection | Academic cycle |
| [SKO-94](https://linear.app/skoolee-ai-app/issue/SKO-94/verify-timetable-update-reschedule-slots) | Verify timetable update (reschedule slots) | Academic cycle |
| [SKO-95](https://linear.app/skoolee-ai-app/issue/SKO-95/verify-timetable-deletion) | Verify timetable deletion | Academic cycle |
| [SKO-96](https://linear.app/skoolee-ai-app/issue/SKO-96/verify-teachers-personal-timetable-view) | Verify teacher's personal timetable view | Academic cycle |

## Academic Year & Cycle (6)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-97](https://linear.app/skoolee-ai-app/issue/SKO-97/verify-academic-year-creation) | Verify academic year creation | Academic cycle |
| [SKO-98](https://linear.app/skoolee-ai-app/issue/SKO-98/verify-academic-year-closing) | Verify academic year closing | Academic cycle |
| [SKO-99](https://linear.app/skoolee-ai-app/issue/SKO-99/verify-student-promotion-to-next-class) | Verify student promotion to next class | Academic cycle |
| [SKO-100](https://linear.app/skoolee-ai-app/issue/SKO-100/verify-academic-cycle-creation-and-status-changes) | Verify academic cycle creation and status changes | Academic cycle |
| [SKO-101](https://linear.app/skoolee-ai-app/issue/SKO-101/verify-promoted-students-appear-in-new-class-roster) | Verify promoted students appear in new class roster | Academic cycle |
| [SKO-102](https://linear.app/skoolee-ai-app/issue/SKO-102/verify-data-rollover-between-academic-years) | Verify data rollover between academic years | Academic cycle |

## Real-Time Notifications (In-App) (15)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-103](https://linear.app/skoolee-ai-app/issue/SKO-103/verify-sse-connection-establishes-on-page-load) | Verify SSE connection establishes on page load | Communication |
| [SKO-104](https://linear.app/skoolee-ai-app/issue/SKO-104/verify-real-time-notification-appears-on-bell-icon) | Verify real-time notification appears on bell icon | Communication |
| [SKO-105](https://linear.app/skoolee-ai-app/issue/SKO-105/verify-cross-tab-notification-sync) | Verify cross-tab notification sync | Communication |
| [SKO-106](https://linear.app/skoolee-ai-app/issue/SKO-106/verify-notification-recipients-match-role-based-rules) | Verify notification recipients match role-based rules | Communication |
| [SKO-107](https://linear.app/skoolee-ai-app/issue/SKO-107/verify-notification-badge-shows-correct-unread-count) | Verify notification badge shows correct unread count | Communication |
| [SKO-108](https://linear.app/skoolee-ai-app/issue/SKO-108/verify-notification-dropdown-displays-title-message-time) | Verify notification dropdown displays title, message, time | Communication |
| [SKO-109](https://linear.app/skoolee-ai-app/issue/SKO-109/verify-mark-single-notification-as-read-on-click) | Verify mark single notification as read on click | Communication |
| [SKO-110](https://linear.app/skoolee-ai-app/issue/SKO-110/verify-mark-all-notifications-as-read) | Verify mark all notifications as read | Communication |
| [SKO-111](https://linear.app/skoolee-ai-app/issue/SKO-111/verify-sse-auto-reconnect-after-connection-drop) | Verify SSE auto-reconnect after connection drop | Communication |
| [SKO-112](https://linear.app/skoolee-ai-app/issue/SKO-112/verify-notifications-persist-after-page-refresh) | Verify notifications persist after page refresh | Communication |
| [SKO-113](https://linear.app/skoolee-ai-app/issue/SKO-113/verify-self-notification-is-suppressed-actor-excluded) | Verify self-notification is suppressed (actor excluded) | Communication |
| [SKO-114](https://linear.app/skoolee-ai-app/issue/SKO-114/verify-super-admin-receives-notifications-from-all-campuses) | Verify SUPER_ADMIN receives notifications from all campuses | Communication |
| [SKO-115](https://linear.app/skoolee-ai-app/issue/SKO-115/verify-notification-pagination-cursor-based) | Verify notification pagination (cursor-based) | Communication |
| [SKO-116](https://linear.app/skoolee-ai-app/issue/SKO-116/verify-empty-state-when-no-notifications-exist) | Verify empty state when no notifications exist | Communication |
| [SKO-117](https://linear.app/skoolee-ai-app/issue/SKO-117/verify-heartbeat-keepalive-prevents-sse-timeout) | Verify heartbeat keepalive prevents SSE timeout | Communication |

## External Notifications ( Whatsapp & Email ) (6)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-118](https://linear.app/skoolee-ai-app/issue/SKO-118/verify-whatsapp-notification-delivery-for-fee-reminders) | Verify WhatsApp notification delivery for fee reminders | Communication |
| [SKO-119](https://linear.app/skoolee-ai-app/issue/SKO-119/verify-email-notification-delivery-for-report-card-publish) | Verify email notification delivery for report card publish | Communication |
| [SKO-120](https://linear.app/skoolee-ai-app/issue/SKO-120/verify-absence-alert-notification-to-parent) | Verify absence alert notification to parent | Communication |
| [SKO-121](https://linear.app/skoolee-ai-app/issue/SKO-121/verify-notification-queue-processing-bullmq) | Verify notification queue processing (BullMQ) | Communication |
| [SKO-122](https://linear.app/skoolee-ai-app/issue/SKO-122/verify-notification-templates-render-correctly) | Verify notification templates render correctly | Communication |
| [SKO-123](https://linear.app/skoolee-ai-app/issue/SKO-123/verify-notification-automation-cron-triggers) | Verify notification automation cron triggers | Communication |

## Notifications Events Coverage (12)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-124](https://linear.app/skoolee-ai-app/issue/SKO-124/verify-class-created-notification-to-admins-and-principal) | Verify CLASS_CREATED notification to admins and principal | Communication |
| [SKO-125](https://linear.app/skoolee-ai-app/issue/SKO-125/verify-class-updated-notification-includes-class-teacher) | Verify CLASS_UPDATED notification includes class teacher | Communication |
| [SKO-126](https://linear.app/skoolee-ai-app/issue/SKO-126/verify-student-admitted-notification-to-class-teacher) | Verify STUDENT_ADMITTED notification to class teacher | Communication |
| [SKO-127](https://linear.app/skoolee-ai-app/issue/SKO-127/verify-attendance-submitted-notification-to-principal) | Verify ATTENDANCE_SUBMITTED notification to principal | Communication |
| [SKO-128](https://linear.app/skoolee-ai-app/issue/SKO-128/verify-exam-created-notification-to-class-teachers) | Verify EXAM_CREATED notification to class teachers | Communication |
| [SKO-129](https://linear.app/skoolee-ai-app/issue/SKO-129/verify-exam-locked-notification-triggers-report-card-flow) | Verify EXAM_LOCKED notification triggers report card flow | Communication |
| [SKO-130](https://linear.app/skoolee-ai-app/issue/SKO-130/verify-marks-entered-notification-to-principal) | Verify MARKS_ENTERED notification to principal | Communication |
| [SKO-131](https://linear.app/skoolee-ai-app/issue/SKO-131/verify-payment-recorded-notification-to-admin) | Verify PAYMENT_RECORDED notification to admin | Communication |
| [SKO-132](https://linear.app/skoolee-ai-app/issue/SKO-132/verify-invoices-generated-notification-with-count) | Verify INVOICES_GENERATED notification with count | Communication |
| [SKO-133](https://linear.app/skoolee-ai-app/issue/SKO-133/verify-timetable-published-notification-to-affected-teachers) | Verify TIMETABLE_PUBLISHED notification to affected teachers | Communication |
| [SKO-134](https://linear.app/skoolee-ai-app/issue/SKO-134/verify-academic-year-closed-notification-to-all-campus-staff) | Verify ACADEMIC_YEAR_CLOSED notification to all campus staff | Communication |
| [SKO-135](https://linear.app/skoolee-ai-app/issue/SKO-135/verify-students-promoted-notification-with-count) | Verify STUDENTS_PROMOTED notification with count | Communication |

## Admin Dashbaord (5)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-136](https://linear.app/skoolee-ai-app/issue/SKO-136/verify-admin-dashboard-loads-all-summary-widgets) | Verify admin dashboard loads all summary widgets | Role consoles (dashboards) |
| [SKO-137](https://linear.app/skoolee-ai-app/issue/SKO-137/verify-admin-attendance-panel-shows-todays-overview) | Verify admin attendance panel shows today's overview | Role consoles (dashboards) |
| [SKO-138](https://linear.app/skoolee-ai-app/issue/SKO-138/verify-admin-can-switch-campus-context-super-admin) | Verify admin can switch campus context (SUPER_ADMIN) | Role consoles (dashboards) |
| [SKO-139](https://linear.app/skoolee-ai-app/issue/SKO-139/verify-admin-quick-actions-navigate-to-correct-pages) | Verify admin quick actions navigate to correct pages | Role consoles (dashboards) |
| [SKO-140](https://linear.app/skoolee-ai-app/issue/SKO-140/verify-admin-data-context-loads-without-errors) | Verify admin data context loads without errors | Role consoles (dashboards) |

## Principle Dashboard (3)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-141](https://linear.app/skoolee-ai-app/issue/SKO-141/verify-principal-dashboard-shows-campus-scoped-data) | Verify principal dashboard shows campus-scoped data | Role consoles (dashboards) |
| [SKO-142](https://linear.app/skoolee-ai-app/issue/SKO-142/verify-principal-attendance-panel-functionality) | Verify principal attendance panel functionality | Role consoles (dashboards) |
| [SKO-143](https://linear.app/skoolee-ai-app/issue/SKO-143/verify-principal-can-view-all-classes-and-teachers) | Verify principal can view all classes and teachers | Role consoles (dashboards) |

## Teacher Dashboard (4)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-144](https://linear.app/skoolee-ai-app/issue/SKO-144/verify-teacher-dashboard-shows-assigned-classes-only) | Verify teacher dashboard shows assigned classes only | Role consoles (dashboards) |
| [SKO-145](https://linear.app/skoolee-ai-app/issue/SKO-145/verify-teacher-can-mark-attendance-for-assigned-class) | Verify teacher can mark attendance for assigned class | Role consoles (dashboards) |
| [SKO-146](https://linear.app/skoolee-ai-app/issue/SKO-146/verify-teacher-can-enter-marks-for-assigned-subjects) | Verify teacher can enter marks for assigned subjects | Role consoles (dashboards) |
| [SKO-147](https://linear.app/skoolee-ai-app/issue/SKO-147/verify-teacher-timetable-view-shows-daily-schedule) | Verify teacher timetable view shows daily schedule | Role consoles (dashboards) |

## Parent Dashbaord (4)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-148](https://linear.app/skoolee-ai-app/issue/SKO-148/verify-parent-dashboard-shows-linked-childs-overview) | Verify parent dashboard shows linked child's overview | Role consoles (dashboards) |
| [SKO-149](https://linear.app/skoolee-ai-app/issue/SKO-149/verify-parent-can-view-published-report-cards) | Verify parent can view published report cards | Role consoles (dashboards) |
| [SKO-150](https://linear.app/skoolee-ai-app/issue/SKO-150/verify-parent-can-view-fee-invoices-and-payment-status) | Verify parent can view fee invoices and payment status | Role consoles (dashboards) |
| [SKO-151](https://linear.app/skoolee-ai-app/issue/SKO-151/verify-parent-receives-real-time-notifications) | Verify parent receives real-time notifications | Role consoles (dashboards) |

## Student Dashbaord (3)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-152](https://linear.app/skoolee-ai-app/issue/SKO-152/verify-student-dashboard-shows-personal-academic-data) | Verify student dashboard shows personal academic data | Role consoles (dashboards) |
| [SKO-153](https://linear.app/skoolee-ai-app/issue/SKO-153/verify-student-can-view-own-timetable) | Verify student can view own timetable | Role consoles (dashboards) |
| [SKO-154](https://linear.app/skoolee-ai-app/issue/SKO-154/verify-student-can-view-own-attendance-record) | Verify student can view own attendance record | Role consoles (dashboards) |

## UI/UX Responsiveness (7)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-155](https://linear.app/skoolee-ai-app/issue/SKO-155/verify-responsive-layout-on-mobile-375px) | Verify responsive layout on mobile (375px) | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-156](https://linear.app/skoolee-ai-app/issue/SKO-156/verify-skeleton-loaders-display-during-data-fetch) | Verify skeleton loaders display during data fetch | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-157](https://linear.app/skoolee-ai-app/issue/SKO-157/verify-responsive-layout-on-tablet-768px) | Verify responsive layout on tablet (768px) | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-158](https://linear.app/skoolee-ai-app/issue/SKO-158/verify-notification-bell-and-dropdown-on-mobile) | Verify notification bell and dropdown on mobile | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-159](https://linear.app/skoolee-ai-app/issue/SKO-159/verify-error-toast-messages-display-on-failed-operations) | Verify error toast messages display on failed operations | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-160](https://linear.app/skoolee-ai-app/issue/SKO-160/verify-loading-states-on-form-submissions) | Verify loading states on form submissions | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-161](https://linear.app/skoolee-ai-app/issue/SKO-161/verify-empty-states-across-all-list-views) | Verify empty states across all list views | Platform foundations (shared UX, tenancy, jobs, ops) |

## Data Integrity & Edge Cases (7)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-162](https://linear.app/skoolee-ai-app/issue/SKO-162/verify-multi-tenant-data-isolation-schoolid-scoping) | Verify multi-tenant data isolation (schoolId scoping) | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-163](https://linear.app/skoolee-ai-app/issue/SKO-163/verify-concurrent-class-creation-doesnt-create-duplicates) | Verify concurrent class creation doesn't create duplicates | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-164](https://linear.app/skoolee-ai-app/issue/SKO-164/verify-cascading-deletes-dont-orphan-records) | Verify cascading deletes don't orphan records | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-165](https://linear.app/skoolee-ai-app/issue/SKO-165/verify-api-input-validation-rejects-malformed-data) | Verify API input validation rejects malformed data | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-166](https://linear.app/skoolee-ai-app/issue/SKO-166/verify-large-dataset-handling-100-students-per-class) | Verify large dataset handling (100+ students per class) | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-167](https://linear.app/skoolee-ai-app/issue/SKO-167/verify-audit-log-entries-for-all-crud-operations) | Verify audit log entries for all CRUD operations | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-168](https://linear.app/skoolee-ai-app/issue/SKO-168/verify-unicode-support-in-names-and-text-fields) | Verify Unicode support in names and text fields | Platform foundations (shared UX, tenancy, jobs, ops) |

## API & Integrations (5)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-169](https://linear.app/skoolee-ai-app/issue/SKO-169/verify-safepay-webhook-callback-processes-payments) | Verify SafePay webhook callback processes payments | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-170](https://linear.app/skoolee-ai-app/issue/SKO-170/verify-all-api-endpoints-return-consistent-response-shape) | Verify all API endpoints return consistent response shape | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-171](https://linear.app/skoolee-ai-app/issue/SKO-171/verify-redis-connection-handles-reconnects-gracefully) | Verify Redis connection handles reconnects gracefully | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-172](https://linear.app/skoolee-ai-app/issue/SKO-172/verify-bullmq-job-queue-processes-notification-jobs) | Verify BullMQ job queue processes notification jobs | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-173](https://linear.app/skoolee-ai-app/issue/SKO-173/verify-prisma-query-performance-on-indexed-columns) | Verify Prisma query performance on indexed columns | Platform foundations (shared UX, tenancy, jobs, ops) |

## Skoolee AI (164)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-191](https://linear.app/skoolee-ai-app/issue/SKO-191/027-global-search-and-reliable-directory-filters) | [027] Global search and reliable directory filters | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-197](https://linear.app/skoolee-ai-app/issue/SKO-197/066-facilities-requests-and-internal-service-desk) | [066] Facilities requests and internal service desk | School operations add-on packages |
| [SKO-198](https://linear.app/skoolee-ai-app/issue/SKO-198/031-year-end-rollover-and-promotion-review) | [031] Year-end rollover and promotion review | Academic cycle |
| [SKO-200](https://linear.app/skoolee-ai-app/issue/SKO-200/028-school-and-campus-lifecycle-editing) | [028] School and campus lifecycle editing | School and teacher onboarding |
| [SKO-202](https://linear.app/skoolee-ai-app/issue/SKO-202/043-principal-action-queue) | [043] Principal action queue | Triage in SKAI |
| [SKO-203](https://linear.app/skoolee-ai-app/issue/SKO-203/042-actionable-notification-center) | [042] Actionable notification center | Communication |
| [SKO-204](https://linear.app/skoolee-ai-app/issue/SKO-204/026-learning-resource-and-document-library) | [026] Learning resource and document library | School operations add-on packages |
| [SKO-205](https://linear.app/skoolee-ai-app/issue/SKO-205/024-configurable-admission-forms-and-enquiry-pipeline) | [024] Configurable admission forms and enquiry pipeline | School and teacher onboarding |
| [SKO-218](https://linear.app/skoolee-ai-app/issue/SKO-218/073-regional-hosting-and-data-lifecycle-controls) | [073] Regional hosting and data lifecycle controls | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-224](https://linear.app/skoolee-ai-app/issue/SKO-224/017-separate-standalone-and-school-group-onboarding-with-resumable) | [017] Separate standalone and school-group onboarding with resumable setup | School and teacher onboarding |
| [SKO-227](https://linear.app/skoolee-ai-app/issue/SKO-227/023-guided-school-setup-and-import-reconciliation) | [023] Guided school setup and import reconciliation | School and teacher onboarding |
| [SKO-228](https://linear.app/skoolee-ai-app/issue/SKO-228/025-staff-hierarchy-workload-and-absence-cover) | [025] Staff hierarchy, workload and absence cover | Attendance |
| [SKO-229](https://linear.app/skoolee-ai-app/issue/SKO-229/029-teaching-timetable-conflicts-and-publication) | [029] Teaching timetable conflicts and publication | Academic cycle |
| [SKO-230](https://linear.app/skoolee-ai-app/issue/SKO-230/030-attendance-accuracy-and-exception-handling) | [030] Attendance accuracy and exception handling | Attendance |
| [SKO-231](https://linear.app/skoolee-ai-app/issue/SKO-231/032-curriculum-and-learning-objective-map) | [032] Curriculum and learning objective map | Assessment and exams (AI Exam Studio flagship) |
| [SKO-232](https://linear.app/skoolee-ai-app/issue/SKO-232/033-reviewed-question-bank-and-assessment-blueprints) | [033] Reviewed question bank and assessment blueprints | Assessment and exams (AI Exam Studio flagship) |
| [SKO-233](https://linear.app/skoolee-ai-app/issue/SKO-233/034-ai-quiztest-generation-with-source-references) | [034] AI quiz/test generation with source references | Assessment and exams (AI Exam Studio flagship) |
| [SKO-234](https://linear.app/skoolee-ai-app/issue/SKO-234/035-assignments-submissions-and-rubrics) | [035] Assignments, submissions and rubrics | Assessment and exams (AI Exam Studio flagship) |
| [SKO-235](https://linear.app/skoolee-ai-app/issue/SKO-235/036-assessment-accommodations-and-accessible-materials) | [036] Assessment accommodations and accessible materials | Assessment and exams (AI Exam Studio flagship) |
| [SKO-236](https://linear.app/skoolee-ai-app/issue/SKO-236/037-exam-attempts-with-autosave-and-recovery) | [037] Exam attempts with autosave and recovery | Assessment and exams (AI Exam Studio flagship) |
| [SKO-237](https://linear.app/skoolee-ai-app/issue/SKO-237/038-exam-scheduling-room-capacity-and-invigilation) | [038] Exam scheduling, room capacity and invigilation | Assessment and exams (AI Exam Studio flagship) |
| [SKO-238](https://linear.app/skoolee-ai-app/issue/SKO-238/039-paper-marks-scan-with-teacher-approved-import) | [039] Paper marks scan with teacher-approved import | School and teacher onboarding |
| [SKO-239](https://linear.app/skoolee-ai-app/issue/SKO-239/040-lesson-plans-and-differentiated-activity-groups) | [040] Lesson plans and differentiated activity groups | Assessment and exams (AI Exam Studio flagship) |
| [SKO-240](https://linear.app/skoolee-ai-app/issue/SKO-240/041-messaging-and-attachment-reliability) | [041] Messaging and attachment reliability | Communication |
| [SKO-241](https://linear.app/skoolee-ai-app/issue/SKO-241/044-student-today-page) | [044] Student Today page | Student and family experience |
| [SKO-242](https://linear.app/skoolee-ai-app/issue/SKO-242/045-family-action-inbox-across-siblings) | [045] Family action inbox across siblings | Student and family experience |
| [SKO-243](https://linear.app/skoolee-ai-app/issue/SKO-243/046-absence-explanation-leave-and-trip-consent) | [046] Absence explanation, leave and trip consent | Attendance |
| [SKO-244](https://linear.app/skoolee-ai-app/issue/SKO-244/047-weekly-family-digest-and-short-home-practice) | [047] Weekly family digest and short home practice | Assessment and exams (AI Exam Studio flagship) |
| [SKO-245](https://linear.app/skoolee-ai-app/issue/SKO-245/048-parent-teacher-meeting-booking-and-follow-up) | [048] Parent-teacher meeting booking and follow-up | Student and family experience |
| [SKO-246](https://linear.app/skoolee-ai-app/issue/SKO-246/049-question-level-misconception-and-item-review) | [049] Question-level misconception and item review | Assessment and exams (AI Exam Studio flagship) |
| [SKO-247](https://linear.app/skoolee-ai-app/issue/SKO-247/050-marking-moderation-and-regrade-workflow) | [050] Marking moderation and regrade workflow | Assessment and exams (AI Exam Studio flagship) |
| [SKO-248](https://linear.app/skoolee-ai-app/issue/SKO-248/051-intervention-ownership-and-reassessment) | [051] Intervention ownership and reassessment | Assessment and exams (AI Exam Studio flagship) |
| [SKO-249](https://linear.app/skoolee-ai-app/issue/SKO-249/052-practice-with-hints-and-spaced-review) | [052] Practice with hints and spaced review | Assessment and exams (AI Exam Studio flagship) |
| [SKO-250](https://linear.app/skoolee-ai-app/issue/SKO-250/053-feedback-and-improvement-portfolio) | [053] Feedback and improvement portfolio | Assessment and exams (AI Exam Studio flagship) |
| [SKO-251](https://linear.app/skoolee-ai-app/issue/SKO-251/054-source-grounded-student-study-assistant) | [054] Source-grounded student study assistant | Chat and AI input |
| [SKO-252](https://linear.app/skoolee-ai-app/issue/SKO-252/055-school-policy-assistant-with-cited-answers) | [055] School policy assistant with cited answers | Chat and AI input |
| [SKO-253](https://linear.app/skoolee-ai-app/issue/SKO-253/056-pilot-adoption-and-value-measurement) | [056] Pilot adoption and value measurement | LEAP pilot and launch readiness |
| [SKO-254](https://linear.app/skoolee-ai-app/issue/SKO-254/057-secure-fee-statements-installments-and-receipts) | [057] Secure fee statements, installments and receipts | Finance |
| [SKO-255](https://linear.app/skoolee-ai-app/issue/SKO-255/058-payment-reconciliation-and-duplicate-prevention) | [058] Payment reconciliation and duplicate prevention | Finance |
| [SKO-256](https://linear.app/skoolee-ai-app/issue/SKO-256/059-refunds-credit-notes-waivers-and-approval-separation) | [059] Refunds, credit notes, waivers and approval separation | Finance |
| [SKO-257](https://linear.app/skoolee-ai-app/issue/SKO-257/060-payroll-provider-interfaces-and-local-rules) | [060] Payroll provider interfaces and local rules | Finance |
| [SKO-258](https://linear.app/skoolee-ai-app/issue/SKO-258/061-purchasing-budgets-and-asset-maintenance) | [061] Purchasing, budgets and asset maintenance | Finance |
| [SKO-259](https://linear.app/skoolee-ai-app/issue/SKO-259/062-library-reservations-barcode-issuereturn-and-fine-policy) | [062] Library reservations, barcode issue/return and fine policy | School operations add-on packages |
| [SKO-260](https://linear.app/skoolee-ai-app/issue/SKO-260/063-bus-boarding-arrival-and-handover-records) | [063] Bus boarding, arrival and handover records | School operations add-on packages |
| [SKO-261](https://linear.app/skoolee-ai-app/issue/SKO-261/064-authorized-qr-pickup) | [064] Authorized QR pickup | Account creation and access |
| [SKO-262](https://linear.app/skoolee-ai-app/issue/SKO-262/065-restricted-clinic-and-safeguarding-workflows) | [065] Restricted clinic and safeguarding workflows | School operations add-on packages |
| [SKO-263](https://linear.app/skoolee-ai-app/issue/SKO-263/067-clubs-sports-trips-and-participation) | [067] Clubs, sports, trips and participation | School operations add-on packages |
| [SKO-264](https://linear.app/skoolee-ai-app/issue/SKO-264/068-substitute-teacher-and-missed-lesson-recovery) | [068] Substitute teacher and missed-lesson recovery | Assessment and exams (AI Exam Studio flagship) |
| [SKO-265](https://linear.app/skoolee-ai-app/issue/SKO-265/069-school-group-policy-templates-with-controlled-local-overrides) | [069] School-group policy templates with controlled local overrides | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-266](https://linear.app/skoolee-ai-app/issue/SKO-266/070-country-specific-tax-and-invoice-packages) | [070] Country-specific tax and invoice packages | Finance |
| [SKO-267](https://linear.app/skoolee-ai-app/issue/SKO-267/071-versioned-apis-webhooks-and-integration-monitoring) | [071] Versioned APIs, webhooks and integration monitoring | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-268](https://linear.app/skoolee-ai-app/issue/SKO-268/072-school-identity-integration-and-roster-exchange) | [072] School identity integration and roster exchange | Account creation and access |
| [SKO-269](https://linear.app/skoolee-ai-app/issue/SKO-269/074-low-bandwidth-operation-and-conflict-aware-offline-capture) | [074] Low-bandwidth operation and conflict-aware offline capture | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-270](https://linear.app/skoolee-ai-app/issue/SKO-270/075-safe-exam-browser-integration) | [075] Safe Exam Browser integration | Assessment and exams (AI Exam Studio flagship) |
| [SKO-271](https://linear.app/skoolee-ai-app/issue/SKO-271/076-improvement-and-accreditation-evidence-workspace) | [076] Improvement and accreditation evidence workspace | School operations add-on packages |
| [SKO-272](https://linear.app/skoolee-ai-app/issue/SKO-272/077-peak-load-performance-and-tenant-fairness) | [077] Peak-load performance and tenant fairness | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-273](https://linear.app/skoolee-ai-app/issue/SKO-273/078-leap-demo-case-studies-and-launch-readiness) | [078] LEAP demo, case studies and launch readiness | LEAP pilot and launch readiness |
| [SKO-274](https://linear.app/skoolee-ai-app/issue/SKO-274/079-capacity-and-staffing-scenario-planning) | [079] Capacity and staffing scenario planning | Staffing |
| [SKO-275](https://linear.app/skoolee-ai-app/issue/SKO-275/080-teacher-question-quality-review-network) | [080] Teacher question-quality review network | Assessment and exams (AI Exam Studio flagship) |
| [SKO-276](https://linear.app/skoolee-ai-app/issue/SKO-276/081-careers-counseling-and-alumni-pathways) | [081] Careers, counseling and alumni pathways | Student and family experience |
| [SKO-277](https://linear.app/skoolee-ai-app/issue/SKO-277/082-optional-canteen-boarding-and-specialist-school-packages) | [082] Optional canteen, boarding and specialist school packages | School operations add-on packages |
| [SKO-278](https://linear.app/skoolee-ai-app/issue/SKO-278/qa-shared-visual-system-navigation-and-page-states-across-roles) | [QA] Shared visual system, navigation and page states across roles | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-279](https://linear.app/skoolee-ai-app/issue/SKO-279/qa-authentication-invitations-role-scope-and-cross-tenant-access) | [QA] Authentication, invitations, role scope and cross-tenant access | Account creation and access |
| [SKO-280](https://linear.app/skoolee-ai-app/issue/SKO-280/qa-supported-languages-translation-and-arabic-rtl-coverage) | [QA] Supported languages, translation and Arabic RTL coverage | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-281](https://linear.app/skoolee-ai-app/issue/SKO-281/qa-first-school-onboarding-from-empty-tenant-to-ready-campus) | [QA] First-school onboarding from empty tenant to ready campus | School and teacher onboarding |
| [SKO-282](https://linear.app/skoolee-ai-app/issue/SKO-282/qa-school-structure-academic-year-classes-subjects-and-staff) | [QA] School structure, academic year, classes, subjects and staff assignments | Assessment and exams (AI Exam Studio flagship) |
| [SKO-283](https://linear.app/skoolee-ai-app/issue/SKO-283/qa-student-guardian-and-staff-directory-imports-with-reconciliation) | [QA] Student, guardian and staff directory imports with reconciliation | School and teacher onboarding |
| [SKO-284](https://linear.app/skoolee-ai-app/issue/SKO-284/qa-teacher-workspace-curriculum-sources-and-lesson-preparation) | [QA] Teacher workspace, curriculum sources and lesson preparation | Assessment and exams (AI Exam Studio flagship) |
| [SKO-285](https://linear.app/skoolee-ai-app/issue/SKO-285/qa-timetable-calendar-date-sheet-and-seating-plan-constraints) | [QA] Timetable, calendar, date-sheet and seating-plan constraints | Academic cycle |
| [SKO-286](https://linear.app/skoolee-ai-app/issue/SKO-286/qa-syllabus-and-past-paper-intake-by-upload-scan-chat-and-audio) | [QA] Syllabus and past-paper intake by upload, scan, chat and audio | Chat and AI input |
| [SKO-287](https://linear.app/skoolee-ai-app/issue/SKO-287/qa-ai-quiz-and-exam-paper-generation-with-teacher-review) | [QA] AI quiz and exam-paper generation with teacher review | Assessment and exams (AI Exam Studio flagship) |
| [SKO-288](https://linear.app/skoolee-ai-app/issue/SKO-288/qa-student-and-guardian-learning-assignments-and-result-visibility) | [QA] Student and guardian learning, assignments and result visibility | School and teacher onboarding |
| [SKO-289](https://linear.app/skoolee-ai-app/issue/SKO-289/qa-results-report-cards-ai-feedback-and-publication-approval) | [QA] Results, report cards, AI feedback and publication approval | Assessment and exams (AI Exam Studio flagship) |
| [SKO-290](https://linear.app/skoolee-ai-app/issue/SKO-290/qa-messaging-announcements-attachments-and-delivery-recovery) | [QA] Messaging, announcements, attachments and delivery recovery | Communication |
| [SKO-291](https://linear.app/skoolee-ai-app/issue/SKO-291/qa-marking-assistance-paper-scan-and-teacher-approved-marks-import) | [QA] Marking assistance, paper scan and teacher-approved marks import | School and teacher onboarding |
| [SKO-292](https://linear.app/skoolee-ai-app/issue/SKO-292/qa-tuition-fees-invoices-installments-receipts-and-reconciliation) | [QA] Tuition fees, invoices, installments, receipts and reconciliation | Finance |
| [SKO-293](https://linear.app/skoolee-ai-app/issue/SKO-293/qa-payroll-revenue-and-ai-assisted-finance-insights) | [QA] Payroll, revenue and AI-assisted finance insights | Finance |
| [SKO-294](https://linear.app/skoolee-ai-app/issue/SKO-294/qa-ai-provider-readiness-privacy-limits-and-failure-recovery) | [QA] AI provider readiness, privacy, limits and failure recovery | Triage in SKAI |
| [SKO-295](https://linear.app/skoolee-ai-app/issue/SKO-295/qa-secure-exam-browser-claims-and-standard-browser-attempt-controls) | [QA] Secure exam browser claims and standard-browser attempt controls | Assessment and exams (AI Exam Studio flagship) |
| [SKO-296](https://linear.app/skoolee-ai-app/issue/SKO-296/qa-integration-webhooks-background-jobs-and-recovery-receipts) | [QA] Integration webhooks, background jobs and recovery receipts | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-297](https://linear.app/skoolee-ai-app/issue/SKO-297/qa-student-teacher-and-class-performance-insights-with-evidence) | [QA] Student, teacher and class performance insights with evidence | Triage in SKAI |
| [SKO-298](https://linear.app/skoolee-ai-app/issue/SKO-298/qa-ai-supported-timetable-finance-and-school-risk-recommendations) | [QA] AI-supported timetable, finance and school-risk recommendations | Finance |
| [SKO-299](https://linear.app/skoolee-ai-app/issue/SKO-299/qa-ai-generated-announcements-translations-and-report-narratives) | [QA] AI-generated announcements, translations and report narratives | Assessment and exams (AI Exam Studio flagship) |
| [SKO-300](https://linear.app/skoolee-ai-app/issue/SKO-300/qa-migration-backup-configuration-and-environment-readiness) | [QA] Migration, backup, configuration and environment readiness | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-301](https://linear.app/skoolee-ai-app/issue/SKO-301/qa-full-school-leap-pilot-journey-and-release-evidence-review) | [QA] Full-school LEAP pilot journey and release evidence review | LEAP pilot and launch readiness |
| [SKO-302](https://linear.app/skoolee-ai-app/issue/SKO-302/prd-skoolee-ai-product-scope-and-execution-index) | [PRD] Skoolee AI product scope and execution index | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-303](https://linear.app/skoolee-ai-app/issue/SKO-303/001-shared-design-system-and-role-based-navigation) | [001] Shared design system and role-based navigation | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-304](https://linear.app/skoolee-ai-app/issue/SKO-304/002-shared-authorization-and-tenantcampuschild-ownership-rules) | [002] Shared authorization and tenant/campus/child ownership rules | Account creation and access |
| [SKO-305](https://linear.app/skoolee-ai-app/issue/SKO-305/003-role-assignment-invitations-and-institution-membership-ux) | [003] Role assignment, invitations and institution membership UX | Account creation and access |
| [SKO-306](https://linear.app/skoolee-ai-app/issue/SKO-306/004-reliable-account-lifecycle-and-administrator-mfa) | [004] Reliable account lifecycle and administrator MFA | Account creation and access |
| [SKO-307](https://linear.app/skoolee-ai-app/issue/SKO-307/005-approved-report-versions-and-publication-gates) | [005] Approved report versions and publication gates | Assessment and exams (AI Exam Studio flagship) |
| [SKO-308](https://linear.app/skoolee-ai-app/issue/SKO-308/006-truthful-marketing-and-synchronized-pricing-entitlements) | [006] Truthful marketing and synchronized pricing entitlements | Finance |
| [SKO-309](https://linear.app/skoolee-ai-app/issue/SKO-309/007-backups-restore-rehearsals-and-migration-checks) | [007] Backups, restore rehearsals and migration checks | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-310](https://linear.app/skoolee-ai-app/issue/SKO-310/008-auditable-grade-and-finance-corrections) | [008] Auditable grade and finance corrections | Assessment and exams (AI Exam Studio flagship) |
| [SKO-311](https://linear.app/skoolee-ai-app/issue/SKO-311/009-ai-provider-policy-privacy-and-evaluation-gateway) | [009] AI provider policy, privacy and evaluation gateway | Assessment and exams (AI Exam Studio flagship) |
| [SKO-312](https://linear.app/skoolee-ai-app/issue/SKO-312/010-durable-event-outbox-and-job-orchestration) | [010] Durable event outbox and job orchestration | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-313](https://linear.app/skoolee-ai-app/issue/SKO-313/011-package-comparison-trial-and-checkout-during-registration) | [011] Package comparison, trial and checkout during registration | School and teacher onboarding |
| [SKO-314](https://linear.app/skoolee-ai-app/issue/SKO-314/012-subscription-lifecycle-group-billing-and-entitlement-enforcement) | [012] Subscription lifecycle, group billing and entitlement enforcement | Finance |
| [SKO-315](https://linear.app/skoolee-ai-app/issue/SKO-315/013-job-status-retries-and-delivery-receipts) | [013] Job status, retries and delivery receipts | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-316](https://linear.app/skoolee-ai-app/issue/SKO-316/014-draft-recovery-consistent-navigation-and-accessibility) | [014] Draft recovery, consistent navigation and accessibility | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-317](https://linear.app/skoolee-ai-app/issue/SKO-317/015-safe-deletion-archival-and-restore) | [015] Safe deletion, archival and restore | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-318](https://linear.app/skoolee-ai-app/issue/SKO-318/016-audited-support-access-and-service-operations) | [016] Audited support access and service operations | Platform foundations (shared UX, tenancy, jobs, ops) |
| [SKO-319](https://linear.app/skoolee-ai-app/issue/SKO-319/017-separate-standalone-and-school-group-onboarding-with-resumable) | [017] Separate standalone and school-group onboarding with resumable setup | School and teacher onboarding; duplicate of SKO-224 |
| [SKO-320](https://linear.app/skoolee-ai-app/issue/SKO-320/018-language-rtl-timezone-calendar-and-currency-packages) | [018] Language, RTL, timezone, calendar and currency packages | Academic cycle |
| [SKO-321](https://linear.app/skoolee-ai-app/issue/SKO-321/019-configurable-curriculum-grading-and-term-structures) | [019] Configurable curriculum, grading and term structures | Assessment and exams (AI Exam Studio flagship) |
| [SKO-322](https://linear.app/skoolee-ai-app/issue/SKO-322/020-permanent-student-identity-and-enrollment-history) | [020] Permanent student identity and enrollment history | School and teacher onboarding |
| [SKO-323](https://linear.app/skoolee-ai-app/issue/SKO-323/021-multiple-guardians-and-granular-accessconsent) | [021] Multiple guardians and granular access/consent | School and teacher onboarding |
| [SKO-324](https://linear.app/skoolee-ai-app/issue/SKO-324/022-reversible-imports-and-clear-validation) | [022] Reversible imports and clear validation | School and teacher onboarding |
| [SKO-325](https://linear.app/skoolee-ai-app/issue/SKO-325/023-guided-school-setup-and-import-reconciliation) | [023] Guided school setup and import reconciliation | School and teacher onboarding; duplicate of SKO-227 |
| [SKO-326](https://linear.app/skoolee-ai-app/issue/SKO-326/024-configurable-admission-forms-and-enquiry-pipeline) | [024] Configurable admission forms and enquiry pipeline | School and teacher onboarding; duplicate of SKO-205 |
| [SKO-327](https://linear.app/skoolee-ai-app/issue/SKO-327/025-staff-hierarchy-workload-and-absence-cover) | [025] Staff hierarchy, workload and absence cover | Attendance; duplicate of SKO-228 |
| [SKO-328](https://linear.app/skoolee-ai-app/issue/SKO-328/026-learning-resource-and-document-library) | [026] Learning resource and document library | School operations add-on packages; duplicate of SKO-204 |
| [SKO-329](https://linear.app/skoolee-ai-app/issue/SKO-329/027-global-search-and-reliable-directory-filters) | [027] Global search and reliable directory filters | Platform foundations (shared UX, tenancy, jobs, ops); duplicate of SKO-191 |
| [SKO-330](https://linear.app/skoolee-ai-app/issue/SKO-330/028-school-and-campus-lifecycle-editing) | [028] School and campus lifecycle editing | School and teacher onboarding; duplicate of SKO-200 |
| [SKO-331](https://linear.app/skoolee-ai-app/issue/SKO-331/030-attendance-accuracy-and-exception-handling) | [030] Attendance accuracy and exception handling | Attendance; duplicate of SKO-230 |
| [SKO-332](https://linear.app/skoolee-ai-app/issue/SKO-332/031-year-end-rollover-and-promotion-review) | [031] Year-end rollover and promotion review | Academic cycle; duplicate of SKO-198 |
| [SKO-333](https://linear.app/skoolee-ai-app/issue/SKO-333/029-teaching-timetable-conflicts-and-publication) | [029] Teaching timetable conflicts and publication | Academic cycle; duplicate of SKO-229 |
| [SKO-334](https://linear.app/skoolee-ai-app/issue/SKO-334/032-curriculum-and-learning-objective-map) | [032] Curriculum and learning objective map | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-231 |
| [SKO-335](https://linear.app/skoolee-ai-app/issue/SKO-335/033-reviewed-question-bank-and-assessment-blueprints) | [033] Reviewed question bank and assessment blueprints | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-232 |
| [SKO-336](https://linear.app/skoolee-ai-app/issue/SKO-336/034-ai-quiztest-generation-with-source-references) | [034] AI quiz/test generation with source references | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-233 |
| [SKO-337](https://linear.app/skoolee-ai-app/issue/SKO-337/035-assignments-submissions-and-rubrics) | [035] Assignments, submissions and rubrics | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-234 |
| [SKO-338](https://linear.app/skoolee-ai-app/issue/SKO-338/036-assessment-accommodations-and-accessible-materials) | [036] Assessment accommodations and accessible materials | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-235 |
| [SKO-339](https://linear.app/skoolee-ai-app/issue/SKO-339/037-exam-attempts-with-autosave-and-recovery) | [037] Exam attempts with autosave and recovery | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-236 |
| [SKO-340](https://linear.app/skoolee-ai-app/issue/SKO-340/038-exam-scheduling-room-capacity-and-invigilation) | [038] Exam scheduling, room capacity and invigilation | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-237 |
| [SKO-341](https://linear.app/skoolee-ai-app/issue/SKO-341/039-paper-marks-scan-with-teacher-approved-import) | [039] Paper marks scan with teacher-approved import | School and teacher onboarding; duplicate of SKO-238 |
| [SKO-342](https://linear.app/skoolee-ai-app/issue/SKO-342/040-lesson-plans-and-differentiated-activity-groups) | [040] Lesson plans and differentiated activity groups | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-239 |
| [SKO-343](https://linear.app/skoolee-ai-app/issue/SKO-343/041-messaging-and-attachment-reliability) | [041] Messaging and attachment reliability | Communication; duplicate of SKO-240 |
| [SKO-344](https://linear.app/skoolee-ai-app/issue/SKO-344/042-actionable-notification-center) | [042] Actionable notification center | Communication; duplicate of SKO-203 |
| [SKO-345](https://linear.app/skoolee-ai-app/issue/SKO-345/043-principal-action-queue) | [043] Principal action queue | Triage in SKAI; duplicate of SKO-202 |
| [SKO-346](https://linear.app/skoolee-ai-app/issue/SKO-346/044-student-today-page) | [044] Student Today page | Student and family experience; duplicate of SKO-241 |
| [SKO-347](https://linear.app/skoolee-ai-app/issue/SKO-347/045-family-action-inbox-across-siblings) | [045] Family action inbox across siblings | Student and family experience; duplicate of SKO-242 |
| [SKO-348](https://linear.app/skoolee-ai-app/issue/SKO-348/046-absence-explanation-leave-and-trip-consent) | [046] Absence explanation, leave and trip consent | Attendance; duplicate of SKO-243 |
| [SKO-349](https://linear.app/skoolee-ai-app/issue/SKO-349/047-weekly-family-digest-and-short-home-practice) | [047] Weekly family digest and short home practice | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-244 |
| [SKO-350](https://linear.app/skoolee-ai-app/issue/SKO-350/048-parent-teacher-meeting-booking-and-follow-up) | [048] Parent-teacher meeting booking and follow-up | Student and family experience; duplicate of SKO-245 |
| [SKO-351](https://linear.app/skoolee-ai-app/issue/SKO-351/049-question-level-misconception-and-item-review) | [049] Question-level misconception and item review | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-246 |
| [SKO-352](https://linear.app/skoolee-ai-app/issue/SKO-352/050-marking-moderation-and-regrade-workflow) | [050] Marking moderation and regrade workflow | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-247 |
| [SKO-353](https://linear.app/skoolee-ai-app/issue/SKO-353/051-intervention-ownership-and-reassessment) | [051] Intervention ownership and reassessment | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-248 |
| [SKO-354](https://linear.app/skoolee-ai-app/issue/SKO-354/052-practice-with-hints-and-spaced-review) | [052] Practice with hints and spaced review | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-249 |
| [SKO-355](https://linear.app/skoolee-ai-app/issue/SKO-355/053-feedback-and-improvement-portfolio) | [053] Feedback and improvement portfolio | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-250 |
| [SKO-356](https://linear.app/skoolee-ai-app/issue/SKO-356/054-source-grounded-student-study-assistant) | [054] Source-grounded student study assistant | Chat and AI input; duplicate of SKO-251 |
| [SKO-357](https://linear.app/skoolee-ai-app/issue/SKO-357/055-school-policy-assistant-with-cited-answers) | [055] School policy assistant with cited answers | Chat and AI input; duplicate of SKO-252 |
| [SKO-358](https://linear.app/skoolee-ai-app/issue/SKO-358/056-pilot-adoption-and-value-measurement) | [056] Pilot adoption and value measurement | LEAP pilot and launch readiness; duplicate of SKO-253 |
| [SKO-359](https://linear.app/skoolee-ai-app/issue/SKO-359/057-secure-fee-statements-installments-and-receipts) | [057] Secure fee statements, installments and receipts | Finance; duplicate of SKO-254 |
| [SKO-360](https://linear.app/skoolee-ai-app/issue/SKO-360/058-payment-reconciliation-and-duplicate-prevention) | [058] Payment reconciliation and duplicate prevention | Finance; duplicate of SKO-255 |
| [SKO-361](https://linear.app/skoolee-ai-app/issue/SKO-361/059-refunds-credit-notes-waivers-and-approval-separation) | [059] Refunds, credit notes, waivers and approval separation | Finance; duplicate of SKO-256 |
| [SKO-362](https://linear.app/skoolee-ai-app/issue/SKO-362/001-shared-design-system-and-role-based-navigation) | [001] Shared design system and role-based navigation | Platform foundations (shared UX, tenancy, jobs, ops); duplicate of SKO-303 |
| [SKO-363](https://linear.app/skoolee-ai-app/issue/SKO-363/002-shared-authorization-and-tenantcampuschild-ownership-rules) | [002] Shared authorization and tenant/campus/child ownership rules | Account creation and access; duplicate of SKO-304 |
| [SKO-364](https://linear.app/skoolee-ai-app/issue/SKO-364/003-role-assignment-invitations-and-institution-membership-ux) | [003] Role assignment, invitations and institution membership UX | Account creation and access; duplicate of SKO-305 |
| [SKO-365](https://linear.app/skoolee-ai-app/issue/SKO-365/004-reliable-account-lifecycle-and-administrator-mfa) | [004] Reliable account lifecycle and administrator MFA | Account creation and access; duplicate of SKO-306 |
| [SKO-366](https://linear.app/skoolee-ai-app/issue/SKO-366/005-approved-report-versions-and-publication-gates) | [005] Approved report versions and publication gates | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-307 |
| [SKO-367](https://linear.app/skoolee-ai-app/issue/SKO-367/006-truthful-marketing-and-synchronized-pricing-entitlements) | [006] Truthful marketing and synchronized pricing entitlements | Finance; duplicate of SKO-308 |
| [SKO-368](https://linear.app/skoolee-ai-app/issue/SKO-368/007-backups-restore-rehearsals-and-migration-checks) | [007] Backups, restore rehearsals and migration checks | Platform foundations (shared UX, tenancy, jobs, ops); duplicate of SKO-309 |
| [SKO-369](https://linear.app/skoolee-ai-app/issue/SKO-369/008-auditable-grade-and-finance-corrections) | [008] Auditable grade and finance corrections | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-310 |
| [SKO-370](https://linear.app/skoolee-ai-app/issue/SKO-370/009-ai-provider-policy-privacy-and-evaluation-gateway) | [009] AI provider policy, privacy and evaluation gateway | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-311 |
| [SKO-371](https://linear.app/skoolee-ai-app/issue/SKO-371/010-durable-event-outbox-and-job-orchestration) | [010] Durable event outbox and job orchestration | Platform foundations (shared UX, tenancy, jobs, ops); duplicate of SKO-312 |
| [SKO-372](https://linear.app/skoolee-ai-app/issue/SKO-372/011-package-comparison-trial-and-checkout-during-registration) | [011] Package comparison, trial and checkout during registration | School and teacher onboarding; duplicate of SKO-313 |
| [SKO-374](https://linear.app/skoolee-ai-app/issue/SKO-374/013-job-status-retries-and-delivery-receipts) | [013] Job status, retries and delivery receipts | Platform foundations (shared UX, tenancy, jobs, ops); duplicate of SKO-315 |
| [SKO-385](https://linear.app/skoolee-ai-app/issue/SKO-385/012-subscription-lifecycle-group-billing-and-entitlement-enforcement) | [012] Subscription lifecycle, group billing and entitlement enforcement | Finance; duplicate of SKO-314 |
| [SKO-397](https://linear.app/skoolee-ai-app/issue/SKO-397/023-guided-school-setup-and-import-reconciliation) | [023] Guided school setup and import reconciliation | School and teacher onboarding; duplicate of SKO-227 |
| [SKO-408](https://linear.app/skoolee-ai-app/issue/SKO-408/034-ai-exam-studio-flagship-assessment-secure-delivery-and-learning) | [034] AI Exam Studio: flagship assessment, secure delivery and learning recovery | Assessment and exams (AI Exam Studio flagship); duplicate of SKO-233 |
| [SKO-452](https://linear.app/skoolee-ai-app/issue/SKO-452/078-leap-demo-case-studies-and-launch-readiness) | [078] LEAP demo, case studies and launch readiness | LEAP pilot and launch readiness; duplicate of SKO-273 |
| [SKO-460](https://linear.app/skoolee-ai-app/issue/SKO-460/085-recoverable-multilingual-ai-chat-and-multimodal-assistant-workflow) | [085] Recoverable multilingual AI chat and multimodal assistant workflow | Chat and AI input |
| [SKO-494](https://linear.app/skoolee-ai-app/issue/SKO-494/ai-release-remains-blocked-because-no-educator-reviewed-evaluation-is) | AI release remains blocked because no educator-reviewed evaluation is recorded | Assessment and exams (AI Exam Studio flagship) |
| [SKO-545](https://linear.app/skoolee-ai-app/issue/SKO-545/ai-workflows-for-every-role-and-per-role-first-login-setup-full) | AI Workflows for every role and per-role first-login setup — full automation (flagship) | Chat and AI input |

## Skoolee AI — Complete Feature List (3)

| Linear | Title | Suggested SKAI home |
| --- | --- | --- |
| [SKO-559](https://linear.app/skoolee-ai-app/issue/SKO-559/m01-utcome-deliver-01-small-ux-a) | M01: utcome Deliver 01 Small UX a | Superseded: truncated duplicate of PM-01 (done as SKAI-52..55) |
| [SKO-560](https://linear.app/skoolee-ai-app/issue/SKO-560/m01-sability-as-a-cohere) | M01: sability as a cohere | Superseded: truncated duplicate of PM-01 (done as SKAI-52..55) |
| [SKO-561](https://linear.app/skoolee-ai-app/issue/SKO-561/m01-eature-tasks-searchfiltersortpagi) | M01: eature tasks * Search/filter/sort/pagi | Superseded: truncated duplicate of PM-01 (done as SKAI-52..55) |
