-- CreateEnum
CREATE TYPE "SosEventStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "alert_subscriptions" ADD COLUMN     "sos_nearby_opt_in" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "sos_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "radius_km" SMALLINT NOT NULL DEFAULT 3,
    "status" "SosEventStatus" NOT NULL DEFAULT 'ACTIVE',
    "notified_count" INTEGER NOT NULL DEFAULT 0,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sos_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sos_events_user_id_status_idx" ON "sos_events"("user_id", "status");

-- CreateIndex
CREATE INDEX "sos_events_status_created_at_idx" ON "sos_events"("status", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
