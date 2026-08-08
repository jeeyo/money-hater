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
