import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIX_TIMEOUT_MS,
  canAskForLocation,
  clearFix,
  currentFix,
  fixParams,
  locationPermission,
} from './location';

const BKK = { coords: { latitude: 13.7563, longitude: 100.5018 } };

/** A geolocation that answers however the test says. */
function stubGeolocation(
  answer: (ok: (p: unknown) => void, fail: (e: unknown) => void) => void,
  { secure = true } = {},
) {
  const getCurrentPosition = vi.fn((ok, fail) => answer(ok, fail));
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  vi.stubGlobal('window', { isSecureContext: secure });
  return getCurrentPosition;
}

beforeEach(() => {
  clearFix();
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fixParams', () => {
  it('is empty when there is nothing to send', () => {
    expect(fixParams(null)).toBe('');
    expect(fixParams(undefined)).toBe('');
  });

  it('appends a coordinate pair to an existing query string', () => {
    expect(fixParams({ lat: 13.7563, lng: 100.5018 })).toBe('&lat=13.756300&lng=100.501800');
  });
});

describe('canAskForLocation', () => {
  it('says no over plain http, where the call never comes back', () => {
    stubGeolocation((ok) => ok(BKK), { secure: false });
    expect(canAskForLocation()).toBe(false);
  });

  it('says no in a browser without geolocation', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { isSecureContext: true });
    expect(canAskForLocation()).toBe(false);
  });
});

describe('currentFix', () => {
  it('reads the browser position', async () => {
    stubGeolocation((ok) => ok(BKK));
    expect(await currentFix()).toEqual({ lat: 13.7563, lng: 100.5018 });
  });

  it('asks the phone once for a batch of photos', async () => {
    const asked = stubGeolocation((ok) => ok(BKK));
    await currentFix();
    await currentFix();
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('shares one request between callers that arrive together', async () => {
    const asked = stubGeolocation((ok) => setTimeout(() => ok(BKK), 10));
    const [first, second] = await Promise.all([currentFix(), currentFix()]);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('gives up rather than failing the upload', async () => {
    stubGeolocation((_ok, fail) => fail({ code: 1, message: 'denied' }));
    expect(await currentFix()).toBeNull();
  });

  it('stops waiting on a prompt that is never answered', async () => {
    // Neither callback fires: the user dismissed the dialog without deciding,
    // which leaves getCurrentPosition's own timeout unstarted for good.
    vi.useFakeTimers();
    stubGeolocation(() => undefined);
    const pending = currentFix();
    await vi.advanceTimersByTimeAsync(FIX_TIMEOUT_MS + 1);
    expect(await pending).toBeNull();
  });

  it('answers null where it cannot ask at all', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { isSecureContext: true });
    expect(await currentFix()).toBeNull();
  });
});

describe('locationPermission', () => {
  it('reports what the browser already decided', async () => {
    stubGeolocation((ok) => ok(BKK));
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: vi.fn() },
      permissions: { query: async () => ({ state: 'granted' as const }) },
    });
    expect(await locationPermission()).toBe('granted');
  });

  it('falls back to what the user last told us where the API says nothing', async () => {
    // Safari has no geolocation entry in the Permissions API, so a yes there
    // has to be remembered by us or the offer reappears on every visit.
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: vi.fn() },
      permissions: {
        query: () => {
          throw new TypeError('unsupported permission name');
        },
      },
    });
    vi.stubGlobal('window', { isSecureContext: true });
    vi.stubGlobal('localStorage', { getItem: () => 'yes', setItem: () => undefined });
    expect(await locationPermission()).toBe('granted');
  });

  it('does not ask on an origin that cannot have it', async () => {
    stubGeolocation((ok) => ok(BKK), { secure: false });
    expect(await locationPermission()).toBe('denied');
  });
});
