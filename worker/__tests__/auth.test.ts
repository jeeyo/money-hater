import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  extractToken,
  generateResetToken,
} from '../auth';

const TEST_SECRET = 'test-secret-do-not-use-in-prod-9aTtq3qzZ';

describe('hashPassword + comparePassword', () => {
  it('round-trips a correct password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(await comparePassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await comparePassword('wrong', hash)).toBe(false);
  });

  it('returns false on a malformed hash without throwing', async () => {
    expect(await comparePassword('pw', 'not-base64!')).toBe(false);
  });

  it('produces a different hash for the same input each time (random salt)', async () => {
    const a = await hashPassword('pw1234567890');
    const b = await hashPassword('pw1234567890');
    expect(a).not.toBe(b);
    expect(await comparePassword('pw1234567890', a)).toBe(true);
    expect(await comparePassword('pw1234567890', b)).toBe(true);
  });
});

describe('generateToken + verifyToken', () => {
  it('round-trips the payload', async () => {
    const token = await generateToken({ userId: 'u1', email: 'a@b.c', username: 'a' }, TEST_SECRET);
    const payload = await verifyToken(token, TEST_SECRET);
    expect(payload).toMatchObject({ userId: 'u1', email: 'a@b.c', username: 'a' });
    expect(payload?.iss).toBe('money-hater');
    expect(typeof payload?.exp).toBe('number');
    expect(typeof payload?.iat).toBe('number');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = await generateToken({ userId: 'u1', email: 'a@b.c', username: 'a' }, TEST_SECRET);
    expect(await verifyToken(token, 'different-secret')).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await generateToken({ userId: 'u1', email: 'a@b.c', username: 'a' }, TEST_SECRET);
    const [h, , s] = token.split('.');
    const tamperedPayload = btoa(JSON.stringify({ userId: 'attacker', email: 'x', username: 'x' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const tampered = `${h}.${tamperedPayload}.${s}`;
    expect(await verifyToken(tampered, TEST_SECRET)).toBeNull();
  });

  it('rejects an expired token', async () => {
    // 1 ms in the past.
    const token = await generateToken(
      { userId: 'u1', email: 'a@b.c', username: 'a' },
      TEST_SECRET,
      -1,
    );
    expect(await verifyToken(token, TEST_SECRET)).toBeNull();
  });
});

describe('extractToken', () => {
  it('strips the Bearer prefix', () => {
    expect(extractToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns the raw value when there is no prefix', () => {
    expect(extractToken('abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns null on missing header', () => {
    expect(extractToken(null)).toBeNull();
  });
});

describe('generateResetToken', () => {
  it('produces 64 lowercase hex characters', () => {
    const t = generateResetToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique tokens', () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a).not.toBe(b);
  });
});
