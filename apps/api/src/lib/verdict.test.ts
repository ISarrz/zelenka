import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GENERIC_THRESHOLDS, type CareThresholds } from './thresholds.js';
import { evaluate, type Reading } from './verdict.js';

// Helpers for "identifiedAt" relative to the 48h cold-start / 24h sun-warmup
// windows. null = treat as long-bound (no cold start, no warmup).
const HOUR = 60 * 60 * 1000;
const longAgo = () => new Date(Date.now() - 72 * HOUR); // past both windows
const justNow = () => new Date(Date.now() - 1 * HOUR);  // inside both windows

// Minimal reading with everything unset; tests fill in only what they grade.
const blank: Reading = {};

describe('evaluate — cold start', () => {
  it('returns cold ring while inside the 48h window regardless of values', () => {
    const r: Reading = { temperatureC: 60, soilMoisturePct: 0 }; // wildly bad
    const v = evaluate(r, GENERIC_THRESHOLDS, justNow());
    assert.equal(v.ring, 'cold');
  });

  it('still computes perParam during cold start (used for transitions)', () => {
    const v = evaluate({ temperatureC: 5 }, GENERIC_THRESHOLDS, justNow());
    assert.equal(v.ring, 'cold');
    assert.equal(v.perParam.temperatureC, 'alert'); // 5°C < warnMin 12
  });

  it('gives a real verdict once past the cold-start window', () => {
    const v = evaluate({ temperatureC: 22 }, GENERIC_THRESHOLDS, longAgo());
    assert.equal(v.ring, 'ok');
  });

  it('never cold when identifiedAt is null', () => {
    const v = evaluate({ temperatureC: 22 }, GENERIC_THRESHOLDS, null);
    assert.equal(v.ring, 'ok');
  });
});

describe('evaluate — temperature bands (generic 12/16/28/32)', () => {
  const t = (temperatureC: number) =>
    evaluate({ temperatureC }, GENERIC_THRESHOLDS, null).perParam.temperatureC;

  it('ok inside okMin..okMax', () => assert.equal(t(22), 'ok'));
  it('warn just below okMin', () => assert.equal(t(14), 'warn'));
  it('warn just above okMax', () => assert.equal(t(30), 'warn'));
  it('alert below warnMin', () => assert.equal(t(8), 'alert'));
  it('alert above warnMax', () => assert.equal(t(35), 'alert'));
  it('boundary okMin is ok', () => assert.equal(t(16), 'ok'));
  it('boundary warnMin is warn (>= warnMin, < okMin)', () => assert.equal(t(12), 'warn'));
  it('unknown when missing', () =>
    assert.equal(evaluate(blank, GENERIC_THRESHOLDS, null).perParam.temperatureC, 'unknown'));
});

describe('evaluate — soil pct path (generic 10/25/85/95)', () => {
  const s = (soilMoisturePct: number) =>
    evaluate({ soilMoisturePct }, GENERIC_THRESHOLDS, null).perParam.soilMoistureRaw;

  it('alert bone dry (< dryAlert)', () => assert.equal(s(5), 'alert'));
  it('warn drying (< dryWarn)', () => assert.equal(s(20), 'warn'));
  it('ok mid range', () => assert.equal(s(50), 'ok'));
  it('warn soaking (> wetWarn)', () => assert.equal(s(90), 'warn'));
  it('alert waterlogged (> wetAlert)', () => assert.equal(s(97), 'alert'));
  it('boundary dryWarn is ok (>= dryWarn)', () => assert.equal(s(25), 'ok'));
});

describe('evaluate — soil pct uses the species band, not a fixed one', () => {
  // "Frequent" plants want it wetter — warn starts higher (dryWarn 30 vs 25).
  const frequent: CareThresholds = {
    ...GENERIC_THRESHOLDS,
    soilMoisturePct: { dryAlert: 15, dryWarn: 30, wetWarn: 90, wetAlert: 97 },
  };
  it('28% is "warn" for a thirsty plant but "ok" generically', () => {
    assert.equal(evaluate({ soilMoisturePct: 28 }, frequent, null).perParam.soilMoistureRaw, 'warn');
    assert.equal(evaluate({ soilMoisturePct: 28 }, GENERIC_THRESHOLDS, null).perParam.soilMoistureRaw, 'ok');
  });
});

describe('evaluate — soil raw fallback when pct is absent', () => {
  // Only reached when soilMoisturePct is null (bad/absent calibration).
  const raw = (soilMoistureRaw: number) =>
    evaluate({ soilMoistureRaw }, GENERIC_THRESHOLDS, null).perParam.soilMoistureRaw;
  it('alert at/above criticallyDry (3300)', () => assert.equal(raw(3300), 'alert'));
  it('warn at/above dry (2800)', () => assert.equal(raw(2900), 'warn'));
  it('ok in the comfortable middle', () => assert.equal(raw(2000), 'ok'));
  it('warn when far below wet (too wet)', () => assert.equal(raw(700), 'warn')); // < wet*0.6 = 780
});

describe('evaluate — light by bright-hours vs minSunHours (generic 4h)', () => {
  const lux = (hoursBrightToday: number) =>
    evaluate({ hoursBrightToday }, GENERIC_THRESHOLDS, null).perParam.lux;
  it('ok when hours >= target', () => assert.equal(lux(5), 'ok'));
  it('warn when target/2 <= hours < target', () => assert.equal(lux(3), 'warn'));
  it('alert when hours < target/2', () => assert.equal(lux(1), 'alert'));

  it('unknown during the 24h sun-warmup window', () => {
    // identifiedAt within 24h → not enough history to fairly grade hours.
    const v = evaluate({ hoursBrightToday: 0 }, GENERIC_THRESHOLDS, justNow());
    assert.equal(v.perParam.lux, 'unknown');
  });

  it('falls back to the instant lux band when hours not supplied', () => {
    // No minSunHours-driven path → grade reading.lux directly.
    const noSun: CareThresholds = { ...GENERIC_THRESHOLDS, minSunHours: undefined };
    assert.equal(evaluate({ lux: 1000 }, noSun, null).perParam.lux, 'ok');
    assert.equal(evaluate({ lux: 100 }, noSun, null).perParam.lux, 'alert');   // < warnMin 150
    assert.equal(evaluate({ lux: 50000 }, noSun, null).perParam.lux, 'warn');  // > okMax 30000
  });
});

describe('evaluate — ring aggregation (alert > warn > ok, unknown ~ ok)', () => {
  it('all-unknown reading is ok, not alarming', () => {
    const v = evaluate(blank, GENERIC_THRESHOLDS, null);
    assert.equal(v.ring, 'ok');
    assert.deepEqual(v.perParam, {
      temperatureC: 'unknown', humidityPct: 'unknown', lux: 'unknown', soilMoistureRaw: 'unknown',
    });
  });
  it('one warn lifts the ring to warn', () => {
    const v = evaluate({ temperatureC: 30 }, GENERIC_THRESHOLDS, null);
    assert.equal(v.ring, 'warn');
  });
  it('an alert dominates a warn', () => {
    const v = evaluate({ temperatureC: 30, soilMoisturePct: 5 }, GENERIC_THRESHOLDS, null);
    assert.equal(v.ring, 'alert');
  });
});
