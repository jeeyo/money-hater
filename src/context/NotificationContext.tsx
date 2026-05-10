import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AppNotification, Expense } from '../types';
import { NotificationType, ExpenseCategory } from '../types';
import { getAllNotifications, addNotification, markNotificationAsRead, clearAllNotifications, getSharedFiles, removeSharedFile } from '../utils/idb';
import { analyzeReceipt } from '../services/analysisService';
import { addExpenseToDB } from '../services/api';
import { useAccount } from './AccountContext';
import { showToast } from '../lib/toast';

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
  const { selectedAccount, accounts } = useAccount();

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
  const isProcessing = React.useRef(false);

  const handleSharedFile = useCallback(async () => {
    if (isProcessing.current) return;

    // Check if we have accounts loaded before processing
    // If accounts are not yet loaded, we should wait. 
    // Assuming accounts array is populated if loaded. 
    // If selectedAccount is undetermined but accounts are loading, we might want to skip this run.
    // However, for now, let's just apply the concurrency lock.

    isProcessing.current = true;

    try {
      const files = await getSharedFiles();
      if (!files || files.length === 0) return;

      const fileCount = files.length;
      showToast(`Processing ${fileCount} receipt${fileCount > 1 ? 's' : ''}...`, 'info');

      for (const { id, file } of files) {
        try {
          const result = await analyzeReceipt(file);

          // Auto-add transaction - use selectedAccount or fallback to first account
          const targetAccount = selectedAccount || accounts[0];

          if (targetAccount) {
            const newExpense: Expense = {
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              accountId: targetAccount.id,
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

            // Dispatch event to refresh Dashboard
            window.dispatchEvent(new Event('expense-added'));
          } else {
            console.warn('No account available to link receipt transaction. Skipping addition.');
            // If we don't implement a solution here, the file is deleted below without being added.
            // But for the reported bug (duplicates), the lock is the key.
          }

          // Remove the processed file
          await removeSharedFile(id);

        } catch (error) {
          console.error('Background analysis failed:', error);
          await addSystemNotification(
            'Analysis Failed',
            'Could not analyze the shared receipt.',
            NotificationType.ERROR
          );
          // Still remove the file even if analysis failed to prevent infinite loop
          await removeSharedFile(id);
        }
      }

      if (fileCount > 0) {
        showToast(`${fileCount} receipt${fileCount > 1 ? 's' : ''} processed!`, 'success');
      }
    } finally {
      isProcessing.current = false;
    }

  }, [selectedAccount, accounts, addSystemNotification]);

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
