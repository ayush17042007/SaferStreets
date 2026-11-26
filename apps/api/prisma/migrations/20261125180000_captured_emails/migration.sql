-- Migration 2: captured_emails for the capture mail transport (dev and tests only).


-- CreateTable
CREATE TABLE "captured_emails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "to_email" CITEXT NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "text_body" TEXT NOT NULL,
    "html_body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "captured_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "captured_emails_to_email_created_at_idx" ON "captured_emails"("to_email", "created_at" DESC);

