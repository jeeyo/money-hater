export type Platform = 'ios' | 'android' | 'other';

/**
 * Which phone is this, for the location-help instructions.
 *
 * Only ever used to decide which set of steps to show first — never to gate
 * behaviour — so a wrong guess costs the user one tap on the other tab.
 */
export function detectPlatform(userAgent = navigator.userAgent): Platform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipod|ipad/i.test(userAgent)) return 'ios';
  // iPadOS 13+ reports itself as a Mac; the touch points give it away
  if (/macintosh/i.test(userAgent) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) {
    return 'ios';
  }
  return 'other';
}
