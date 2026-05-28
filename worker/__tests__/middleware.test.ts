import { describe, expect, it, vi, beforeEach } from 'vitest';

// Stub `./db` BEFORE importing the middleware so the spy is in place.
vi.mock('../db', () => ({
  getPrisma: vi.fn(),
}));

import type { Context } from 'hono';
import { __test } from '../middleware';
import { generateToken } from '../auth';
import { generateApiToken, hashToken } from '../tokens';
import { getPrisma } from '../db';

const SECRET = 'test-secret-do-not-use-in-prod-9aTtq3qzZ';

interface StubPrismaShape {
  apiToken: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  session: {
    findUnique: ReturnType<typeof vi.fn>;
  };
}

function buildContext(opts: { authHeader?: string | null; accessCookie?: string | null }): Context {
  const headers = new Map<string, string>();
  if (opts.authHeader) headers.set('authorization', opts.authHeader);
  const cookie = opts.accessCookie ? `mh_at=${opts.accessCookie}` : '';
  if (cookie) headers.set('cookie', cookie);

  return {
    req: {
      header: (name: string) => headers.get(name.toLowerCase()) ?? undefined,
      raw: { headers: { get: (n: string) => headers.get(n.toLowerCase()) ?? null } },
    },
    env: { JWT_SECRET: SECRET },
    executionCtx: undefined,
  } as unknown as Context;
}

function stubPrisma(): StubPrismaShape {
  const prisma: StubPrismaShape = {
    apiToken: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
    session: {
      findUnique: vi.fn(),
    },
  };
  (getPrisma as unknown as ReturnType<typeof vi.fn>).mockReturnValue(prisma);
  return prisma;
}

describe('resolveAuth — API token path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a valid mht_ token with an active row', async () => {
    const prisma = stubPrisma();
    const plaintext = generateApiToken();
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      revokedAt: null,
      expiresAt: null,
      lastUsedAt: null,
      user: { id: 'u1', email: 'a@b.c', username: 'alice' },
    });

    const user = await __test.resolveAuth(buildContext({ authHeader: `Bearer ${plaintext}` }));

    expect(user).toMatchObject({
      userId: 'u1',
      authKind: 'api_token',
      apiTokenId: 'tok-1',
    });
    expect(prisma.apiToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: await hashToken(plaintext) },
      include: expect.any(Object),
    });
  });

  it('rejects a revoked token', async () => {
    const prisma = stubPrisma();
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      revokedAt: new Date(),
      expiresAt: null,
      lastUsedAt: null,
      user: { id: 'u1', email: 'a@b.c', username: 'alice' },
    });
    const user = await __test.resolveAuth(
      buildContext({ authHeader: `Bearer ${generateApiToken()}` }),
    );
    expect(user).toBeNull();
  });

  it('rejects an expired token', async () => {
    const prisma = stubPrisma();
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
      lastUsedAt: null,
      user: { id: 'u1', email: 'a@b.c', username: 'alice' },
    });
    const user = await __test.resolveAuth(
      buildContext({ authHeader: `Bearer ${generateApiToken()}` }),
    );
    expect(user).toBeNull();
  });

  it('rejects an unknown token', async () => {
    const prisma = stubPrisma();
    prisma.apiToken.findUnique.mockResolvedValue(null);
    const user = await __test.resolveAuth(
      buildContext({ authHeader: `Bearer ${generateApiToken()}` }),
    );
    expect(user).toBeNull();
  });
});

describe('resolveAuth — JWT cookie path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a valid JWT with an active session', async () => {
    const prisma = stubPrisma();
    prisma.session.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const jwt = await generateToken(
      { userId: 'u1', email: 'a@b.c', username: 'alice', sid: 'sess-1' },
      SECRET,
    );
    const user = await __test.resolveAuth(buildContext({ accessCookie: jwt }));
    expect(user).toMatchObject({
      userId: 'u1',
      authKind: 'jwt',
      sid: 'sess-1',
    });
  });

  it('rejects a JWT whose session is revoked', async () => {
    const prisma = stubPrisma();
    prisma.session.findUnique.mockResolvedValue({
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const jwt = await generateToken(
      { userId: 'u1', email: 'a@b.c', username: 'alice', sid: 'sess-1' },
      SECRET,
    );
    const user = await __test.resolveAuth(buildContext({ accessCookie: jwt }));
    expect(user).toBeNull();
  });

  it('rejects a JWT without a sid claim', async () => {
    stubPrisma();
    const jwt = await generateToken({ userId: 'u1', email: 'a@b.c', username: 'alice' }, SECRET);
    const user = await __test.resolveAuth(buildContext({ accessCookie: jwt }));
    expect(user).toBeNull();
  });

  it('ignores a JWT placed in the Authorization header (not mht_)', async () => {
    stubPrisma();
    const jwt = await generateToken(
      { userId: 'u1', email: 'a@b.c', username: 'alice', sid: 'sess-1' },
      SECRET,
    );
    const user = await __test.resolveAuth(buildContext({ authHeader: `Bearer ${jwt}` }));
    expect(user).toBeNull();
  });

  it('returns null when no credential is presented', async () => {
    stubPrisma();
    const user = await __test.resolveAuth(buildContext({}));
    expect(user).toBeNull();
  });
});
