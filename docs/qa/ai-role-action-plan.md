# Role-specific chatbot action plan

Generated from the executable registry. This is connected coverage, not every function in the application. The planner receives a live role plan each turn; permission overrides, campus and seat gates can further restrict these actions. Backend validation is always authoritative.

Execution modes: A = run within scope; B = review and confirm inside chat; C = separate approval or domain screen. Unconnected operations must be reported as unavailable, never simulated as completed. Credentials and arbitrary SQL/code are never allowed.

## App Owner (APP_OWNER)

13 connected actions.

| Action | Scope | Mode |
| --- | --- | --- |
| Update my profile (`profile.update`) | self | A |
| Save a private plan (`personal.save_plan`) | self | A |
| Look up institutions (`platform.inspect`) | platform | A |
| Update an institution's profile (`platform.update_institution`) | platform | B |
| Draft a pilot charter (`platform.pilot_create`) | platform | B |
| Prepare a capacity limit (`platform.capacity_apply_policy`) | platform | C |
| Prepare a provider-event note (`platform.resolve_provider_event`) | platform | C |
| Prepare a subscription decision (`platform.subscription_request_review`) | platform | C |
| Prepare a new school (`platform.provision_school`) | platform | C |
| Prepare a plan or status change (`platform.update_school_plan_status`) | platform | C |
| Update default package prices (`platform.set_default_plan_pricing`) | platform | B |
| Open card payment setup (`platform.payment_connect_onboarding`) | platform | C |
| Prepare signing an account out (`platform.session_terminate`) | platform | C |

## Super Admin (SUPER_ADMIN)

20 connected actions.

| Action | Scope | Mode |
| --- | --- | --- |
| Update my profile (`profile.update`) | self | A |
| Save a private plan (`personal.save_plan`) | self | A |
| Save a work plan (`work.save`) | own-campus | A |
| Change the school's messaging rules (`chat.update_school_settings`) | any-campus-of-school | B |
| Add a campus (`campus.create`) | any-campus-of-school | B |
| Correct a campus's details (`campus.update_details`) | any-campus-of-school | B |
| Start a group standard (`group_policy.create_template`) | any-campus-of-school | B |
| Draft a group standard (`group_policy.save_draft`) | any-campus-of-school | B |
| Submit a standard for review (`group_policy.submit_for_review`) | any-campus-of-school | B |
| Add a sign-in domain (`identity.add_domain`) | any-campus-of-school | B |
| Prepare a leader invitation (`staff.leader_invite_prepare`) | any-campus-of-school | B |
| Compare plans (`subscription.preview`) | any-campus-of-school | A |
| Check campus readiness (`readiness.view`) | any-campus-of-school | A |
| Review a group standard (`group_policy.review_version`) | any-campus-of-school | C |
| Decide a campus exception (`group_policy.decide_override`) | any-campus-of-school | C |
| Change someone's access (`memberships.change_access`) | any-campus-of-school | C |
| Ask for a plan change (`subscription.request_plan_change`) | any-campus-of-school | C |
| Stop someone's access (`staff.deactivate`) | any-campus-of-school | C |
| Decide a support access request (`governance.support_grant_decide`) | any-campus-of-school | C |
| Send leader invitations (`staff.leader_invite_send`) | any-campus-of-school | C |

## Campus Admin (CAMPUS_ADMIN)

118 connected actions.

