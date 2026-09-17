import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canAskForLocation,
  clearFix,
  currentFix,
  locationPermission,
  rememberOptIn,
} from '../lib/location';
import type { Fix } from '../lib/location';

export type UploadLocationStatus =
  /** No geolocation here at all — a plain-http install, or a browser without it. */
  | 'unsupported'
  /** Available, and the user has not been asked. Nothing happens until they ask for it. */
  | 'offer'
  /** Waiting on the browser's prompt, or on a fix. */
  | 'asking'
  /** On: uploads will carry where the phone is. */
  | 'on'
  /** The browser is refusing — denied for this site, or no fix to be had. */
  | 'blocked';

/**
 * Where the phone is, offered to uploads of photos that have no location.
 *
 * The prompt is never sprung on anyone. A browser that already remembers a yes
 * is used straight away, and otherwise the page shows a line explaining what
 * it is for and the user asks for it — a location permission dialog that
 * appears the instant someone taps "Choose photos", with no explanation, is
 * the kind that gets denied for good.
 */
export function useUploadLocation() {
  const [status, setStatus] = useState<UploadLocationStatus>(
    canAskForLocation() ? 'offer' : 'unsupported',
  );
  const on = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const permission = await locationPermission();
      if (cancelled || permission === 'prompt') return;
      if (permission === 'denied') {
        setStatus('blocked');
        return;
      }
      // Already granted: warm a fix up now, so the upload does not wait on one
      // later. No prompt can appear from here.
      on.current = true;
      setStatus('asking');
      const fix = await currentFix();
      if (!cancelled) setStatus(fix ? 'on' : 'blocked');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setStatus('asking');
    clearFix();
    const fix = await currentFix();
    on.current = fix !== null;
    rememberOptIn(fix !== null);
    setStatus(fix ? 'on' : 'blocked');
  }, []);

  /** What to send with an upload: a fix when this is on, and null otherwise. */
  const fixForUpload = useCallback(async (): Promise<Fix | null> => {
    if (!on.current) return null;
    return currentFix();
  }, []);

  return { status, enable, fixForUpload };
}
