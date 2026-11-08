ALTER TABLE "schools" ADD COLUMN "commercial_contract" JSONB;

-- Preserve the terms and effective limit known for each existing account at
-- migration time. Later catalogue edits apply only to new contracts.
UPDATE "schools" AS school
SET "commercial_contract" = jsonb_build_object(
  'catalogVersion', '2026-10-08.1',
  'effectiveAt', COALESCE(school."plan_started_at", school."created_at", NOW()),
  'plan', CASE WHEN school."plan" IN ('FREE','BASIC','PRO','ENTERPRISE') THEN school."plan" ELSE 'FREE' END,
  'name', plan.name,
  'price', COALESCE(
    CASE
      WHEN school."plan_pricing" -> school."plan" ->> 'price' ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (school."plan_pricing" -> school."plan" ->> 'price')::numeric
      ELSE NULL
    END,
    plan.price
  ),
  'priceCurrency', 'PKR',
  'priceLabel', COALESCE(school."plan_pricing" -> school."plan" ->> 'priceLabel', plan.price_label),
  'features', plan.features,
  'aiCredits', COALESCE(school."ai_credits_limit", plan.ai_credits),
  'maxStudents', plan.max_students,
  'maxTeachers', plan.max_teachers,
  'maxCampuses', plan.max_campuses,
  'whatsappEnabled', plan.whatsapp_enabled,
  'pdfExportEnabled', plan.pdf_export_enabled,
  'pdfBulkExport', plan.pdf_bulk_export,
  'analyticsEnabled', plan.analytics_enabled,
  'aiCreditPolicy', jsonb_build_object('allowance', 'plan-monthly', 'unused', 'expire-at-calendar-month-reset', 'reset', 'zero-used-on-calendar-month-boundary')
)
FROM (
  VALUES
    ('FREE', 'Basic', 0, 'PKR 0/mo', '["Up to 50 students","2 teacher accounts","1 campus","100 AI credits/month","Standard report cards","Email support"]'::jsonb, 100, 50, 2, 1, false, false, false, false),
    ('BASIC', 'Pro', 4000, 'PKR 4,000/mo', '["Up to 500 students","10 teacher accounts","1 campus","1,000 AI credits/month","Branded report cards","WhatsApp notifications","Bulk PDF export","Priority support"]'::jsonb, 1000, 500, 10, 1, true, true, true, false),
    ('PRO', 'Enterprise', 7000, 'PKR 7,000/mo', '["Up to 2,500 students","50 teacher accounts","5 campuses","5,000 AI credits/month","Custom branded report cards","WhatsApp + Email notifications","Bulk PDF export","Analytics dashboard","API access","Dedicated support"]'::jsonb, 5000, 2500, 50, 5, true, true, true, true),
    ('ENTERPRISE', 'Custom', NULL, 'Custom', '["Unlimited students","Unlimited teacher accounts","Unlimited campuses","50,000 AI credits/month","Advanced WhatsApp workflows","Bulk PDF export","Network analytics","Custom security review","Dedicated onboarding"]'::jsonb, 50000, -1, -1, -1, true, true, true, true)
) AS plan(type, name, price, price_label, features, ai_credits, max_students, max_teachers, max_campuses, whatsapp_enabled, pdf_export_enabled, pdf_bulk_export, analytics_enabled)
WHERE school."commercial_contract" IS NULL
  AND (school."plan" = plan.type OR (school."plan" NOT IN ('FREE','BASIC','PRO','ENTERPRISE') AND plan.type = 'FREE'));
