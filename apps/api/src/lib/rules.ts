import { prisma } from '../db.js';
import { sendPushToUser } from './push.js';
import type { CareThresholds } from './thresholds.js';
import type { RingStatus, Verdict } from './verdict.js';

// Triggers we ship in Sprint 4. Mapped to the design doc's 12-trigger table —
// the remaining 8 land later. Each triggers a push iff:
//   (a) we entered the problem zone (state transition from ok/unknown into
//       this trigger's severity), AND
//   (b) cooldown hasn't fired this kind for this plant in the last 12h, AND
//   (c) we haven't already sent 3 pushes for this plant in the last 24h.
//
// Quiet hours mute *everything* (per the doc — simpler is safer).
const COOLDOWN_MS = 12 * 60 * 60 * 1000;
const DAILY_CAP_MS = 24 * 60 * 60 * 1000;
const DAILY_CAP = 3;
const SHARP_TEMP_DROP_C = 5;

export type TriggerKind =
  | 'soil_orange'
  | 'soil_red'
  | 'temp_orange'
  | 'temp_red'
  | 'temp_drop';

interface PlantCtx {
  id: string;
  userId: string;
  name: string;
  thresholds: CareThresholds;
  prevRingStatus: RingStatus | null;
  // Most recent measurement *before* this one — used for sharp-change detection.
  prevTemperatureC: number | null;
  prevMeasuredAt: Date | null;
}

interface MeasurementCtx {
  temperatureC: number | null;
  humidityPct: number | null;
  lux: number | null;
  soilMoistureRaw: number | null;
  measuredAt: Date;
}

interface QuietHours {
  startMin: number | null;
  endMin: number | null;
}

function inQuietHours(now: Date, q: QuietHours): boolean {
  if (q.startMin == null || q.endMin == null) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  // Windows that wrap midnight (e.g. 23:00 → 07:00) need OR; same-day uses AND.
  return q.startMin <= q.endMin
    ? m >= q.startMin && m <= q.endMin
    : m >= q.startMin || m <= q.endMin;
}

function copy(kind: TriggerKind, plantName: string, thresholds: CareThresholds): { title: string; body: string } {
  // Per design doc: plant name in title, numbers + action in body, ≤40/≤100 chars, ровный тон.
  const title = plantName.slice(0, 40);
  switch (kind) {
    case 'soil_orange':
      return { title, body: 'Почва подсыхает. Полейте 150–200 мл тёплой отстоянной воды.' };
    case 'soil_red':
      return { title, body: 'Почва сухая. Полейте 200–250 мл воды как можно скорее.' };
    case 'temp_orange': {
      const t = thresholds.temperatureC;
      const band = t ? `${t.okMin}–${t.okMax}°C` : 'комфортную';
      return { title, body: `Температура вышла за норму. Поддерживайте ${band}.` };
    }
    case 'temp_red':
      return { title, body: 'Опасная температура. Переставьте подальше от окна или батареи.' };
    case 'temp_drop':
      return { title, body: 'Температура резко падает. Закройте сквозняк или окно.' };
  }
}

function detectTriggers(plant: PlantCtx, m: MeasurementCtx, newVerdict: Verdict): TriggerKind[] {
  const out: TriggerKind[] = [];
  const prev = plant.prevRingStatus;

  // Soil: only fire on transition (was not-warn/alert previously, now is).
  const soilSev = newVerdict.perParam.soilMoistureRaw;
  if ((prev === 'ok' || prev === 'cold' || prev == null) && soilSev === 'alert')
    out.push('soil_red');
  else if ((prev === 'ok' || prev === 'cold' || prev == null) && soilSev === 'warn')
    out.push('soil_orange');

  const tempSev = newVerdict.perParam.temperatureC;
  if ((prev === 'ok' || prev === 'cold' || prev == null) && tempSev === 'alert')
    out.push('temp_red');
  else if ((prev === 'ok' || prev === 'cold' || prev == null) && tempSev === 'warn')
    out.push('temp_orange');

  // Sharp temperature drop — independent of zone; fires if dropped ≥5°C/hour.
  if (
    plant.prevTemperatureC != null &&
    m.temperatureC != null &&
    plant.prevMeasuredAt != null
  ) {
    const dt = m.temperatureC - plant.prevTemperatureC;
    const dh = (m.measuredAt.getTime() - plant.prevMeasuredAt.getTime()) / 3_600_000;
    if (dh > 0 && dh < 2 && dt <= -SHARP_TEMP_DROP_C) out.push('temp_drop');
  }

  return out;
}

async function shouldSuppress(
  plant: PlantCtx,
  kind: TriggerKind,
  now: Date,
  quiet: QuietHours,
): Promise<string | null> {
  if (inQuietHours(now, quiet)) return 'quiet_hours';

  // Cooldown — same kind in last 12 h?
  const cooldownSince = new Date(now.getTime() - COOLDOWN_MS);
  const recent = await prisma.notificationLog.findFirst({
    where: { plantId: plant.id, kind, sentAt: { gte: cooldownSince }, suppressedReason: null },
  });
  if (recent) return 'cooldown';

  // Daily cap — any kind, last 24 h.
  const dailySince = new Date(now.getTime() - DAILY_CAP_MS);
  const dailyCount = await prisma.notificationLog.count({
    where: { plantId: plant.id, sentAt: { gte: dailySince }, suppressedReason: null },
  });
  if (dailyCount >= DAILY_CAP) return 'daily_cap';

  return null;
}

/**
 * Run the rule engine for a single new measurement on a plant. Records each
 * candidate trigger in NotificationLog (whether suppressed or sent) so the
 * cooldown / daily cap math is consistent.
 */
export async function evaluatePushTriggers(args: {
  plant: PlantCtx;
  measurement: MeasurementCtx;
  newVerdict: Verdict;
  quietHours: QuietHours;
}): Promise<void> {
  const { plant, measurement, newVerdict, quietHours } = args;
  const triggers = detectTriggers(plant, measurement, newVerdict);
  if (triggers.length === 0) return;
  const now = new Date();

  for (const kind of triggers) {
    const reason = await shouldSuppress(plant, kind, now, quietHours);
    const { title, body } = copy(kind, plant.name, plant.thresholds);

    if (reason) {
      await prisma.notificationLog.create({
        data: { userId: plant.userId, plantId: plant.id, kind, title, body, suppressedReason: reason },
      });
      continue;
    }

    await sendPushToUser(plant.userId, {
      title,
      body,
      url: `/`,
      tag: `${plant.id}:${kind}`,
    }).catch(() => undefined);

    await prisma.notificationLog.create({
      data: { userId: plant.userId, plantId: plant.id, kind, title, body },
    });
  }
}
