import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { sendMagicLink } from '../lib/mail.js';
import {
  clearSessionCookie,
  createSession,
  newToken,
  readSession,
  setSessionCookie,
} from '../lib/sessions.js';

const RequestBody = z.object({ email: z.string().email() });
const ConsumeBody = z.object({ token: z.string().min(8) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/magic-link/request', async (req, reply) => {
    const parsed = RequestBody.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid email' };
    }
    const email = parsed.data.email.toLowerCase();

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email },
    });

    const token = newToken(24);
    const expiresAt = new Date(Date.now() + config.magicLinkTtlMin * 60 * 1000);
    await prisma.magicLinkToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    const url = `${config.webBaseUrl}/auth/consume?token=${encodeURIComponent(token)}`;
    await sendMagicLink(email, url);

    return { status: 'sent' };
  });

  app.post('/api/auth/magic-link/consume', async (req, reply) => {
    const parsed = ConsumeBody.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid token' };
    }

    const link = await prisma.magicLinkToken.findUnique({
      where: { token: parsed.data.token },
      include: { user: true },
    });
    if (!link || link.consumedAt || link.expiresAt < new Date()) {
      reply.code(400);
      return { error: 'token expired or already used' };
    }

    await prisma.magicLinkToken.update({
      where: { id: link.id },
      data: { consumedAt: new Date() },
    });

    const { token, expiresAt } = await createSession(link.userId);
    setSessionCookie(reply, token, expiresAt);

    return { user: { id: link.user.id, email: link.user.email } };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const session = await readSession(req);
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    clearSessionCookie(reply);
    return { status: 'ok' };
  });

  app.get('/api/me', async (req, reply) => {
    const session = await readSession(req);
    if (!session) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    return { user: { id: session.user.id, email: session.user.email } };
  });
}
