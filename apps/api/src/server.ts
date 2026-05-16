import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { config, isProd } from './config.js';
import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { healthRoutes } from './routes/health.js';
import { measurementRoutes } from './routes/measurements.js';
import { plantRoutes } from './routes/plants.js';

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

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await app.listen({ host: '0.0.0.0', port: config.port });
