import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireDevice } from '../lib/auth.js';
import { detectAutoEvents } from '../lib/care_events.js';
import { evaluatePushTriggers } from '../lib/rules.js';
import type { CareThresholds } from '../lib/thresholds.js';
import { BRIGHT_LUX_THRESHOLD, GENERIC_THRESHOLDS } from '../lib/thresholds.js';
import { evaluate, type RingStatus } from '../lib/verdict.js';
import { soilPctFromRaw } from '../lib/soil.js';

async function countBrightHours(deviceId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ hours: bigint | number }>>`
    SELECT COUNT(DISTINCT date_trunc('hour', "measuredAt")) AS hours
    FROM "Measurement"
    WHERE "deviceId" = ${deviceId}
      AND "measuredAt" >= ${since}
      AND "lux" IS NOT NULL
      AND "lux" >= ${BRIGHT_LUX_THRESHOLD}
  `;
  const n = rows[0]?.hours ?? 0;
  return typeof n === 'bigint' ? Number(n) : n;
}

// One physical sample from the sensor. All fields nullable so firmware can ship
// an early build that only fills, say, temperatureC + soilMoistureRaw.
const Sample = z.object({
  measuredAt: z.string().datetime().optional(),
  temperatureC: z.number().finite().nullable().optional(),
  humidityPct: z.number().finite().min(0).max(100).nullable().optional(),
  pressureHpa: z.number().finite().nullable().optional(),
  lux: z.number().finite().min(0).nullable().optional(),
  soilMoistureRaw: z.number().int().nullable().optional(),
  soilMoisturePct: z.number().finite().min(0).max(100).nullable().optional(),
  batteryRaw: z.number().int().min(0).max(4095).nullable().optional(),
  batteryMv: z.number().int().min(0).max(4000).nullable().optional(),
});

const DeviceMeta = z.object({
  firmwareVersion: z.string().min(1).max(32).optional(),
  wifiRssi: z.number().int().min(-150).max(0).optional(),
});

const LastError = z.object({
  resetReason: z.number().int(),
  count: z.number().int().min(1),
  firmwareVersion: z.string().min(1).max(32).optional(),
});

const Batch = z.object({
  samples: z.array(Sample).min(1).max(64),
  device: DeviceMeta.optional(),
  lastError: LastError.optional(),
});

// esp_reset_reason_t code → label. Keep aligned with ESP-IDF: panic = 7,
// int_wdt = 8, task_wdt = 9, wdt = 10, brownout = 15.
const RESET_REASON_LABEL: Record<number, string> = {
  7: 'PANIC',
  8: 'INT_WDT',
  9: 'TASK_WDT',
  10: 'WDT',
  15: 'BROWNOUT',
};

