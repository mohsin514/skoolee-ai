-- Pending event and a partial workflow must survive restore, including their receipts.
INSERT INTO workflow_events (id,school_id,kind,reference_id,actor_id,identity)
VALUES ('recovery-event','rehearsal-school','REPORT_PUBLISHED','rehearsal-exam','role-PRINCIPAL','recovery-pending');
INSERT INTO workflow_jobs (id,school_id,state,checkpoint)
VALUES ('recovery-event','rehearsal-school','retrying',1);
INSERT INTO workflow_effects (id,school_id,job_id,identity,state,completed_at)
VALUES ('recovery-effect','rehearsal-school','recovery-event','confirmed-before-crash','committed',now());
-- Synthetic artifact bytes exercise durable published identity and byte recovery;
-- this fixture is not a rendering/typography test or a real pupil report.
INSERT INTO report_cards(id,school_id,campus_id,student_id,exam_id,current_version_id,published_version_id,status)
VALUES ('recovery-report','rehearsal-school','rehearsal-campus','rehearsal-student','rehearsal-exam','recovery-published-version','recovery-published-version','PUBLISHED');
INSERT INTO report_versions(id,school_id,report_card_id,number,content_hash,document_identity,document_bytes,snapshot,blockers,changed_sections,approved_by,approved_at,published_at)
VALUES ('recovery-published-version','rehearsal-school','recovery-report',1,'synthetic-content-hash','synthetic-document-identity',decode('255044462d312e340a2553796e746865746963207265636f766572792061727469666163740a2525454f460a','hex'),'{"synthetic":true}','[]','[]','role-PRINCIPAL',now(),now());
