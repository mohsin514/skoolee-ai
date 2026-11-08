-- Columns the admin UI already collected but had nowhere to store.
--
-- The transport form posted a `description`, and the hostel room-type form
-- posted `description` and `costPerTerm`. Neither model had those fields, so the
-- API dropped them on the way in and the tables rendered "—" forever. Adding the
-- columns rather than deleting the inputs: a route description and a per-term
-- hostel charge are both things a campus actually needs to record.
--
-- cost_per_term is paisa, matching invoices, fees and transport fares.

ALTER TABLE "transport_routes" ADD COLUMN IF NOT EXISTS "description" TEXT;

ALTER TABLE "dorm_room_types" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "dorm_room_types" ADD COLUMN IF NOT EXISTS "cost_per_term" INTEGER NOT NULL DEFAULT 0;
