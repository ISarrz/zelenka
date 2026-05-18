-- Soil-moisture calibration per device: raw ADC reading in air ("dry") and
-- in water ("wet"). With both present, the read paths render
-- soilMoisturePct = clamp((dryRaw - raw) / (dryRaw - wetRaw), 0, 1) * 100.

ALTER TABLE "Device"
  ADD COLUMN "soilDryRaw" INTEGER,
  ADD COLUMN "soilWetRaw" INTEGER;
