import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  copy,
  detectTriggers,
  inQuietHours,
  isImprovingTrend,
  type MeasurementCtx,
  type PlantCtx,
  type QuietHours,
} from './rules.js';
import { GENERIC_THRESHOLDS } from './thresholds.js';
import type { PerParamVerdict, RingStatus, Verdict } from './verdict.js';

// ---- factories -------------------------------------------------------------

const perParam = (over: Partial<PerParamVerdict> = {}): PerParamVerdict => ({
  temperatureC: 'ok', humidityPct: 'ok', lux: 'ok', soilMoistureRaw: 'ok', ...over,
});
const verdict = (ring: RingStatus, pp: Partial<PerParamVerdict> = {}): Verdict => ({
  ring, perParam: perParam(pp),
});

const plantCtx = (over: Partial<PlantCtx> = {}): PlantCtx => ({
  id: 'p1',
  userId: 'u1',
  name: 'Фикус',
  thresholds: GENERIC_THRESHOLDS,
  notificationTexts: null,
  prevRingStatus: 'ok',
  prevTemperatureC: null,
  prevMeasuredAt: null,
  recentTrend: [],
  ...over,
});

const HOUR = 60 * 60 * 1000;
const measureCtx = (over: Partial<MeasurementCtx> = {}): MeasurementCtx => ({
  temperatureC: 22, humidityPct: 50, lux: 1000, soilMoistureRaw: 2000,
  measuredAt: new Date('2026-01-01T12:00:00Z'), ...over,
});

// ---- inQuietHours ----------------------------------------------------------

describe('inQuietHours', () => {
  const utc = (iso: string) => new Date(iso);
  const q = (startMin: number | null, endMin: number | null): QuietHours =>
    ({ startMin, endMin, timezone: 'UTC' });

  it('false when no window configured', () => {
    assert.equal(inQuietHours(utc('2026-01-01T03:00:00Z'), q(null, null)), false);
    assert.equal(inQuietHours(utc('2026-01-01T03:00:00Z'), q(1380, null)), false);
  });

  it('same-day window (22:00–23:00)', () => {
    const win = q(22 * 60, 23 * 60);
    assert.equal(inQuietHours(utc('2026-01-01T22:30:00Z'), win), true);
    assert.equal(inQuietHours(utc('2026-01-01T21:00:00Z'), win), false);
    assert.equal(inQuietHours(utc('2026-01-01T22:00:00Z'), win), true); // inclusive start
    assert.equal(inQuietHours(utc('2026-01-01T23:00:00Z'), win), true); // inclusive end
  });

  it('wrap-midnight window (23:00–07:00)', () => {
    const win = q(23 * 60, 7 * 60);
    assert.equal(inQuietHours(utc('2026-01-01T02:00:00Z'), win), true);
    assert.equal(inQuietHours(utc('2026-01-01T23:30:00Z'), win), true);
    assert.equal(inQuietHours(utc('2026-01-01T06:00:00Z'), win), true);
    assert.equal(inQuietHours(utc('2026-01-01T12:00:00Z'), win), false);
    assert.equal(inQuietHours(utc('2026-01-01T07:30:00Z'), win), false);
  });

  it('honours the timezone (08:00 UTC = 11:00 in Moscow)', () => {
    // Window 10:00–12:00 local Moscow. 08:00Z is 11:00 MSK → inside.
    const win: QuietHours = { startMin: 10 * 60, endMin: 12 * 60, timezone: 'Europe/Moscow' };
    assert.equal(inQuietHours(utc('2026-01-01T08:00:00Z'), win), true);
    assert.equal(inQuietHours(utc('2026-01-01T05:00:00Z'), win), false); // 08:00 MSK
  });
});

// ---- detectTriggers --------------------------------------------------------

describe('detectTriggers — only fires on entering the problem zone', () => {
  it('soil alert from a prior ok → soil_red', () => {
    const out = detectTriggers(plantCtx({ prevRingStatus: 'ok' }), measureCtx(),
      verdict('alert', { soilMoistureRaw: 'alert' }));
    assert.deepEqual(out, ['soil_red']);
  });

  it('soil warn from cold start → soil_orange', () => {
    const out = detectTriggers(plantCtx({ prevRingStatus: 'cold' }), measureCtx(),
      verdict('warn', { soilMoistureRaw: 'warn' }));
    assert.deepEqual(out, ['soil_orange']);
  });

  it('soil alert from a prior warn → nothing (already in a zone)', () => {
    const out = detectTriggers(plantCtx({ prevRingStatus: 'warn' }), measureCtx(),
      verdict('alert', { soilMoistureRaw: 'alert' }));
    assert.deepEqual(out, []);
  });

  it('null prev status counts as a fresh entry', () => {
    const out = detectTriggers(plantCtx({ prevRingStatus: null }), measureCtx(),
      verdict('alert', { temperatureC: 'alert' }));
    assert.deepEqual(out, ['temp_red']);
  });

  it('temp warn from ok → temp_orange', () => {
    const out = detectTriggers(plantCtx({ prevRingStatus: 'ok' }), measureCtx(),
      verdict('warn', { temperatureC: 'warn' }));
    assert.deepEqual(out, ['temp_orange']);
  });
});

