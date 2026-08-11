import { AlertTriangle, Camera, Check, Clock, ImagePlus, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { ImageModal } from '../components/ImageModal';
import { ImageThumb } from '../components/ImageThumb';
import { LocationHelpSheet } from '../components/LocationHelpSheet';
import {
  useImage,
  useReanalyzeImage,
  useRecentImages,
  useUploadImages,
} from '../hooks/useData';
import type { UploadOutcome } from '../hooks/useData';
import { looksLikeImage } from '../lib/files';
import { formatDateTime } from '../lib/format';
import { takeSharedFiles } from '../lib/sharedFiles';
import type { ImageRecord } from '../types';

/** The server prefixes its errors with the filename; the row already shows it. */
function reasonFor(outcome: UploadOutcome): string {
  if (outcome.status === 'duplicate') return 'already logged';
  const error = outcome.error ?? 'failed';
  return error.startsWith(outcome.name) ? error.slice(outcome.name.length).trimStart() : error;
}

/** How long a photo may sit at "Analyzing…" before we stop implying it is fine.
 *
 *  Analysis normally takes seconds. Past this it is not slow, it is waiting on
 *  something that may never come back — a worker that went away mid-job leaves
 *  the row exactly like this, and nothing else on this page can rescue it. */
const STALL_AFTER_MS = 45_000;

function UploadedImage({ initial, onOpen }: { initial: ImageRecord; onOpen: () => void }) {
  // Poll each uploaded image until analysis completes
  const { data } = useImage(initial.id);
  const reanalyze = useReanalyzeImage();
  const [stalled, setStalled] = useState(false);
  const image = data ?? initial;
  const settled = image.status === 'analyzed' || image.status === 'failed';

  useEffect(() => {
    if (settled) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), STALL_AFTER_MS);
    return () => clearTimeout(timer);
    // Restart the clock whenever it goes back to analyzing, retries included
  }, [settled, image.status, reanalyze.submittedAt]);

  const retry = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        reanalyze.mutate(image.id);
      }}
      disabled={reanalyze.isPending}
      className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-600 disabled:text-ink-4"
    >
      <RefreshCw className="size-3.5" /> Try again
    </button>
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-2 text-left active:bg-surface-2"
    >
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
          <>
            <p className="text-xs text-danger">{image.error ?? 'Analysis failed'}</p>
            {retry}
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 text-xs text-ink-3">
              <Loader2 className="size-3.5 animate-spin" /> Analyzing…
            </p>
            {stalled && (
              <>
                <p className="text-xs text-ink-4">
                  Taking longer than it should. The photo is logged either way.
                </p>
                {retry}
              </>
            )}
          </>
        )}
        {image.taken_at && (
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-4">
            <Clock className="size-3 shrink-0" aria-hidden />
            {formatDateTime(image.taken_at)}
            {image.taken_at_source === 'custom' ? ' · edited' : ''}
            {image.taken_at_source === 'upload' ? ' · guessed' : ''}
          </p>
        )}
      </div>
    </button>
  );
}

