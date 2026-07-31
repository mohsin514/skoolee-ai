warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config


[+] Added Schemas
  - public

[+] Added enums
  - UserRole
  - Gender
  - AttendanceStatus
  - InvoiceStatus

[+] Added tables
  - schools
  - campuses
  - users
  - classes
  - students
  - subjects
  - exams
  - grade_weight_configs
  - marks
  - report_cards
  - attendance
  - attendance_edit_history
  - fee_structures
  - invoices
  - payments
  - payment_plans
  - bank_reconciliations
  - ai_usage_logs
  - ai_insights
  - ai_review_items
  - intervention_plans
  - prompt_templates
  - parent_conversations
  - consent_logs
  - notification_templates
  - parent_communications
  - timetables
  - timetable_slots
  - pending_registrations
  - staff_invitations
  - audit_logs
  - platform_config
  - super_admin_audit_logs
  - login_sessions
  - password_history
  - password_resets
  - student_class_history
  - teacher_attendance
  - academic_cycles

[*] Changed the `academic_cycles` table
  [+] Added index on columns (campus_id, status)
  [+] Added unique index on columns (campus_id, academic_year)
  [+] Added foreign key on columns (campus_id)

[*] Changed the `ai_insights` table
  [+] Added index on columns (school_id, campus_id, feature)
  [+] Added index on columns (user_id)

[*] Changed the `ai_review_items` table
  [+] Added index on columns (school_id, campus_id, status)
  [+] Added index on columns (related_type, related_id)

[*] Changed the `ai_usage_logs` table
  [+] Added index on columns (school_id, campus_id)
  [+] Added index on columns (feature)
  [+] Added foreign key on columns (school_id)

[*] Changed the `attendance` table
  [+] Added index on columns (class_id, date)
  [+] Added index on columns (campus_id, date)
  [+] Added unique index on columns (student_id, date)
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (class_id)
  [+] Added foreign key on columns (student_id)
  [+] Added foreign key on columns (marked_by)

[*] Changed the `attendance_edit_history` table
  [+] Added index on columns (attendance_id)
  [+] Added foreign key on columns (attendance_id)

[*] Changed the `bank_reconciliations` table
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (reconciled_by)

[*] Changed the `campuses` table
  [+] Added unique index on columns (reg_id)
  [+] Added foreign key on columns (school_id)

[*] Changed the `classes` table
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (class_teacher_id)

[*] Changed the `consent_logs` table
  [+] Added index on columns (school_id, campus_id, user_id)

[*] Changed the `exams` table
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (class_id)
  [+] Added foreign key on columns (subject_id)
  [+] Added foreign key on columns (locked_by)

[*] Changed the `fee_structures` table
  [+] Added index on columns (campus_id, class_id)
  [+] Added unique index on columns (class_id, active_from)
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (class_id)
  [+] Added foreign key on columns (created_by)
  [+] Added foreign key on columns (updated_by)

[*] Changed the `grade_weight_configs` table
  [+] Added unique index on columns (class_id, academic_year)
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (class_id)

[*] Changed the `intervention_plans` table
  [+] Added index on columns (school_id, campus_id, status)
  [+] Added index on columns (student_id)

[*] Changed the `invoices` table
  [+] Added unique index on columns (invoice_number)
  [+] Added index on columns (student_id, due_date)
  [+] Added index on columns (status)
  [+] Added index on columns (campus_id)
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (student_id)

[*] Changed the `login_sessions` table
  [+] Added index on columns (user_id)
  [+] Added index on columns (token_hash)
  [+] Added foreign key on columns (user_id)

[*] Changed the `marks` table
  [+] Added unique index on columns (exam_id, student_id, subject_id)
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (exam_id)
  [+] Added foreign key on columns (student_id)
  [+] Added foreign key on columns (subject_id)
  [+] Added foreign key on columns (entered_by)

[*] Changed the `notification_templates` table
  [+] Added index on columns (school_id, campus_id, key, channel)
  [+] Added foreign key on columns (school_id)
  [+] Added foreign key on columns (campus_id)

