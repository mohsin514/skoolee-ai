-- Synthetic records only; no production identities or delivery destinations.
INSERT INTO schools (id,name,slug,city,reg_id,contact_email) VALUES
 ('rehearsal-school','Recovery fixture','rehearsal','Test','rehearsal','operator@example.invalid');
INSERT INTO campuses (id,school_id,name,city,reg_id) VALUES ('rehearsal-campus','rehearsal-school','Fixture','Test','fixture-campus');
INSERT INTO users (id,school_id,campus_id,email,full_name,role)
 SELECT 'role-' || role::text,'rehearsal-school','rehearsal-campus',lower(role::text) || '@example.invalid','Synthetic ' || role::text,role
 FROM unnest(enum_range(NULL::"UserRole")) role;
INSERT INTO classes (id,school_id,campus_id,name,academic_year) VALUES ('rehearsal-class','rehearsal-school','rehearsal-campus','Fixture',2026);
INSERT INTO students (id,school_id,campus_id,class_id,full_name,roll_no,gender) VALUES ('rehearsal-student','rehearsal-school','rehearsal-campus','rehearsal-class','Synthetic pupil','R1','MALE');
INSERT INTO subjects (id,school_id,campus_id,class_id,name) VALUES ('rehearsal-subject','rehearsal-school','rehearsal-campus','rehearsal-class','Math');
INSERT INTO exams (id,school_id,campus_id,class_id,title,term,academic_year) VALUES ('rehearsal-exam','rehearsal-school','rehearsal-campus','rehearsal-class','Fixture','Term 1',2026);
INSERT INTO marks (id,school_id,campus_id,exam_id,student_id,subject_id,marks_obtained) VALUES ('rehearsal-mark','rehearsal-school','rehearsal-campus','rehearsal-exam','rehearsal-student','rehearsal-subject',83);
INSERT INTO invoices (id,school_id,campus_id,student_id,invoice_date,due_date,monthly_fee,subtotal,total_amount,total_amount_paid,balance_due) VALUES ('rehearsal-invoice','rehearsal-school','rehearsal-campus','rehearsal-student','2026-10-01','2026-10-15',10000,10000,10000,2500,7500);
INSERT INTO student_documents (id,school_id,student_id,kind,file_key,file_name) VALUES ('rehearsal-document','rehearsal-school','rehearsal-student','OTHER','synthetic/attachment.txt','attachment.txt');
