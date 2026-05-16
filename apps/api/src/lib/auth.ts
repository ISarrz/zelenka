import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { readSession } from './sessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    deviceId?: string;
  }
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const session = await readSession(req);
  if (!session) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  req.userId = session.userId;
}

export async function requireDevice(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'missing device token' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const device = await prisma.device.findUnique({ where: { deviceToken: token } });
  if (!device) {
    reply.code(401).send({ error: 'invalid device token' });
    return;
  }
  req.deviceId = device.id;
}
