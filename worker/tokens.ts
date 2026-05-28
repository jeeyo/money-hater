/**
 * Token helpers shared by API tokens and refresh tokens. API tokens carry
 * the `mht_` prefix so the auth middleware can route them through the API
 * token path without trying JWT verification first.
 */

export const API_TOKEN_PREFIX = 'mht_';
const API_TOKEN_BODY_BYTES = 32; // 64 hex chars
const REFRESH_TOKEN_BYTES = 32;
const DISPLAY_PREFIX_LEN = API_TOKEN_PREFIX.length + 8; // "mht_" + 4 random bytes

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateApiToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(API_TOKEN_BODY_BYTES));
  return `${API_TOKEN_PREFIX}${toHex(bytes)}`;
}

export function generateRefreshToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REFRESH_TOKEN_BYTES));
  return toHex(bytes);
}

/**
 * SHA-256 hex of a token. Used to store tokens at rest without ever keeping
 * the plaintext server-side, and to look them up on incoming requests.
 */
export async function hashToken(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(buf));
}

export function isApiTokenFormat(token: string): boolean {
  return token.startsWith(API_TOKEN_PREFIX);
}

/**
 * Short display prefix for the UI list. Not unique by construction (4 random
 * bytes ≈ 4 B combinations); fine for human identification, never use as a
 * lookup key.
 */
export function apiTokenPrefix(token: string): string {
  return token.slice(0, DISPLAY_PREFIX_LEN);
}
