-- Pending event and a partial workflow must survive restore, including their receipts.
INSERT INTO workflow_events (id,school_id,kind,reference_id,actor_id,identity)
VALUES ('recovery-event','rehearsal-school','REPORT_PUBLISHED','rehearsal-exam','role-PRINCIPAL','recovery-pending');
INSERT INTO workflow_jobs (id,school_id,state,checkpoint)
VALUES ('recovery-event','rehearsal-school','retrying',1);
INSERT INTO workflow_effects (id,school_id,job_id,identity,state,completed_at)
VALUES ('recovery-effect','rehearsal-school','recovery-event','confirmed-before-crash','committed',now());
