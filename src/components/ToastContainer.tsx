import React, { useEffect, useState } from 'react';
import Toast from './Toast';
import { subscribeToasts, dismissToast, type ToastEntry } from '../lib/toast';

const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast
            message={t.message}
            type={t.type}
            duration={t.duration}
            onClose={() => dismissToast(t.id)}
          />
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
