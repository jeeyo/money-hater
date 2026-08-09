import { MapPin, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useDeleteImage, useImage, useReanalyzeImage, useUpdateImage } from '../hooks/useData';
import { formatTime } from '../lib/format';
import type { ImageRecord } from '../types';
import { PlaceAutocomplete } from './PlaceAutocomplete';

/** The place a photo was taken at, as read by the pipeline and as correctable.
 *
 * Reverse geocoding answers with the nearest match to the GPS fix, which
 * indoors or on a dense street is regularly the shop next door. Re-analyzing
 * asks the same question and gets the same answer, so the fix has to be the
 * user naming the place.
 */
function PlaceRow({ image }: { image: ImageRecord }) {
  const update = useUpdateImage();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');

  function save(placeId: number | null) {
    update.mutate(
      { id: image.id, place_id: placeId },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-3">Place</span>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              // Empty, not the current name: prefilling it filters the list
              // down to the one place the user opened this to get away from.
              setQuery('');
              setEditing(true);
            }}
            className="flex items-center gap-1 text-xs font-medium text-brand-600"
          >
            <Pencil className="size-3.5" /> {image.place ? 'Change' : 'Set place'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-1.5">
          <PlaceAutocomplete
            value={query}
            // Always null: the field is a search here, and its own unlink
            // button would be a second, silent way to do what "Remove place"
            // does explicitly below.
            placeId={null}
            at={image.taken_at}
            onChange={(name, placeId) => {
              setQuery(name);
              // Only a picked suggestion is a place; free text alone is not
              if (placeId != null) save(placeId);
            }}
          />
          <p className="text-xs text-ink-4">Pick one of the suggestions to save it.</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs font-medium text-ink-3"
            >
              Cancel
            </button>
            {image.place && (
              <button
                type="button"
                onClick={() => save(null)}
                className="text-xs font-medium text-danger"
              >
                Remove place
              </button>
            )}
          </div>
          {update.isError && (
            <p className="text-xs text-danger">{update.error.message}</p>
          )}
        </div>
      ) : (
        <p className="flex items-start gap-1.5 text-sm text-ink-2">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-4" aria-hidden />
          <span className="min-w-0">
            {image.place ? (
              <>
                {image.place.name}
                {image.place.formatted_address && (
                  <span className="block text-xs text-ink-4">
                    {image.place.formatted_address}
                  </span>
                )}
              </>
            ) : (
              <span className="text-ink-4">Not set</span>
            )}
          </span>
        </p>
      )}
    </div>
  );
}

export function ImageModal({ image: initial, onClose }: { image: ImageRecord; onClose: () => void }) {
  const reanalyze = useReanalyzeImage();
  const remove = useDeleteImage();
  // The caller's copy is a snapshot of the list it came from; follow the
  // record itself so an edit made here shows without closing the modal.
  const { data } = useImage(initial.id);
  const image = data ?? initial;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 dark:bg-black/85 md:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface ring-1 ring-line md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <img src={image.original_url} alt="" className="max-h-[50dvh] w-full object-contain bg-surface-2" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          {image.analysis?.caption && (
            <p className="text-sm text-ink-2">{image.analysis.caption}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {image.analysis?.labels?.map((label) => (
              <span
                key={label}
                className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2"
              >
                {label}
              </span>
            ))}
          </div>

          <PlaceRow image={image} />

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-3">
            {image.taken_at && (
              <>
                <dt>Taken</dt>
                <dd>
                  {formatTime(image.taken_at)}{' '}
                  <span className="text-ink-4">({image.taken_at_source})</span>
                </dd>
              </>
            )}
            {image.lat != null && (
              <>
                <dt>GPS</dt>
                <dd>
                  {image.lat.toFixed(4)}, {image.lng?.toFixed(4)}
                </dd>
              </>
            )}
            {image.status === 'failed' && (
              <>
                <dt className="text-danger">Failed</dt>
                <dd className="text-danger">{image.error}</dd>
              </>
            )}
          </dl>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => reanalyze.mutate(image.id, { onSuccess: onClose })}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line py-2.5 text-sm font-medium text-ink-2 active:bg-surface-2"
            >
              <RefreshCw className="size-4" /> Re-analyze
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete this photo?')) remove.mutate(image.id, { onSuccess: onClose });
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-danger-line py-2.5 text-sm font-medium text-danger active:bg-danger-bg"
            >
              <Trash2 className="size-4" /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
