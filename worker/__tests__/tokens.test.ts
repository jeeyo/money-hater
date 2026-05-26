import { describe, expect, it } from 'vitest';
import {
  API_TOKEN_PREFIX,
  apiTokenPrefix,
  generateApiToken,
  generateRefreshToken,
  hashToken,
  isApiTokenFormat,
} from '../tokens';

describe('generateApiToken', () => {
  it('produces an mht_-prefixed 64-char hex body (68 total)', () => {
    const t = generateApiToken();
    expect(t).toMatch(/^mht_[0-9a-f]{64}$/);
    expect(t.length).toBe(68);
  });

  it('is unique across calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateApiToken());
    expect(seen.size).toBe(50);
  });
});

describe('generateRefreshToken', () => {
  it('is 64 lowercase hex characters', () => {
    expect(generateRefreshToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is unique across calls', () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken());
  });
});

describe('hashToken', () => {
  it('matches the published SHA-256 vector for "abc"', async () => {
    expect(await hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('produces 64 hex chars for arbitrary input', async () => {
    expect(await hashToken('mht_abcdef')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const a = await hashToken('some-string');
    const b = await hashToken('some-string');
    expect(a).toBe(b);
  });
});

describe('isApiTokenFormat', () => {
  it('accepts mht_-prefixed tokens', () => {
    expect(isApiTokenFormat(`${API_TOKEN_PREFIX}deadbeef`)).toBe(true);
  });

  it('rejects JWT-shaped tokens', () => {
    expect(isApiTokenFormat('eyJhbGciOiJIUzI1NiJ9.eyJ1IjoxfQ.sig')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isApiTokenFormat('')).toBe(false);
  });
});

describe('apiTokenPrefix', () => {
  it('returns 12 chars: "mht_" + 8 hex', () => {
    const t = generateApiToken();
    const prefix = apiTokenPrefix(t);
    expect(prefix.length).toBe(12);
    expect(prefix).toMatch(/^mht_[0-9a-f]{8}$/);
    expect(t.startsWith(prefix)).toBe(true);
  });
});
