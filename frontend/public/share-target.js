/* Web Share Target handler, imported into the generated service worker.
 *
 * Sharing photos from the phone's gallery POSTs a multipart form to this app.
 * A POST cannot be answered by the SPA's index.html, so the service worker
 * takes it, parks the files in the cache, and redirects to /upload, which
 * picks them up and uploads them like any other selection.
 */
/* global self, caches, Response */

const SHARED_CACHE = 'shared-photos';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return;

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll('files').filter((f) => f && typeof f !== 'string');
        const cache = await caches.open(SHARED_CACHE);
        await Promise.all(
          files.map((file, index) =>
            cache.put(
              // The index keeps the order; the name rides along in a header so
              // the page can rebuild a File with it.
              `/shared-photo/${Date.now()}-${index}`,
              new Response(file, {
                headers: {
                  'content-type': file.type || 'application/octet-stream',
                  'x-filename': encodeURIComponent(file.name || `shared-${index}`),
                },
              }),
            ),
          ),
        );
        return Response.redirect(`/upload?shared=${files.length}`, 303);
      } catch {
        // Never leave the user on a blank error page: fall through to the app
        return Response.redirect('/upload?shared=0', 303);
      }
    })(),
  );
});
