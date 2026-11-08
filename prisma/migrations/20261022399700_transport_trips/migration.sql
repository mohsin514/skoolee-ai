-- AlterTable
ALTER TABLE "transport_routes" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "transport_stops" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "route_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_rider_stops" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "student_id" TEXT NOT NULL,
    "stop_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_rider_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_trips" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "service_date" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "route_title" TEXT NOT NULL,
    "vehicle_number" TEXT NOT NULL,
    "vehicle_capacity" INTEGER NOT NULL,
    "driver_name" TEXT,
    "attendant_id" TEXT NOT NULL,
    "coordinator_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departed_at" TIMESTAMP(3),
    "vehicle_check_at" TIMESTAMP(3),
    "vehicle_check_by_id" TEXT,
    "vehicle_check_signature" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "emergency_reason" TEXT,

    CONSTRAINT "transport_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_passengers" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "trip_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "student_name" TEXT NOT NULL,
    "stop_name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANIFEST',
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',
    "boarded_at" TIMESTAMP(3),
    "boarded_by_id" TEXT,
    "handed_over_at" TIMESTAMP(3),
    "handed_over_by_id" TEXT,
    "receiver_type" TEXT,
    "receiver_name" TEXT,
    "receiver_user_id" TEXT,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "trip_id" TEXT NOT NULL,
    "student_id" TEXT,
    "kind" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT NOT NULL,
    "client_event_id" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "trip_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_exceptions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "trip_id" TEXT NOT NULL,
    "student_id" TEXT,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "trip_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transport_stops_school_id_idx" ON "transport_stops"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "transport_stops_route_id_name_key" ON "transport_stops"("route_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "transport_rider_stops_student_id_key" ON "transport_rider_stops"("student_id");

-- CreateIndex
CREATE INDEX "transport_rider_stops_school_id_idx" ON "transport_rider_stops"("school_id");

-- CreateIndex
CREATE INDEX "transport_trips_school_id_campus_id_service_date_idx" ON "transport_trips"("school_id", "campus_id", "service_date");

-- CreateIndex
CREATE INDEX "transport_trips_school_id_attendant_id_service_date_idx" ON "transport_trips"("school_id", "attendant_id", "service_date");

-- CreateIndex
CREATE UNIQUE INDEX "transport_trips_route_id_service_date_direction_key" ON "transport_trips"("route_id", "service_date", "direction");

-- CreateIndex
CREATE INDEX "trip_passengers_school_id_student_id_status_idx" ON "trip_passengers"("school_id", "student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "trip_passengers_trip_id_student_id_key" ON "trip_passengers"("trip_id", "student_id");

-- CreateIndex
CREATE INDEX "trip_events_school_id_trip_id_idx" ON "trip_events"("school_id", "trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_events_trip_id_client_event_id_key" ON "trip_events"("trip_id", "client_event_id");

-- CreateIndex
CREATE INDEX "trip_exceptions_school_id_trip_id_status_idx" ON "trip_exceptions"("school_id", "trip_id", "status");

-- AddForeignKey
ALTER TABLE "transport_stops" ADD CONSTRAINT "transport_stops_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_stops" ADD CONSTRAINT "transport_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_rider_stops" ADD CONSTRAINT "transport_rider_stops_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_rider_stops" ADD CONSTRAINT "transport_rider_stops_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "transport_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_passengers" ADD CONSTRAINT "trip_passengers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_passengers" ADD CONSTRAINT "trip_passengers_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "transport_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "transport_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_exceptions" ADD CONSTRAINT "trip_exceptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_exceptions" ADD CONSTRAINT "trip_exceptions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "transport_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-437: closed sets, sane capacity, a signed vehicle check before a normal close, an owner on every exception.
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_capacity_check" CHECK ("capacity" IS NULL OR ("capacity" BETWEEN 1 AND 200)) NOT VALID;
ALTER TABLE "transport_stops" ADD CONSTRAINT "transport_stops_check" CHECK ("sequence" >= 0 AND length(btrim("name")) > 0);
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_state_check" CHECK ("direction" IN ('AM','PM') AND "status" IN ('PUBLISHED','DEPARTED','CLOSED','CLOSED_EMERGENCY') AND "vehicle_capacity" BETWEEN 1 AND 200 AND "service_date" ~ '^\d{4}-\d{2}-\d{2}$' AND ("status" <> 'CLOSED' OR ("vehicle_check_at" IS NOT NULL AND "closed_at" IS NOT NULL)) AND ("status" <> 'CLOSED_EMERGENCY' OR length(btrim(coalesce("emergency_reason", ''))) > 0));
ALTER TABLE "trip_passengers" ADD CONSTRAINT "trip_passengers_state_check" CHECK ("source" IN ('MANIFEST','AMENDMENT') AND "status" IN ('EXPECTED','ABSENT','BOARDED','HANDED_OVER','REMOVED','TRANSFERRED') AND ("status" NOT IN ('BOARDED','HANDED_OVER') OR ("boarded_at" IS NOT NULL AND "boarded_by_id" IS NOT NULL)) AND ("status" <> 'HANDED_OVER' OR ("handed_over_at" IS NOT NULL AND "handed_over_by_id" IS NOT NULL AND "receiver_type" IN ('STAFF','GUARDIAN','AUTHORIZED_ADULT') AND length(btrim(coalesce("receiver_name", ''))) > 0)));
ALTER TABLE "trip_exceptions" ADD CONSTRAINT "trip_exceptions_check" CHECK ("kind" IN ('UNLISTED_PASSENGER','CAPACITY_OVERFLOW','MISSING_CHILD','MISSING_RECIPIENT','DOUBLE_BOARDING','LATE_CHANGE') AND "status" IN ('OPEN','RESOLVED') AND ("status" = 'OPEN' OR ("resolved_by_id" IS NOT NULL AND length(btrim(coalesce("resolution", ''))) > 0)));
-- One child is boarded on at most one trip at a time.
CREATE UNIQUE INDEX "trip_passengers_one_boarded_key" ON "trip_passengers" ("student_id") WHERE "status" = 'BOARDED';
