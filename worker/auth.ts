/**
 * Authentication utilities for Cloudflare Workers
 * Uses Web Crypto API for password hashing and JWT signing
 */

// JWT expiration time
const JWT_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export interface JWTPayload {
  userId?: string;
  email: string;
  username: string;
  exp?: number;
}

/**
 * Hash a password using Web Crypto API (PBKDF2)
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    data,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashArray = new Uint8Array(derivedBits);

  // Combine salt and hash
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);

  // Convert to base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Compare a plain text password with a hashed password
 */
export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    // Decode the stored hash
    const combined = Uint8Array.from(atob(hashedPassword), c => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const storedHash = combined.slice(16);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      data,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const hashArray = new Uint8Array(derivedBits);

    // Compare hashes
    if (hashArray.length !== storedHash.length) return false;

    let match = true;
    for (let i = 0; i < hashArray.length; i++) {
      if (hashArray[i] !== storedHash[i]) match = false;
    }

    return match;
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
}

/**
 * Generate a JWT token for a user
 */
export async function generateToken(payload: JWTPayload, jwtSecret: string, expiresIn: number = JWT_EXPIRES_IN): Promise<string> {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Date.now();
  const exp = now + expiresIn;

  const tokenPayload = {
    ...payload,
    iat: Math.floor(now / 1000),
    exp: Math.floor(exp / 1000)
  };

  const encoder = new TextEncoder();

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));

  const message = `${encodedHeader}.${encodedPayload}`;

  // Sign the message
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  );

  const encodedSignature = base64UrlEncode(signature);

  return `${message}.${encodedSignature}`;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token: string, jwtSecret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const message = `${encodedHeader}.${encodedPayload}`;

    const encoder = new TextEncoder();

    // Verify signature
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = base64UrlDecode(encodedSignature);

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(message)
    );

    if (!isValid) return null;

    // Decode payload
    const payload = JSON.parse(base64UrlDecodeString(encodedPayload)) as JWTPayload;

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  // Support both "Bearer <token>" and just "<token>"
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return authHeader;
}

// Helper functions for base64url encoding/decoding
function base64UrlEncode(data: string | ArrayBuffer): string {
  let base64: string;

  if (typeof data === 'string') {
    base64 = btoa(data);
  } else {
    const bytes = new Uint8Array(data);
    base64 = btoa(String.fromCharCode(...bytes));
  }

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(data: string): ArrayBuffer {
  // Add padding
  let base64 = data
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  while (base64.length % 4) {
    base64 += '=';
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function base64UrlDecodeString(data: string): string {
  // Add padding
  let base64 = data
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  while (base64.length % 4) {
    base64 += '=';
  }

  return atob(base64);
}

/**
 * Generate a random reset token
 */
export function generateResetToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify Cloudflare Turnstile token
 */
export async function verifyTurnstile(token: string, secretKey: string): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body: formData,
      method: 'POST',
    });

    const outcome = await result.json() as any;
    return outcome.success;
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return false;
  }
}
