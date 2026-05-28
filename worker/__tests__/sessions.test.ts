import { describe, expect, it, vi } from 'vitest';
import {
  createSession,
  isSessionActive,
  rotateRefreshToken,
  revokeSession,
  revokeAllSessions,
  gcSessions,
} from '../sessions';
import { hashToken } from '../tokens';
import type { PrismaClient } from '@prisma/client';

/** Build a stub Prisma client exposing only the session methods used. */
function buildPrisma(
  row?: Partial<{
    id: string;
    userId: string;
    refreshTokenHash: string;
    revokedAt: Date | null;
    expiresAt: Date;
    lastSeenAt: Date;
  }>,
) {
  const session = {
    create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'sess-1',
      userId: 'u1',
      ...data,
    })),
    findUnique: vi.fn().mockResolvedValue(
      row
        ? {
            id: row.id ?? 'sess-1',
            userId: row.userId ?? 'u1',
            refreshTokenHash: row.refreshTokenHash ?? 'hash',
            revokedAt: row.revokedAt ?? null,
            expiresAt: row.expiresAt ?? new Date(Date.now() + 86_400_000),
            lastSeenAt: row.lastSeenAt ?? new Date(),
          }
        : null,
    ),
    update: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
  };
  return { session } as unknown as PrismaClient;
}

describe('createSession', () => {
  it('writes a row with a 30-day expiry and returns the plaintext token', async () => {
    const prisma = buildPrisma();
    const result = await createSession(prisma, 'u1', { userAgent: 'curl/8' });
    expect(result.sessionId).toBe('sess-1');
    expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    const createCall = (prisma.session.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.userId).toBe('u1');
    expect(createCall.data.userAgent).toBe('curl/8');
    expect(createCall.data.refreshTokenHash).toBe(await hashToken(result.refreshToken));
    const expiresMs = (createCall.data.expiresAt as Date).getTime();
    const expectedMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresMs - expectedMs)).toBeLessThan(5_000);
  });
});

describe('rotateRefreshToken', () => {
  it('returns null when no matching session exists', async () => {
    const prisma = buildPrisma();
    expect(await rotateRefreshToken(prisma, 'anything')).toBeNull();
  });

  it('returns null when the session is revoked', async () => {
    const token = 'abc';
    const prisma = buildPrisma({
      refreshTokenHash: await hashToken(token),
      revokedAt: new Date(),
    });
    expect(await rotateRefreshToken(prisma, token)).toBeNull();
  });

  it('returns null when the session has expired', async () => {
    const token = 'abc';
    const prisma = buildPrisma({
      refreshTokenHash: await hashToken(token),
      expiresAt: new Date(Date.now() - 1_000),
    });
    expect(await rotateRefreshToken(prisma, token)).toBeNull();
  });

  it('rotates the hash and returns a new plaintext', async () => {
    const token = 'old-refresh';
    const prisma = buildPrisma({ refreshTokenHash: await hashToken(token) });
    const result = await rotateRefreshToken(prisma, token);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe('u1');
    expect(result?.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result?.refreshToken).not.toBe(token);
    const updateCall = (prisma.session.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.refreshTokenHash).toBe(await hashToken(result!.refreshToken));
  });
});

describe('revokeSession + revokeAllSessions', () => {
  it('revokeSession sets revokedAt when not already revoked', async () => {
    const prisma = buildPrisma();
    await revokeSession(prisma, 'sess-1');
    const args = (prisma.session.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.where).toEqual({ id: 'sess-1', revokedAt: null });
    expect(args.data.revokedAt).toBeInstanceOf(Date);
  });

  it('revokeAllSessions scopes by user', async () => {
    const prisma = buildPrisma();
    await revokeAllSessions(prisma, 'u1');
    const args = (prisma.session.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'u1', revokedAt: null });
  });
});

describe('isSessionActive', () => {
  it('returns false when no row', async () => {
    const prisma = buildPrisma();
    expect(await isSessionActive(prisma, 'sess-x')).toBe(false);
  });

  it('returns false when revoked', async () => {
    const prisma = buildPrisma({ revokedAt: new Date() });
    expect(await isSessionActive(prisma, 'sess-1')).toBe(false);
  });

  it('returns false when expired', async () => {
    const prisma = buildPrisma({ expiresAt: new Date(Date.now() - 1) });
    expect(await isSessionActive(prisma, 'sess-1')).toBe(false);
  });

  it('returns true for an active, unexpired session', async () => {
    const prisma = buildPrisma({ expiresAt: new Date(Date.now() + 60_000) });
    expect(await isSessionActive(prisma, 'sess-1')).toBe(true);
  });
});

describe('gcSessions', () => {
  it('issues a deleteMany against expired or long-revoked rows', async () => {
    const prisma = buildPrisma();
    const res = await gcSessions(prisma);
    expect(res.removed).toBe(3);
    const args = (prisma.session.deleteMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.where.OR).toHaveLength(2);
  });
});
