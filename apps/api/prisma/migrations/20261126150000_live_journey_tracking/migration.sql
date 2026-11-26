-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JourneyEventType" ADD VALUE 'DEVIATED';
ALTER TYPE "JourneyEventType" ADD VALUE 'STOPPED';
ALTER TYPE "JourneyEventType" ADD VALUE 'LOST_SIGNAL';
ALTER TYPE "JourneyEventType" ADD VALUE 'SOS_TRIGGERED';

-- AlterTable
ALTER TABLE "journeys" ADD COLUMN     "last_lat" DECIMAL(9,6),
ADD COLUMN     "last_lng" DECIMAL(9,6),
ADD COLUMN     "last_location_at" TIMESTAMPTZ(6),
ADD COLUMN     "route_geometry" JSONB,
ADD COLUMN     "safety_state" VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "sos_triggered_at" TIMESTAMPTZ(6),
ADD COLUMN     "start_lat" DECIMAL(9,6),
ADD COLUMN     "start_lng" DECIMAL(9,6),
ADD COLUMN     "tracking_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "journey_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "journey_id" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracy_m" DOUBLE PRECISION,
    "speed_mps" DOUBLE PRECISION,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journey_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journey_locations_journey_id_recorded_at_idx" ON "journey_locations"("journey_id", "recorded_at" DESC);

-- AddForeignKey
ALTER TABLE "journey_locations" ADD CONSTRAINT "journey_locations_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