export async function measurementRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/device/measurements', { preHandler: requireDevice }, async (req, reply) => {
    // Discriminate on the presence of `samples` rather than a zod union —
    // a union would happily match `{samples:[...]}` against the single-sample
    // schema (all fields optional!) and silently drop the array.
    const body = req.body as Record<string, unknown> | null;
    let samples: z.infer<typeof Sample>[];
    let deviceMeta: z.infer<typeof DeviceMeta> | undefined;
    if (body && typeof body === 'object' && 'samples' in body) {
      const parsed = Batch.safeParse(body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid batch', issues: parsed.error.issues };
      }
      samples = parsed.data.samples;
      deviceMeta = parsed.data.device;
      if (parsed.data.lastError) {
        const e = parsed.data.lastError;
        const label = RESET_REASON_LABEL[e.resetReason] ?? `code_${e.resetReason}`;
        req.log.warn(
          { deviceId: req.deviceId, resetReason: e.resetReason, label, count: e.count, firmwareVersion: e.firmwareVersion },
          `device ${req.deviceId} reported crash: ${label} ×${e.count}${e.firmwareVersion ? ` on fw ${e.firmwareVersion}` : ''}`,
        );
      }
    } else {
      const parsed = Sample.safeParse(body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid sample', issues: parsed.error.issues };
      }
      samples = [parsed.data];
    }
    const now = new Date();

    // Pull soil calibration once for the whole batch so we can render
    // pct = f(raw, dry, wet) at write-time. Firmware-provided pct still
    // wins when present — it's already the right answer, no need to recompute.
    const calRow = await prisma.device.findUnique({
      where: { id: req.deviceId! },
      select: { soilDryRaw: true, soilWetRaw: true },
    });
    const cal = { soilDryRaw: calRow?.soilDryRaw ?? null, soilWetRaw: calRow?.soilWetRaw ?? null };

    await prisma.measurement.createMany({
      data: samples.map((s) => ({
        deviceId: req.deviceId!,
        measuredAt: s.measuredAt ? new Date(s.measuredAt) : now,
        temperatureC: s.temperatureC ?? null,
        humidityPct: s.humidityPct ?? null,
        pressureHpa: s.pressureHpa ?? null,
        lux: s.lux ?? null,
        soilMoistureRaw: s.soilMoistureRaw ?? null,
        soilMoisturePct: s.soilMoisturePct ?? soilPctFromRaw(s.soilMoistureRaw, cal),
        batteryRaw: s.batteryRaw ?? null,
        batteryMv: s.batteryMv ?? null,
        // Stamp the batch-level RSSI onto every sample so history queries
        // can plot signal-strength over time alongside the sensor channels.
        wifiRssi: deviceMeta?.wifiRssi ?? null,
      })),
    });

    // Pick up + clear pendingFactoryReset atomically. We read the row, then
    // include it in deviceUpdate below so the same UPDATE that touches
    // lastSeenAt also drops the flag — minimal window for a double-fire.
    const devForReset = await prisma.device.findUnique({
      where: { id: req.deviceId! },
      select: { pendingFactoryReset: true },
    });
    const factoryResetPending = devForReset?.pendingFactoryReset === true;

    // Build the partial update for Device — metadata fields the firmware
    // reported, merged with the lastSeen timestamp and any reset-flag clear.
    const deviceUpdate: Record<string, unknown> = { lastSeenAt: now };
    if (deviceMeta?.firmwareVersion) deviceUpdate.firmwareVersion = deviceMeta.firmwareVersion;
    if (deviceMeta?.wifiRssi != null) deviceUpdate.wifiRssi = deviceMeta.wifiRssi;
    if (factoryResetPending) deviceUpdate.pendingFactoryReset = false;

    await prisma.device.update({ where: { id: req.deviceId! }, data: deviceUpdate });

    // Rule engine — evaluate only against the most recent sample in the
    // batch (the older ones are stale by definition).
    const device = await prisma.device.findUnique({
      where: { id: req.deviceId! },
      include: {
        user: { select: { id: true } },
        plant: { include: { species: true } },
      },
    });
    const plant = device?.plant;
    // device.user is nullable in the schema (orphans pre-claim), but a Plant
    // can only exist once the device has been claimed, so device + plant
    // together imply a non-null user.
    if (device && plant && device.user) {
      const last = samples[samples.length - 1];
      const measuredAt = last.measuredAt ? new Date(last.measuredAt) : now;
      const speciesThresholds =
        (plant.species?.thresholds as unknown as CareThresholds | null) ?? null;
      const thresholds: CareThresholds = { ...GENERIC_THRESHOLDS, ...(speciesThresholds ?? {}) };
      const hoursBrightToday = await countBrightHours(device.id);
      const verdict = evaluate(
        {
          temperatureC: last.temperatureC ?? null,
          humidityPct: last.humidityPct ?? null,
          lux: last.lux ?? null,
          hoursBrightToday,
          soilMoistureRaw: last.soilMoistureRaw ?? null,
          soilMoisturePct: last.soilMoisturePct ?? soilPctFromRaw(last.soilMoistureRaw ?? null, cal),
        },
        thresholds,
        plant.identifiedAt,
      );

      // Pull a small trailing window of measurements: the immediately-prior
      // one feeds sharp-change detection, and the last 2 (plus the new
      // sample) feed the trend check that gates repeat pushes.
      const trailing = await prisma.measurement.findMany({
        where: { deviceId: device.id, measuredAt: { lt: measuredAt } },
        orderBy: { measuredAt: 'desc' },
        take: 2,
      });
      const prevMeasurement = trailing[0] ?? null;
      const trend = [...trailing].reverse().map((m) => ({
        temperatureC: m.temperatureC,
        humidityPct: m.humidityPct,
        soilMoistureRaw: m.soilMoistureRaw,
      }));
      trend.push({
        temperatureC: last.temperatureC ?? null,
        humidityPct: last.humidityPct ?? null,
        soilMoistureRaw: last.soilMoistureRaw ?? null,
      });

      await evaluatePushTriggers({
        plant: {
          id: plant.id,
          userId: plant.userId,
          name: plant.name,
          thresholds,
          notificationTexts: (plant.species?.notificationTexts as Record<string, string> | null) ?? null,
          prevRingStatus: (plant.lastRingStatus as RingStatus | null) ?? null,
          prevTemperatureC: prevMeasurement?.temperatureC ?? null,
          prevMeasuredAt: prevMeasurement?.measuredAt ?? null,
          recentTrend: trend,
        },
        measurement: {
          temperatureC: last.temperatureC ?? null,
          humidityPct: last.humidityPct ?? null,
          lux: last.lux ?? null,
          soilMoistureRaw: last.soilMoistureRaw ?? null,
          measuredAt,
        },
        newVerdict: verdict,
      });

      await prisma.plant.update({
        where: { id: plant.id },
        data: { lastRingStatus: verdict.ring },
      });

      // Auto-detect care events (currently: watering via pct rise vs the
      // trailing-hour minimum).
      await detectAutoEvents({
        plantId: plant.id,
        deviceId: device.id,
        newSoilPct: last.soilMoisturePct ?? soilPctFromRaw(last.soilMoistureRaw ?? null, cal),
        occurredAt: measuredAt,
        wetCalibratedAt: device.soilWetCalibratedAt,
      });
    }

    return { stored: samples.length, pendingFactoryReset: factoryResetPending };
  });
}
