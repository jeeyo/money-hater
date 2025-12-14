import React, { useRef, useEffect } from 'react';
import { Bell, Trash2, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { NotificationType } from '../types';

interface NotificationPanelProps {
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({ onClose, triggerRef }) => {
  const { notifications, markAsRead, clearAll } = useNotification();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsidePanel = panelRef.current && !panelRef.current.contains(target);
      const isOutsideTrigger = triggerRef?.current && !triggerRef.current.contains(target);

      if (isOutsidePanel && isOutsideTrigger) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, triggerRef]);

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.SUCCESS:
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case NotificationType.WARNING:
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case NotificationType.ERROR:
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <div
      ref={panelRef}
      className="fixed md:absolute top-16 left-4 right-4 md:left-auto md:right-0 w-auto md:w-96 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden flex flex-col max-h-[80vh]"
    >
      <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Notifications
        </h3>
        {notifications.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      <div className="overflow-y-auto flex-1 p-2 space-y-2">
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No notifications</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-3 rounded-lg border transition-all ${notif.read
                ? 'bg-white dark:bg-slate-800 border-transparent opacity-75'
                : 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/30'
                }`}
              onClick={() => !notif.read && markAsRead(notif.id)}
            >
              <div className="flex gap-3">
                <div className="mt-0.5 shrink-0">
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <p className={`text-sm font-medium ${notif.read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                      {notif.title}
                    </p>
                    <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">
                      {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {notif.message}
                  </p>
                </div>
                {!notif.read && (
                  <div className="shrink-0 self-center">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
