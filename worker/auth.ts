/**
 * Authentication utilities for Cloudflare Workers.
 * Uses Web Crypto API for password hashing and hono/jwt for token signing.
 */

import { sign, verify } from 'hono/jwt';
import type { JWTPayload as HonoJWTPayload } from 'hono/utils/jwt/types';

// Short-lived access JWT. Refresh handled out-of-band via the Session table
// and the refresh-token cookie (see worker/sessions.ts).
const JWT_EXPIRES_IN_MS = 60 * 60 * 1000; // 1 hour

export interface JWTPayload extends HonoJWTPayload {
  userId?: string;
  email: string;
  username: string;
  /** Session id; required for all login-issued tokens. Absent only on the
   *  set-password registration link, which never goes through authMiddleware. */
  sid?: string;
}

/**
 * Hash a password using PBKDF2-SHA256.
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey('raw', data, 'PBKDF2', false, ['deriveBits']);

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );

  const hashArray = new Uint8Array(derivedBits);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Constant-time compare a plain text password with a stored PBKDF2 hash.
 */
export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    const combined = Uint8Array.from(atob(hashedPassword), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const storedHash = combined.slice(16);

    const keyMaterial = await crypto.subtle.importKey('raw', data, 'PBKDF2', false, ['deriveBits']);

    const derivedBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      256,
    );

    const hashArray = new Uint8Array(derivedBits);
    if (hashArray.length !== storedHash.length) return false;

    // Constant-time compare: walk every byte, XOR-accumulate.
    let diff = 0;
    for (let i = 0; i < hashArray.length; i++) {
      diff |= hashArray[i] ^ storedHash[i];
    }
    return diff === 0;
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
}

/**
 * Generate a JWT (HS256) for a user, signed with the configured secret.
 */
export async function generateToken(
  payload: JWTPayload,
  jwtSecret: string,
  expiresInMs: number = JWT_EXPIRES_IN_MS,
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + Math.floor(expiresInMs / 1000);

  const fullPayload: JWTPayload = {
    ...payload,
    iat: nowSec,
    exp: expSec,
    iss: 'money-hater',
  };

  return sign(fullPayload, jwtSecret);
}

/**
 * Verify a JWT and return its payload, or null if invalid/expired.
 */
export async function verifyToken(token: string, jwtSecret: string): Promise<JWTPayload | null> {
  try {
    const payload = await verify(token, jwtSecret);
    return payload as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Extract a Bearer token from an Authorization header value.
 */
export function extractToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  if (authHeader.startsWith('Bearer ')) return authHeader.substring(7);
  return authHeader;
}

/**
 * Generate a cryptographically random hex token used for password reset.
 */
export function generateResetToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify a Cloudflare Turnstile token against the siteverify endpoint.
 */
export async function verifyTurnstile(
  token: string | undefined,
  secretKey: string,
): Promise<boolean> {
  if (!token) return false;
  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body: formData,
      method: 'POST',
    });

    const outcome = (await result.json()) as { success: boolean };
    return outcome.success === true;
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return false;
  }
}