| Action | Scope | Mode |
| --- | --- | --- |
| Update my profile (`profile.update`) | self | A |
| Save a private plan (`personal.save_plan`) | self | A |
| Add students to the roster (`students.create`) | own-campus | B |
| Log a phone call (`front_desk.call_log`) | own-campus | A |
| Look up current school records (`school.inspect`) | own-campus | A |
| Save a work plan (`work.save`) | own-campus | A |
| Create classes for the academic year (`academics.setup_year`) | own-campus | B |
| Add classrooms (`setup.rooms`) | own-campus | B |
| Set the period bell times (`setup.periods`) | own-campus | B |
| Add subjects to classes (`setup.subjects`) | own-campus | B |
| Assign teachers to subjects or classes (`setup.teacher_allocations`) | own-campus | B |
| Set the weekend days (`setup.weekends`) | own-campus | B |
| Add or change holidays (`setup.holidays`) | own-campus | B |
| Remove holidays (`setup.holidays_delete`) | own-campus | C |
| Prepare staff invitations (`setup.staff_invitations`) | own-campus | B |
| Link guardians to students (`setup.guardians`) | own-campus | C |
| Transfer students between classes (`setup.transfers`) | own-campus | C |
| Withdraw students (`setup.withdrawals`) | own-campus | C |
| Accept a migration cutover (`setup.migration_cutover`) | own-campus | C |
| Draft a class timetable (`timetable.create_draft`) | own-campus | B |
| Draft timetables for several classes (`timetable.create_school_drafts`) | own-campus | B |
| Publish timetables (`timetable.publish_reviewed`) | own-campus | C |
| Assign cover teachers (`timetable.assign_substitutes`) | own-campus | B |
| Record a class register for a teacher (`attendance.record_register_operator`) | own-campus | C |
| Activate, pause or close the academic year (`academics.transition_year`) | own-campus | C |
| Promote students to the next year (`students.promote_enrollment`) | own-campus | C |
| Record a decision on a school risk (`operations.record_risk_decision`) | own-campus | C |
| Send an announcement to families (`communications.queue_announcement`) | own-campus | C |
| Plan an exam session (`exams.create_session_plan`) | own-campus | B |
| Add syllabus topics (`curriculum.import_topics`) | own-campus | A |
| Generate fee invoices (`fees.generate_invoices`) | own-campus | C |
| Record a payment, refund or other finance entry (`finance.apply_operation`) | own-campus | C |
| Add subjects to classes (`setup.subjects_by_class`) | own-campus | B |
| Apply for leave (`leave.apply`) | self | B |
| Save a class register (`attendance.mark_class`) | assigned-class | B |
| Create a fee group (`fees.create_fee_group`) | own-campus | B |
| Create a fee type (`fees.create_fee_type`) | own-campus | B |
| Set a fee amount for a group (`fees.create_master_line`) | own-campus | B |
| Assign a fee group to classes (`fees.assign_fee_group`) | own-campus | B |
| Set a late fee fine (`fees.create_fine_rule`) | own-campus | B |
| Create a fee discount (`fees.create_discount`) | own-campus | B |
| Remind families about fee dues (`fees.send_due_reminder`) | own-campus | C |
| Stage students for import review (`imports.stage_batch`) | own-campus | B |
| Commit a staged roster (`imports.commit_batch`) | own-campus | C |
| Create the academic year (draft) (`academic.cycle.create`) | own-campus | B |
| Ask for the academic year to be started (`academic.cycle.activate`) | own-campus | C |
| Choose a class teacher (`academic.class_teacher.assign`) | own-campus | C |
| Add a leave type (`leave.create_type`) | own-campus | B |
| Give staff leave days (`leave.create_allocation`) | own-campus | B |
| Set up the staff ranks (`staff.apply_hierarchy_preset`) | own-campus | B |
| Send staff invitations (`staff.invite_send`) | own-campus | C |
| Change a guardian's access (`guardians.change_access`) | own-campus | C |
| Decide an admission application (`admissions.decide_application`) | own-campus | C |
| Review a leave request (`leave.review`) | own-campus | C |
| Add an account to the books (`accounts.create_account`) | own-campus | B |
| Add a bank account by name (`accounts.create_bank_account`) | own-campus | B |
| Add a payment method (`accounts.create_payment_method`) | own-campus | B |
| Start a tax package draft (`tax.save_package_draft`) | own-campus | B |
| Give a discount to pupils (`fees.assign_discount`) | own-campus | B |
| Set an employee's payroll details (`payroll.set_employee_details`) | own-campus | B |
| Who owes fees (`read.fees.defaulters`) | own-campus | A |
| This month's fee collection (`read.fees.collection_summary`) | own-campus | A |
| Record a fee payment (`fees.collect_payment`) | own-campus | C |
| Request a refund, credit or waiver (`fees.request_adjustment`) | own-campus | C |
| Prepare a month's invoices (`fees.generate_monthly_invoices`) | own-campus | C |
| Propose an instalment plan (`fees.propose_payment_plan`) | own-campus | C |
| Send a tax package for sign-off (`tax.request_signoff`) | own-campus | C |
| Commit a bank statement (`imports.commit_bank_statement`) | own-campus | C |
| Post a bank reconciliation (`fees.post_bank_reconciliation`) | own-campus | C |
| Prepare a payroll run (`payroll.prepare_run`) | own-campus | C |
| Log post or a parcel (`front_desk.postal_log`) | own-campus | A |
| Check a certificate before issuing (`front_desk.certificate_preview`) | own-campus | A |
| Sign a visitor in (`front_desk.visitor_check_in`) | own-campus | B |
| Sign a visitor out (`front_desk.visitor_check_out`) | own-campus | B |
| Complete a callback (`front_desk.callback_complete`) | own-campus | B |
| Move a callback (`front_desk.callback_reschedule`) | own-campus | B |
| Log an admission enquiry (`enquiries.create`) | own-campus | B |
| Update an enquiry (`enquiries.update`) | own-campus | B |
| Start an application from an enquiry (`admissions.start_application`) | own-campus | B |
| Fill in an application (`admissions.save_answers`) | own-campus | B |
| Record a complaint (`front_desk.complaint_intake`) | own-campus | B |
| Draft a certificate template (`front_desk.certificate_template_save`) | own-campus | B |
| Issue a certificate (`front_desk.certificate_issue`) | own-campus | C |
| Assign a complaint (`front_desk.complaint_assign`) | own-campus | C |
| Release a child at the gate (`pickup.gate_release`) | own-campus | C |
| Send a template for approval (`front_desk.request_template_approval`) | own-campus | C |
| Issue a book (`library.desk_issue_copy`) | own-campus | B |
| Return a book (`library.desk_return_copy`) | own-campus | B |
| Renew a loan (`library.desk_renew_loan`) | own-campus | B |
| Reserve a title (`library.desk_reserve_title`) | own-campus | B |
| Register copies (`library.desk_add_copies`) | own-campus | B |
| Set the loan rules (`library.desk_save_rules`) | own-campus | B |
| Enrol library members (`library.member_create`) | own-campus | B |
| Edit a catalogue title (`library.book_update`) | own-campus | B |
| Draft a purchase request (`purchasing.save_request`) | own-campus | B |
| Add a shelf section (`library.category_create`) | own-campus | A |
| Add books to the catalogue (`library.book_create`) | own-campus | A |
| Who has overdue books (`read.library.overdue`) | own-campus | A |
| Propose late fines or a lost-book charge (`library.desk_save_rules_money`) | own-campus | C |
| Report a lost copy (`library.desk_mark_lost`) | own-campus | C |
| Waive a fine or send it to fees (`library.desk_decide_charge`) | own-campus | C |
| Choose a class teacher (`academic.class.assign_teacher`) | own-campus | B |
| Add subjects to a class (`academic.subject.create`) | own-campus | B |
| Choose a subject teacher (`academic.subject.assign_teacher`) | own-campus | B |
| Set teachers' weekly lesson cap (`staff.set_workload_capacity`) | own-campus | B |
| Start a blank class timetable (`timetable.create`) | own-campus | B |
| Plan an exam session (`exams.session.create`) | own-campus | B |
| Choose an invigilator (`exams.invigilation.assign`) | own-campus | B |
| Draft a grading model (`academic.model.create_draft`) | own-campus | B |
| Set up inspection standards (`improvement.create_framework`) | own-campus | B |
| Arrange cover for an absent teacher (`staff.propose_cover`) | own-campus | B |
| Draft support plans for learners (`learning_actions.save_draft`) | own-campus | B |
| Review a mark correction (`corrections.decide_mark`) | own-campus | C |
| Activate a support plan (`learning_actions.activate`) | own-campus | C |
| Activate a grading model (`academic.model.activate`) | own-campus | C |
| Approve report cards (`reports.approve_versions`) | own-campus | C |
| Publish the exam datesheet (`exams.datesheet.publish`) | own-campus | C |
| Review a locked exam (`exams.principal_review`) | own-campus | C |

