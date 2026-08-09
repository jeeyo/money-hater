import { CloudOff, RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Service-worker status: offline notice and an explicit "reload for the new version". */
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-sm rounded-2xl border border-line bg-surface p-3 shadow-lg md:bottom-4">
      {needRefresh ? (
        <div className="flex items-center gap-3">
          <RefreshCw className="size-5 shrink-0 text-brand-600" />
          <p className="flex-1 text-sm text-ink-2">A new version is ready.</p>
          <button
            type="button"
            onClick={() => updateServiceWorker(true)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="text-sm text-ink-4"
          >
            Later
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <CloudOff className="size-5 shrink-0 text-ink-4" />
          <p className="flex-1 text-sm text-ink-2">Ready to work offline.</p>
          <button
            type="button"
            onClick={() => setOfflineReady(false)}
            className="text-sm font-medium text-brand-600"
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}
