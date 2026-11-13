-- SKAI-1811 (DB-01 Phase 5a): a row-level security policy on every tenant table.
--
-- Every table with a school_id column gets ENABLE + FORCE ROW LEVEL SECURITY and a tenant_isolation policy:
-- a session sees and writes only rows of the school in app.current_school_id (set per transaction by
-- src/lib/db/prisma.ts when TENANT_RLS is on). With the setting unset, current_school_id() is NULL and every
-- tenant table is empty: the policy fails closed. The 14 tables that already carry curated policies from their
-- own migrations are left as they are.
--
-- This changes nothing for the running app yet. It connects as `postgres`, which has BYPASSRLS on Supabase, and
-- migrations, CI and local tests run as superusers. Enforcement starts in Phase 5b, when the app connects as a
-- dedicated role without BYPASSRLS (created by a person with a password they choose) and TENANT_RLS=on; that
-- step also needs a service role for the deliberately unscoped paths (login lookup, platform owner, crons).
--
-- Rollback: for each table, DROP POLICY tenant_isolation ON <t>; ALTER TABLE <t> NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE <t> DISABLE ROW LEVEL SECURITY.

-- Each ALTER below takes a brief exclusive lock. On a busy database, fail fast instead of queueing behind (or
-- deadlocking with) live traffic; every statement is idempotent, so a failed run is simply run again.
SET lock_timeout = '10s';

CREATE OR REPLACE FUNCTION current_school_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.current_school_id', true), '') $$;