[*] Changed the `parent_communications` table
  [+] Added unique index on columns (idempotency_key)
  [+] Added index on columns (school_id, campus_id, created_at)
  [+] Added index on columns (student_id)
  [+] Added index on columns (parent_user_id)
  [+] Added index on columns (status)
  [+] Added index on columns (related_type, related_id)
  [+] Added foreign key on columns (school_id)
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (student_id)
  [+] Added foreign key on columns (parent_user_id)
  [+] Added foreign key on columns (created_by_id)

[*] Changed the `parent_conversations` table
  [+] Added index on columns (school_id, campus_id, user_id)

[*] Changed the `password_history` table
  [+] Added index on columns (user_id)
  [+] Added foreign key on columns (user_id)

[*] Changed the `password_resets` table
  [+] Added unique index on columns (token)

[*] Changed the `payment_plans` table
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (student_id)

[*] Changed the `payments` table
  [+] Added index on columns (invoice_id)
  [+] Added index on columns (student_id)
  [+] Added unique index on columns (campus_id, payment_date, reference_number)
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (invoice_id)
  [+] Added foreign key on columns (student_id)
  [+] Added foreign key on columns (recorded_by)

[*] Changed the `pending_registrations` table
  [+] Added unique index on columns (email)

[*] Changed the `platform_config` table
  [+] Added unique index on columns (key)

[*] Changed the `prompt_templates` table
  [+] Added index on columns (school_id, campus_id, role, feature)

[*] Changed the `report_cards` table
  [+] Added unique index on columns (student_id, exam_id)
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (student_id)
  [+] Added foreign key on columns (exam_id)

[*] Changed the `schools` table
  [+] Added unique index on columns (slug)
  [+] Added unique index on columns (stripe_customer_id)
  [+] Added unique index on columns (stripe_subscription_id)
  [+] Added unique index on columns (reg_id)
  [+] Added unique index on columns (contact_email)

[*] Changed the `staff_invitations` table
  [+] Added unique index on columns (token)
  [+] Added foreign key on columns (campus_id)

[*] Changed the `student_class_history` table
  [+] Added index on columns (campus_id, academic_year)
  [+] Added unique index on columns (student_id, class_id, academic_year)
  [+] Added foreign key on columns (student_id)
  [+] Added foreign key on columns (class_id)
  [+] Added foreign key on columns (campus_id)

[*] Changed the `students` table
  [+] Added unique index on columns (student_user_id)
  [+] Added unique index on columns (admission_no)
  [+] Added unique index on columns (campus_id, roll_no)
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (class_id)
  [+] Added foreign key on columns (student_user_id)
  [+] Added foreign key on columns (parent_user_id)

[*] Changed the `subjects` table
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (class_id)
  [+] Added foreign key on columns (teacher_id)

[*] Changed the `super_admin_audit_logs` table
  [+] Added index on columns (user_id)
  [+] Added index on columns (action)
  [+] Added index on columns (created_at)
  [+] Added foreign key on columns (user_id)

[*] Changed the `teacher_attendance` table
  [+] Added index on columns (campus_id, date)
  [+] Added unique index on columns (user_id, date)
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (user_id)

[*] Changed the `timetable_slots` table
  [+] Added index on columns (teacher_id, day_of_week, period_number)
  [+] Added unique index on columns (timetable_id, day_of_week, period_number)
  [+] Added foreign key on columns (timetable_id)
  [+] Added foreign key on columns (subject_id)
  [+] Added foreign key on columns (teacher_id)

[*] Changed the `timetables` table
  [+] Added index on columns (campus_id)
  [+] Added unique index on columns (class_id, academic_year, term)
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (class_id)

[*] Changed the `users` table
  [+] Added unique index on columns (email)
  [+] Added unique index on columns (username)
  [+] Added foreign key on columns (campus_id)
  [+] Added foreign key on columns (school_id)

