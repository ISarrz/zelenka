-- Timestamp of the most recent wet-calibration step. Auto-care detection
-- pauses for a short window after this so that "probe in a cup of water"
-- during calibration doesn't get logged as a watering event.

ALTER TABLE "Device"
  ADD COLUMN "soilWetCalibratedAt" TIMESTAMP(3);
