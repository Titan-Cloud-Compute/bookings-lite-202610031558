-- Story: create-service — providers offer bookable services.
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Service_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Service_durationMinutes_check" CHECK ("durationMinutes" > 0),
    CONSTRAINT "Service_priceCents_check" CHECK ("priceCents" >= 0)
);

CREATE INDEX "Service_providerId_idx" ON "Service"("providerId");
CREATE INDEX "Service_active_idx" ON "Service"("active");

ALTER TABLE "Service" ADD CONSTRAINT "Service_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
