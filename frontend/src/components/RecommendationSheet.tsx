import { CalendarHeart, ExternalLink, MapPin, Star } from 'lucide-react';
import { usePlaceDetails } from '../hooks/useData';
import type { Recommendation } from '../types';
import { formatWalk, mapsUrl } from './RecommendationsPanel';
import { Sheet } from './Sheet';

/** The rest of a suggestion: why it was picked, and what people say about it. */
export function RecommendationSheet({
  item,
  onClose,
}: {
  item: Recommendation;
  onClose: () => void;
}) {
  // Reviews cost real money per place, so they are fetched when this opens —
  // never for the whole card row.
  const { data: details, isLoading } = usePlaceDetails(item.google_place_id);
  const walk = formatWalk(item.distance_m);
  const rating = details?.rating ?? item.rating;
  const ratingCount = details?.user_rating_count ?? item.user_rating_count;

  return (
    <Sheet title={item.name} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
          {rating != null && (
            <span className="flex items-center gap-1">
              <Star className="size-4 fill-current text-money" aria-hidden />
              {rating.toFixed(1)}
              {ratingCount != null && <span className="text-ink-4">({ratingCount})</span>}
            </span>
          )}
          {walk && (
            <span className="flex items-center gap-1">
              <MapPin className="size-4" aria-hidden />
              {walk} away
            </span>
          )}
          {item.price_level && <span>{item.price_level.replace(/PRICE_LEVEL_/, '').toLowerCase()}</span>}
          {(details?.open_now ?? item.open_now) === true && (
            <span className="text-money">open now</span>
          )}
          {(details?.open_now ?? item.open_now) === false && (
            <span className="text-danger">closed now</span>
          )}
        </div>

        {item.why && <p className="text-base text-ink">{item.why}</p>}

        {item.event && (
          <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
            <CalendarHeart className="mt-0.5 size-4 shrink-0" aria-hidden />
            {item.event}
          </p>
        )}

        {(details?.formatted_address ?? item.address) && (
          <p className="text-sm text-ink-3">{details?.formatted_address ?? item.address}</p>
        )}

        <a
          href={details?.maps_uri ?? mapsUrl(item.google_place_id)}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-base font-semibold text-white active:bg-brand-700"
        >
          Open in Google Maps <ExternalLink className="size-4" aria-hidden />
        </a>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-ink-2">Recent comments</h3>
          {isLoading && <p className="text-sm text-ink-4">Loading…</p>}
          {!isLoading && (details?.reviews.length ?? 0) === 0 && (
            <p className="text-sm text-ink-4">No comments to show.</p>
          )}
          <ul className="space-y-2">
            {details?.reviews.map((review, index) => (
              <li key={index} className="rounded-xl bg-surface-2 px-3 py-2">
                <p className="flex items-center gap-2 text-xs text-ink-3">
                  {review.rating != null && (
                    <span className="flex items-center gap-0.5">
                      <Star className="size-3 fill-current text-money" aria-hidden />
                      {review.rating}
                    </span>
                  )}
                  <span className="truncate">{review.author ?? 'Someone'}</span>
                  {review.relative_time && <span className="text-ink-4">{review.relative_time}</span>}
                </p>
                <p className="mt-1 line-clamp-4 text-sm text-ink-2">{review.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}
