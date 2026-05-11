import { createContext } from 'react';
import type { AppNotification } from '../types';
import { NotificationType } from '../types';

export interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  addSystemNotification: (title: string, message: string, type: NotificationType) => Promise<void>;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);
