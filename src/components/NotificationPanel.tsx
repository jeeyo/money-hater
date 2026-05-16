import React, { useRef, useEffect } from 'react';
import { Bell, Trash2, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { useNotification } from '../context/useNotification';
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
      if (isOutsidePanel && isOutsideTrigger) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, triggerRef]);

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.SUCCESS:
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case NotificationType.WARNING:
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case NotificationType.ERROR:
        return <AlertCircle className="w-5 h-5 text-rose-400" />;
      default:
        return <Info className="w-5 h-5 text-cyan-400" />;
    }
  };

  return (
    <div
      ref={panelRef}
      className="fixed md:absolute top-16 left-4 right-4 md:left-auto md:right-0 w-auto md:w-96
        bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl z-50
        overflow-hidden flex flex-col max-h-[80vh] animate-scale-in"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/3">
        <h3 className="font-semibold text-white flex items-center gap-2 text-sm">
          <Bell className="w-4 h-4 text-violet-400" />
          Notifications
        </h3>
        {notifications.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-slate-500 hover:text-rose-400 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1 p-2 space-y-1.5">
        {notifications.length === 0 ? (
          <div className="py-10 text-center text-slate-600 text-sm">
            <Bell className="w-8 h-8 mx-auto mb-3 opacity-20" />
            <p className="text-slate-500">No notifications yet</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-3 rounded-xl border transition-all cursor-pointer
                ${notif.read
                  ? 'bg-transparent border-transparent opacity-55 hover:opacity-75'
                  : 'bg-violet-500/5 border border-violet-500/20 hover:bg-violet-500/10'
                }`}
              onClick={() => !notif.read && markAsRead(notif.id)}
            >
              <div className="flex gap-3">
                <div className="mt-0.5 shrink-0">{getIcon(notif.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <p className={`text-sm font-medium ${notif.read ? 'text-slate-400' : 'text-white'}`}>
                      {notif.title}
                    </p>
                    <span className="text-[10px] text-slate-600 shrink-0 whitespace-nowrap">
                      {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                    {notif.message}
                  </p>
                </div>
                {!notif.read && (
                  <div className="shrink-0 self-center">
                    <div className="w-2 h-2 rounded-full bg-violet-400" />
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
