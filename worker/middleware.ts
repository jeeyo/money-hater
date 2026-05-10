import type { Context, Next } from 'hono';
import { extractToken, verifyToken, type JWTPayload } from './auth';

export interface AuthContext {
  user: JWTPayload;
}

/**
 * Middleware to authenticate requests using JWT.
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  const token = extractToken(authHeader ?? null);

  if (!token) {
    return c.json({ error: 'Unauthorized - No token provided' }, 401);
  }

  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload || !payload.userId) {
    return c.json({ error: 'Unauthorized - Invalid or expired token' }, 401);
  }

  c.set('user', payload);
  await next();
}

/**
 * Get authenticated user from context. Always has a userId after authMiddleware.
 */
export function getAuthUser(c: Context): JWTPayload & { userId: string } {
  return c.get('user');
}
