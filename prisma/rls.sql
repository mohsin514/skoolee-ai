-- ===========================================================
-- OPTIONAL DATABASE-LAYER TENANT ISOLATION (Postgres RLS)
--
-- This is the second, independent layer of defence behind the
-- application guard in src/lib/db/prisma.ts. It is NOT applied by
-- `prisma migrate` (it lives outside prisma/migrations on purpose).
-- Apply it by hand once the prerequisites below are met.
--
-- STATUS: these policies are VERIFIED CORRECT but NOT ENABLED.
--
-- Tested 2026-08-14 against this database inside a rolled-back
-- transaction, using a non-BYPASSRLS probe role on the students table:
--     school A -> saw 16 of its 16 rows
--     school B -> saw  2 of its  2 rows
--     GUC unset -> saw 0 rows  (fail-closed)
-- The policy logic works. Two hard blockers remain before it can be
-- switched on, BOTH of which will take the app down if ignored.
--
-- BLOCKER 1 — the current role bypasses RLS entirely.
--   This app connects as `postgres`, which on Supabase has
--   rolbypassrls = true (confirmed). RLS is a complete no-op for it, even
--   with FORCE ROW LEVEL SECURITY. Applying this file today would change
--   nothing; applying it *after* switching roles changes everything.
--   You must create a dedicated login role and repoint DATABASE_URL.
--   Choose the password yourself — do not let it be generated into a file:
--       CREATE ROLE skoolee_app LOGIN PASSWORD '<your-password>';
--       GRANT USAGE ON SCHEMA public TO skoolee_app;
--       GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO skoolee_app;
--       ALTER DEFAULT PRIVILEGES IN SCHEMA public
--         GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO skoolee_app;
--   Verify with: SELECT rolbypassrls FROM pg_roles WHERE rolname='skoolee_app';
--   It MUST be false.
--
-- BLOCKER 2 — RESOLVED. The app now sets app.current_school_id.
--   Implemented in src/lib/db/prisma.ts behind the TENANT_RLS env flag
--   (off unless TENANT_RLS=on/1/true). When enabled, every query against a
--   tenant model runs as BEGIN; set_config('app.current_school_id', …, true);
--   query; COMMIT. The `true` makes it transaction-local, so it cannot leak
--   across a pooled connection — session-level SET was never an option, and
--   is the bug that got withTenant()/tenantExec() deleted from tenant.ts.
--
--   Verified 2026-08-14 with TENANT_RLS=on against this database:
--     GUC inside the transaction  -> the caller's school id
--     GUC on a separate query     -> '' (no leak between connections)
--     ordinary scoped queries     -> still work
--
--   COST: an extra round trip per standalone query. To amortise it, wrap
--   multi-query work in tenantTransaction() from src/lib/db/prisma.ts —
--   one BEGIN/set_config for the whole unit. With TENANT_RLS on, use
--   tenantTransaction() instead of prisma.$transaction(), or the guard will
--   try to open a nested transaction for each query inside the outer one.
--
-- TO TURN RLS ON, in this order:
--   1. Create the role in BLOCKER 1 and verify rolbypassrls = false.
--   2. Set TENANT_RLS=on, deploy, confirm the app behaves normally
--      (policies are not applied yet, so this only exercises the GUC path).
--   3. Repoint DATABASE_URL/DIRECT_URL at the new role.
--   4. Apply this file. Roll back with: ALTER TABLE … DISABLE ROW LEVEL SECURITY.
--
-- Until step 4, the enforced isolation layer is the application guard in
-- src/lib/db/prisma.ts, which is fail-closed and covers every model.
-- ===========================================================

-- Helper: the school currently in scope, or NULL when unset.
CREATE OR REPLACE FUNCTION current_school_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.current_school_id', true) $$;

