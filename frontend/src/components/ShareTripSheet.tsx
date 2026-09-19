import { Check, Download, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import { downloadFilename, formatBytes, saveBlob } from '../lib/files';
import { tzOffsetMinutes } from '../lib/format';
import type { TripDetail } from '../types';
import { Sheet } from './Sheet';

type State =
  | { phase: 'idle' }
  | { phase: 'building' }
  | { phase: 'saved'; name: string; bytes: number }
  | { phase: 'failed'; message: string };

/** Every photo the exported page would show. */
function photoCount(trip: TripDetail): number {
  return trip.days.reduce(
    (total, day) =>
      total + day.visits.reduce((n, visit) => n + visit.images.filter((i) => i.thumb_url).length, 0),
    0,
  );
}

/**
 * Save the trip as one HTML file to send to someone.
 *
 * Deliberately a file rather than a link: every route in this app answers only
 * to its owner's cookie, so a shareable URL would mean public trips, tokens and
 * unauthenticated image serving. A file is the same itinerary with none of that
 * — and it stays shared with exactly the people it was sent to.
 *
 * The page itself is built by the server, which has the photographs on disk and
 * keeps the finished file until the trip changes. A trip exported twice is
 * therefore a download and nothing more.
 */
export function ShareTripSheet({ trip, onClose }: { trip: TripDetail; onClose: () => void }) {
  const [withPhotos, setWithPhotos] = useState(true);
  const [withSpending, setWithSpending] = useState(true);
  const [state, setState] = useState<State>({ phase: 'idle' });

  const photos = useMemo(() => photoCount(trip), [trip]);
  const building = state.phase === 'building';

  async function create() {
    setState({ phase: 'building' });
    try {
      const query = new URLSearchParams({
        photos: String(withPhotos),
        spending: String(withSpending),
        tz_offset_minutes: String(tzOffsetMinutes()),
      });
      const response = await apiFetch(`/api/trips/${trip.id}/export.html?${query}`);
      const blob = await response.blob();
      const name = downloadFilename(response.headers.get('content-disposition')) ?? 'trip.html';
      saveBlob(blob, name);
      setState({ phase: 'saved', name, bytes: blob.size });
    } catch (error) {
      setState({ phase: 'failed', message: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  return (
    <Sheet title="Share this trip" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-3">
          Saves “{trip.title}” as a single web page — the map, the days and the stops, in one
          file you can send to anyone. It opens in any browser; no account needed.
        </p>

        <div className="space-y-2">
          <label className="flex items-start gap-2.5 rounded-2xl border border-line px-3 py-2.5">
            <input
              type="checkbox"
              checked={withPhotos}
              disabled={building || photos === 0}
              onChange={(e) => setWithPhotos(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-brand-600 disabled:opacity-50"
            />
            <span className="min-w-0 text-sm">
              <span className="font-medium text-ink">Include photos</span>
              <span className="block text-xs text-ink-3">
                {photos === 0
                  ? 'No photos on this trip yet'
                  : `${photos} photo${photos === 1 ? '' : 's'} travel inside the file, which makes it bigger`}
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 rounded-2xl border border-line px-3 py-2.5">
            <input
              type="checkbox"
              checked={withSpending}
              disabled={building}
              onChange={(e) => setWithSpending(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-brand-600 disabled:opacity-50"
            />
            <span className="min-w-0 text-sm">
              <span className="font-medium text-ink">Include what you spent</span>
              <span className="block text-xs text-ink-3">
                Totals and the individual expenses. Off, the page is the itinerary alone.
              </span>
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={create}
          disabled={building}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-50"
        >
          {building ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {building ? 'Building the page…' : 'Save the page'}
        </button>

        {state.phase === 'saved' && (
          <p className="flex items-start gap-1.5 rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
            <Check className="mt-0.5 size-4 shrink-0" />
            <span>
              Saved <span className="font-medium">{state.name}</span> ·{' '}
              {formatBytes(state.bytes)}. Send it however you like — the map needs the
              recipient to be online, the rest works offline.
            </span>
          </p>
        )}

        {state.phase === 'failed' && (
          <p className="rounded-xl bg-danger-bg px-3 py-2.5 text-sm text-danger">
            The page could not be built: {state.message}
          </p>
        )}

        <p className="text-xs text-ink-4">
          Anyone with the file sees the places, times and photos it contains — and the exact
          coordinates behind the map.
        </p>
      </div>
    </Sheet>
  );
}
