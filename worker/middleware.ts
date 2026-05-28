import type { Context, Next } from 'hono';
import { extractToken, verifyToken, type JWTPayload } from './auth';
import { hashToken, isApiTokenFormat } from './tokens';
import { isSessionActive } from './sessions';
import { readAccessCookie } from './cookies';
import { getPrisma } from './db';

export interface AuthUser {
  userId: string;
  email: string;
  username: string;
  /** Which credential class served this request. */
  authKind: 'jwt' | 'api_token';
  /** Present on `jwt` auth — points at the Session row. */
  sid?: string;
  /** Present on `api_token` auth — points at the ApiToken row. */
  apiTokenId?: string;
}

export interface AuthContext {
  user: AuthUser;
}

/**
 * Try to resolve the request to a user via either an API token (Bearer
 * `mht_…` in the Authorization header) or the access JWT cookie. Returns
 * null if neither path succeeds.
 *
 * JWTs are NOT accepted from the Authorization header — that channel is
 * reserved for API tokens. This keeps the credential boundary unambiguous.
 */
async function resolveAuth(c: Context): Promise<AuthUser | null> {
  const bearer = extractToken(c.req.header('Authorization') ?? null);

  // ----- API token path -----
  if (bearer && isApiTokenFormat(bearer)) {
    const prisma = getPrisma(c);
    const hash = await hashToken(bearer);
    const row = await prisma.apiToken.findUnique({
      where: { tokenHash: hash },
      include: { user: { select: { id: true, email: true, username: true } } },
    });
    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

    // Throttle the lastUsedAt write to once per minute per token. Fire and
    // forget via waitUntil so the response doesn't wait on D1.
    const now = Date.now();
    const last = row.lastUsedAt?.getTime() ?? 0;
    if (now - last > 60_000) {
      const promise = prisma.apiToken
        .update({ where: { id: row.id }, data: { lastUsedAt: new Date(now) } })
        .then(
          () => undefined,
          (err) => console.error('lastUsedAt update failed', err),
        );
      const ctx = (c as unknown as { executionCtx?: ExecutionContext }).executionCtx;
      if (ctx?.waitUntil) ctx.waitUntil(promise);
      else void promise;
    }

    return {
      userId: row.user.id,
      email: row.user.email,
      username: row.user.username,
      authKind: 'api_token',
      apiTokenId: row.id,
    };
  }

  // ----- JWT (cookie) path -----
  const cookieToken = readAccessCookie(c);
  if (!cookieToken) return null;

  const payload = (await verifyToken(cookieToken, c.env.JWT_SECRET)) as JWTPayload | null;
  if (!payload || !payload.userId || !payload.sid) return null;

  const prisma = getPrisma(c);
  if (!(await isSessionActive(prisma, payload.sid))) return null;

  return {
    userId: payload.userId,
    email: payload.email,
    username: payload.username,
    sid: payload.sid,
    authKind: 'jwt',
  };
}

/** Accept either a JWT cookie or an API token. */
export async function authMiddleware(c: Context, next: Next) {
  const user = await resolveAuth(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('user', user);
  await next();
}

/** Restrict to login-session JWTs — API tokens cannot mint more tokens
 *  or list sessions. */
export async function jwtOnly(c: Context, next: Next) {
  const user = await resolveAuth(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (user.authKind !== 'jwt') {
    return c.json({ error: 'This endpoint requires a login session' }, 403);
  }
  c.set('user', user);
  await next();
}

/** Restrict to API tokens. Reserved for future programmatic-only endpoints. */
export async function apiTokenOnly(c: Context, next: Next) {
  const user = await resolveAuth(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (user.authKind !== 'api_token') {
    return c.json({ error: 'This endpoint requires an API token' }, 403);
  }
  c.set('user', user);
  await next();
}

/** Get authenticated user from context. Always defined after one of the
 *  auth middlewares above. */
export function getAuthUser(c: Context): AuthUser {
  return c.get('user');
}

// Exported for unit tests. Production code should always go through one of
// the middleware exports above.
export const __test = { resolveAuth };
