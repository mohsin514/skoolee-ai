CREATE TABLE activity_jobs (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 campus_id TEXT NOT NULL REFERENCES campuses(id), class_id TEXT,
 actor_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('REPORT_DELIVERY','PDF','IMPORT')),
 identity TEXT NOT NULL, source_id TEXT NOT NULL, source_label TEXT NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 cancel_requested_at TIMESTAMP(3), UNIQUE(school_id,identity), UNIQUE(id,school_id)
);
CREATE TABLE activity_items (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL, job_id TEXT NOT NULL,
 reference_id TEXT NOT NULL, label TEXT NOT NULL, version_id TEXT,
 workflow_id TEXT, communication_id TEXT, payload JSONB,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','completed','failed','cancelled')),
 reason TEXT, result JSONB, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(job_id,school_id) REFERENCES activity_jobs(id,school_id) ON DELETE CASCADE,
 FOREIGN KEY(workflow_id,school_id) REFERENCES workflow_jobs(id,school_id),
 UNIQUE(job_id,reference_id)
);
CREATE INDEX activity_jobs_scope ON activity_jobs(school_id,campus_id,created_at);
CREATE INDEX activity_items_job ON activity_items(job_id,school_id);
CREATE TABLE delivery_receipts (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE, communication_id TEXT NOT NULL REFERENCES parent_communications(id) ON DELETE CASCADE,
 provider_message_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('sent','delivered','read','failed')),
 occurred_at TIMESTAMP(3) NOT NULL, received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(communication_id,state,occurred_at)
);
