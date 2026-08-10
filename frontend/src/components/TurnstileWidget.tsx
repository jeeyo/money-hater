import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { loadTurnstile } from '../lib/turnstile';

/**
 * The Turnstile checkbox, when the server is configured for it.
 *
 * A token is single-use and expires after a few minutes, so the parent
 * remounts this (a changing `key`) to get a fresh one after a failed attempt
 * or a long-idle form; `onToken(null)` covers the token going stale while the
 * form sits open, which puts the submit button back to disabled.
 */
export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const { theme } = useTheme();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          theme: theme === 'system' ? 'auto' : theme,
          callback: (token) => callback.current(token),
          'error-callback': () => callback.current(null),
          'expired-callback': () => callback.current(null),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, theme]);

  if (failed) {
    return (
      <p className="text-sm text-danger">
        The human check could not load. Check your connection and reload the page.
      </p>
    );
  }
  // Reserves the widget's height so the button below it does not jump when the
  // challenge finally paints.
  return <div ref={container} className="flex min-h-[65px] justify-center" />;
}
