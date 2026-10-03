-- Story: set-availability — weekly availability windows and blocked slots.
CREATE TABLE "AvailabilityWindow" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AvailabilityWindow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AvailabilityWindow_dayOfWeek_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
    CONSTRAINT "AvailabilityWindow_range_check" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute")
);

CREATE INDEX "AvailabilityWindow_providerId_idx" ON "AvailabilityWindow"("providerId");

ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BlockedSlot" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlockedSlot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BlockedSlot_range_check" CHECK ("startsAt" < "endsAt")
);

CREATE INDEX "BlockedSlot_providerId_idx" ON "BlockedSlot"("providerId");

ALTER TABLE "BlockedSlot" ADD CONSTRAINT "BlockedSlot_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