ALTER TABLE "academic_cycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_cycles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "academic_cycles";
CREATE POLICY tenant_isolation ON "academic_cycles" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "academic_model_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_model_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "academic_model_versions";
CREATE POLICY tenant_isolation ON "academic_model_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "accommodation_live_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accommodation_live_adjustments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "accommodation_live_adjustments";
CREATE POLICY tenant_isolation ON "accommodation_live_adjustments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "accommodation_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accommodation_plans" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "accommodation_plans";
CREATE POLICY tenant_isolation ON "accommodation_plans" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "accommodation_rehearsals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accommodation_rehearsals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "accommodation_rehearsals";
CREATE POLICY tenant_isolation ON "accommodation_rehearsals" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "accommodation_support_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accommodation_support_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "accommodation_support_records";
CREATE POLICY tenant_isolation ON "accommodation_support_records" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activities" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "activities";
CREATE POLICY tenant_isolation ON "activities" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "activity_attendances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_attendances" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "activity_attendances";
CREATE POLICY tenant_isolation ON "activity_attendances" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "activity_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "activity_items";
CREATE POLICY tenant_isolation ON "activity_items" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "activity_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "activity_jobs";
CREATE POLICY tenant_isolation ON "activity_jobs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "activity_places" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_places" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "activity_places";
CREATE POLICY tenant_isolation ON "activity_places" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "activity_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "activity_sessions";
CREATE POLICY tenant_isolation ON "activity_sessions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "admission_application_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_application_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_application_events";
CREATE POLICY tenant_isolation ON "admission_application_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "admission_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_applications" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_applications";
CREATE POLICY tenant_isolation ON "admission_applications" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "admission_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_assessments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_assessments";
CREATE POLICY tenant_isolation ON "admission_assessments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "admission_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_documents";
CREATE POLICY tenant_isolation ON "admission_documents" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "admission_form_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_form_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_form_versions";
CREATE POLICY tenant_isolation ON "admission_form_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "admission_forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_forms" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_forms";
CREATE POLICY tenant_isolation ON "admission_forms" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "admission_queries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_queries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_queries";
CREATE POLICY tenant_isolation ON "admission_queries" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "admission_query_follow_ups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_query_follow_ups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_query_follow_ups";
CREATE POLICY tenant_isolation ON "admission_query_follow_ups" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "admission_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_submissions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_submissions";
CREATE POLICY tenant_isolation ON "admission_submissions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_capability_gaps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_capability_gaps" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_capability_gaps";
CREATE POLICY tenant_isolation ON "ai_capability_gaps" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_insights" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_insights";
CREATE POLICY tenant_isolation ON "ai_insights" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_review_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_review_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_review_items";
CREATE POLICY tenant_isolation ON "ai_review_items" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_setup_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_setup_responses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_setup_responses";
CREATE POLICY tenant_isolation ON "ai_setup_responses" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_usage_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_usage_logs";
CREATE POLICY tenant_isolation ON "ai_usage_logs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_workflow_confirmations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_workflow_confirmations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_workflow_confirmations";
CREATE POLICY tenant_isolation ON "ai_workflow_confirmations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_workflow_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_workflow_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_workflow_events";
CREATE POLICY tenant_isolation ON "ai_workflow_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_workflow_handoffs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_workflow_handoffs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_workflow_handoffs";
CREATE POLICY tenant_isolation ON "ai_workflow_handoffs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_workflow_intents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_workflow_intents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_workflow_intents";
CREATE POLICY tenant_isolation ON "ai_workflow_intents" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_workflow_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_workflow_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_workflow_jobs";
CREATE POLICY tenant_isolation ON "ai_workflow_jobs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_workflow_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_workflow_questions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_workflow_questions";
CREATE POLICY tenant_isolation ON "ai_workflow_questions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_workflow_segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_workflow_segments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_workflow_segments";
CREATE POLICY tenant_isolation ON "ai_workflow_segments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_workflow_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_workflow_steps" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_workflow_steps";
CREATE POLICY tenant_isolation ON "ai_workflow_steps" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "alumni_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alumni_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "alumni_profiles";
CREATE POLICY tenant_isolation ON "alumni_profiles" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "asset_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_services" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "asset_services";
CREATE POLICY tenant_isolation ON "asset_services" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "assignment_extensions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignment_extensions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "assignment_extensions";
CREATE POLICY tenant_isolation ON "assignment_extensions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "assignment_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignment_feedback" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "assignment_feedback";
CREATE POLICY tenant_isolation ON "assignment_feedback" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "assignment_rubric_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignment_rubric_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "assignment_rubric_versions";
CREATE POLICY tenant_isolation ON "assignment_rubric_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "assignment_submission_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignment_submission_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "assignment_submission_versions";
CREATE POLICY tenant_isolation ON "assignment_submission_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "assignment_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignment_submissions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "assignment_submissions";
CREATE POLICY tenant_isolation ON "assignment_submissions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "assignment_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignment_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "assignment_versions";
CREATE POLICY tenant_isolation ON "assignment_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "assignments";
CREATE POLICY tenant_isolation ON "assignments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "attendance";
CREATE POLICY tenant_isolation ON "attendance" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "attendance_edit_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_edit_history" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "attendance_edit_history";
CREATE POLICY tenant_isolation ON "attendance_edit_history" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "attendance_explanations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_explanations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "attendance_explanations";
CREATE POLICY tenant_isolation ON "attendance_explanations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "attendance_registers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_registers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "attendance_registers";
CREATE POLICY tenant_isolation ON "attendance_registers" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "attendance_rule_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_rule_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "attendance_rule_versions";
CREATE POLICY tenant_isolation ON "attendance_rule_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "audit_logs";
CREATE POLICY tenant_isolation ON "audit_logs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_accounts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "bank_accounts";
CREATE POLICY tenant_isolation ON "bank_accounts" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "bank_reconciliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_reconciliations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "bank_reconciliations";
CREATE POLICY tenant_isolation ON "bank_reconciliations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "bank_transaction_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_transaction_keys" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "bank_transaction_keys";
CREATE POLICY tenant_isolation ON "bank_transaction_keys" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "boarding_leaves" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "boarding_leaves" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "boarding_leaves";
CREATE POLICY tenant_isolation ON "boarding_leaves" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "boarding_roll_calls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "boarding_roll_calls" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "boarding_roll_calls";
CREATE POLICY tenant_isolation ON "boarding_roll_calls" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "book_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "book_categories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "book_categories";
CREATE POLICY tenant_isolation ON "book_categories" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "book_copies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "book_copies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "book_copies";
CREATE POLICY tenant_isolation ON "book_copies" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "book_issues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "book_issues" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "book_issues";
CREATE POLICY tenant_isolation ON "book_issues" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "book_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "book_reservations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "book_reservations";
CREATE POLICY tenant_isolation ON "book_reservations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "books" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "books" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "books";
CREATE POLICY tenant_isolation ON "books" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "campus_packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campus_packages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "campus_packages";
CREATE POLICY tenant_isolation ON "campus_packages" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "campus_weekends" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campus_weekends" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "campus_weekends";
CREATE POLICY tenant_isolation ON "campus_weekends" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "campuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campuses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "campuses";
CREATE POLICY tenant_isolation ON "campuses" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "canteen_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "canteen_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "canteen_items";
CREATE POLICY tenant_isolation ON "canteen_items" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "canteen_ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "canteen_ledger_entries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "canteen_ledger_entries";
CREATE POLICY tenant_isolation ON "canteen_ledger_entries" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "canteen_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "canteen_orders" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "canteen_orders";
CREATE POLICY tenant_isolation ON "canteen_orders" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "canteen_spend_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "canteen_spend_limits" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "canteen_spend_limits";
CREATE POLICY tenant_isolation ON "canteen_spend_limits" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "care_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "care_plans" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "care_plans";
CREATE POLICY tenant_isolation ON "care_plans" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "certificate_issues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificate_issues" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "certificate_issues";
CREATE POLICY tenant_isolation ON "certificate_issues" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "certificate_template_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificate_template_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "certificate_template_versions";
CREATE POLICY tenant_isolation ON "certificate_template_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "certificate_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificate_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "certificate_templates";
CREATE POLICY tenant_isolation ON "certificate_templates" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "chart_of_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chart_of_accounts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "chart_of_accounts";
CREATE POLICY tenant_isolation ON "chart_of_accounts" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "chat_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_attachments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "chat_attachments";
CREATE POLICY tenant_isolation ON "chat_attachments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "chat_messages";
CREATE POLICY tenant_isolation ON "chat_messages" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "chat_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "chat_settings";
CREATE POLICY tenant_isolation ON "chat_settings" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "class_rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_rooms" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "class_rooms";
CREATE POLICY tenant_isolation ON "class_rooms" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "classes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "classes";
CREATE POLICY tenant_isolation ON "classes" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "clinic_visits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinic_visits" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "clinic_visits";
CREATE POLICY tenant_isolation ON "clinic_visits" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "complaint_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complaint_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "complaint_events";
CREATE POLICY tenant_isolation ON "complaint_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "complaints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complaints" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "complaints";
CREATE POLICY tenant_isolation ON "complaints" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "confidential_access_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "confidential_access_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "confidential_access_logs";
CREATE POLICY tenant_isolation ON "confidential_access_logs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "confidential_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "confidential_members" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "confidential_members";
CREATE POLICY tenant_isolation ON "confidential_members" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "confidential_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "confidential_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "confidential_settings";
CREATE POLICY tenant_isolation ON "confidential_settings" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "consent_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "consent_logs";
CREATE POLICY tenant_isolation ON "consent_logs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "conversation_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_members" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "conversation_members";
CREATE POLICY tenant_isolation ON "conversation_members" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "conversations";
CREATE POLICY tenant_isolation ON "conversations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "correction_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "correction_notes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "correction_notes";
CREATE POLICY tenant_isolation ON "correction_notes" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "corrections" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "corrections";
CREATE POLICY tenant_isolation ON "corrections" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "counselling_appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "counselling_appointments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "counselling_appointments";
CREATE POLICY tenant_isolation ON "counselling_appointments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "counselling_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "counselling_notes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "counselling_notes";
CREATE POLICY tenant_isolation ON "counselling_notes" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "cover_handovers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cover_handovers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cover_handovers";
CREATE POLICY tenant_isolation ON "cover_handovers" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "curriculum_objective_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "curriculum_objective_mappings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "curriculum_objective_mappings";
CREATE POLICY tenant_isolation ON "curriculum_objective_mappings" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "curriculum_pack_activation_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "curriculum_pack_activation_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "curriculum_pack_activation_events";
CREATE POLICY tenant_isolation ON "curriculum_pack_activation_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "curriculum_pack_activations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "curriculum_pack_activations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "curriculum_pack_activations";
CREATE POLICY tenant_isolation ON "curriculum_pack_activations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "data_legal_holds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_legal_holds" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "data_legal_holds";
CREATE POLICY tenant_isolation ON "data_legal_holds" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "data_lifecycle_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_lifecycle_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "data_lifecycle_requests";
CREATE POLICY tenant_isolation ON "data_lifecycle_requests" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "data_retention_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_retention_schedules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "data_retention_schedules";
CREATE POLICY tenant_isolation ON "data_retention_schedules" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "delivery_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_receipts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "delivery_receipts";
CREATE POLICY tenant_isolation ON "delivery_receipts" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "department_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "department_members" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "department_members";
CREATE POLICY tenant_isolation ON "department_members" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "departments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "departments";
CREATE POLICY tenant_isolation ON "departments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "dietary_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dietary_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "dietary_records";
CREATE POLICY tenant_isolation ON "dietary_records" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "dorm_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dorm_allocations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "dorm_allocations";
CREATE POLICY tenant_isolation ON "dorm_allocations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "dorm_room_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dorm_room_types" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "dorm_room_types";
CREATE POLICY tenant_isolation ON "dorm_room_types" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "dorm_rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dorm_rooms" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "dorm_rooms";
CREATE POLICY tenant_isolation ON "dorm_rooms" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "drop_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drop_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "drop_items";
CREATE POLICY tenant_isolation ON "drop_items" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "drop_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drop_sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "drop_sessions";
CREATE POLICY tenant_isolation ON "drop_sessions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "emergency_accesses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_accesses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "emergency_accesses";
CREATE POLICY tenant_isolation ON "emergency_accesses" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "enrollment_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enrollment_proposals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "enrollment_proposals";
CREATE POLICY tenant_isolation ON "enrollment_proposals" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "evidence_criteria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidence_criteria" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "evidence_criteria";
CREATE POLICY tenant_isolation ON "evidence_criteria" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "evidence_frameworks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidence_frameworks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "evidence_frameworks";
CREATE POLICY tenant_isolation ON "evidence_frameworks" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "evidence_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidence_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "evidence_items";
CREATE POLICY tenant_isolation ON "evidence_items" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "evidence_packs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidence_packs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "evidence_packs";
CREATE POLICY tenant_isolation ON "evidence_packs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "evidence_reviewer_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidence_reviewer_grants" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "evidence_reviewer_grants";
CREATE POLICY tenant_isolation ON "evidence_reviewer_grants" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_attendance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_attendance";
CREATE POLICY tenant_isolation ON "exam_attendance" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_brief_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_brief_receipts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_brief_receipts";
CREATE POLICY tenant_isolation ON "exam_brief_receipts" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_datesheet_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_datesheet_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_datesheet_versions";
CREATE POLICY tenant_isolation ON "exam_datesheet_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_exceptions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_exceptions";
CREATE POLICY tenant_isolation ON "exam_exceptions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_invigilations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_invigilations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_invigilations";
CREATE POLICY tenant_isolation ON "exam_invigilations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_paper_moderations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_paper_moderations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_paper_moderations";
CREATE POLICY tenant_isolation ON "exam_paper_moderations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_paper_scripts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_paper_scripts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_paper_scripts";
CREATE POLICY tenant_isolation ON "exam_paper_scripts" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_paper_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_paper_slots" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_paper_slots";
CREATE POLICY tenant_isolation ON "exam_paper_slots" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_print_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_print_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_print_runs";
CREATE POLICY tenant_isolation ON "exam_print_runs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_rooms" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_rooms";
CREATE POLICY tenant_isolation ON "exam_rooms" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_schedules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_schedules";
CREATE POLICY tenant_isolation ON "exam_schedules" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_seats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_seats" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_seats";
CREATE POLICY tenant_isolation ON "exam_seats" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_sessions";
CREATE POLICY tenant_isolation ON "exam_sessions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exams" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exams";
CREATE POLICY tenant_isolation ON "exams" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "family_digest_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_digest_deliveries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "family_digest_deliveries";
CREATE POLICY tenant_isolation ON "family_digest_deliveries" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "family_digest_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_digest_entries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "family_digest_entries";
CREATE POLICY tenant_isolation ON "family_digest_entries" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "family_digests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_digests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "family_digests";
CREATE POLICY tenant_isolation ON "family_digests" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "family_result_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_result_notes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "family_result_notes";
CREATE POLICY tenant_isolation ON "family_result_notes" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_carry_forwards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_carry_forwards" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_carry_forwards";
CREATE POLICY tenant_isolation ON "fee_carry_forwards" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_discount_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_discount_assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_discount_assignments";
CREATE POLICY tenant_isolation ON "fee_discount_assignments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_discounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_discounts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_discounts";
CREATE POLICY tenant_isolation ON "fee_discounts" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_fine_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_fine_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_fine_rules";
CREATE POLICY tenant_isolation ON "fee_fine_rules" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_group_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_group_assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_group_assignments";
CREATE POLICY tenant_isolation ON "fee_group_assignments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_groups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_groups";
CREATE POLICY tenant_isolation ON "fee_groups" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_structures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_structures" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_structures";
CREATE POLICY tenant_isolation ON "fee_structures" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_types" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_types";
CREATE POLICY tenant_isolation ON "fee_types" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fees_master_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fees_master_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fees_master_lines";
CREATE POLICY tenant_isolation ON "fees_master_lines" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "financial_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_adjustments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "financial_adjustments";
CREATE POLICY tenant_isolation ON "financial_adjustments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "goods_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goods_receipts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "goods_receipts";
CREATE POLICY tenant_isolation ON "goods_receipts" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "grade_weight_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade_weight_configs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "grade_weight_configs";
CREATE POLICY tenant_isolation ON "grade_weight_configs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "guardian_access_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_access_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "guardian_access_events";
CREATE POLICY tenant_isolation ON "guardian_access_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "guardian_access_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_access_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "guardian_access_versions";
CREATE POLICY tenant_isolation ON "guardian_access_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "guardian_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_consents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "guardian_consents";
CREATE POLICY tenant_isolation ON "guardian_consents" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "guardian_relationships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_relationships" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "guardian_relationships";
CREATE POLICY tenant_isolation ON "guardian_relationships" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "guardian_review_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_review_queue" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "guardian_review_queue";
CREATE POLICY tenant_isolation ON "guardian_review_queue" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "holidays" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "holidays";
CREATE POLICY tenant_isolation ON "holidays" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "identity_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_connections" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "identity_connections";
CREATE POLICY tenant_isolation ON "identity_connections" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "identity_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "identity_events";
CREATE POLICY tenant_isolation ON "identity_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "identity_link_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_link_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "identity_link_requests";
CREATE POLICY tenant_isolation ON "identity_link_requests" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "identity_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_links" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "identity_links";
CREATE POLICY tenant_isolation ON "identity_links" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_batches" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "import_batches";
CREATE POLICY tenant_isolation ON "import_batches" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "improvement_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "improvement_actions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "improvement_actions";
CREATE POLICY tenant_isolation ON "improvement_actions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "institution_setups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution_setups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "institution_setups";
CREATE POLICY tenant_isolation ON "institution_setups" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "integration_commands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_commands" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "integration_commands";
CREATE POLICY tenant_isolation ON "integration_commands" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "integration_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_connections" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "integration_connections";
CREATE POLICY tenant_isolation ON "integration_connections" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "integration_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_credentials" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "integration_credentials";
CREATE POLICY tenant_isolation ON "integration_credentials" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "integration_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_deliveries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "integration_deliveries";
CREATE POLICY tenant_isolation ON "integration_deliveries" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "integration_delivery_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_delivery_attempts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "integration_delivery_attempts";
CREATE POLICY tenant_isolation ON "integration_delivery_attempts" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "integration_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "integration_events";
CREATE POLICY tenant_isolation ON "integration_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "integration_external_refs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_external_refs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "integration_external_refs";
CREATE POLICY tenant_isolation ON "integration_external_refs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "integration_request_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_request_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "integration_request_logs";
CREATE POLICY tenant_isolation ON "integration_request_logs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "intervention_check_ins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "intervention_check_ins" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "intervention_check_ins";
CREATE POLICY tenant_isolation ON "intervention_check_ins" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "intervention_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "intervention_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "intervention_events";
CREATE POLICY tenant_isolation ON "intervention_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "intervention_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "intervention_plans" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "intervention_plans";
CREATE POLICY tenant_isolation ON "intervention_plans" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "invoices";
CREATE POLICY tenant_isolation ON "invoices" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "item_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_categories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "item_categories";
CREATE POLICY tenant_isolation ON "item_categories" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "item_evidence_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_evidence_decisions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "item_evidence_decisions";
CREATE POLICY tenant_isolation ON "item_evidence_decisions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "item_stock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_stock" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "item_stock";
CREATE POLICY tenant_isolation ON "item_stock" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "item_stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_stores" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "item_stores";
CREATE POLICY tenant_isolation ON "item_stores" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "item_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_transactions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "item_transactions";
CREATE POLICY tenant_isolation ON "item_transactions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "items";
CREATE POLICY tenant_isolation ON "items" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "learner_leave_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learner_leave_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "learner_leave_requests";
CREATE POLICY tenant_isolation ON "learner_leave_requests" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "learning_resource_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_resource_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "learning_resource_versions";
CREATE POLICY tenant_isolation ON "learning_resource_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "learning_resources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_resources" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "learning_resources";
CREATE POLICY tenant_isolation ON "learning_resources" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "learning_transfer_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_transfer_cases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "learning_transfer_cases";
CREATE POLICY tenant_isolation ON "learning_transfer_cases" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "learning_transfer_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_transfer_mappings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "learning_transfer_mappings";
CREATE POLICY tenant_isolation ON "learning_transfer_mappings" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "leave_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_allocations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "leave_allocations";
CREATE POLICY tenant_isolation ON "leave_allocations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "leave_requests";
CREATE POLICY tenant_isolation ON "leave_requests" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "leave_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_types" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "leave_types";
CREATE POLICY tenant_isolation ON "leave_types" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ledger_entries";
CREATE POLICY tenant_isolation ON "ledger_entries" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "lesson_plan_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_plan_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "lesson_plan_events";
CREATE POLICY tenant_isolation ON "lesson_plan_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "lesson_plan_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_plan_states" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "lesson_plan_states";
CREATE POLICY tenant_isolation ON "lesson_plan_states" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "lesson_recoveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_recoveries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "lesson_recoveries";
CREATE POLICY tenant_isolation ON "lesson_recoveries" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "library_charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_charges" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "library_charges";
CREATE POLICY tenant_isolation ON "library_charges" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "library_loan_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_loan_policies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "library_loan_policies";
CREATE POLICY tenant_isolation ON "library_loan_policies" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "library_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_members" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "library_members";
CREATE POLICY tenant_isolation ON "library_members" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "locale_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locale_policies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "locale_policies";
CREATE POLICY tenant_isolation ON "locale_policies" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "login_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "login_sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "login_sessions";
CREATE POLICY tenant_isolation ON "login_sessions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "mark_scan_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mark_scan_batches" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "mark_scan_batches";
CREATE POLICY tenant_isolation ON "mark_scan_batches" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "mark_scan_cells" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mark_scan_cells" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "mark_scan_cells";
CREATE POLICY tenant_isolation ON "mark_scan_cells" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "mark_scan_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mark_scan_pages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "mark_scan_pages";
CREATE POLICY tenant_isolation ON "mark_scan_pages" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "mark_sheet_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mark_sheet_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "mark_sheet_templates";
CREATE POLICY tenant_isolation ON "mark_sheet_templates" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "marks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "marks";
CREATE POLICY tenant_isolation ON "marks" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "medication_doses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medication_doses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "medication_doses";
CREATE POLICY tenant_isolation ON "medication_doses" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "medication_instructions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medication_instructions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "medication_instructions";
CREATE POLICY tenant_isolation ON "medication_instructions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "meeting_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_actions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "meeting_actions";
CREATE POLICY tenant_isolation ON "meeting_actions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "meeting_booking_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_booking_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "meeting_booking_events";
CREATE POLICY tenant_isolation ON "meeting_booking_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "meeting_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_bookings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "meeting_bookings";
CREATE POLICY tenant_isolation ON "meeting_bookings" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "meeting_follow_ups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_follow_ups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "meeting_follow_ups";
CREATE POLICY tenant_isolation ON "meeting_follow_ups" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "meeting_staff_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_staff_notes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "meeting_staff_notes";
CREATE POLICY tenant_isolation ON "meeting_staff_notes" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "meeting_windows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_windows" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "meeting_windows";
CREATE POLICY tenant_isolation ON "meeting_windows" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "mentoring_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mentoring_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "mentoring_requests";
CREATE POLICY tenant_isolation ON "mentoring_requests" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "notification_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "notification_templates";
CREATE POLICY tenant_isolation ON "notification_templates" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "notifications";
CREATE POLICY tenant_isolation ON "notifications" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "offline_operations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offline_operations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "offline_operations";
CREATE POLICY tenant_isolation ON "offline_operations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "onboarding_checkout_intents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_checkout_intents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "onboarding_checkout_intents";
CREATE POLICY tenant_isolation ON "onboarding_checkout_intents" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "online_payment_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "online_payment_orders" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "online_payment_orders";
CREATE POLICY tenant_isolation ON "online_payment_orders" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "parent_communications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_communications" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "parent_communications";
CREATE POLICY tenant_isolation ON "parent_communications" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "parent_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_conversations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "parent_conversations";
CREATE POLICY tenant_isolation ON "parent_conversations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "password_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_history" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "password_history";
CREATE POLICY tenant_isolation ON "password_history" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pathway_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pathway_actions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pathway_actions";
CREATE POLICY tenant_isolation ON "pathway_actions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pathway_counsellors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pathway_counsellors" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pathway_counsellors";
CREATE POLICY tenant_isolation ON "pathway_counsellors" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pathway_goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pathway_goals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pathway_goals";
CREATE POLICY tenant_isolation ON "pathway_goals" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pathway_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pathway_opportunities" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pathway_opportunities";
CREATE POLICY tenant_isolation ON "pathway_opportunities" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_allocations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payment_allocations";
CREATE POLICY tenant_isolation ON "payment_allocations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payment_method_refs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_method_refs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payment_method_refs";
CREATE POLICY tenant_isolation ON "payment_method_refs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payment_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_plans" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payment_plans";
CREATE POLICY tenant_isolation ON "payment_plans" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payment_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_receipts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payment_receipts";
CREATE POLICY tenant_isolation ON "payment_receipts" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payments";
CREATE POLICY tenant_isolation ON "payments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payroll_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_adjustments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payroll_adjustments";
CREATE POLICY tenant_isolation ON "payroll_adjustments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payroll_calculations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_calculations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payroll_calculations";
CREATE POLICY tenant_isolation ON "payroll_calculations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payroll_employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_employees" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payroll_employees";
CREATE POLICY tenant_isolation ON "payroll_employees" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payroll_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payroll_lines";
CREATE POLICY tenant_isolation ON "payroll_lines" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payroll_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_policies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payroll_policies";
CREATE POLICY tenant_isolation ON "payroll_policies" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payroll_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_providers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payroll_providers";
CREATE POLICY tenant_isolation ON "payroll_providers" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payroll_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payroll_runs";
CREATE POLICY tenant_isolation ON "payroll_runs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payroll_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_submissions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payroll_submissions";
CREATE POLICY tenant_isolation ON "payroll_submissions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "period_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "period_definitions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "period_definitions";
CREATE POLICY tenant_isolation ON "period_definitions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "phone_call_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "phone_call_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "phone_call_logs";
CREATE POLICY tenant_isolation ON "phone_call_logs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "phone_callback_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "phone_callback_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "phone_callback_events";
CREATE POLICY tenant_isolation ON "phone_callback_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "phone_callbacks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "phone_callbacks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "phone_callbacks";
CREATE POLICY tenant_isolation ON "phone_callbacks" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pickup_authorizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pickup_authorizations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pickup_authorizations";
CREATE POLICY tenant_isolation ON "pickup_authorizations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pickup_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pickup_checks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pickup_checks";
CREATE POLICY tenant_isolation ON "pickup_checks" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pickup_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pickup_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pickup_events";
CREATE POLICY tenant_isolation ON "pickup_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pickup_restrictions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pickup_restrictions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pickup_restrictions";
CREATE POLICY tenant_isolation ON "pickup_restrictions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pilot_commercial_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pilot_commercial_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pilot_commercial_events";
CREATE POLICY tenant_isolation ON "pilot_commercial_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pilot_ledger_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pilot_ledger_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pilot_ledger_settings";
CREATE POLICY tenant_isolation ON "pilot_ledger_settings" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pilot_ledger_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pilot_ledger_snapshots" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pilot_ledger_snapshots";
CREATE POLICY tenant_isolation ON "pilot_ledger_snapshots" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pilot_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pilot_proposals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pilot_proposals";
CREATE POLICY tenant_isolation ON "pilot_proposals" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "pilot_readiness_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pilot_readiness_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pilot_readiness_records";
CREATE POLICY tenant_isolation ON "pilot_readiness_records" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "planning_baselines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "planning_baselines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "planning_baselines";
CREATE POLICY tenant_isolation ON "planning_baselines" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "planning_handoffs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "planning_handoffs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "planning_handoffs";
CREATE POLICY tenant_isolation ON "planning_handoffs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "planning_scenarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "planning_scenarios" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "planning_scenarios";
CREATE POLICY tenant_isolation ON "planning_scenarios" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "policy_eval_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_eval_cases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "policy_eval_cases";
CREATE POLICY tenant_isolation ON "policy_eval_cases" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "policy_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "policy_events";
CREATE POLICY tenant_isolation ON "policy_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "policy_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_overrides" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "policy_overrides";
CREATE POLICY tenant_isolation ON "policy_overrides" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "policy_provenances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_provenances" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "policy_provenances";
CREATE POLICY tenant_isolation ON "policy_provenances" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "policy_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_questions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "policy_questions";
CREATE POLICY tenant_isolation ON "policy_questions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "policy_template_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_template_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "policy_template_versions";
CREATE POLICY tenant_isolation ON "policy_template_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "policy_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "policy_templates";
CREATE POLICY tenant_isolation ON "policy_templates" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "portfolio_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portfolio_entries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "portfolio_entries";
CREATE POLICY tenant_isolation ON "portfolio_entries" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "portfolio_shares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portfolio_shares" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "portfolio_shares";
CREATE POLICY tenant_isolation ON "portfolio_shares" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "postal_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "postal_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "postal_events";
CREATE POLICY tenant_isolation ON "postal_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "postal_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "postal_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "postal_records";
CREATE POLICY tenant_isolation ON "postal_records" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "practice_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "practice_responses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "practice_responses";
CREATE POLICY tenant_isolation ON "practice_responses" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "practice_revisits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "practice_revisits" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "practice_revisits";
CREATE POLICY tenant_isolation ON "practice_revisits" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "practice_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "practice_sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "practice_sessions";
CREATE POLICY tenant_isolation ON "practice_sessions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "prompt_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prompt_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "prompt_templates";
CREATE POLICY tenant_isolation ON "prompt_templates" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "purchase_budgets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_budgets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "purchase_budgets";
CREATE POLICY tenant_isolation ON "purchase_budgets" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "purchase_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "purchase_requests";
CREATE POLICY tenant_isolation ON "purchase_requests" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "queue_item_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "queue_item_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "queue_item_events";
CREATE POLICY tenant_isolation ON "queue_item_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "queue_item_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "queue_item_states" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "queue_item_states";
CREATE POLICY tenant_isolation ON "queue_item_states" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "readiness_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "readiness_tasks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "readiness_tasks";
CREATE POLICY tenant_isolation ON "readiness_tasks" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "receipt_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receipt_sequences" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "receipt_sequences";
CREATE POLICY tenant_isolation ON "receipt_sequences" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "report_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_cards" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "report_cards";
CREATE POLICY tenant_isolation ON "report_cards" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "report_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "report_versions";
CREATE POLICY tenant_isolation ON "report_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "role_permissions";
CREATE POLICY tenant_isolation ON "role_permissions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "rollover_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rollover_decisions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "rollover_decisions";
CREATE POLICY tenant_isolation ON "rollover_decisions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "rollover_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rollover_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "rollover_events";
CREATE POLICY tenant_isolation ON "rollover_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "rollover_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rollover_plans" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "rollover_plans";
CREATE POLICY tenant_isolation ON "rollover_plans" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "roster_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roster_batches" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "roster_batches";
CREATE POLICY tenant_isolation ON "roster_batches" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "roster_external_ids" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roster_external_ids" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "roster_external_ids";
CREATE POLICY tenant_isolation ON "roster_external_ids" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "route_vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "route_vehicles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "route_vehicles";
CREATE POLICY tenant_isolation ON "route_vehicles" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "safeguarding_concerns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safeguarding_concerns" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "safeguarding_concerns";
CREATE POLICY tenant_isolation ON "safeguarding_concerns" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "safeguarding_disclosures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safeguarding_disclosures" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "safeguarding_disclosures";
CREATE POLICY tenant_isolation ON "safeguarding_disclosures" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "safeguarding_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safeguarding_entries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "safeguarding_entries";
CREATE POLICY tenant_isolation ON "safeguarding_entries" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_assessment_repairs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_assessment_repairs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_assessment_repairs";
CREATE POLICY tenant_isolation ON "school_ai_assessment_repairs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_conversations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_conversations";
CREATE POLICY tenant_isolation ON "school_ai_conversations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_evidence_packs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_evidence_packs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_evidence_packs";
CREATE POLICY tenant_isolation ON "school_ai_evidence_packs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_exam_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_exam_assignments";
CREATE POLICY tenant_isolation ON "school_ai_exam_assignments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_exam_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_attempts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_exam_attempts";
CREATE POLICY tenant_isolation ON "school_ai_exam_attempts" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_exam_clarification_acks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_clarification_acks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_exam_clarification_acks";
CREATE POLICY tenant_isolation ON "school_ai_exam_clarification_acks" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_exam_clarifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_clarifications" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_exam_clarifications";
CREATE POLICY tenant_isolation ON "school_ai_exam_clarifications" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_exam_form_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_form_allocations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_exam_form_allocations";
CREATE POLICY tenant_isolation ON "school_ai_exam_form_allocations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_exam_pauses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_pauses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_exam_pauses";
CREATE POLICY tenant_isolation ON "school_ai_exam_pauses" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_exam_remedies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_remedies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_exam_remedies";
CREATE POLICY tenant_isolation ON "school_ai_exam_remedies" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_executions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_executions";
CREATE POLICY tenant_isolation ON "school_ai_executions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_language_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_language_proposals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_language_proposals";
CREATE POLICY tenant_isolation ON "school_ai_language_proposals" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_moderation_samples" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_moderation_samples" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_moderation_samples";
CREATE POLICY tenant_isolation ON "school_ai_moderation_samples" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_records";
CREATE POLICY tenant_isolation ON "school_ai_records" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_rehearsals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_rehearsals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_rehearsals";
CREATE POLICY tenant_isolation ON "school_ai_rehearsals" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_requests";
CREATE POLICY tenant_isolation ON "school_ai_requests" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_result_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_result_corrections" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_result_corrections";
CREATE POLICY tenant_isolation ON "school_ai_result_corrections" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_revisions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_revisions";
CREATE POLICY tenant_isolation ON "school_ai_revisions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_setup_task_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_setup_task_revisions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_setup_task_revisions";
CREATE POLICY tenant_isolation ON "school_ai_setup_task_revisions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_ai_setup_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_setup_tasks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_ai_setup_tasks";
CREATE POLICY tenant_isolation ON "school_ai_setup_tasks" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_assets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_assets";
CREATE POLICY tenant_isolation ON "school_assets" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_policies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_policies";
CREATE POLICY tenant_isolation ON "school_policies" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_readiness" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_readiness" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_readiness";
CREATE POLICY tenant_isolation ON "school_readiness" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "secure_browser_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "secure_browser_exceptions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "secure_browser_exceptions";
CREATE POLICY tenant_isolation ON "secure_browser_exceptions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "secure_browser_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "secure_browser_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "secure_browser_profiles";
CREATE POLICY tenant_isolation ON "secure_browser_profiles" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "service_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_categories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "service_categories";
CREATE POLICY tenant_isolation ON "service_categories" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "service_request_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_request_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "service_request_events";
CREATE POLICY tenant_isolation ON "service_request_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "service_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "service_requests";
CREATE POLICY tenant_isolation ON "service_requests" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "staff_appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_appointments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "staff_appointments";
CREATE POLICY tenant_isolation ON "staff_appointments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "staff_designations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_designations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "staff_designations";
CREATE POLICY tenant_isolation ON "staff_designations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "staff_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "staff_documents";
CREATE POLICY tenant_isolation ON "staff_documents" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "staff_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_invitations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "staff_invitations";
CREATE POLICY tenant_isolation ON "staff_invitations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "staff_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "staff_profiles";
CREATE POLICY tenant_isolation ON "staff_profiles" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "staff_reporting_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_reporting_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "staff_reporting_lines";
CREATE POLICY tenant_isolation ON "staff_reporting_lines" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "staff_timeline_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_timeline_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "staff_timeline_events";
CREATE POLICY tenant_isolation ON "staff_timeline_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "storage_cleanups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storage_cleanups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "storage_cleanups";
CREATE POLICY tenant_isolation ON "storage_cleanups" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "stripe_webhook_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stripe_webhook_receipts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "stripe_webhook_receipts";
CREATE POLICY tenant_isolation ON "stripe_webhook_receipts" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "student_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_categories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_categories";
CREATE POLICY tenant_isolation ON "student_categories" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "student_class_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_class_history" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_class_history";
CREATE POLICY tenant_isolation ON "student_class_history" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "student_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_documents";
CREATE POLICY tenant_isolation ON "student_documents" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "student_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_enrollments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_enrollments";
CREATE POLICY tenant_isolation ON "student_enrollments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "student_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_groups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_groups";
CREATE POLICY tenant_isolation ON "student_groups" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "student_timeline_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_timeline_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_timeline_events";
CREATE POLICY tenant_isolation ON "student_timeline_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "students";
CREATE POLICY tenant_isolation ON "students" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "study_passages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "study_passages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "study_passages";
CREATE POLICY tenant_isolation ON "study_passages" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "study_turns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "study_turns" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "study_turns";
CREATE POLICY tenant_isolation ON "study_turns" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subjects" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "subjects";
CREATE POLICY tenant_isolation ON "subjects" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "subscription_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "subscription_requests";
CREATE POLICY tenant_isolation ON "subscription_requests" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "supplier_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_invoices" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "supplier_invoices";
CREATE POLICY tenant_isolation ON "supplier_invoices" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "suppliers";
CREATE POLICY tenant_isolation ON "suppliers" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "support_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_actions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "support_actions";
CREATE POLICY tenant_isolation ON "support_actions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "support_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_grants" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "support_grants";
CREATE POLICY tenant_isolation ON "support_grants" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "support_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_incidents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "support_incidents";
CREATE POLICY tenant_isolation ON "support_incidents" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "syllabus_topics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "syllabus_topics" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "syllabus_topics";
CREATE POLICY tenant_isolation ON "syllabus_topics" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "tax_activations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_activations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tax_activations";
CREATE POLICY tenant_isolation ON "tax_activations" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "tax_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tax_documents";
CREATE POLICY tenant_isolation ON "tax_documents" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "tax_fixture_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_fixture_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tax_fixture_runs";
CREATE POLICY tenant_isolation ON "tax_fixture_runs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "tax_submission_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_submission_attempts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tax_submission_attempts";
CREATE POLICY tenant_isolation ON "tax_submission_attempts" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "teacher_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_attendance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "teacher_attendance";
CREATE POLICY tenant_isolation ON "teacher_attendance" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "teacher_support_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_support_notes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "teacher_support_notes";
CREATE POLICY tenant_isolation ON "teacher_support_notes" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "teaching_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teaching_assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "teaching_assignments";
CREATE POLICY tenant_isolation ON "teaching_assignments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "teaching_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teaching_progress" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "teaching_progress";
CREATE POLICY tenant_isolation ON "teaching_progress" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "timetable_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetable_slots" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "timetable_slots";
CREATE POLICY tenant_isolation ON "timetable_slots" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "timetable_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetable_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "timetable_versions";
CREATE POLICY tenant_isolation ON "timetable_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "timetables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetables" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "timetables";
CREATE POLICY tenant_isolation ON "timetables" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "transport_rider_stops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_rider_stops" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "transport_rider_stops";
CREATE POLICY tenant_isolation ON "transport_rider_stops" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "transport_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_routes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "transport_routes";
CREATE POLICY tenant_isolation ON "transport_routes" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "transport_stops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_stops" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "transport_stops";
CREATE POLICY tenant_isolation ON "transport_stops" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "transport_trips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_trips" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "transport_trips";
CREATE POLICY tenant_isolation ON "transport_trips" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "trip_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_consents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "trip_consents";
CREATE POLICY tenant_isolation ON "trip_consents" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "trip_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "trip_events";
CREATE POLICY tenant_isolation ON "trip_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "trip_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_exceptions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "trip_exceptions";
CREATE POLICY tenant_isolation ON "trip_exceptions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "trip_invitees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_invitees" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "trip_invitees";
CREATE POLICY tenant_isolation ON "trip_invitees" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "trip_passengers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_passengers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "trip_passengers";
CREATE POLICY tenant_isolation ON "trip_passengers" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "trip_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "trip_versions";
CREATE POLICY tenant_isolation ON "trip_versions" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "trips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trips" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "trips";
CREATE POLICY tenant_isolation ON "trips" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "users";
CREATE POLICY tenant_isolation ON "users" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "vehicles";
CREATE POLICY tenant_isolation ON "vehicles" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "visitor_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visitor_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "visitor_logs";
CREATE POLICY tenant_isolation ON "visitor_logs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "whatsapp_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_connections" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "whatsapp_connections";
CREATE POLICY tenant_isolation ON "whatsapp_connections" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "whatsapp_managed_sending" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_managed_sending" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "whatsapp_managed_sending";
CREATE POLICY tenant_isolation ON "whatsapp_managed_sending" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "whatsapp_usage_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_usage_entries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "whatsapp_usage_entries";
CREATE POLICY tenant_isolation ON "whatsapp_usage_entries" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "workflow_effects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_effects" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "workflow_effects";
CREATE POLICY tenant_isolation ON "workflow_effects" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "workflow_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "workflow_events";
CREATE POLICY tenant_isolation ON "workflow_events" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "workflow_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "workflow_jobs";
CREATE POLICY tenant_isolation ON "workflow_jobs" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());
