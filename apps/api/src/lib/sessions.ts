import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config, isProd } from '../config.js';
import { prisma } from '../db.js';

const COOKIE_NAME = 'zelenka_session';

export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/',
};

export function newToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export async function createSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = newToken();
  const expiresAt = new Date(
    Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000,
  );
  await prisma.session.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(COOKIE_NAME, token, {
    ...SESSION_COOKIE_OPTS,
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, SESSION_COOKIE_OPTS);
}

export async function readSession(req: FastifyRequest) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) return null;
  return session;
}