## Campus Admin (ADMIN)

120 connected actions.

| Action | Scope | Mode |
| --- | --- | --- |
| Update my profile (`profile.update`) | self | A |
| Save a private plan (`personal.save_plan`) | self | A |
| Add students to the roster (`students.create`) | own-campus | B |
| Log a phone call (`front_desk.call_log`) | own-campus | A |
| Look up current school records (`school.inspect`) | own-campus | A |
| Save a work plan (`work.save`) | own-campus | A |
| Create classes for the academic year (`academics.setup_year`) | own-campus | B |
| Add classrooms (`setup.rooms`) | own-campus | B |
| Set the period bell times (`setup.periods`) | own-campus | B |
| Add subjects to classes (`setup.subjects`) | own-campus | B |
| Assign teachers to subjects or classes (`setup.teacher_allocations`) | own-campus | B |
| Set the weekend days (`setup.weekends`) | own-campus | B |
| Add or change holidays (`setup.holidays`) | own-campus | B |
| Remove holidays (`setup.holidays_delete`) | own-campus | C |
| Prepare staff invitations (`setup.staff_invitations`) | own-campus | B |
| Link guardians to students (`setup.guardians`) | own-campus | C |
| Transfer students between classes (`setup.transfers`) | own-campus | C |
| Withdraw students (`setup.withdrawals`) | own-campus | C |
| Accept a migration cutover (`setup.migration_cutover`) | own-campus | C |
| Draft a class timetable (`timetable.create_draft`) | own-campus | B |
| Draft timetables for several classes (`timetable.create_school_drafts`) | own-campus | B |
| Publish timetables (`timetable.publish_reviewed`) | own-campus | C |
| Assign cover teachers (`timetable.assign_substitutes`) | own-campus | B |
| Record a class register for a teacher (`attendance.record_register_operator`) | own-campus | C |
| Activate, pause or close the academic year (`academics.transition_year`) | own-campus | C |
| Promote students to the next year (`students.promote_enrollment`) | own-campus | C |
| Record a decision on a school risk (`operations.record_risk_decision`) | own-campus | C |
| Send an announcement to families (`communications.queue_announcement`) | own-campus | C |
| Plan an exam session (`exams.create_session_plan`) | own-campus | B |
| Add syllabus topics (`curriculum.import_topics`) | own-campus | A |
| Generate fee invoices (`fees.generate_invoices`) | own-campus | C |
| Record a payment, refund or other finance entry (`finance.apply_operation`) | own-campus | C |
| Add subjects to classes (`setup.subjects_by_class`) | own-campus | B |
| Apply for leave (`leave.apply`) | self | B |
| Save a class register (`attendance.mark_class`) | assigned-class | B |
| Create a fee group (`fees.create_fee_group`) | own-campus | B |
| Create a fee type (`fees.create_fee_type`) | own-campus | B |
| Set a fee amount for a group (`fees.create_master_line`) | own-campus | B |
| Assign a fee group to classes (`fees.assign_fee_group`) | own-campus | B |
| Set a late fee fine (`fees.create_fine_rule`) | own-campus | B |
| Create a fee discount (`fees.create_discount`) | own-campus | B |
| Remind families about fee dues (`fees.send_due_reminder`) | own-campus | C |
| Stage students for import review (`imports.stage_batch`) | own-campus | B |
| Commit a staged roster (`imports.commit_batch`) | own-campus | C |
| Create the academic year (draft) (`academic.cycle.create`) | own-campus | B |
| Ask for the academic year to be started (`academic.cycle.activate`) | own-campus | C |
| Choose a class teacher (`academic.class_teacher.assign`) | own-campus | C |
| Add a leave type (`leave.create_type`) | own-campus | B |
| Give staff leave days (`leave.create_allocation`) | own-campus | B |
| Change the school's messaging rules (`chat.update_school_settings`) | any-campus-of-school | B |
| Set up the staff ranks (`staff.apply_hierarchy_preset`) | own-campus | B |
| Send staff invitations (`staff.invite_send`) | own-campus | C |
| Resend staff invitations (`staff.resend_invitation`) | own-campus | C |
| Change a guardian's access (`guardians.change_access`) | own-campus | C |
| Decide an admission application (`admissions.decide_application`) | own-campus | C |
| Review a leave request (`leave.review`) | own-campus | C |
| Add an account to the books (`accounts.create_account`) | own-campus | B |
| Add a bank account by name (`accounts.create_bank_account`) | own-campus | B |
| Add a payment method (`accounts.create_payment_method`) | own-campus | B |
| Start a tax package draft (`tax.save_package_draft`) | own-campus | B |
| Give a discount to pupils (`fees.assign_discount`) | own-campus | B |
| Set an employee's payroll details (`payroll.set_employee_details`) | own-campus | B |
| Who owes fees (`read.fees.defaulters`) | own-campus | A |
| This month's fee collection (`read.fees.collection_summary`) | own-campus | A |
| Record a fee payment (`fees.collect_payment`) | own-campus | C |
| Request a refund, credit or waiver (`fees.request_adjustment`) | own-campus | C |
| Prepare a month's invoices (`fees.generate_monthly_invoices`) | own-campus | C |
| Propose an instalment plan (`fees.propose_payment_plan`) | own-campus | C |
| Send a tax package for sign-off (`tax.request_signoff`) | own-campus | C |
| Commit a bank statement (`imports.commit_bank_statement`) | own-campus | C |
| Post a bank reconciliation (`fees.post_bank_reconciliation`) | own-campus | C |
| Prepare a payroll run (`payroll.prepare_run`) | own-campus | C |
| Log post or a parcel (`front_desk.postal_log`) | own-campus | A |
| Check a certificate before issuing (`front_desk.certificate_preview`) | own-campus | A |
| Sign a visitor in (`front_desk.visitor_check_in`) | own-campus | B |
| Sign a visitor out (`front_desk.visitor_check_out`) | own-campus | B |
| Complete a callback (`front_desk.callback_complete`) | own-campus | B |
| Move a callback (`front_desk.callback_reschedule`) | own-campus | B |
| Log an admission enquiry (`enquiries.create`) | own-campus | B |
| Update an enquiry (`enquiries.update`) | own-campus | B |
| Start an application from an enquiry (`admissions.start_application`) | own-campus | B |
| Fill in an application (`admissions.save_answers`) | own-campus | B |
| Record a complaint (`front_desk.complaint_intake`) | own-campus | B |
| Draft a certificate template (`front_desk.certificate_template_save`) | own-campus | B |
| Issue a certificate (`front_desk.certificate_issue`) | own-campus | C |
| Assign a complaint (`front_desk.complaint_assign`) | own-campus | C |
| Release a child at the gate (`pickup.gate_release`) | own-campus | C |
| Send a template for approval (`front_desk.request_template_approval`) | own-campus | C |
| Issue a book (`library.desk_issue_copy`) | own-campus | B |
| Return a book (`library.desk_return_copy`) | own-campus | B |
| Renew a loan (`library.desk_renew_loan`) | own-campus | B |
| Reserve a title (`library.desk_reserve_title`) | own-campus | B |
| Register copies (`library.desk_add_copies`) | own-campus | B |
| Set the loan rules (`library.desk_save_rules`) | own-campus | B |
| Enrol library members (`library.member_create`) | own-campus | B |
| Edit a catalogue title (`library.book_update`) | own-campus | B |
| Draft a purchase request (`purchasing.save_request`) | own-campus | B |
| Add a shelf section (`library.category_create`) | own-campus | A |
| Add books to the catalogue (`library.book_create`) | own-campus | A |
| Who has overdue books (`read.library.overdue`) | own-campus | A |
| Propose late fines or a lost-book charge (`library.desk_save_rules_money`) | own-campus | C |
| Report a lost copy (`library.desk_mark_lost`) | own-campus | C |
| Waive a fine or send it to fees (`library.desk_decide_charge`) | own-campus | C |
| Choose a class teacher (`academic.class.assign_teacher`) | own-campus | B |
| Add subjects to a class (`academic.subject.create`) | own-campus | B |
| Choose a subject teacher (`academic.subject.assign_teacher`) | own-campus | B |
| Set teachers' weekly lesson cap (`staff.set_workload_capacity`) | own-campus | B |
| Start a blank class timetable (`timetable.create`) | own-campus | B |
| Plan an exam session (`exams.session.create`) | own-campus | B |
| Choose an invigilator (`exams.invigilation.assign`) | own-campus | B |
| Draft a grading model (`academic.model.create_draft`) | own-campus | B |
| Set up inspection standards (`improvement.create_framework`) | own-campus | B |
| Arrange cover for an absent teacher (`staff.propose_cover`) | own-campus | B |
| Draft support plans for learners (`learning_actions.save_draft`) | own-campus | B |
| Review a mark correction (`corrections.decide_mark`) | own-campus | C |
| Activate a support plan (`learning_actions.activate`) | own-campus | C |
| Activate a grading model (`academic.model.activate`) | own-campus | C |
| Approve report cards (`reports.approve_versions`) | own-campus | C |
| Publish the exam datesheet (`exams.datesheet.publish`) | own-campus | C |
| Review a locked exam (`exams.principal_review`) | own-campus | C |

