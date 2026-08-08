/** The page side of the share target: collect what the service worker parked.
 *
 * `public/share-target.js` answers the POST from the phone's share sheet and
 * stores each photo in this cache, because a redirect cannot carry a body.
 */
const SHARED_CACHE = 'shared-photos';

export async function takeSharedFiles(): Promise<File[]> {
  if (!('caches' in window)) return [];
  let cache: Cache;
  try {
    cache = await caches.open(SHARED_CACHE);
  } catch {
    return [];
  }

  const requests = await cache.keys();
  const files: File[] = [];
  // Keys are timestamp-ordered, so the photos arrive in the order they were shared
  for (const request of [...requests].sort((a, b) => a.url.localeCompare(b.url))) {
    const response = await cache.match(request);
    if (!response) continue;
    const blob = await response.blob();
    const name = decodeURIComponent(response.headers.get('x-filename') ?? 'shared-photo');
    files.push(new File([blob], name, { type: response.headers.get('content-type') ?? '' }));
  }

  // Taken, not read: a refresh must not upload the same photos twice
  await Promise.all(requests.map((request) => cache.delete(request)));
  return files;
}
