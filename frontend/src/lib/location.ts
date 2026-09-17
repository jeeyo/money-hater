/** Where the browser says its owner is, for photos that cannot say it themselves.
 *
 * Most receipts arrive with no coordinates: the camera has location switched
 * off, the shot is a screenshot, or it came through a chat app that stripped
 * the EXIF on the way. The phone still knows where it is standing, and for a
 * receipt photographed and uploaded on the spot that is the missing half of
 * the answer — enough for the server to turn the name printed on it into a
 * place on the map.
 *
 * Nothing here ever throws or rejects. A location is a bonus on an upload, and
 * an upload that fails because the browser would not answer would be a much
 * worse thing than one filed without coordinates.
 */

export interface Fix {
  lat: number;
  lng: number;
}

/** Long enough that picking twenty photos asks the phone once. */
const FIX_TTL_MS = 120_000;
/** The upload is waiting on this, so it is short. Nothing is lost by failing. */
export const FIX_TIMEOUT_MS = 8000;
/** Remembers a yes on browsers whose Permissions API says nothing useful. */
const OPT_IN_KEY = 'moneyhater.uploadLocation';

let cached: { fix: Fix; at: number } | null = null;
let inFlight: Promise<Fix | null> | null = null;

export function canAskForLocation(): boolean {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false;
  // Geolocation is handed out on secure origins only, and on an insecure one
  // the call never reaches either callback — so it has to be ruled out here.
  return typeof window !== 'undefined' && window.isSecureContext;
}

/** Has the user already said yes — to the browser, or to us on a browser that does not remember? */
export async function locationPermission(): Promise<'granted' | 'prompt' | 'denied'> {
  if (!canAskForLocation()) return 'denied';
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    if (status) return status.state;
  } catch {
    // Safari has no geolocation entry in the Permissions API; fall through to
    // what the user last told us, so a yes there is not asked for every visit.
  }
  return optedIn() ? 'granted' : 'prompt';
}

export function optedIn(): boolean {
  try {
    return localStorage.getItem(OPT_IN_KEY) === 'yes';
  } catch {
    return false; // private mode, or storage blocked
  }
}

export function rememberOptIn(yes: boolean): void {
  try {
    localStorage.setItem(OPT_IN_KEY, yes ? 'yes' : 'no');
  } catch {
    // Nothing to do: the user is asked again next visit, which is survivable.
  }
}

/** Forget the last fix, for tests and for a user who turns this off. */
export function clearFix(): void {
  cached = null;
}

/**
 * The current fix, or null.
 *
 * Asking triggers the browser's permission prompt, so only call it where the
 * user has just done something that explains it. The answer is cached briefly:
 * an upload of twenty photos is one location, not twenty.
 */
export function currentFix(): Promise<Fix | null> {
  if (cached && Date.now() - cached.at < FIX_TTL_MS) return Promise.resolve(cached.fix);
  if (inFlight) return inFlight;
  if (!canAskForLocation()) return Promise.resolve(null);

  inFlight = new Promise<Fix | null>((resolve) => {
    // getCurrentPosition's own timeout only starts once permission has been
    // decided, so a prompt that is dismissed rather than answered leaves both
    // callbacks unfired for good. This is the wall clock that always stops it.
    let settled = false;
    const finish = (fix: Fix | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (fix) cached = { fix, at: Date.now() };
      resolve(fix);
    };
    const timer = setTimeout(() => finish(null), FIX_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => finish({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => finish(null),
      { enableHighAccuracy: false, timeout: FIX_TIMEOUT_MS, maximumAge: FIX_TTL_MS },
    );
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Six decimals is a metre or so — more than a receipt lookup can use. */
export function fixParams(fix: Fix | null | undefined): string {
  if (!fix) return '';
  return `&lat=${fix.lat.toFixed(6)}&lng=${fix.lng.toFixed(6)}`;
}
