/**
 * Shared security constants and password policy.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 10 characters and include a letter and a number or symbol.';

/**
 * Validate a password against the application policy.
 * Returns null on success, an error message on failure.
 */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_POLICY_MESSAGE;
  if (password.length > 200) return 'Password is too long.';
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumberOrSymbol = /[0-9!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]/.test(password);
  if (!hasLetter || !hasNumberOrSymbol) return PASSWORD_POLICY_MESSAGE;
  return null;
}

// File upload limits.
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'application/pdf',
]);
export const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/**
 * Sanitize a user-provided filename for storage in R2.
 * Strips path separators, control chars, and caps length.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // Drop anything outside printable ASCII to a safe substitute, then restrict to a tight allowlist.
  const printable = Array.from(base, (ch) => (ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f ? '' : ch)).join('');
  const cleaned = printable.replace(/[^A-Za-z0-9._-]/g, '_');
  const trimmed = cleaned.slice(0, 80) || 'file';
  return trimmed;
}

// Limits for AI inputs to prevent runaway prompts.
export const MAX_DESCRIPTION_LENGTH = 500;
