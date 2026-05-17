import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireDevice } from '../lib/auth.js';
import { rawToVoltage, updateBatteryCounters } from '../lib/battery.js';
import { detectAutoEvents } from '../lib/care_events.js';
import { evaluatePushTriggers } from '../lib/rules.js';
import type { CareThresholds } from '../lib/thresholds.js';
import { GENERIC_THRESHOLDS } from '../lib/thresholds.js';
import { evaluate, type RingStatus } from '../lib/verdict.js';

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
});

const Batch = z.object({ samples: z.array(Sample).min(1).max(64) });

export async function measurementRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/device/measurements', { preHandler: requireDevice }, async (req, reply) => {
    // Discriminate on the presence of `samples` rather than a zod union —
    // a union would happily match `{samples:[...]}` against the single-sample
    // schema (all fields optional!) and silently drop the array.
    const body = req.body as Record<string, unknown> | null;
    let samples: z.infer<typeof Sample>[];
    if (body && typeof body === 'object' && 'samples' in body) {
      const parsed = Batch.safeParse(body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid batch', issues: parsed.error.issues };
      }
      samples = parsed.data.samples;
    } else {
      const parsed = Sample.safeParse(body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid sample', issues: parsed.error.issues };
      }
      samples = [parsed.data];
    }
    const now = new Date();

    // Compute battery counter delta BEFORE inserting — we need to know the
    // prior-recorded voltage, which would otherwise include the new samples
    // we're about to write.
    const samplesWithBattery = samples.filter((s) => s.batteryRaw != null);
    let priorBatteryVoltage: number | null = null;
    if (samplesWithBattery.length > 0) {
      const lastBattery = await prisma.measurement.findFirst({
        where: { deviceId: req.deviceId!, batteryRaw: { not: null } },
        orderBy: { measuredAt: 'desc' },
        select: { batteryRaw: true },
      });
      priorBatteryVoltage = rawToVoltage(lastBattery?.batteryRaw);
    }

    await prisma.measurement.createMany({
      data: samples.map((s) => ({
        deviceId: req.deviceId!,
        measuredAt: s.measuredAt ? new Date(s.measuredAt) : now,
        temperatureC: s.temperatureC ?? null,
        humidityPct: s.humidityPct ?? null,
        pressureHpa: s.pressureHpa ?? null,
        lux: s.lux ?? null,
        soilMoistureRaw: s.soilMoistureRaw ?? null,
        soilMoisturePct: s.soilMoisturePct ?? null,
        batteryRaw: s.batteryRaw ?? null,
      })),
    });

    if (samplesWithBattery.length > 0) {
      const dev = await prisma.device.findUnique({
        where: { id: req.deviceId! },
        select: { cyclesSinceLastCharge: true, cyclesPerFullBattery: true },
      });
      if (dev) {
        const upd = await updateBatteryCounters({
          deviceId: req.deviceId!,
          device: dev,
          priorVoltage: priorBatteryVoltage,
          freshBatteryRaws: samplesWithBattery.map((s) => s.batteryRaw),
        });
        await prisma.device.update({
          where: { id: req.deviceId! },
          data: {
            cyclesSinceLastCharge: upd.newCounter,
            cyclesPerFullBattery: upd.newPerFull,
            ...(upd.chargeDetected ? { lastChargeAt: now } : {}),
          },
        });
      }
    }

    // Rule engine — evaluate only against the most recent sample in the
    // batch (the older ones are stale by definition).
    const device = await prisma.device.findUnique({
      where: { id: req.deviceId! },
      include: {
        user: { select: { id: true, quietHoursStartMin: true, quietHoursEndMin: true, timezone: true } },
        plant: { include: { species: true } },
      },
    });
    const plant = device?.plant;
    if (device && plant) {
      const last = samples[samples.length - 1];
      const measuredAt = last.measuredAt ? new Date(last.measuredAt) : now;
      const thresholds: CareThresholds =
        (plant.species?.thresholds as unknown as CareThresholds | null) ?? GENERIC_THRESHOLDS;
      const verdict = evaluate(
        {
          temperatureC: last.temperatureC ?? null,
          humidityPct: last.humidityPct ?? null,
          lux: last.lux ?? null,
          soilMoistureRaw: last.soilMoistureRaw ?? null,
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
        quietHours: {
          startMin: device.user.quietHoursStartMin ?? null,
          endMin: device.user.quietHoursEndMin ?? null,
          timezone: device.user.timezone,
        },
      });

      await prisma.plant.update({
        where: { id: plant.id },
        data: { lastRingStatus: verdict.ring },
      });

      // Auto-detect care events (currently: watering via soil-moisture drop).
      await detectAutoEvents({
        plantId: plant.id,
        prevSoilRaw: prevMeasurement?.soilMoistureRaw ?? null,
        newSoilRaw: last.soilMoistureRaw ?? null,
        occurredAt: measuredAt,
      });
    }

    return { stored: samples.length };
  });
}
