-- The battery "days remaining" forecast and the per-cycle self-learning that
-- backed it were removed. Battery is now reported purely as a voltage-derived
-- qualitative estimate (full/mid/low/critical). Drop the cycle-tracking columns.

ALTER TABLE "Device" DROP COLUMN "cyclesSinceLastCharge";
ALTER TABLE "Device" DROP COLUMN "cyclesPerFullBattery";
ALTER TABLE "Device" DROP COLUMN "lastChargeAt";
