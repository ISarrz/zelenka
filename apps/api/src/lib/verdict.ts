import type { CareThresholds } from './thresholds.js';

export type Severity = 'ok' | 'warn' | 'alert' | 'unknown';
export type RingStatus = 'cold' | 'ok' | 'warn' | 'alert';

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

const COLD_START_MS = 48 * 60 * 60 * 1000;

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

// Preferred grading path when calibration is set — operates in user-facing
// pct space so the cell colour matches what the user reads on screen.
// Bands mirror the chart's SOIL_PCT_BAND with an extra alert layer on both
// extremes.
function gradeSoilPct(pct: number | null | undefined): Severity {
  if (pct == null) return 'unknown';
  if (pct < 10) return 'alert';   // bone dry
  if (pct < 25) return 'warn';
  if (pct > 95) return 'alert';   // soaking
  if (pct > 85) return 'warn';
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
    // Prefer pct grading when the caller did the calibration conversion.
    soilMoistureRaw: reading.soilMoisturePct != null
      ? gradeSoilPct(reading.soilMoisturePct)
      : gradeSoil(reading.soilMoistureRaw, thresholds.soilMoistureRaw),
  };

  // 48-hour cold-start rule from the design doc — we don't give a verdict
  // until the device has been bound long enough to have a baseline.
  if (identifiedAt && Date.now() - identifiedAt.getTime() < COLD_START_MS) {
    return { ring: 'cold', perParam };
  }

  // Aggregate ring: alert > warn > ok. Unknown is treated as ok-equivalent
  // (don't alarm just because a sensor is missing).
  const values = Object.values(perParam);
  if (values.includes('alert')) return { ring: 'alert', perParam };
  if (values.includes('warn'))  return { ring: 'warn',  perParam };
  return { ring: 'ok', perParam };
}