## Principal (PRINCIPAL)

33 connected actions.

| Action | Scope | Mode |
| --- | --- | --- |
| Update my profile (`profile.update`) | self | A |
| Save a private plan (`personal.save_plan`) | self | A |
| Look up current school records (`school.inspect`) | own-campus | A |
| Save a work plan (`work.save`) | own-campus | A |
| Draft a class timetable (`timetable.create_draft`) | own-campus | B |
| Draft timetables for several classes (`timetable.create_school_drafts`) | own-campus | B |
| Publish timetables (`timetable.publish_reviewed`) | own-campus | C |
| Assign cover teachers (`timetable.assign_substitutes`) | own-campus | B |
| Activate, pause or close the academic year (`academics.transition_year`) | own-campus | C |
| Record a decision on a school risk (`operations.record_risk_decision`) | own-campus | C |
| Send an announcement to families (`communications.queue_announcement`) | own-campus | C |
| Plan an exam session (`exams.create_session_plan`) | own-campus | B |
| Add syllabus topics (`curriculum.import_topics`) | own-campus | A |
| Apply for leave (`leave.apply`) | self | B |
| Review a leave request (`leave.review`) | own-campus | C |
| Choose a class teacher (`academic.class.assign_teacher`) | own-campus | B |
| Add subjects to a class (`academic.subject.create`) | own-campus | B |
| Choose a subject teacher (`academic.subject.assign_teacher`) | own-campus | B |
| Set teachers' weekly lesson cap (`staff.set_workload_capacity`) | own-campus | B |
| Start a blank class timetable (`timetable.create`) | own-campus | B |
| Plan an exam session (`exams.session.create`) | own-campus | B |
| Choose an invigilator (`exams.invigilation.assign`) | own-campus | B |
| Draft a grading model (`academic.model.create_draft`) | own-campus | B |
| Set up inspection standards (`improvement.create_framework`) | own-campus | B |
| Arrange cover for an absent teacher (`staff.propose_cover`) | own-campus | B |
| Draft support plans for learners (`learning_actions.save_draft`) | own-campus | B |
| Review a mark correction (`corrections.decide_mark`) | own-campus | C |
| Activate a support plan (`learning_actions.activate`) | own-campus | C |
| Activate a grading model (`academic.model.activate`) | own-campus | C |
| Approve report cards (`reports.approve_versions`) | own-campus | C |
| Publish the exam datesheet (`exams.datesheet.publish`) | own-campus | C |
| Review a locked exam (`exams.principal_review`) | own-campus | C |
| Ask the campus admin for periods, rooms or holidays (`academic.request_operator_setup`) | own-campus | C |

