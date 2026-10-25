CREATE TABLE rag_documents (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 campus_id TEXT, title TEXT NOT NULL, content TEXT NOT NULL, roles TEXT[] NOT NULL,
 status TEXT NOT NULL DEFAULT 'DRAFT', version INTEGER NOT NULL DEFAULT 1,
 checksum TEXT NOT NULL, index_mode TEXT, created_by_id TEXT NOT NULL,
 published_by_id TEXT, published_at TIMESTAMP(3), expires_at TIMESTAMP(3),
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL,
 CONSTRAINT rag_document_state CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED','DELETED') AND version > 0),
 CONSTRAINT rag_document_limits CHECK (char_length(content) <= 80000 AND cardinality(roles) BETWEEN 1 AND 11)
);
CREATE UNIQUE INDEX rag_documents_id_school_id_key ON rag_documents(id, school_id);
CREATE INDEX rag_documents_school_id_status_campus_id_idx ON rag_documents(school_id,status,campus_id);
CREATE TABLE rag_chunks (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL, document_id TEXT NOT NULL,
 version INTEGER NOT NULL, ordinal INTEGER NOT NULL, text TEXT NOT NULL,
 start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL, embedding DOUBLE PRECISION[] NOT NULL,
 model TEXT,
 CONSTRAINT rag_chunks_document_id_school_id_fkey FOREIGN KEY(document_id,school_id) REFERENCES rag_documents(id,school_id) ON DELETE CASCADE,
 CONSTRAINT rag_chunk_bounds CHECK (start_offset >= 0 AND end_offset > start_offset AND version > 0 AND ordinal >= 0),
 CONSTRAINT rag_embedding_dimension CHECK (cardinality(embedding) IN (0,512))
);
CREATE UNIQUE INDEX rag_chunks_document_id_version_ordinal_key ON rag_chunks(document_id,version,ordinal);
CREATE INDEX rag_chunks_school_id_document_id_idx ON rag_chunks(school_id,document_id);
ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rag_documents USING(school_id = NULLIF(current_setting('app.current_school_id',true),'')) WITH CHECK(school_id = NULLIF(current_setting('app.current_school_id',true),''));
ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rag_chunks USING(school_id = NULLIF(current_setting('app.current_school_id',true),'')) WITH CHECK(school_id = NULLIF(current_setting('app.current_school_id',true),''));
