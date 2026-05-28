import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePlaceTool } from '../tools/maps';
import type { ToolContext } from '../agent';

function ctxWithKey(key?: string): ToolContext {
  return { userId: 'u1', prisma: {} as never, env: { GOOGLE_MAPS_API_KEY: key } };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

afterEach(() => vi.restoreAllMocks());

describe('resolve_place input schema', () => {
  it('requires a query or coordinates', () => {
    expect(resolvePlaceTool.inputSchema.safeParse({}).success).toBe(false);
    expect(resolvePlaceTool.inputSchema.safeParse({ query: 'cafe' }).success).toBe(true);
    expect(resolvePlaceTool.inputSchema.safeParse({ latitude: 1, longitude: 2 }).success).toBe(
      true,
    );
  });

  it('rejects out-of-range coordinates', () => {
    expect(resolvePlaceTool.inputSchema.safeParse({ latitude: 200, longitude: 0 }).success).toBe(
      false,
    );
  });
});

describe('resolve_place execute', () => {
  it('returns maps_unavailable without an API key', async () => {
    const res = await resolvePlaceTool.execute({ query: 'cafe' }, ctxWithKey(undefined));
    expect(res).toEqual({ error: 'maps_unavailable' });
  });

  it('performs a text search and normalizes the result', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        places: [
          {
            id: 'place-123',
            displayName: { text: 'Blue Bottle Coffee' },
            formattedAddress: '1 Main St',
            location: { latitude: 13.7, longitude: 100.5 },
          },
        ],
      }),
    );
    const res = (await resolvePlaceTool.execute({ query: 'blue bottle' }, ctxWithKey('key'))) as {
      places: Array<Record<string, unknown>>;
    };
    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('places.googleapis.com');
    expect((init as RequestInit).method).toBe('POST');
    expect((init!.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('key');
    expect(JSON.parse((init as RequestInit).body as string).textQuery).toBe('blue bottle');
    expect(res.places[0]).toMatchObject({
      placeName: 'Blue Bottle Coffee',
      placeId: 'place-123',
      latitude: 13.7,
      longitude: 100.5,
    });
  });

  it('reverse-geocodes when only coordinates are given', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        results: [{ place_id: 'p9', formatted_address: '50 Sukhumvit Rd' }],
      }),
    );
    const res = (await resolvePlaceTool.execute(
      { latitude: 13.7, longitude: 100.5 },
      ctxWithKey('key'),
    )) as { places: Array<Record<string, unknown>> };
    expect(String(spy.mock.calls[0][0])).toContain('latlng=13.7,100.5');
    expect(res.places[0]).toMatchObject({ placeId: 'p9', formattedAddress: '50 Sukhumvit Rd' });
  });

  it('returns no_match when the API yields nothing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ places: [] }));
    const res = await resolvePlaceTool.execute({ query: 'nowhere' }, ctxWithKey('key'));
    expect(res).toEqual({ places: [], note: 'no_match' });
  });

  it('returns an error object when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const res = await resolvePlaceTool.execute({ query: 'x' }, ctxWithKey('key'));
    expect(res).toEqual({ error: 'maps_request_failed' });
  });
});
