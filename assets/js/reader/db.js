/**
 * IndexedDB storage for offline book file caching and custom uploaded books.
 */

(() => {
  const DB_NAME = 'KindleFreeBooksDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'cached_books';

function getIDB() {
  if (typeof window !== 'undefined' && window.indexedDB) return window.indexedDB;
  if (typeof indexedDB !== 'undefined') return indexedDB;
  return null;
}

function openDB() {
  const idb = getIDB();
  if (!idb) return Promise.reject(new Error('IndexedDB 不可用'));

  return new Promise((resolve, reject) => {
    try {
      const request = idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

const BookDB = {
  async saveBook(id, blob, meta = {}) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const entry = {
          id,
          blob,
          updatedAt: Date.now(),
          ...meta
        };
        const req = store.put(entry);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('BookDB.saveBook failed:', e);
      return false;
    }
  },

  async getBook(id) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result ? req.result.blob : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  },

  async hasBook(id) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.count(id);
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return false;
    }
  },

  async deleteBook(id) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return false;
    }
  },

  async getAllCustomBooks() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const custom = (req.result || []).filter(item => item.isCustom);
          resolve(custom);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return [];
    }
  },

  async getAllCachedBooks() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const cached = (req.result || []).map(item => ({
            id: item.id,
            title: item.title,
            author: item.author,
            format: item.format,
            isCustom: !!item.isCustom,
            updatedAt: item.updatedAt,
            size: item.blob ? item.blob.size : 0
          }));
          resolve(cached);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return [];
    }
  }
};

  window.BookDB = BookDB;
})();

