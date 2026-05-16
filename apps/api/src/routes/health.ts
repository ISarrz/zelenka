import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/healthz', async () => ({ status: 'ok' }));

  app.get('/api/readyz', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch (err) {
      reply.code(503);
      return { status: 'db unreachable', error: String(err) };
    }
  });
}
