import { prisma } from '../db.js';

// Auto-detected care events. Sprint 5 ships one detector: watering, by way
// of a sustained rise in soil-moisture pct compared to the trailing-hour
// minimum. Single-sample comparisons miss slow waterings — capacitive V1.2
// soaks in over several 10-minute slots — so we look at a window.

// Minimum jump (percentage points) from the trailing-hour minimum to count
// as a watering. 20 pp clears sensor noise (~±5 pp drift) and small touch
// events while catching even a half-strength pour.
const WATERING_PCT_JUMP = 20;
// Trailing window we compare against. One hour ≈ 6 batched samples,
// enough to cover slow absorption without spanning a previous watering.
const WATERING_WINDOW_MS = 60 * 60 * 1000;
// Don't auto-record another watering within this window (sensor noise can
// produce additional ticks during a single soak).
const WATERING_COOLDOWN_MS = 6 * 60 * 60 * 1000;
// After the wet-calibration step the user has the probe sitting in a cup of
// water; subsequent samples for a while can land while the probe is still
// wet/being handled. Pausing detection for this window prevents that from
// getting logged as a watering event.
const WET_CALIBRATION_LOCKOUT_MS = 60 * 60 * 1000;

function median3(a: number, b: number, c: number): number {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

export async function detectAutoEvents(args: {
  plantId: string;
  deviceId: string;
  newSoilPct: number | null;
  occurredAt: Date;
  wetCalibratedAt: Date | null;
}): Promise<void> {
  const { plantId, deviceId, newSoilPct, occurredAt, wetCalibratedAt } = args;
  if (newSoilPct == null) return;

  // Calibration lock-out: the wet-anchor step necessarily produces an
  // in-water reading that looks just like a watering. Skip detection while
  // we're inside the cool-off window after the most recent wet calibration.
  if (
    wetCalibratedAt &&
    occurredAt.getTime() - wetCalibratedAt.getTime() < WET_CALIBRATION_LOCKOUT_MS
  ) {
    return;
  }

  // Pull the two samples immediately before `occurredAt` — used to confirm
  // the current reading via a 3-sample median, so a single in-water glitch
  // (probe lifted out, ADC spike, ESD touch) can't trigger detection on
  // its own.
  const prior = await prisma.measurement.findMany({
    where: {
      deviceId,
      measuredAt: { lt: occurredAt },
      soilMoisturePct: { not: null },
    },
    orderBy: { measuredAt: 'desc' },
    take: 2,
    select: { soilMoisturePct: true, measuredAt: true },
  });
  if (prior.length < 2) return;
  const currentMedian = median3(
    newSoilPct,
    prior[0].soilMoisturePct as number,
    prior[1].soilMoisturePct as number,
  );

  // Baseline: minimum over the trailing hour, *excluding* the two samples
  // used to compute currentMedian (so the comparison is current-vs-before,
  // not current-vs-itself).
  const windowStart = new Date(occurredAt.getTime() - WATERING_WINDOW_MS);
  const oldestPriorAt = prior[1].measuredAt;
  const baseline = await prisma.measurement.findMany({
    where: {
      deviceId,
      measuredAt: { gte: windowStart, lt: oldestPriorAt },
      soilMoisturePct: { not: null },
    },
    select: { soilMoisturePct: true },
  });
  if (baseline.length === 0) return;

  let minPct = Infinity;
  for (const m of baseline) {
    if (m.soilMoisturePct != null && m.soilMoisturePct < minPct) minPct = m.soilMoisturePct;
  }
  if (!isFinite(minPct)) return;
  if (currentMedian - minPct < WATERING_PCT_JUMP) return;

  const recent = await prisma.careEvent.findFirst({
    where: {
      plantId,
      kind: 'water',
      source: 'auto',
      occurredAt: { gte: new Date(occurredAt.getTime() - WATERING_COOLDOWN_MS) },
    },
  });
  if (recent) return;

  await prisma.careEvent.create({
    data: {
      plantId,
      kind: 'water',
      occurredAt,
      source: 'auto',
      note: `Soil ${minPct.toFixed(0)}% → ${currentMedian.toFixed(0)}%`,
    },
  });
}
