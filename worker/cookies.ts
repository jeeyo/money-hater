/**
 * Auth cookies. The access JWT and refresh token both live in HttpOnly
 * cookies so JavaScript can't read them. SameSite=Strict + the existing
 * CORS allow-list is the CSRF defense (same-origin SPA in prod).
 */

import type { Context } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';

export const ACCESS_COOKIE = 'mh_at';
export const REFRESH_COOKIE = 'mh_rt';
export const ACCESS_PATH = '/api'; // never sent to the static SPA shell
export const REFRESH_PATH = '/api/auth'; // refresh + logout + logout-everywhere

const ACCESS_MAX_AGE = 60 * 60; // 1 hour
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function isSecure(c: Context): boolean {
  return new URL(c.req.url).protocol === 'https:';
}

export function setAuthCookies(c: Context, accessJwt: string, refreshToken: string): void {
  const secure = isSecure(c);
  setCookie(c, ACCESS_COOKIE, accessJwt, {
    httpOnly: true,
    secure,
    sameSite: 'Strict',
    path: ACCESS_PATH,
    maxAge: ACCESS_MAX_AGE,
  });
  setCookie(c, REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'Strict',
    path: REFRESH_PATH,
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearAuthCookies(c: Context): void {
  deleteCookie(c, ACCESS_COOKIE, { path: ACCESS_PATH });
  deleteCookie(c, REFRESH_COOKIE, { path: REFRESH_PATH });
}

export function readAccessCookie(c: Context): string | null {
  return getCookie(c, ACCESS_COOKIE) ?? null;
}

export function readRefreshCookie(c: Context): string | null {
  return getCookie(c, REFRESH_COOKIE) ?? null;
}
