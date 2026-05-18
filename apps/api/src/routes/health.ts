import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // /api/healthz is hit by the captive-portal "done" page (served from
  // http://192.168.4.1) to detect when the phone is back on the internet,
  // so it needs an open CORS policy that overrides the app-wide restriction
  // to webBaseUrl. The endpoint reveals nothing sensitive.
  app.get('/api/healthz', async (_req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    return { status: 'ok' };
  });

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
