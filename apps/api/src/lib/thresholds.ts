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
  // User-facing soil comfort band in pct (0..100). pct grows as the soil gets
  // wetter (inverse of raw ADC). Four boundaries cut the range into
  // alert(dry) < warn(dry) < ok < warn(wet) < alert(wet). **This is the band
  // the ring verdict actually grades against** — the raw band below is only a
  // fallback for samples we couldn't convert to pct (bad/absent calibration).
  soilMoisturePct?: { dryAlert: number; dryWarn: number; wetWarn: number; wetAlert: number };
  soilMoistureRaw?: { wet: number; dry: number; criticallyDry: number };
  // Hours of bright light (lux ≥ BRIGHT_LUX_THRESHOLD) the plant needs per
  // day. Driven by Perenual's xSunlightDuration.min; falls back to a generic
  // indoor default. Verdict uses this in preference to the instant `lux`
  // band so plants aren't flagged "темно" every night.
  minSunHours?: number;
}

// Single bar above which a sample counts toward the day's bright-light hours.
// 1000 lx ≈ a bright north-facing window on an overcast day, well below
// direct-window readings (10–50 klx). Tuned to make "did the plant see
// daylight today?" the question rather than "is it noon?".
export const BRIGHT_LUX_THRESHOLD = 1000;

// Sensible defaults applied when no per-species data is available. Tuned for
// typical indoor plants; species-specific data overrides slot-by-slot.
export const GENERIC_THRESHOLDS: CareThresholds = {
  temperatureC: { warnMin: 12, okMin: 16, okMax: 28, warnMax: 32 },
  humidityPct:  { warnMin: 25, okMin: 35, okMax: 70, warnMax: 80 },
  lux:          { warnMin: 150, okMin: 400, okMax: 30000, warnMax: 60000 },
  soilMoisturePct: { dryAlert: 10, dryWarn: 25, wetWarn: 85, wetAlert: 95 },
  soilMoistureRaw: { wet: 1300, dry: 2800, criticallyDry: 3300 },
  minSunHours: 4,
};

// Build thresholds from a Perenual species row. Most fields are categorical
// (watering: "Minimum"/"Average"/"Frequent"; sunlight: array of buckets),
// so this is mapping work, not measurement.
export function thresholdsFromPerenual(row: {
  watering?: string | null;
  sunlight?: string[] | null;
  details?: Record<string, unknown> | null;
  minSunHours?: number | null;
  droughtTolerant?: boolean | null;
}): CareThresholds {
  const t: CareThresholds = JSON.parse(JSON.stringify(GENERIC_THRESHOLDS));

  // Per-species sun-hour target overrides the generic 4h default.
  if (row.minSunHours != null && row.minSunHours > 0 && row.minSunHours <= 24) {
    t.minSunHours = row.minSunHours;
  }

  // Watering → soil moisture comfort band.
  // "Frequent" plants want it wetter; "Minimum" plants tolerate dryness.
  //
  // Two bands are kept in sync:
  //   - soilMoisturePct — what the ring verdict reads (pct space).
  //   - soilMoistureRaw — pre-calibration fallback only (raw ADC space).
  // Both move the same direction per category; the pct one is authoritative.
  switch (row.watering?.toLowerCase()) {
    case 'frequent':
      // Wants it wet — start warning while there's still moisture left, and
      // tolerate the high end a bit more before flagging "soaking".
      t.soilMoisturePct = { dryAlert: 15, dryWarn: 30, wetWarn: 90, wetAlert: 97 };
      t.soilMoistureRaw = { wet: 1100, dry: 2300, criticallyDry: 2900 };
      break;
    case 'minimum':
      // Tolerates dryness; stricter on the wet side (overwatering risk).
      t.soilMoisturePct = { dryAlert: 8, dryWarn: 18, wetWarn: 80, wetAlert: 92 };
      t.soilMoistureRaw = { wet: 1700, dry: 3300, criticallyDry: 3800 };
      break;
    case 'none':
      t.soilMoisturePct = { dryAlert: 5, dryWarn: 14, wetWarn: 75, wetAlert: 88 };
      t.soilMoistureRaw = { wet: 1900, dry: 3500, criticallyDry: 4000 };
      break;
    // "Average" = generic default
  }

  // drought_tolerant is a finer signal than the 3-bucket watering field: let
  // these species dry further before we warn/alert. Applied on top of the
  // category band so e.g. a drought-tolerant "Average" plant still differs
  // from a thirsty one. Floors keep "bone dry" meaningful.
  if (row.droughtTolerant && t.soilMoisturePct) {
    t.soilMoisturePct = {
      ...t.soilMoisturePct,
      dryAlert: Math.max(3, t.soilMoisturePct.dryAlert - 4),
      dryWarn: Math.max(8, t.soilMoisturePct.dryWarn - 7),
    };
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

// Per-species push text overrides — currently keyed only by watering
// frequency, since that's the parameter where one-size-fits-all texts feel
// off the most (a cactus owner being told "Полейте 200 мл" is comedy).
// Returns a map from TriggerKind -> body text, or null to fall back to the
// rules.ts defaults.
export type NotificationTexts = Partial<Record<string, string>>;

export function notificationTextsFromPerenual(row: {
  watering?: string | null;
}): NotificationTexts | null {
  const w = row.watering?.toLowerCase();
  switch (w) {
    case 'frequent':
      return {
        soil_orange: 'Почва подсыхает. Полейте тёплой водой.',
        soil_red:    'Почва сухая. Полейте как можно скорее.',
      };
    case 'minimum':
      return {
        soil_orange: 'Почва подсыхает. Полейте и дайте земле просохнуть.',
        soil_red:    'Почва пересохла. Полейте аккуратно.',
      };
    case 'none':
      return {
        soil_orange: 'Почва подсыхает. Этому виду много не нужно — полейте немного.',
        soil_red:    'Почва пересохла. Полейте — лучше сухо, чем перелив.',
      };
    case 'average':
    default:
      return null; // generic defaults are fine
  }
}
