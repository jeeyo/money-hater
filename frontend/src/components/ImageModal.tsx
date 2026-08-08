import { RefreshCw, Trash2, X } from 'lucide-react';
import { useDeleteImage, useReanalyzeImage } from '../hooks/useData';
import { formatTime } from '../lib/format';
import type { ImageRecord } from '../types';

export function ImageModal({ image, onClose }: { image: ImageRecord; onClose: () => void }) {
  const reanalyze = useReanalyzeImage();
  const remove = useDeleteImage();

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
            {image.place && (
              <>
                <dt>Place</dt>
                <dd>{image.place.name}</dd>
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