describe('detectTriggers — sharp temperature drop', () => {
  const base = (prevTemperatureC: number, hoursAgo: number, nowTemp: number) =>
    detectTriggers(
      plantCtx({
        prevRingStatus: 'ok',
        prevTemperatureC,
        prevMeasuredAt: new Date('2026-01-01T12:00:00Z'),
      }),
      measureCtx({
        temperatureC: nowTemp,
        measuredAt: new Date(new Date('2026-01-01T12:00:00Z').getTime() + hoursAgo * HOUR),
      }),
      verdict('ok'),
    );

  it('fires when ≥5°C drop within <2h', () => {
    assert.deepEqual(base(25, 1, 19), ['temp_drop']); // -6°C in 1h
  });
  it('does not fire for a <5°C drop', () => {
    assert.deepEqual(base(25, 1, 21), []); // -4°C
  });
  it('does not fire when the gap is ≥2h (stale, not "sharp")', () => {
    assert.deepEqual(base(25, 3, 19), []);
  });
  it('does not fire on a rise', () => {
    assert.deepEqual(base(19, 1, 25), []);
  });
});

// ---- isImprovingTrend ------------------------------------------------------

describe('isImprovingTrend', () => {
  const trend = (vals: Array<Partial<{ t: number; s: number }>>) =>
    vals.map((v) => ({ temperatureC: v.t ?? null, humidityPct: null, soilMoistureRaw: v.s ?? null }));

  it('needs at least 3 samples', () => {
    assert.equal(isImprovingTrend('soil_red', plantCtx({ recentTrend: trend([{ s: 3000 }, { s: 2700 }]) })), false);
  });

  it('soil: improving when raw drops by more than the noise floor', () => {
    // generic dry 2800 → minDelta = 140. 3000→2700 = 300 drop → improving.
    const p = plantCtx({ recentTrend: trend([{ s: 3000 }, { s: 2900 }, { s: 2700 }]) });
    assert.equal(isImprovingTrend('soil_red', p), true);
  });

  it('soil: not improving when the change is within noise', () => {
    const p = plantCtx({ recentTrend: trend([{ s: 2700 }, { s: 2750 }, { s: 2720 }]) });
    assert.equal(isImprovingTrend('soil_orange', p), false);
  });

  it('temp: improving when moving toward the optimum (22°C)', () => {
    // 10°C → 14°C: closer to optimum by 4°C (> 0.3 noise) → improving.
    const p = plantCtx({ recentTrend: trend([{ t: 10 }, { t: 12 }, { t: 14 }]) });
    assert.equal(isImprovingTrend('temp_red', p), true);
  });

  it('temp: not improving when moving away from the optimum', () => {
    const p = plantCtx({ recentTrend: trend([{ t: 14 }, { t: 12 }, { t: 10 }]) });
    assert.equal(isImprovingTrend('temp_orange', p), false);
  });

  it('temp_drop has no trend concept → never "improving"', () => {
    const p = plantCtx({ recentTrend: trend([{ t: 10 }, { t: 12 }, { t: 14 }]) });
    assert.equal(isImprovingTrend('temp_drop' as never, p), false);
  });
});

// ---- copy ------------------------------------------------------------------

describe('copy', () => {
  it('truncates the title (plant name) to 40 chars', () => {
    const long = 'А'.repeat(60);
    const { title } = copy('soil_red', long, GENERIC_THRESHOLDS, null);
    assert.equal(title.length, 40);
  });

  it('uses a per-species override body when present', () => {
    const { body } = copy('soil_orange', 'Кактус', GENERIC_THRESHOLDS, {
      soil_orange: 'Кастомный текст',
    });
    assert.equal(body, 'Кастомный текст');
  });

  it('falls back to the default body when no override for that kind', () => {
    const { body } = copy('soil_red', 'Фикус', GENERIC_THRESHOLDS, { soil_orange: 'x' });
    assert.match(body, /Полейте/);
  });

  it('temp_orange interpolates the comfort band from thresholds', () => {
    const { body } = copy('temp_orange', 'Фикус', GENERIC_THRESHOLDS, null);
    assert.match(body, /16–28°C/); // okMin–okMax
  });

  it('the body never exceeds the 100-char design cap (default texts)', () => {
    for (const kind of ['soil_orange', 'soil_red', 'temp_orange', 'temp_red', 'temp_drop'] as const) {
      const { body } = copy(kind, 'Фикус', GENERIC_THRESHOLDS, null);
      assert.ok(body.length <= 100, `${kind} body too long: ${body.length}`);
    }
  });
});
