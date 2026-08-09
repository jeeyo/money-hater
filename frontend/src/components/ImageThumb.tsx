import { Loader2, Receipt, TriangleAlert, UtensilsCrossed } from 'lucide-react';
import type { ImageRecord } from '../types';

const KIND_BADGES: Record<string, { icon: typeof Receipt; className: string }> = {
  receipt: { icon: Receipt, className: 'bg-amber-500' },
  food: { icon: UtensilsCrossed, className: 'bg-rose-500' },
};

export function ImageThumb({
  image,
  size = 'size-24',
  onClick,
}: {
  image: ImageRecord;
  size?: string;
  onClick?: () => void;
}) {
  const badge = image.analysis ? KIND_BADGES[image.analysis.kind] : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative ${size} shrink-0 overflow-hidden rounded-xl bg-surface-2 text-left`}
    >
      {image.thumb_url ? (
        <img
          src={image.thumb_url}
          alt={image.analysis?.caption ?? 'photo'}
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-ink-4">
          {image.status === 'failed' ? (
            <TriangleAlert className="size-6 text-danger" />
          ) : (
            <Loader2 className="size-6 animate-spin" />
          )}
        </div>
      )}
      {(image.status === 'pending' || image.status === 'processing') && image.thumb_url && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
          <Loader2 className="size-6 animate-spin text-white" />
        </div>
      )}
      {badge && (
        <span
          className={`absolute right-1 top-1 flex size-6 items-center justify-center rounded-full text-white ${badge.className}`}
        >
          <badge.icon className="size-3.5" />
        </span>
      )}
    </button>
  );
}
