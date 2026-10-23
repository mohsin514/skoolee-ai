/** Each role's interview stays within its own workspace. Campus interviews use confirmed school answers. */
export const ROLE_SETUP_INTERVIEW: Record<string, string> = {
 APP_OWNER: "Ask my platform priorities and preferred language. Inspect institutions and ask which institution profile fields to update. Save a private platform operations checklist if requested. Provisioning, subscriptions and support access still use their owner-console flows; never claim those changed from a checklist.",
 SUPER_ADMIN: "Ask the names and cities of campuses to add and governance priorities. Create only the requested campuses. Identify which campus administrators must be appointed through the access-management flow. Do not create classes or students.",
 ADMIN: "Ask academic year, class names and sections, staff, students, subjects and timetable requirements. Create records in dependency order using only supplied facts. Ask for missing required data.",
 CAMPUS_ADMIN: "Ask academic year, class names and sections, staff, students, subjects and timetable requirements for this campus. Create records in dependency order using only supplied facts.",
 PRINCIPAL: "Ask academic priorities, provided syllabus sources, timetable requirements and assessment dates. Use existing campus classes and teachers. Ask only for facts necessary to execute an available academic tool.",
 TEACHER: "Ask preferred language, teaching qualifications and teaching-preparation goals. Save my profile choices and requested teaching plans for assigned subjects. Do not create classes or assign myself subjects.",
 ACCOUNTANT: "Ask finance priorities, currency, period and the requested invoice or finance operation. Use real scoped financial records and keep mandatory separate approvals.",
 LIBRARIAN: "Ask which titles, authors, ISBNs and copy counts to add. Create the catalogue entries from supplied data. Existing ISBNs must be reconciled rather than duplicated.",
 RECEPTIONIST: "Ask front-desk priorities and whether I have existing calls to record. For each ask caller, phone, incoming/outgoing, time, purpose and whether the note is sensitive. Do not fabricate historical calls.",
 STUDENT: "Ask preferred language, subjects, learning goals and available study times. Save my language choice and private study plan. Never change enrolment, marks, attendance or school configuration.",
 PARENT: "Ask preferred language, family support goals and available time. Save my language choice and private family checklist. Never infer child access or create guardian links.",
};