export function UploadPage() {
  const upload = useUploadImages();
  const [uploaded, setUploaded] = useState<ImageRecord[]>([]);
  const [skipped, setSkipped] = useState<UploadOutcome[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [openImage, setOpenImage] = useState<ImageRecord | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const recent = useRecentImages();
  const uploadedIds = new Set(uploaded.map((image) => image.id));
  // Older uploads, from this session or an earlier one — the "just uploaded"
  // list above already covers the ones just added, so this is everything else.
  const olderUploads = (recent.data ?? []).filter((image) => !uploadedIds.has(image.id));

  // `upload` is recreated each render, so keep the callback out of the effect's
  // dependencies — the shared photos must be claimed exactly once.
  const uploadRef = useRef(upload);
  uploadRef.current = upload;

  function record(outcomes: UploadOutcome[]) {
    const added = outcomes
      .filter((o) => o.status === 'added' && o.image)
      .map((o) => o.image as ImageRecord);
    setUploaded((prev) => [...added, ...prev]);
    setSkipped(outcomes.filter((o) => o.status !== 'added'));
  }

  function handleFiles(files: FileList | File[] | null) {
    const all = Array.from(files ?? []);
    const list = all.filter(looksLikeImage);
    const rejected: UploadOutcome[] = all
      .filter((file) => !looksLikeImage(file))
      .map((file) => ({
        name: file.name,
        status: 'failed',
        code: 'not_an_image',
        error: 'Not an image',
      }));
    if (list.length === 0) {
      setSkipped(rejected);
      return;
    }
    uploadRef.current.mutate(list, {
      onSuccess: (outcomes) => record([...outcomes, ...rejected]),
    });
  }

  // Photos sent from the phone's share sheet are parked by the service worker;
  // collect them on arrival so sharing lands straight in the log.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const shared = await takeSharedFiles();
      if (cancelled || shared.length === 0) return;
      handleFiles(shared);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once: takeSharedFiles consumes the cache, so a re-run finds nothing
  }, []);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    handleFiles(event.dataTransfer.files);
  }

  const { done, total } = upload.progress;

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
          Anything from your day — a place, food, an item, a receipt. The time and location are
          read from the photo where it has them.
        </p>
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-left text-xs text-ink-3">
          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            No location on a photo is fine — it lands on your timeline by its time, and gets a
            map pin once you give it a place.{' '}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="font-medium text-brand-600 underline underline-offset-2"
            >
              How to keep it
            </button>
          </span>
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
        <p className="mt-3 text-xs text-ink-4">
          Pick as many as you like. Installed on a phone, Money Hater also shows up in the share
          sheet — send photos to it straight from your gallery.
        </p>
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
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <Loader2 className="size-4 animate-spin" />
            {total > 1 ? `Uploading ${done + 1} of ${total}…` : 'Uploading…'}
          </p>
          {total > 1 && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-brand-600 transition-[width]"
                style={{ width: `${Math.round((done / total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
      {upload.isError && <p className="text-sm text-danger">{upload.error.message}</p>}

      {!upload.isPending && skipped.length > 0 && (
        <section className="space-y-1.5 rounded-xl border border-line bg-surface p-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
            <AlertTriangle className="size-4 text-money" aria-hidden />
            {skipped.length} not added
          </h2>
          <ul className="space-y-1.5 text-xs text-ink-3">
            {skipped.map((outcome, index) => (
              <li key={`${outcome.name}-${index}`}>
                <span className="block truncate">{outcome.name}</span>
                <span className={outcome.status === 'failed' ? 'text-danger' : 'text-ink-4'}>
                  {reasonFor(outcome)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {uploaded.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-3">
            <Check className="size-4 text-brand-600" aria-hidden /> Just uploaded
          </h2>
          <p className="text-xs text-ink-4">Tap a photo to fix its date, time, or place.</p>
          {uploaded.map((image) => (
            <UploadedImage key={image.id} initial={image} onOpen={() => setOpenImage(image)} />
          ))}
          <Link to="/" className="inline-block pt-1 text-sm font-medium text-brand-600">
            See today's timeline →
          </Link>
        </section>
      )}

      {olderUploads.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-3">
            <Clock className="size-4 text-ink-4" aria-hidden /> Recently uploaded
          </h2>
          <p className="text-xs text-ink-4">
            Got filed on the wrong day? Tap a photo to fix its date, time, or place.
          </p>
          {olderUploads.map((image) => (
            <UploadedImage key={image.id} initial={image} onOpen={() => setOpenImage(image)} />
          ))}
        </section>
      )}

      {helpOpen && <LocationHelpSheet onClose={() => setHelpOpen(false)} />}
      {openImage && <ImageModal image={openImage} onClose={() => setOpenImage(null)} />}
    </div>
  );
}
