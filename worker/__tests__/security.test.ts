import { describe, expect, it } from 'vitest';
import {
  sanitizeFilename,
  validatePassword,
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
} from '../security';

describe('validatePassword', () => {
  it('accepts a strong password', () => {
    expect(validatePassword('Hunter2-pass!')).toBeNull();
    expect(validatePassword('abcdefghi9')).toBeNull();
  });

  it('rejects too-short passwords', () => {
    expect(validatePassword('short1!')).not.toBeNull();
  });

  it('rejects letter-only or symbol-only passwords', () => {
    expect(validatePassword('abcdefghijk')).not.toBeNull();
    expect(validatePassword('!!!!!!!!!!!!')).not.toBeNull();
  });

  it('rejects non-string input', () => {
    expect(validatePassword(null)).toBe('Password is required.');
    expect(validatePassword(undefined)).toBe('Password is required.');
    expect(validatePassword(12345 as unknown as string)).toBe('Password is required.');
  });

  it('rejects extremely long passwords', () => {
    expect(validatePassword('a1' + 'x'.repeat(500))).not.toBeNull();
  });
});

describe('sanitizeFilename', () => {
  it('strips path separators', () => {
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('..');
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('/');
    expect(sanitizeFilename('a\\b/c.png')).toBe('c.png');
  });

  it('replaces unsafe characters with underscores', () => {
    expect(sanitizeFilename('hello world.png')).toBe('hello_world.png');
    expect(sanitizeFilename('café.png')).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('collapses control characters', () => {
    expect(sanitizeFilename('a\x00b\x1fc.png')).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('caps length to 80 characters', () => {
    const long = 'a'.repeat(500) + '.png';
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(80);
  });

  it('falls back to "file" for empty input', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('!!!')).not.toBe('');
  });
});

describe('upload constants', () => {
  it('caps uploads to a sensible size', () => {
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(0);
    expect(MAX_UPLOAD_BYTES).toBeLessThan(50 * 1024 * 1024);
  });

  it('allowlist excludes anything outside images and pdf', () => {
    expect(ALLOWED_UPLOAD_MIME_TYPES.has('image/png')).toBe(true);
    expect(ALLOWED_UPLOAD_MIME_TYPES.has('application/pdf')).toBe(true);
    expect(ALLOWED_UPLOAD_MIME_TYPES.has('text/html')).toBe(false);
    expect(ALLOWED_UPLOAD_MIME_TYPES.has('application/octet-stream')).toBe(false);
  });
});