## Teacher (TEACHER)

24 connected actions.

| Action | Scope | Mode |
| --- | --- | --- |
| Update my profile (`profile.update`) | self | A |
| Save a private plan (`personal.save_plan`) | self | A |
| Save a work plan (`work.save`) | own-campus | A |
| Draft homework (`assignments.create`) | assigned-class | B |
| Release homework (`assignments.release`) | assigned-class | C |
| Save a link to class resources (`resources.create`) | assigned-class | A |
| Publish a resource (`resources.publish`) | assigned-class | C |
| Add a portfolio entry (`portfolio.create_entry`) | assigned-class | B |
| Set up a club or sports activity (`activities.create`) | own-campus | B |
| Draft a message to a class's families (`chat.send_message`) | assigned-class | C |
| Open Exam Studio (`exam_studio.open`) | assigned-class | C |
| Apply for leave (`leave.apply`) | self | B |
| Offer parent meeting slots (`meetings.open_window`) | self | B |
| Ask the academic lead to fix my set-up (`readiness.update_task`) | self | C |
| Prepare this week's family update (`digests.prepare`) | assigned-class | A |
| Send the weekly family update (`digests.send`) | assigned-class | C |
| Save a class register (`attendance.mark_class`) | assigned-class | B |
| Check my registers (`read.teacher.register_status`) | assigned-class | A |
| My day (`read.teacher.today`) | self | A |
| Create a quiz or class test (`exams.create`) | assigned-class | B |
| Enter marks (`marks.enter_bulk`) | assigned-class | B |
| Print a paper marks sheet (`marks_scan.create_template`) | assigned-class | A |
| Edit a report card remark (`reports.edit_remarks`) | assigned-class | B |
| Request a mark correction (`corrections.request_mark`) | assigned-class | B |

