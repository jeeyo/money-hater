/**
 * Photos for an exported trip page, as data URIs.
 *
 * The app's own thumbnails are served from `/api/images/{id}/thumb`, which is
 * behind the session cookie — a plain `<img src="/api/…">` in a file someone
 * mails to a friend is a broken icon. So the bytes travel with the page: each
 * thumbnail is fetched with the exporter's own session, re-encoded, and inlined.
 *
 * Re-encoding is what keeps the file sendable. Stored thumbnails are 512px JPEG
 * at quality 82 (`backend/app/services/storage.py`); at quality 72 they lose
 * roughly a third of their weight at a size nobody looks closely at, and base64
 * adds that third straight back.
 */
import type { ImageRecord, TripDetail } from '../types';
import { apiFetch } from './api';
import { exportablePhotos } from './tripExport';

/** Never larger than the stored thumbnail, so the page's tap-to-enlarge shows a
 *  real photo rather than an upscale of a smaller one. */
export const EXPORT_PHOTO_MAX = 512;
const EXPORT_PHOTO_QUALITY = 0.72;
/** Enough to keep a remote server busy, few enough not to stall the app. */
const CONCURRENCY = 4;

async function toDataUri(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, EXPORT_PHOTO_MAX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2d canvas context');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', EXPORT_PHOTO_QUALITY);
  } finally {
    bitmap.close();
  }
}

async function fetchPhoto(image: ImageRecord): Promise<string | null> {
  // One missing or undecodable photo is not worth failing an export over: the
  // page simply goes out without it, and the rest of the trip is intact.
  try {
    const response = await apiFetch(image.thumb_url!);
    return await toDataUri(await response.blob());
  } catch {
    return null;
  }
}

export interface PhotoProgress {
  done: number;
  total: number;
}

/**
 * Every photo the exported page would show, keyed by image id.
 *
 * `onProgress` is called after each one — packing a long trip takes a few
 * seconds and a button that just sits there looks broken.
 */
export async function collectTripPhotos(
  trip: TripDetail,
  onProgress?: (progress: PhotoProgress) => void,
): Promise<Map<number, string>> {
  const images = exportablePhotos(trip);
  const photos = new Map<number, string>();
  let done = 0;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < images.length) {
      const image = images[next++];
      const uri = await fetchPhoto(image);
      if (uri) photos.set(image.id, uri);
      onProgress?.({ done: ++done, total: images.length });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, images.length) }, () => worker()),
  );
  return photos;
}
