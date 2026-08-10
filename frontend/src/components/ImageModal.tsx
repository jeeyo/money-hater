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
 *
 * Naming it means pressing Save. Committing on the click of a suggestion
 * looked tidy and was not: a name that matched no suggestion had no way to be
 * saved at all, and with an empty list — a log with no places in it yet — the
 * sheet was a text field, a hint, and nothing that did anything.
 */
function PlaceRow({ image }: { image: ImageRecord }) {
  const update = useUpdateImage();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  // The suggestion that was clicked, if any. Kept beside the text rather than
  // saved on the spot so the row reads the same either way: pick or type, then
  // Save. Typing again drops it — the text is what the user is now proposing.
  const [picked, setPicked] = useState<number | null>(null);

  function close() {
    setEditing(false);
    update.reset();
  }

  function save(body: { place_id?: number | null; place_query?: string }) {
    update.mutate({ id: image.id, ...body }, { onSuccess: close });
  }

  const typed = query.trim();
  const canSave = picked != null || typed.length > 0;

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
              setPicked(null);
              update.reset();
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
            placeId={picked}
            at={image.taken_at}
            // The photo knows where it was; suggest from there rather than
            // from the middle of whichever stop its clock lands in.
            near={
              image.lat != null && image.lng != null
                ? { lat: image.lat, lng: image.lng }
                : null
            }
            inline
            onChange={(name, placeId) => {
              setQuery(name);
              setPicked(placeId);
            }}
          />
          <p className="text-xs text-ink-4">
            {picked != null
              ? 'From your suggestions — Save to attach it.'
              : 'Pick a suggestion, or type a name and Save to search for it.'}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canSave || update.isPending}
              onClick={() =>
                save(picked != null ? { place_id: picked } : { place_query: typed })
              }
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white active:bg-brand-700 disabled:bg-surface-2 disabled:text-ink-4"
            >
              {update.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={close}
              className="text-xs font-medium text-ink-3"
            >
              Cancel
            </button>
            {image.place && (
              <button
                type="button"
                onClick={() => save({ place_id: null })}
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
