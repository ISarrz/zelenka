// Soil-moisture calibration: linear mapping between two per-device anchors
// captured at the end of setup — "dry" (sensor in air) and "wet" (sensor in
// a glass of water). The raw ADC reading is inverted relative to wetness:
// drier soil → higher raw, wetter → lower raw. So pct grows as raw shrinks
// below `dryRaw`, capped at the `wetRaw` point.
//
// Even before the user calibrates we render an approximate pct using the
// generic band (wet=1300, dry=2800 in GENERIC_THRESHOLDS) — so the home
// screen always shows a percentage instead of a raw ADC number. Once
// calibration is set, the per-device anchors take over.

interface Calibration {
  soilDryRaw: number | null;
  soilWetRaw: number | null;
}

// Generic-band defaults (mirrored from GENERIC_THRESHOLDS.soilMoistureRaw),
// inlined here to avoid pulling thresholds.ts into hot read paths.
const GENERIC_DRY = 2800;
const GENERIC_WET = 1300;

export function soilPctFromRaw(raw: number | null | undefined, cal: Calibration): number | null {
  if (raw == null) return null;
  const dry = cal.soilDryRaw ?? GENERIC_DRY;
  const wet = cal.soilWetRaw ?? GENERIC_WET;
  // Guard against operator mistakes (anchors backwards or equal).
  if (dry <= wet) return null;
  const pct = ((dry - raw) / (dry - wet)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}
