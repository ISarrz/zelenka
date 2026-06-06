import type { CareThresholds } from './thresholds.js';

export type Severity = 'ok' | 'warn' | 'alert' | 'unknown';
export type RingStatus = 'ok' | 'warn' | 'alert';

export interface Reading {
  temperatureC?: number | null;
  humidityPct?: number | null;
  lux?: number | null;
  soilMoistureRaw?: number | null;
  // Pre-computed soil moisture in % (caller mixes device calibration with
  // the generic fallback). When set, the verdict grades soil in pct space —
  // matches what the user sees on screen. Falls back to the raw band only
  // if pct isn't supplied.
  soilMoisturePct?: number | null;
  // Count of distinct hours in the last 24h where lux was bright enough
  // (≥ BRIGHT_LUX_THRESHOLD). Caller computes this server-side; verdict uses
  // it instead of the instant `lux` whenever both this and minSunHours are
  // available, so plants aren't flagged "темно" at night.
  hoursBrightToday?: number | null;
}

export interface PerParamVerdict {
  temperatureC: Severity;
  humidityPct: Severity;
  lux: Severity;
  soilMoistureRaw: Severity;
}

export interface Verdict {
  ring: RingStatus;
  perParam: PerParamVerdict;
}

function gradeBand(
  v: number | null | undefined,
  band?: { okMin: number; okMax: number; warnMin: number; warnMax: number },
): Severity {
  if (v == null) return 'unknown';
  if (!band) return 'unknown';
  if (v < band.warnMin || v > band.warnMax) return 'alert';
  if (v < band.okMin || v > band.okMax) return 'warn';
  return 'ok';
}

function gradeSunHours(
  hours: number | null | undefined,
  target: number | undefined,
): Severity {
  if (hours == null || target == null) return 'unknown';
  if (hours < target / 2) return 'alert';
  if (hours < target)     return 'warn';
  return 'ok';
}

function gradeSoil(
  v: number | null | undefined,
  band?: { wet: number; dry: number; criticallyDry: number },
): Severity {
  // Higher raw ADC = drier. So order is wet < dry < criticallyDry.
  if (v == null) return 'unknown';
  if (!band) return 'unknown';
  if (v >= band.criticallyDry) return 'alert';
  if (v >= band.dry) return 'warn';
  // Sopping wet is also a problem — symmetric "too wet" alert if data wanders
  // far below the wet bound (e.g. just-watered sensor that stays low for days).
  if (v < band.wet * 0.6) return 'warn';
  return 'ok';
}

// Preferred grading path — operates in user-facing pct space so the cell
// colour matches what the user reads on screen. The band comes from the
// species thresholds (derived from Perenual watering category + drought
// tolerance); falls back to the generic boundaries when none is supplied.
const GENERIC_SOIL_PCT_BAND = { dryAlert: 10, dryWarn: 25, wetWarn: 85, wetAlert: 95 };

function gradeSoilPct(
  pct: number | null | undefined,
  band?: { dryAlert: number; dryWarn: number; wetWarn: number; wetAlert: number },
): Severity {
  if (pct == null) return 'unknown';
  const b = band ?? GENERIC_SOIL_PCT_BAND;
  if (pct < b.dryAlert) return 'alert';   // bone dry
  if (pct < b.dryWarn) return 'warn';
  if (pct > b.wetAlert) return 'alert';   // soaking
  if (pct > b.wetWarn) return 'warn';
  return 'ok';
}

export function evaluate(
  reading: Reading,
  thresholds: CareThresholds,
  identifiedAt: Date | null,
): Verdict {
  // Light is graded by hours-of-bright-light vs xSunlightDuration target
  // when both are available (the physiologically meaningful metric). Falls
  // back to the instant-lux band only if the caller didn't supply a windowed
  // count — keeps tests and any other call sites working.
  //
  // Guard: the windowed metric needs a full 24 h of samples to be fair. In
  // the first day after binding, hoursBrightToday is always low simply
  // because the device hasn't been collecting that long — return 'unknown'
  // instead of crying alert on a fresh plant.
  const SUN_WARMUP_MS = 24 * 60 * 60 * 1000;
  const sunWarmingUp = identifiedAt
    ? Date.now() - identifiedAt.getTime() < SUN_WARMUP_MS
    : false;
  const luxSeverity = reading.hoursBrightToday != null && thresholds.minSunHours != null
    ? (sunWarmingUp ? 'unknown' : gradeSunHours(reading.hoursBrightToday, thresholds.minSunHours))
    : gradeBand(reading.lux, thresholds.lux);

  const perParam: PerParamVerdict = {
    temperatureC: gradeBand(reading.temperatureC, thresholds.temperatureC),
    humidityPct:  gradeBand(reading.humidityPct,  thresholds.humidityPct),
    lux:          luxSeverity,
    // Prefer pct grading (the live path) — uses the species pct band so
    // drought-tolerant / thirsty plants grade differently. Falls back to the
    // raw band only when pct couldn't be computed (bad/absent calibration).
    soilMoistureRaw: reading.soilMoisturePct != null
      ? gradeSoilPct(reading.soilMoisturePct, thresholds.soilMoisturePct)
      : gradeSoil(reading.soilMoistureRaw, thresholds.soilMoistureRaw),
  };

  // Aggregate ring: alert > warn > ok. Unknown is treated as ok-equivalent
  // (don't alarm just because a sensor is missing).
  const values = Object.values(perParam);
  if (values.includes('alert')) return { ring: 'alert', perParam };
  if (values.includes('warn'))  return { ring: 'warn',  perParam };
  return { ring: 'ok', perParam };
}
