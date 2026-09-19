import { Check, Download, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buildTripHtml, exportablePhotos, tripExportFilename } from '../lib/tripExport';
import { collectTripPhotos } from '../lib/tripPhotos';
import type { TripDetail } from '../types';
import { Sheet } from './Sheet';

type State =
  | { phase: 'idle' }
  | { phase: 'packing'; done: number; total: number }
  | { phase: 'saved'; name: string; bytes: number }
  | { phase: 'failed'; message: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function save(html: string, name: string): number {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // Revoking while the download is still being handed over cancels it in some
  // browsers, so let the click settle first.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return blob.size;
}

/**
 * Save the trip as one HTML file to send to someone.
 *
 * Deliberately a file rather than a link: every route in this app answers only
 * to its owner's cookie, so a shareable URL would mean public trips, tokens and
 * unauthenticated image serving. A file is the same itinerary with none of that
 * — and it stays shared with exactly the people it was sent to.
 */
export function ShareTripSheet({ trip, onClose }: { trip: TripDetail; onClose: () => void }) {
  const [withPhotos, setWithPhotos] = useState(true);
  const [withSpending, setWithSpending] = useState(true);
  const [state, setState] = useState<State>({ phase: 'idle' });

  const photoCount = useMemo(() => exportablePhotos(trip).length, [trip]);
  const packing = state.phase === 'packing';

  async function create() {
    setState({ phase: 'packing', done: 0, total: withPhotos ? photoCount : 0 });
    try {
      const photos =
        withPhotos && photoCount > 0
          ? await collectTripPhotos(trip, (progress) =>
              setState({ phase: 'packing', ...progress }),
            )
          : new Map<number, string>();
      const name = tripExportFilename(trip);
      const html = buildTripHtml(trip, { photos, includeSpending: withSpending });
      setState({ phase: 'saved', name, bytes: save(html, name) });
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
              disabled={packing || photoCount === 0}
              onChange={(e) => setWithPhotos(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-brand-600 disabled:opacity-50"
            />
            <span className="min-w-0 text-sm">
              <span className="font-medium text-ink">Include photos</span>
              <span className="block text-xs text-ink-3">
                {photoCount === 0
                  ? 'No photos on this trip yet'
                  : `${photoCount} photo${photoCount === 1 ? '' : 's'} travel inside the file, which makes it bigger`}
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 rounded-2xl border border-line px-3 py-2.5">
            <input
              type="checkbox"
              checked={withSpending}
              disabled={packing}
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
          disabled={packing}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-50"
        >
          {packing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {packing
            ? state.total > 0
              ? `Packing photos… ${state.done}/${state.total}`
              : 'Building the page…'
            : 'Save the page'}
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
