/**
 * Kindle Free Books - Unified Data Store Module
 * Encapsulates LocalStorage (history, favorites, settings) & IndexedDB (offline blobs, custom books).
 */

(() => {
  const STORAGE_KEYS = {
    HISTORY: 'kfb_reading_history',
    FAVORITES: 'kfb_favorites',
    SETTINGS: 'kfb_reader_settings',
    VIEW_MODE: 'kfb_view_mode',
    THEME: 'kfb_theme'
  };

  const ls = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  });

  const listeners = new Set();

  function notifyChange(type, payload) {
    listeners.forEach(cb => {
      try { cb(type, payload); } catch (e) { console.error('Store listener error:', e); }
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (Object.values(STORAGE_KEYS).includes(e.key)) {
        notifyChange('storage_sync', { key: e.key });
      }
    });
  }

  const BookStore = {
    // 1. Favorites
    getFavorites() {
      try {
        const raw = ls.getItem(STORAGE_KEYS.FAVORITES);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    },

    isFavorite(bookId) {
      return this.getFavorites().includes(bookId);
    },

    toggleFavorite(bookId) {
      const favs = this.getFavorites();
      const idx = favs.indexOf(bookId);
      let isFav = false;
      if (idx > -1) {
        favs.splice(idx, 1);
        isFav = false;
      } else {
        favs.unshift(bookId);
        isFav = true;
      }
      ls.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favs));
      notifyChange('favorites_changed', { bookId, isFavorite: isFav });
      return isFav;
    },

    // 2. Reading History & Progress
    getAllProgress() {
      try {
        const raw = ls.getItem(STORAGE_KEYS.HISTORY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    },

    getProgress(bookId) {
      const all = this.getAllProgress();
      return all[bookId] || null;
    },

    saveProgress(bookId, data) {
      try {
        const all = this.getAllProgress();
        const existing = all[bookId] || {};
        all[bookId] = {
          ...existing,
          ...data,
          bookId,
          lastReadTime: Date.now()
        };
        ls.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(all));
        notifyChange('progress_saved', { bookId, data: all[bookId] });
      } catch (e) {
        console.warn('Failed to save reading progress:', e);
      }
    },

    deleteProgress(bookId) {
      try {
        const all = this.getAllProgress();
        if (all[bookId]) {
          delete all[bookId];
          ls.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(all));
          notifyChange('progress_deleted', { bookId });
        }
      } catch (e) {
        console.warn('Failed to delete reading progress:', e);
      }
    },

    clearAllHistory() {
      try {
        ls.removeItem(STORAGE_KEYS.HISTORY);
        notifyChange('history_cleared', {});
      } catch (e) {}
    },

    getRecentBooks(limit = 100) {
      const all = this.getAllProgress();
      return Object.values(all)
        .sort((a, b) => (b.lastReadTime || 0) - (a.lastReadTime || 0))
        .slice(0, limit);
    },

    // 3. User Settings & Preferences
    getSettings() {
      if (typeof BookStorage !== 'undefined' && BookStorage.getSettings) {
        return BookStorage.getSettings();
      }
      return {
        theme: 'paper',
        fontSize: 18,
        lineHeight: 1.8,
        fontFamily: 'serif',
        maxWidth: 820
      };
    },

    saveSettings(settings) {
      if (typeof BookStorage !== 'undefined' && BookStorage.saveSettings) {
        return BookStorage.saveSettings(settings);
      }
    },

    getViewMode() {
      return ls.getItem(STORAGE_KEYS.VIEW_MODE) || 'grid';
    },

    saveViewMode(mode) {
      ls.setItem(STORAGE_KEYS.VIEW_MODE, mode);
      notifyChange('view_mode_changed', { mode });
    },

    // 4. Offline Cached Books & Custom Uploads (via BookDB)
    async getCachedBooks() {
      if (typeof BookDB !== 'undefined' && BookDB.getAllCachedBooks) {
        return await BookDB.getAllCachedBooks();
      }
      return [];
    },

    async isCached(bookId) {
      if (typeof BookDB !== 'undefined' && BookDB.hasBook) {
        return await BookDB.hasBook(bookId);
      }
      return false;
    },

    async getCustomBooks() {
      if (typeof BookDB !== 'undefined' && BookDB.getAllCustomBooks) {
        return await BookDB.getAllCustomBooks();
      }
      return [];
    },

    async saveCustomBook(bookId, blob, meta) {
      if (typeof BookDB !== 'undefined' && BookDB.saveBook) {
        const res = await BookDB.saveBook(bookId, blob, { ...meta, isCustom: true });
        notifyChange('custom_book_saved', { bookId });
        return res;
      }
      return false;
    },

    async deleteBook(bookId) {
      if (typeof BookDB !== 'undefined' && BookDB.deleteBook) {
        const res = await BookDB.deleteBook(bookId);
        notifyChange('book_deleted', { bookId });
        return res;
      }
      return false;
    },

    // 5. Reactive Listener
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    _notify: notifyChange
  };

  window.BookStore = BookStore;
})();
