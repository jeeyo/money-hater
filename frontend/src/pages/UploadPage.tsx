import { Camera, ImagePlus, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { ImageThumb } from '../components/ImageThumb';
import { useImage, useUploadImages } from '../hooks/useData';
import type { ImageRecord } from '../types';

function UploadedImage({ initial }: { initial: ImageRecord }) {
  // Poll each uploaded image until analysis completes
  const { data } = useImage(initial.id);
  const image = data ?? initial;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2">
      <ImageThumb image={image} size="size-16" />
      <div className="min-w-0 flex-1 text-sm">
        {image.status === 'analyzed' ? (
          <>
            <p className="truncate font-medium text-ink">
              {image.analysis?.caption ?? image.place?.name ?? 'Logged'}
            </p>
            <p className="text-xs text-ink-3">
              {image.analysis?.kind ?? 'photo'}
              {image.place && <> · {image.place.name}</>}
              {image.has_expense && <> · expense recorded</>}
            </p>
          </>
        ) : image.status === 'failed' ? (
          <p className="text-xs text-danger">{image.error ?? 'Analysis failed'}</p>
        ) : (
          <p className="flex items-center gap-2 text-xs text-ink-3">
            <Loader2 className="size-3.5 animate-spin" /> Analyzing…
          </p>
        )}
      </div>
    </div>
  );
}

export function UploadPage() {
  const upload = useUploadImages();
  const [uploaded, setUploaded] = useState<ImageRecord[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | File[] | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    upload.mutate(list, {
      onSuccess: (created) => setUploaded((prev) => [...created, ...prev]),
    });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    handleFiles(event.dataTransfer.files);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold text-ink">Add photos</h1>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? 'border-brand-500 bg-brand-50' : 'border-line-strong bg-surface'
        }`}
      >
        <p className="text-sm text-ink-3">
          Anything from your day — a place, food, an item, a receipt. EXIF time and GPS are read
          automatically.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white active:bg-brand-700 sm:hidden"
          >
            <Camera className="size-4" /> Take a photo
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-5 py-3 text-sm font-semibold text-ink-2 active:bg-surface-2"
          >
            <ImagePlus className="size-4" /> Choose photos
          </button>
        </div>
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {upload.isPending && (
        <p className="flex items-center gap-2 text-sm text-ink-3">
          <Loader2 className="size-4 animate-spin" /> Uploading…
        </p>
      )}
      {upload.isError && <p className="text-sm text-danger">{upload.error.message}</p>}
      {upload.isSuccess && upload.data.length === 0 && (
        <p className="text-sm text-ink-3">Those photos were already in your log.</p>
      )}

      {uploaded.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-3">Just uploaded</h2>
          {uploaded.map((image) => (
            <UploadedImage key={image.id} initial={image} />
          ))}
          <Link to="/" className="inline-block pt-1 text-sm font-medium text-brand-600">
            See today's timeline →
          </Link>
        </section>
      )}
    </div>
  );
}
