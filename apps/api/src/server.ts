import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { config, isProd } from './config.js';
import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { healthRoutes } from './routes/health.js';
import { measurementRoutes } from './routes/measurements.js';

const app = Fastify({
  logger: { level: isProd ? 'info' : 'debug' },
  trustProxy: true,
});

await app.register(cors, {
  origin: config.webBaseUrl,
  credentials: true,
});
await app.register(cookie);

await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(deviceRoutes);
await app.register(measurementRoutes);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await app.listen({ host: '0.0.0.0', port: config.port });
