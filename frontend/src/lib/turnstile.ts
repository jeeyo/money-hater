/**
 * Cloudflare's Turnstile script, loaded on demand.
 *
 * Only the sign-in and sign-up forms need it, and only when the server hands
 * back a site key, so it stays out of index.html: nobody who is already signed
 * in — which is everyone, nearly all of the time — should be fetching a
 * third-party script on every launch of a PWA.
 */

export interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  action?: string;
}

export interface TurnstileApi {
  render: (element: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loader: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  // One loader for the process: React 19's StrictMode mounts effects twice in
  // development, and a remount after a failed sign-in would otherwise append
  // another copy of the script.
  loader ??= new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    const onLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile loaded without an API'));
    };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', () => {
      // Let a later attempt retry the network rather than replaying this failure
      loader = null;
      script.remove();
      reject(new Error('Could not load Turnstile'));
    });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return loader;
}
