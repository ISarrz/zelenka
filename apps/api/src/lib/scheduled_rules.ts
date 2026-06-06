// Periodically-run rules — the 6 triggers that aren't reactive to a single
// measurement insert. Called by a setInterval in server.ts every 10 min.
//
// Each trigger writes to NotificationLog the same way evaluatePushTriggers
// does, so cooldown / daily-cap checks remain consistent across both paths.

import { prisma } from '../db.js';
import { batteryVoltage, voltageToEstimate } from './battery.js';
import { sendPushToUser } from './push.js';
import type { CareThresholds } from './thresholds.js';
import { GENERIC_THRESHOLDS } from './thresholds.js';

const COOLDOWN_24H = 24 * 60 * 60 * 1000;
const COOLDOWN_7D = 7 * 24 * 60 * 60 * 1000;
const SENSOR_SILENT_HOURS = 24;
const LIGHT_LOW_DAYS = 3;
const HUMID_LOW_DAYS = 5;
const ONBOARDING_HOURS = 48;

function copyFor(kind: string, plantName: string): { title: string; body: string } {
  const title = plantName.slice(0, 40);
  switch (kind) {
    case 'light_low':
      return { title, body: 'Света мало уже три дня. Переставьте ближе к окну.' };
    case 'air_dry':
      return { title, body: 'Воздух сухой пятый день. Поставьте увлажнитель или поддон с водой.' };
    case 'sensor_silent':
      return { title, body: 'Датчик молчит сутки. Проверьте Wi-Fi или зарядите аккумулятор.' };
    case 'onboarding_place_ok':
      return { title, body: 'Место подходит — за двое суток все показатели в норме.' };
    case 'onboarding_place_alert':
      return { title, body: 'Место не очень — за двое суток показатели за пределами нормы.' };
    case 'battery_low_week':
      return { title, body: 'Зарядите датчик. Низкий заряд.' };
  }
  return { title, body: '' };
}

async function recentlySent(plantId: string, kind: string, sinceMs: number): Promise<boolean> {
  const row = await prisma.notificationLog.findFirst({
    where: { plantId, kind, sentAt: { gte: new Date(Date.now() - sinceMs) }, suppressedReason: null },
  });
  return !!row;
}

async function fire(
  userId: string,
  plantId: string,
  kind: string,
  plantName: string,
): Promise<void> {
  const { title, body } = copyFor(kind, plantName);
  await sendPushToUser(userId, { title, body, url: '/', tag: `${plantId}:${kind}` })
    .catch(() => undefined);
  await prisma.notificationLog.create({
    data: { userId, plantId, kind, title, body },
  });
}

// ----- triggers ------------------------------------------------------------

interface PlantSnap {
  id: string;
  userId: string;
  name: string;
  identifiedAt: Date | null;
  deviceId: string | null;
  thresholds: CareThresholds;
}

async function loadPlants(): Promise<PlantSnap[]> {
  const rows = await prisma.plant.findMany({
    where: { deviceId: { not: null } },
    include: { species: true },
  });
  return rows.map((p) => ({
    id: p.id,
    userId: p.userId,
    name: p.name,
    identifiedAt: p.identifiedAt,
    deviceId: p.deviceId,
    thresholds:
      (p.species?.thresholds as unknown as CareThresholds | null) ?? GENERIC_THRESHOLDS,
  }));
}

async function scanLightLow(plants: PlantSnap[]): Promise<void> {
  for (const p of plants) {
    const band = p.thresholds.lux;
    if (!band || !p.deviceId) continue;
    if (await recentlySent(p.id, 'light_low', COOLDOWN_24H)) continue;

    const since = new Date(Date.now() - LIGHT_LOW_DAYS * 24 * 60 * 60 * 1000);
    const everAdequate = await prisma.measurement.findFirst({
      where: { deviceId: p.deviceId, measuredAt: { gte: since }, lux: { gte: band.okMin } },
    });
    const anyDataAtAll = await prisma.measurement.findFirst({
      where: { deviceId: p.deviceId, measuredAt: { gte: since } },
    });
    if (anyDataAtAll && !everAdequate) {
      await fire(p.userId, p.id, 'light_low', p.name);
    }
  }
}

