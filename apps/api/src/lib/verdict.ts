import type { CareThresholds } from './thresholds.js';

export type Severity = 'ok' | 'warn' | 'alert' | 'unknown';
export type RingStatus = 'cold' | 'ok' | 'warn' | 'alert';

export interface Reading {
  temperatureC?: number | null;
  humidityPct?: number | null;
  lux?: number | null;
  soilMoistureRaw?: number | null;
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

export function evaluate(
  reading: Reading,
  thresholds: CareThresholds,
  identifiedAt: Date | null,
): Verdict {
  const perParam: PerParamVerdict = {
    temperatureC: gradeBand(reading.temperatureC, thresholds.temperatureC),
    humidityPct:  gradeBand(reading.humidityPct,  thresholds.humidityPct),
    lux:          gradeBand(reading.lux,          thresholds.lux),
    soilMoistureRaw: gradeSoil(reading.soilMoistureRaw, thresholds.soilMoistureRaw),
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
