import { z } from 'zod';
import { combineSignal, sanitizeText, type ToolContext, type ToolDef } from '../agent';

// ---------------------------------------------------------------------------
// resolve_place — Google Maps lookup.
//
// Resolves a merchant/place from free text (Places Text Search) or coordinates
// (reverse geocoding) into a canonical { placeName, placeId, formattedAddress,
// latitude, longitude }. The API key is server-only (ctx.env), never exposed
// to the browser. External text (names/addresses) is treated as untrusted data
// and sanitized before returning to the model.
// ---------------------------------------------------------------------------

const MAPS_TIMEOUT_MS = 8_000;
const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

const inputSchema = z
  .object({
    query: z.string().min(1).max(200).optional(),
    latitude: z.coerce.number().gte(-90).lte(90).optional(),
    longitude: z.coerce.number().gte(-180).lte(180).optional(),
  })
  .refine((v) => !!v.query || (v.latitude !== undefined && v.longitude !== undefined), {
    message: 'provide a query or both latitude and longitude',
  });

type Input = z.infer<typeof inputSchema>;

interface ResolvedPlace {
  placeName: string;
  placeId: string;
  formattedAddress: string;
  latitude?: number;
  longitude?: number;
}

function clean(value: unknown): string {
  return sanitizeText(value, 200);
}

async function textSearch(
  input: Input,
  apiKey: string,
  signal: AbortSignal,
): Promise<ResolvedPlace[]> {
  const body: Record<string, unknown> = { textQuery: input.query, maxResultCount: 3 };
  if (input.latitude !== undefined && input.longitude !== undefined) {
    body.locationBias = {
      circle: {
        center: { latitude: input.latitude, longitude: input.longitude },
        radius: 5000,
      },
    };
  }
  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }>;
  };
  return (data.places ?? []).slice(0, 3).map((p) => ({
    placeName: clean(p.displayName?.text ?? ''),
    placeId: clean(p.id ?? ''),
    formattedAddress: clean(p.formattedAddress ?? ''),
    latitude: p.location?.latitude,
    longitude: p.location?.longitude,
  }));
}

async function reverseGeocode(
  lat: number,
  lng: number,
  apiKey: string,
  signal: AbortSignal,
): Promise<ResolvedPlace[]> {
  const url = `${GEOCODE_URL}?latlng=${lat},${lng}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: Array<{ place_id?: string; formatted_address?: string }>;
  };
  return (data.results ?? []).slice(0, 1).map((r) => ({
    placeName: clean(r.formatted_address ?? ''),
    placeId: clean(r.place_id ?? ''),
    formattedAddress: clean(r.formatted_address ?? ''),
    latitude: lat,
    longitude: lng,
  }));
}

async function execute(args: unknown, ctx: ToolContext): Promise<unknown> {
  const input = args as Input;
  const apiKey = ctx.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { error: 'maps_unavailable' };

  const signal = combineSignal(ctx.signal, MAPS_TIMEOUT_MS);
  try {
    const places = input.query
      ? await textSearch(input, apiKey, signal)
      : await reverseGeocode(input.latitude as number, input.longitude as number, apiKey, signal);
    if (places.length === 0) return { places: [], note: 'no_match' };
    return { places };
  } catch (err) {
    console.error('resolve_place failed:', err);
    return { error: 'maps_request_failed' };
  }
}

export const resolvePlaceTool: ToolDef = {
  name: 'resolve_place',
  description:
    'Resolve a merchant or place name into a canonical place via Google Maps, or reverse-geocode GPS coordinates into a place. Returns up to 3 {placeName, placeId, formattedAddress, latitude, longitude}. Provide a query, coordinates, or both (coordinates bias a text search to nearby results).',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Merchant/place name or address text to look up.' },
      latitude: { type: 'number', description: 'Optional latitude (-90..90).' },
      longitude: { type: 'number', description: 'Optional longitude (-180..180).' },
    },
  },
  inputSchema,
  execute,
};
