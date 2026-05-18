-- Make Device.userId nullable to support orphan devices that have been
-- manufactured (token baked into firmware + printed on QR) but not yet
-- claimed by a user. The first POST /api/devices/claim binds them.

ALTER TABLE "Device"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "claimedAt" TIMESTAMP(3);

-- Existing devices were created via "Add device" (always owned), so their
-- claimedAt is just their createdAt.
UPDATE "Device" SET "claimedAt" = "createdAt" WHERE "userId" IS NOT NULL;