ALTER TABLE "academic_cycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_cycles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "academic_cycles";
CREATE POLICY tenant_isolation ON "academic_cycles"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "admission_queries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_queries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_queries";
CREATE POLICY tenant_isolation ON "admission_queries"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "admission_query_follow_ups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_query_follow_ups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_query_follow_ups";
CREATE POLICY tenant_isolation ON "admission_query_follow_ups"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_insights" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_insights";
CREATE POLICY tenant_isolation ON "ai_insights"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_review_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_review_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_review_items";
CREATE POLICY tenant_isolation ON "ai_review_items"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ai_usage_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_usage_logs";
CREATE POLICY tenant_isolation ON "ai_usage_logs"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "attendance";
CREATE POLICY tenant_isolation ON "attendance"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "attendance_edit_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_edit_history" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "attendance_edit_history";
CREATE POLICY tenant_isolation ON "attendance_edit_history"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "audit_logs";
CREATE POLICY tenant_isolation ON "audit_logs"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_accounts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "bank_accounts";
CREATE POLICY tenant_isolation ON "bank_accounts"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "bank_reconciliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_reconciliations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "bank_reconciliations";
CREATE POLICY tenant_isolation ON "bank_reconciliations"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "book_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "book_categories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "book_categories";
CREATE POLICY tenant_isolation ON "book_categories"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "book_issues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "book_issues" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "book_issues";
CREATE POLICY tenant_isolation ON "book_issues"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "books" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "books" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "books";
CREATE POLICY tenant_isolation ON "books"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "campus_weekends" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campus_weekends" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "campus_weekends";
CREATE POLICY tenant_isolation ON "campus_weekends"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "campuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campuses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "campuses";
CREATE POLICY tenant_isolation ON "campuses"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "certificate_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificate_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "certificate_templates";
CREATE POLICY tenant_isolation ON "certificate_templates"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "chart_of_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chart_of_accounts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "chart_of_accounts";
CREATE POLICY tenant_isolation ON "chart_of_accounts"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "chat_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_attachments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "chat_attachments";
CREATE POLICY tenant_isolation ON "chat_attachments"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "chat_messages";
CREATE POLICY tenant_isolation ON "chat_messages"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "chat_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "chat_settings";
CREATE POLICY tenant_isolation ON "chat_settings"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "class_rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_rooms" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "class_rooms";
CREATE POLICY tenant_isolation ON "class_rooms"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "classes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "classes";
CREATE POLICY tenant_isolation ON "classes"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "complaints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complaints" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "complaints";
CREATE POLICY tenant_isolation ON "complaints"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "consent_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "consent_logs";
CREATE POLICY tenant_isolation ON "consent_logs"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "conversation_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_members" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "conversation_members";
CREATE POLICY tenant_isolation ON "conversation_members"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "conversations";
CREATE POLICY tenant_isolation ON "conversations"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "dorm_room_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dorm_room_types" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "dorm_room_types";
CREATE POLICY tenant_isolation ON "dorm_room_types"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "dorm_rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dorm_rooms" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "dorm_rooms";
CREATE POLICY tenant_isolation ON "dorm_rooms"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exam_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_schedules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exam_schedules";
CREATE POLICY tenant_isolation ON "exam_schedules"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "exams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exams" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exams";
CREATE POLICY tenant_isolation ON "exams"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_carry_forwards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_carry_forwards" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_carry_forwards";
CREATE POLICY tenant_isolation ON "fee_carry_forwards"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_discount_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_discount_assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_discount_assignments";
CREATE POLICY tenant_isolation ON "fee_discount_assignments"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_discounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_discounts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_discounts";
CREATE POLICY tenant_isolation ON "fee_discounts"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_fine_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_fine_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_fine_rules";
CREATE POLICY tenant_isolation ON "fee_fine_rules"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_group_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_group_assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_group_assignments";
CREATE POLICY tenant_isolation ON "fee_group_assignments"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_groups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_groups";
CREATE POLICY tenant_isolation ON "fee_groups"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_structures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_structures" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_structures";
CREATE POLICY tenant_isolation ON "fee_structures"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_types" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fee_types";
CREATE POLICY tenant_isolation ON "fee_types"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fees_master_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fees_master_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "fees_master_lines";
CREATE POLICY tenant_isolation ON "fees_master_lines"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "grade_weight_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade_weight_configs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "grade_weight_configs";
CREATE POLICY tenant_isolation ON "grade_weight_configs"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "holidays" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "holidays";
CREATE POLICY tenant_isolation ON "holidays"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "intervention_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "intervention_plans" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "intervention_plans";
CREATE POLICY tenant_isolation ON "intervention_plans"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "invoices";
CREATE POLICY tenant_isolation ON "invoices"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "item_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_categories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "item_categories";
CREATE POLICY tenant_isolation ON "item_categories"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "item_stock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_stock" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "item_stock";
CREATE POLICY tenant_isolation ON "item_stock"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "item_stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_stores" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "item_stores";
CREATE POLICY tenant_isolation ON "item_stores"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "item_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_transactions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "item_transactions";
CREATE POLICY tenant_isolation ON "item_transactions"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "items";
CREATE POLICY tenant_isolation ON "items"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "leave_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_allocations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "leave_allocations";
CREATE POLICY tenant_isolation ON "leave_allocations"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "leave_requests";
CREATE POLICY tenant_isolation ON "leave_requests"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "leave_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_types" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "leave_types";
CREATE POLICY tenant_isolation ON "leave_types"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ledger_entries";
CREATE POLICY tenant_isolation ON "ledger_entries"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "library_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_members" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "library_members";
CREATE POLICY tenant_isolation ON "library_members"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "login_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "login_sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "login_sessions";
CREATE POLICY tenant_isolation ON "login_sessions"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "marks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "marks";
CREATE POLICY tenant_isolation ON "marks"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "notification_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "notification_templates";
CREATE POLICY tenant_isolation ON "notification_templates"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "notifications";
CREATE POLICY tenant_isolation ON "notifications"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "online_payment_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "online_payment_orders" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "online_payment_orders";
CREATE POLICY tenant_isolation ON "online_payment_orders"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "parent_communications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_communications" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "parent_communications";
CREATE POLICY tenant_isolation ON "parent_communications"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "parent_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_conversations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "parent_conversations";
CREATE POLICY tenant_isolation ON "parent_conversations"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "password_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_history" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "password_history";
CREATE POLICY tenant_isolation ON "password_history"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payment_method_refs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_method_refs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payment_method_refs";
CREATE POLICY tenant_isolation ON "payment_method_refs"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payment_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_plans" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payment_plans";
CREATE POLICY tenant_isolation ON "payment_plans"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payments";
CREATE POLICY tenant_isolation ON "payments"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payroll_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payroll_lines";
CREATE POLICY tenant_isolation ON "payroll_lines"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "payroll_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payroll_runs";
CREATE POLICY tenant_isolation ON "payroll_runs"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "period_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "period_definitions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "period_definitions";
CREATE POLICY tenant_isolation ON "period_definitions"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "phone_call_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "phone_call_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "phone_call_logs";
CREATE POLICY tenant_isolation ON "phone_call_logs"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "postal_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "postal_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "postal_records";
CREATE POLICY tenant_isolation ON "postal_records"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "prompt_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prompt_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "prompt_templates";
CREATE POLICY tenant_isolation ON "prompt_templates"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "report_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_cards" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "report_cards";
CREATE POLICY tenant_isolation ON "report_cards"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "role_permissions";
CREATE POLICY tenant_isolation ON "role_permissions"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "route_vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "route_vehicles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "route_vehicles";
CREATE POLICY tenant_isolation ON "route_vehicles"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "staff_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "staff_documents";
CREATE POLICY tenant_isolation ON "staff_documents"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "staff_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_invitations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "staff_invitations";
CREATE POLICY tenant_isolation ON "staff_invitations"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "staff_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "staff_profiles";
CREATE POLICY tenant_isolation ON "staff_profiles"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "staff_timeline_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_timeline_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "staff_timeline_events";
CREATE POLICY tenant_isolation ON "staff_timeline_events"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "student_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_categories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_categories";
CREATE POLICY tenant_isolation ON "student_categories"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "student_class_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_class_history" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_class_history";
CREATE POLICY tenant_isolation ON "student_class_history"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "student_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_documents";
CREATE POLICY tenant_isolation ON "student_documents"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "student_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_groups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_groups";
CREATE POLICY tenant_isolation ON "student_groups"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "student_timeline_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_timeline_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_timeline_events";
CREATE POLICY tenant_isolation ON "student_timeline_events"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "students";
CREATE POLICY tenant_isolation ON "students"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subjects" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "subjects";
CREATE POLICY tenant_isolation ON "subjects"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "suppliers";
CREATE POLICY tenant_isolation ON "suppliers"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "syllabus_topics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "syllabus_topics" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "syllabus_topics";
CREATE POLICY tenant_isolation ON "syllabus_topics"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "teacher_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_attendance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "teacher_attendance";
CREATE POLICY tenant_isolation ON "teacher_attendance"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "timetable_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetable_slots" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "timetable_slots";
CREATE POLICY tenant_isolation ON "timetable_slots"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "timetables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetables" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "timetables";
CREATE POLICY tenant_isolation ON "timetables"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "transport_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_routes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "transport_routes";
CREATE POLICY tenant_isolation ON "transport_routes"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "users";
CREATE POLICY tenant_isolation ON "users"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "vehicles";
CREATE POLICY tenant_isolation ON "vehicles"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "visitor_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visitor_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "visitor_logs";
CREATE POLICY tenant_isolation ON "visitor_logs"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());
