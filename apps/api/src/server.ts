import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { config, isProd } from './config.js';
import { scanScheduledTriggers } from './lib/scheduled_rules.js';
import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { eventRoutes } from './routes/events.js';
import { feedRoutes } from './routes/feed.js';
import { firmwareRoutes } from './routes/firmware.js';
import { healthRoutes } from './routes/health.js';
import { measurementRoutes } from './routes/measurements.js';
import { meRoutes } from './routes/me.js';
import { plantRoutes } from './routes/plants.js';
import { pushRoutes } from './routes/push.js';

const app = Fastify({
  logger: { level: isProd ? 'info' : 'debug' },
  trustProxy: true,
});

await app.register(cors, {
  origin: config.webBaseUrl,
  credentials: true,
});
await app.register(cookie);
await app.register(multipart, {
  limits: {
    files: 3,
    fileSize: 6 * 1024 * 1024, // 6 MB per image — generous; Plant.id rejects 10MB+
  },
});

await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(deviceRoutes);
await app.register(measurementRoutes);
await app.register(plantRoutes);
await app.register(eventRoutes);
await app.register(feedRoutes);
await app.register(firmwareRoutes);
await app.register(pushRoutes);
await app.register(meRoutes);

let scheduledTimer: NodeJS.Timeout | null = null;

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  if (scheduledTimer) clearInterval(scheduledTimer);
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await app.listen({ host: '0.0.0.0', port: config.port });

// Once-per-10-min scheduler for the time-based push triggers
// (light_low, air_dry, sensor_silent, onboarding_*, battery_low_week).
const SCHEDULED_INTERVAL_MS = 10 * 60 * 1000;
scheduledTimer = setInterval(() => {
  scanScheduledTriggers().catch((err) => app.log.error({ err }, 'scheduled scan failed'));
}, SCHEDULED_INTERVAL_MS);
// First scan ~30s after boot so we don't slam the DB during startup churn.
setTimeout(() => {
  scanScheduledTriggers().catch((err) => app.log.error({ err }, 'first scheduled scan failed'));
}, 30_000);