## Parent (PARENT)

15 connected actions.

| Action | Scope | Mode |
| --- | --- | --- |
| Update my profile (`profile.update`) | self | A |
| Save a private plan (`personal.save_plan`) | self | A |
| My child's attendance (`read.parent.child_attendance`) | own-child | A |
| Fees due (`read.parent.dues`) | own-child | A |
| Explain an absence (`parent.explain_absence`) | own-child | B |
| Tell the school my child will be away (`family.request_leave`) | own-child | B |
| Book a meeting with a teacher (`family.meeting`) | own-child | B |
| Set a daily canteen limit (`canteen.set_spend_limit`) | own-child | B |
| Tell the canteen about allergies (`canteen.record_dietary`) | own-child | B |
| Ask for a place in a club or trip (`family_activities.request_place`) | own-child | B |
| Change my phone number (`profile.change_phone`) | self | C |
| Stop school updates on a channel (`communications.set_guardian_channel_preference`) | self | C |
| Write to the school office (`chat.message_office`) | self | C |
| Let someone else collect my child (`pickup.issue_authorization`) | own-child | C |
| Pay a fee online (`fees.start_online_payment`) | own-child | C |

## Student (STUDENT)

13 connected actions.

| Action | Scope | Mode |
| --- | --- | --- |
| Update my profile (`profile.update`) | self | A |
| Save a private plan (`personal.save_plan`) | self | A |
| Save a private goal (`pathways.save_goal_private`) | self | A |
| Add a step to my goal (`pathways.add_action`) | self | A |
| Choose who sees my goal (`pathways.share_goal`) | self | B |
| Ask to meet a counsellor (`pathways.request_appointment`) | self | B |
| Save my homework draft (`assignments.save_learner_draft`) | self | B |
| Submit my homework (`assignments.submit`) | self | B |
| Add work to my portfolio (`portfolio.student_entry`) | self | B |
| Ask my teacher for help (`study.request_help`) | self | C |
| Ask the office to check a mark or record (`corrections.request_office`) | self | C |
| My homework (`read.student.assignments`) | self | A |
| My attendance (`read.student.attendance`) | self | A |

