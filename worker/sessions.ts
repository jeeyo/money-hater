/**
 * Login session bookkeeping. Each row holds a hashed opaque refresh token;
 * the access JWT carries the row id as the `sid` claim so the middleware
 * can revoke a single session by setting `revokedAt`.
 *
 * Refresh tokens use a 30-day sliding window: each rotation rewrites the
 * hash, bumps `lastSeenAt`, and pushes `expiresAt` 30 days into the future.
 * Active users effectively never log out; idle (>30d) sessions die.
 */

import type { PrismaClient } from '@prisma/client';
import { generateRefreshToken, hashToken } from './tokens';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const GC_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // keep dead rows for a week for forensics

export interface CreatedSession {
  sessionId: string;
  refreshToken: string;
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
  meta: { userAgent?: string; name?: string } = {},
): Promise<CreatedSession> {
  const refreshToken = generateRefreshToken();
  const row = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: await hashToken(refreshToken),
      userAgent: meta.userAgent ?? null,
      name: meta.name ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { sessionId: row.id, refreshToken };
}

export interface RotatedSession {
  sessionId: string;
  userId: string;
  refreshToken: string;
}

/**
 * Verify a presented refresh token, rotate it (rolling), and return the
 * new plaintext. Returns null for unknown, revoked, or expired sessions —
 * the caller should treat all three as "log the user out".
 */
export async function rotateRefreshToken(
  prisma: PrismaClient,
  presentedRefreshToken: string,
): Promise<RotatedSession | null> {
  const hash = await hashToken(presentedRefreshToken);
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: hash } });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;

  const next = generateRefreshToken();
  const nextHash = await hashToken(next);
  const now = new Date();

  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: nextHash,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    },
  });

  return { sessionId: session.id, userId: session.userId, refreshToken: next };
}

export async function revokeSession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * One indexed PK lookup. Called on every JWT-authenticated request, so the
 * select projection is minimal.
 */
export async function isSessionActive(prisma: PrismaClient, sessionId: string): Promise<boolean> {
  const row = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { revokedAt: true, expiresAt: true },
  });
  if (!row) return false;
  if (row.revokedAt) return false;
  return row.expiresAt.getTime() >= Date.now();
}

/**
 * Delete expired or long-revoked sessions. Called from the daily cron.
 */
export async function gcSessions(prisma: PrismaClient): Promise<{ removed: number }> {
  const cutoff = new Date(Date.now() - GC_GRACE_MS);
  const expired = await prisma.session.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
    },
  });
  return { removed: expired.count };
}
