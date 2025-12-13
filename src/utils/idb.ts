// IndexedDB utilities for shared files

const DB_NAME = 'shared-files-db';
const STORE_NAME = 'files';
const FILE_KEY = 'receipt';

const NOTIFICATION_STORE_NAME = 'notifications';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2); // Upgrade version to 2

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(NOTIFICATION_STORE_NAME)) {
        const store = db.createObjectStore(NOTIFICATION_STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('read', 'read', { unique: false });
      }
    };
  });
}

export async function getSharedFile(): Promise<File | null> {
  // console.log('[IDB] getSharedFile called');
  try {
    const db = await openDB();
    // console.log('[IDB] Database opened');
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(FILE_KEY);

      request.onsuccess = () => {
        // console.log('[IDB] File retrieved:', request.result);
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        console.error('[IDB] Error retrieving file:', request.error);
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[IDB] Error getting shared file:', error);
    return null;
  }
}

export async function clearSharedFile(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(FILE_KEY);

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('Error clearing shared file:', error);
  }
}

import type { AppNotification } from '../types';

export async function getAllNotifications(): Promise<AppNotification[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([NOTIFICATION_STORE_NAME], 'readonly');
      const store = transaction.objectStore(NOTIFICATION_STORE_NAME);
      const index = store.index('timestamp');
      // Get all, but reversed would require cursor, for simplicity getting all and sorting in memory
      // or using openCursor(null, 'prev')
      const request = index.getAll();

      request.onsuccess = () => {
        db.close();
        // Return mostly recent first
        const results = (request.result as AppNotification[]).sort((a, b) => b.timestamp - a.timestamp);
        resolve(results);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    return [];
  }
}

export async function addNotification(notification: AppNotification): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([NOTIFICATION_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(NOTIFICATION_STORE_NAME);
      store.put(notification);

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('Error adding notification:', error);
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([NOTIFICATION_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(NOTIFICATION_STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        const notification = request.result as AppNotification;
        if (notification) {
          notification.read = true;
          store.put(notification);
        }
      };

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
}

export async function clearAllNotifications(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([NOTIFICATION_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(NOTIFICATION_STORE_NAME);
      store.clear();

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('Error clearing notifications:', error);
  }
}
