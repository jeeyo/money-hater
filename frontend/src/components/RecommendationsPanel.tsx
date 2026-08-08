import { Compass, MapPin, RefreshCw, Star } from 'lucide-react';
import { useState } from 'react';
import { useGenerateRecommendations, useRecommendations } from '../hooks/useData';
import type { Recommendation } from '../types';
import { RecommendationSheet } from './RecommendationSheet';

export function mapsUrl(googlePlaceId: string): string {
  return `https://www.google.com/maps/search/?api=1&query=&query_place_id=${googlePlaceId}`;
}

export function formatWalk(distanceM: number | null): string | null {
  if (distanceM == null) return null;
  if (distanceM < 1000) return `${distanceM} m`;
  return `${(distanceM / 1000).toFixed(1)} km`;
}

function Card({ item, onOpen }: { item: Recommendation; onOpen: () => void }) {
  const walk = formatWalk(item.distance_m);
  return (
    <li className="w-[68%] max-w-64 shrink-0 snap-start">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col gap-1.5 rounded-2xl border border-line bg-surface p-3 text-left active:bg-surface-2"
      >
        {item.category && (
          <span className="w-fit rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
            {item.category}
          </span>
        )}
        <span className="line-clamp-2 font-medium text-ink">{item.name}</span>
        <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
          {item.rating != null && (
            <span className="flex items-center gap-0.5">
              <Star className="size-3 fill-current text-money" aria-hidden />
              {item.rating.toFixed(1)}
              {item.user_rating_count != null && (
                <span className="text-ink-4"> ({item.user_rating_count})</span>
              )}
            </span>
          )}
          {walk && (
            <span className="flex items-center gap-0.5">
              <MapPin className="size-3" aria-hidden />
              {walk}
            </span>
          )}
          {item.open_now === false && <span className="text-danger">closed</span>}
        </span>
      </button>
    </li>
  );
}

function Skeletons() {
  return (
    <ul className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-28 w-[68%] max-w-64 shrink-0 animate-pulse snap-start rounded-2xl bg-surface-2"
        />
      ))}
    </ul>
  );
}

/** "What next?" for the trip you are on. Only rendered for open trips. */
export function RecommendationsPanel({ tripId }: { tripId: number }) {
  const { data, isLoading } = useRecommendations(tripId);
  const generate = useGenerateRecommendations(tripId);
  const [opened, setOpened] = useState<Recommendation | null>(null);

  const status = data?.status ?? 'none';
  const pending = status === 'pending' || generate.isPending;
  const items = data?.items ?? [];

  return (
    <section className="space-y-2 border-t border-line-soft pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
          <Compass className="size-4 text-brand-600" aria-hidden />
          {status === 'ready' && data?.moment ? data.moment : 'What next?'}
        </h2>
        {status === 'ready' && (
          <button
            type="button"
            onClick={() => generate.mutate({ refresh: true })}
            disabled={pending}
            className="flex items-center gap-1 text-xs text-ink-3 disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${pending ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </button>
        )}
      </div>

      {pending && <Skeletons />}

      {!pending && status === 'ready' && items.length > 0 && (
        <ul className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1">
          {items.map((item) => (
            <Card key={item.google_place_id} item={item} onOpen={() => setOpened(item)} />
          ))}
        </ul>
      )}

      {!pending && status === 'ready' && items.length === 0 && (
        <p className="text-sm text-ink-3">
          Nothing worth suggesting near {data?.anchor_label ?? 'your last stop'} right now.
        </p>
      )}

      {!pending && status !== 'ready' && !isLoading && (
        <div className="space-y-2">
          <p className="text-sm text-ink-3">
            {data?.anchor_label
              ? `Ideas for where to go next from ${data.anchor_label}, based on this trip and the time of day.`
              : 'Ideas for where to go next, based on this trip and the time of day.'}
          </p>
          <button
            type="button"
            onClick={() => generate.mutate({})}
            className="w-full rounded-xl border border-brand-600 py-2.5 text-sm font-semibold text-brand-700 active:bg-brand-50"
          >
            Suggest somewhere
          </button>
        </div>
      )}

      {status === 'failed' && data?.error && (
        <p className="text-sm text-danger">Could not suggest anything: {data.error}</p>
      )}
      {generate.isError && <p className="text-sm text-danger">{generate.error.message}</p>}

      {opened && <RecommendationSheet item={opened} onClose={() => setOpened(null)} />}
    </section>
  );
}
