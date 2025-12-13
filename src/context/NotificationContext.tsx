import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AppNotification, Expense } from '../types';
import { NotificationType, ExpenseCategory } from '../types';
import { getAllNotifications, addNotification, markNotificationAsRead, clearAllNotifications, getSharedFile, clearSharedFile } from '../utils/idb';
import { analyzeReceipt } from '../services/analysisService';
import { addExpenseToDB } from '../services/api'; // We might need to refresh expenses context if we could, but here we just add to DB
import { useAccount } from './AccountContext';
import Toast, { type ToastType } from '../components/Toast';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  addSystemNotification: (title: string, message: string, type: NotificationType) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const { selectedAccount } = useAccount();
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const refreshNotifications = useCallback(async () => {
    const notifs = await getAllNotifications();
    setNotifications(notifs);
  }, []);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  const addSystemNotification = useCallback(async (title: string, message: string, type: NotificationType) => {
    const newNotification: AppNotification = {
      id: crypto.randomUUID(),
      title,
      message,
      type,
      timestamp: Date.now(),
      read: false
    };
    await addNotification(newNotification);
    await refreshNotifications();
  }, [refreshNotifications]);

  const markAsRead = async (id: string) => {
    await markNotificationAsRead(id);
    await refreshNotifications(); // Or just update local state for optimistic UI
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const clearAll = async () => {
    await clearAllNotifications();
    setNotifications([]);
  };

  // Background Analysis Logic
  const handleSharedFile = useCallback(async () => {
    // console.log('[NotificationContext] Checking for shared file...');
    const file = await getSharedFile();
    if (!file) return;

    // console.log('[NotificationContext] Found file, analyzing...');
    await clearSharedFile(); // Clear immediately so we don't process it twice

    setToast({ message: 'Analyzing receipt in background...', type: 'info' });

    // Create "Processing" notification? Maybe just Toast is enough for "In Progress", and Notification for "Done".

    try {
      const result = await analyzeReceipt(file);

      // Auto-add transaction
      if (selectedAccount) {
        const newExpense: Expense = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          accountId: selectedAccount.id,
          description: result.description || 'Scanned Receipt',
          amount: result.amount || 0,
          date: result.date || new Date().toISOString().split('T')[0],
          type: result.type || 'expense',
          category: result.category || ExpenseCategory.OTHER,
          tags: result.tags || [],
          attachmentUrl: result.attachmentUrl
        };

        await addExpenseToDB(newExpense);

        await addSystemNotification(
          'Receipt Processed',
          `Added transaction: ${newExpense.description} - ฿${newExpense.amount}`,
          NotificationType.SUCCESS
        );
        setToast({ message: 'Receipt added successfully!', type: 'success' });

        // Note: We are NOT refreshing the Dashboard expenses list here automatically 
        // because Expenses state is in Dashboard. We might need a global EventBus or rely on Dashboard re-fetching.
        // For now, let's assume user accepts they might need to refresh or we can trigger a soft reload if critical.
        // Actually, since we are adding to DB, next time Dashboard fetches it will be there.
        // To make it live, we would need Expenses to be in a Context. 
        // For this task, "Auto-add" means it's in the DB.

      } else {
        // No account selected?! Fallback or error.
        console.warn("No selected account for auto-add");
        await addSystemNotification(
          'Analysis Complete',
          'Receipt analyzed but no account selected. Please add manually.',
          NotificationType.WARNING
        );
      }

    } catch (error) {
      console.error('Background analysis failed:', error);
      await addSystemNotification(
        'Analysis Failed',
        'Could not analyze the shared receipt.',
        NotificationType.ERROR
      );
      setToast({ message: 'Receipt analysis failed', type: 'error' });
    }

  }, [selectedAccount, addSystemNotification]);

  // Check for shared files on mount and visibility change
  useEffect(() => {
    handleSharedFile();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleSharedFile();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [handleSharedFile]);


  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, clearAll, addSystemNotification }}>
      {children}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