async function scanAirDry(plants: PlantSnap[]): Promise<void> {
  for (const p of plants) {
    const band = p.thresholds.humidityPct;
    if (!band || !p.deviceId) continue;
    if (await recentlySent(p.id, 'air_dry', COOLDOWN_24H)) continue;

    const since = new Date(Date.now() - HUMID_LOW_DAYS * 24 * 60 * 60 * 1000);
    const everAdequate = await prisma.measurement.findFirst({
      where: { deviceId: p.deviceId, measuredAt: { gte: since }, humidityPct: { gte: band.okMin } },
    });
    const anyDataAtAll = await prisma.measurement.findFirst({
      where: { deviceId: p.deviceId, measuredAt: { gte: since } },
    });
    if (anyDataAtAll && !everAdequate) {
      await fire(p.userId, p.id, 'air_dry', p.name);
    }
  }
}

async function scanSensorSilent(plants: PlantSnap[]): Promise<void> {
  for (const p of plants) {
    if (!p.deviceId) continue;
    if (await recentlySent(p.id, 'sensor_silent', COOLDOWN_24H)) continue;
    const latest = await prisma.measurement.findFirst({
      where: { deviceId: p.deviceId },
      orderBy: { measuredAt: 'desc' },
    });
    if (!latest) continue;
    const ageH = (Date.now() - latest.measuredAt.getTime()) / 3_600_000;
    if (ageH >= SENSOR_SILENT_HOURS) {
      await fire(p.userId, p.id, 'sensor_silent', p.name);
    }
  }
}

async function scanOnboarding(plants: PlantSnap[]): Promise<void> {
  for (const p of plants) {
    if (!p.deviceId || !p.identifiedAt) continue;
    const ageH = (Date.now() - p.identifiedAt.getTime()) / 3_600_000;
    if (ageH < ONBOARDING_HOURS || ageH > ONBOARDING_HOURS + 1) continue; // 1-hour window

    // Either kind fires at most once per plant (forever).
    const alreadySent = await prisma.notificationLog.findFirst({
      where: { plantId: p.id, kind: { in: ['onboarding_place_ok', 'onboarding_place_alert'] }, suppressedReason: null },
    });
    if (alreadySent) continue;

    // Look at the last 24h of measurements. If anything has been alerting,
    // the place is not great; otherwise we declare it good.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const measurements = await prisma.measurement.findMany({
      where: { deviceId: p.deviceId, measuredAt: { gte: since } },
      orderBy: { measuredAt: 'asc' },
    });
    if (measurements.length === 0) continue;

    const t = p.thresholds;
    let badCount = 0;
    for (const m of measurements) {
      if (t.temperatureC && m.temperatureC != null) {
        if (m.temperatureC < t.temperatureC.warnMin || m.temperatureC > t.temperatureC.warnMax) badCount++;
      }
      if (t.humidityPct && m.humidityPct != null) {
        if (m.humidityPct < t.humidityPct.warnMin || m.humidityPct > t.humidityPct.warnMax) badCount++;
      }
      if (t.lux && m.lux != null) {
        if (m.lux < t.lux.warnMin) badCount++;
      }
    }
    const kind = badCount > measurements.length * 0.3 ? 'onboarding_place_alert' : 'onboarding_place_ok';
    await fire(p.userId, p.id, kind, p.name);
  }
}

// Weekly cadence — fires at most once every 7 days per plant. Body just says
// the battery is low (the per-cycle "days remaining" estimate was removed).
async function scanBatteryLow(plants: PlantSnap[]): Promise<void> {
  for (const p of plants) {
    if (!p.deviceId) continue;
    if (await recentlySent(p.id, 'battery_low_week', COOLDOWN_7D)) continue;

    const latest = await prisma.measurement.findFirst({
      where: { deviceId: p.deviceId, OR: [{ batteryRaw: { not: null } }, { batteryMv: { not: null } }] },
      orderBy: { measuredAt: 'desc' },
      select: { batteryRaw: true, batteryMv: true },
    });
    const voltage = batteryVoltage(latest?.batteryRaw, latest?.batteryMv);
    const estimate = voltageToEstimate(voltage);
    if (estimate !== 'low' && estimate !== 'critical') continue;

    await fire(p.userId, p.id, 'battery_low_week', p.name);
  }
}

export async function scanScheduledTriggers(): Promise<void> {
  const plants = await loadPlants();
  await scanLightLow(plants);
  await scanAirDry(plants);
  await scanSensorSilent(plants);
  await scanOnboarding(plants);
  await scanBatteryLow(plants);
}
