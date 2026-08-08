import { MapPin, Pin } from 'lucide-react';
import { useState } from 'react';
import { formatSpend, formatTime } from '../lib/format';
import type { ImageRecord, Visit } from '../types';
import { ImageModal } from './ImageModal';
import { ImageThumb } from './ImageThumb';

export function VisitCard({ visit }: { visit: Visit }) {
  const [openImage, setOpenImage] = useState<ImageRecord | null>(null);

  return (
    <div className="relative pl-6">
      {/* timeline rail */}
      <span className="absolute left-0 top-2 flex size-4 items-center justify-center">
        <span className="size-2.5 rounded-full bg-brand-500 ring-4 ring-brand-50" />
      </span>
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">
              {visit.label}
              {visit.pinned && <Pin className="ml-1 inline size-3.5 text-slate-400" />}
            </p>
            <p className="text-xs text-slate-500">
              {formatTime(visit.started_at)}
              {visit.ended_at !== visit.started_at && <> – {formatTime(visit.ended_at)}</>}
              {visit.place?.formatted_address && (
                <span className="ml-1 inline-flex items-center gap-0.5 text-slate-400">
                  <MapPin className="size-3" />
                  <span className="max-w-40 truncate align-bottom md:max-w-72">
                    {visit.place.formatted_address}
                  </span>
                </span>
              )}
            </p>
          </div>
          {visit.spend.base_total_minor > 0 && (
            <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              {formatSpend(visit.spend)}
            </span>
          )}
        </div>
        {visit.images.length > 0 && (
          <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
            {visit.images.map((image) => (
              <ImageThumb key={image.id} image={image} onClick={() => setOpenImage(image)} />
            ))}
          </div>
        )}
      </div>
      {openImage && <ImageModal image={openImage} onClose={() => setOpenImage(null)} />}
    </div>
  );
}