## Accountant (ACCOUNTANT)

30 connected actions.

| Action | Scope | Mode |
| --- | --- | --- |
| Update my profile (`profile.update`) | self | A |
| Save a private plan (`personal.save_plan`) | self | A |
| Look up current school records (`school.inspect`) | own-campus | A |
| Save a work plan (`work.save`) | own-campus | A |
| Generate fee invoices (`fees.generate_invoices`) | own-campus | C |
| Record a payment, refund or other finance entry (`finance.apply_operation`) | own-campus | C |
| Apply for leave (`leave.apply`) | self | B |
| Create a fee group (`fees.create_fee_group`) | own-campus | B |
| Create a fee type (`fees.create_fee_type`) | own-campus | B |
| Set a fee amount for a group (`fees.create_master_line`) | own-campus | B |
| Assign a fee group to classes (`fees.assign_fee_group`) | own-campus | B |
| Set a late fee fine (`fees.create_fine_rule`) | own-campus | B |
| Create a fee discount (`fees.create_discount`) | own-campus | B |
| Remind families about fee dues (`fees.send_due_reminder`) | own-campus | C |
| Add an account to the books (`accounts.create_account`) | own-campus | B |
| Add a bank account by name (`accounts.create_bank_account`) | own-campus | B |
| Add a payment method (`accounts.create_payment_method`) | own-campus | B |
| Start a tax package draft (`tax.save_package_draft`) | own-campus | B |
| Give a discount to pupils (`fees.assign_discount`) | own-campus | B |
| Set an employee's payroll details (`payroll.set_employee_details`) | own-campus | B |
| Who owes fees (`read.fees.defaulters`) | own-campus | A |
| This month's fee collection (`read.fees.collection_summary`) | own-campus | A |
| Record a fee payment (`fees.collect_payment`) | own-campus | C |
| Request a refund, credit or waiver (`fees.request_adjustment`) | own-campus | C |
| Prepare a month's invoices (`fees.generate_monthly_invoices`) | own-campus | C |
| Propose an instalment plan (`fees.propose_payment_plan`) | own-campus | C |
| Send a tax package for sign-off (`tax.request_signoff`) | own-campus | C |
| Commit a bank statement (`imports.commit_bank_statement`) | own-campus | C |
| Post a bank reconciliation (`fees.post_bank_reconciliation`) | own-campus | C |
| Prepare a payroll run (`payroll.prepare_run`) | own-campus | C |

