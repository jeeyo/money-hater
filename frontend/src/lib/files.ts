const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|gif|tiff?|avif)$/i;

/**
 * Is this worth sending to the server?
 *
 * Deliberately lenient about the MIME type: photos picked from an Android
 * gallery, or arriving through the share sheet, routinely have an empty
 * `type`, and HEIC from an iPhone is often reported as `""` too. Rejecting
 * those here means a photo the user picked silently never uploads. The server
 * sniffs the actual bytes and 415s anything that is not really an image, so
 * the strict check happens where it can be done properly.
 */
export function looksLikeImage(file: File): boolean {
  if (file.type) return file.type.startsWith('image/');
  return IMAGE_EXTENSIONS.test(file.name);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Hand the browser a blob to save. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // Revoking while the download is still being handed over cancels it in some
  // browsers, so let the click settle first.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The name a response asked to be saved under, out of its Content-Disposition. */
export function downloadFilename(header: string | null): string | null {
  if (!header) return null;
  // RFC 5987's encoded form first: it is the one that survives a non-ASCII name,
  // and a server that sends it sends the plain `filename=` beside it as a
  // fallback for readers that do not understand it — which this is not.
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      /* a malformed escape is no reason to lose the download */
    }
  }
  return /filename="?([^";]+)"?/i.exec(header)?.[1] ?? null;
}
