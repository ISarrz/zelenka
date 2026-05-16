// Per-parameter "what's OK" ranges. All numeric fields nullable — a sensor or
// a plant species may not constrain everything.
//
// Soil moisture is stored as a *raw ADC value* in Sprint 1 (calibration in
// Sprint 2). On the V1.2 capacitive sensor, higher value = drier; we therefore
// treat `dry` > `wet` (note the inversion vs other params).
export interface CareThresholds {
  temperatureC?: { okMin: number; okMax: number; warnMin: number; warnMax: number };
  humidityPct?:  { okMin: number; okMax: number; warnMin: number; warnMax: number };
  lux?:          { okMin: number; okMax: number; warnMin: number; warnMax: number };
  soilMoistureRaw?: { wet: number; dry: number; criticallyDry: number };
}

// Sensible defaults applied when no per-species data is available. Tuned for
// typical indoor plants; species-specific data overrides slot-by-slot.
export const GENERIC_THRESHOLDS: CareThresholds = {
  temperatureC: { warnMin: 12, okMin: 16, okMax: 28, warnMax: 32 },
  humidityPct:  { warnMin: 25, okMin: 35, okMax: 70, warnMax: 80 },
  lux:          { warnMin: 150, okMin: 400, okMax: 30000, warnMax: 60000 },
  soilMoistureRaw: { wet: 1300, dry: 2800, criticallyDry: 3300 },
};

// Build thresholds from a Perenual species row. Most fields are categorical
// (watering: "Minimum"/"Average"/"Frequent"; sunlight: array of buckets),
// so this is mapping work, not measurement.
export function thresholdsFromPerenual(row: {
  watering?: string | null;
  sunlight?: string[] | null;
  details?: Record<string, unknown> | null;
}): CareThresholds {
  const t: CareThresholds = JSON.parse(JSON.stringify(GENERIC_THRESHOLDS));

  // Watering → soil moisture comfort band.
  // "Frequent" plants want it wetter; "Minimum" plants tolerate dryness.
  switch (row.watering?.toLowerCase()) {
    case 'frequent':
      t.soilMoistureRaw = { wet: 1100, dry: 2300, criticallyDry: 2900 };
      break;
    case 'minimum':
      t.soilMoistureRaw = { wet: 1700, dry: 3300, criticallyDry: 3800 };
      break;
    case 'none':
      t.soilMoistureRaw = { wet: 1900, dry: 3500, criticallyDry: 4000 };
      break;
    // "Average" = generic default
  }

  // Sunlight → lux range. The Perenual sunlight field is a JSON array; the
  // *brightest* tolerance is what matters for ok-max, the *darkest* for ok-min.
  if (Array.isArray(row.sunlight) && row.sunlight.length > 0) {
    const buckets = row.sunlight.map((s) => s.toLowerCase());
    const tolerates = (bucket: string) => buckets.some((b) => b.includes(bucket));

    if (tolerates('full sun')) {
      t.lux = { warnMin: 300, okMin: 1000, okMax: 80000, warnMax: 120000 };
    } else if (tolerates('part') || tolerates('filtered')) {
      t.lux = { warnMin: 200, okMin: 600, okMax: 20000, warnMax: 40000 };
    } else if (tolerates('shade')) {
      t.lux = { warnMin: 100, okMin: 300, okMax: 8000, warnMax: 20000 };
    }
  }

  // Hardiness (cold-tolerance zone) — if available, lift the temp-min warning.
  // Perenual `hardiness` is `{min, max}` with USDA zone numbers; we don't trust
  // it for warm-side limits but we can use it for cold limits. Defer until we
  // have a non-null sample.

  return t;
}