## Librarian (LIBRARIAN)

19 connected actions.

| Action | Scope | Mode |
| --- | --- | --- |
| Update my profile (`profile.update`) | self | A |
| Save a private plan (`personal.save_plan`) | self | A |
| Save a work plan (`work.save`) | own-campus | A |
| Apply for leave (`leave.apply`) | self | B |
| Issue a book (`library.desk_issue_copy`) | own-campus | B |
| Return a book (`library.desk_return_copy`) | own-campus | B |
| Renew a loan (`library.desk_renew_loan`) | own-campus | B |
| Reserve a title (`library.desk_reserve_title`) | own-campus | B |
| Register copies (`library.desk_add_copies`) | own-campus | B |
| Set the loan rules (`library.desk_save_rules`) | own-campus | B |
| Enrol library members (`library.member_create`) | own-campus | B |
| Edit a catalogue title (`library.book_update`) | own-campus | B |
| Draft a purchase request (`purchasing.save_request`) | own-campus | B |
| Add a shelf section (`library.category_create`) | own-campus | A |
| Add books to the catalogue (`library.book_create`) | own-campus | A |
| Who has overdue books (`read.library.overdue`) | own-campus | A |
| Propose late fines or a lost-book charge (`library.desk_save_rules_money`) | own-campus | C |
| Report a lost copy (`library.desk_mark_lost`) | own-campus | C |
| Waive a fine or send it to fees (`library.desk_decide_charge`) | own-campus | C |

## Receptionist (RECEPTIONIST)

21 connected actions.

| Action | Scope | Mode |
| --- | --- | --- |
| Update my profile (`profile.update`) | self | A |
| Save a private plan (`personal.save_plan`) | self | A |
| Log a phone call (`front_desk.call_log`) | own-campus | A |
| Save a work plan (`work.save`) | own-campus | A |
| Apply for leave (`leave.apply`) | self | B |
| Log post or a parcel (`front_desk.postal_log`) | own-campus | A |
| Check a certificate before issuing (`front_desk.certificate_preview`) | own-campus | A |
| Sign a visitor in (`front_desk.visitor_check_in`) | own-campus | B |
| Sign a visitor out (`front_desk.visitor_check_out`) | own-campus | B |
| Complete a callback (`front_desk.callback_complete`) | own-campus | B |
| Move a callback (`front_desk.callback_reschedule`) | own-campus | B |
| Log an admission enquiry (`enquiries.create`) | own-campus | B |
| Update an enquiry (`enquiries.update`) | own-campus | B |
| Start an application from an enquiry (`admissions.start_application`) | own-campus | B |
| Fill in an application (`admissions.save_answers`) | own-campus | B |
| Record a complaint (`front_desk.complaint_intake`) | own-campus | B |
| Draft a certificate template (`front_desk.certificate_template_save`) | own-campus | B |
| Issue a certificate (`front_desk.certificate_issue`) | own-campus | C |
| Assign a complaint (`front_desk.complaint_assign`) | own-campus | C |
| Release a child at the gate (`pickup.gate_release`) | own-campus | C |
| Send a template for approval (`front_desk.request_template_approval`) | own-campus | C |
