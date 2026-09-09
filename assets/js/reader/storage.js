/**
 * LocalStorage wrapper for reading history, favorites, and user preferences.
 */

(() => {
  const STORAGE_KEYS = {
    HISTORY: 'kfb_reading_history',
    FAVORITES: 'kfb_favorites',
    SETTINGS: 'kfb_reader_settings',
    CUSTOM_BOOKS: 'kfb_custom_books_meta'
  };

  const storage = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  });

  const DEFAULT_SETTINGS = {
    theme: 'paper', // 'paper' (light), 'sepia' (eye-care), 'dark' (dim), 'black' (OLED)
    fontSize: 18,
    lineHeight: 1.8,
    fontFamily: 'serif', // 'serif', 'sans', 'kaiti'
    maxWidth: 820
  };

  const BookStorage = {
  // Reading Progress History
  saveProgress(bookId, data) {
    try {
      const history = this.getAllHistory();
      const existing = history[bookId] || {};
      history[bookId] = {
        ...existing,
        ...data,
        bookId,
        lastReadTime: Date.now()
      };
      storage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
      if (typeof window !== 'undefined' && window.BookStore && window.BookStore._notify) {
        window.BookStore._notify('progress_saved', { bookId, data: history[bookId] });
      }
    } catch (e) {
      console.warn('Failed to save progress to localStorage:', e);
    }
  },

  getProgress(bookId) {
    try {
      const history = this.getAllHistory();
      return history[bookId] || null;
    } catch (e) {
      return null;
    }
  },

  getAllHistory() {
    try {
      const raw = storage.getItem(STORAGE_KEYS.HISTORY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  getRecentBooks(limit = 10) {
    const history = this.getAllHistory();
    return Object.values(history)
      .sort((a, b) => (b.lastReadTime || 0) - (a.lastReadTime || 0))
      .slice(0, limit);
  },

  // Favorites
  getFavorites() {
    try {
      const raw = storage.getItem(STORAGE_KEYS.FAVORITES);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  isFavorite(bookId) {
    const favs = this.getFavorites();
    return favs.includes(bookId);
  },

  toggleFavorite(bookId) {
    const favs = this.getFavorites();
    const index = favs.indexOf(bookId);
    let isFav = false;
    if (index > -1) {
      favs.splice(index, 1);
      isFav = false;
    } else {
      favs.unshift(bookId);
      isFav = true;
    }
    storage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favs));
    if (typeof window !== 'undefined' && window.BookStore && window.BookStore._notify) {
      window.BookStore._notify('favorites_changed', { bookId, isFavorite: isFav });
    }
    return isFav;
  },

  // Reader Settings
  getSettings() {
    try {
      const raw = storage.getItem(STORAGE_KEYS.SETTINGS);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  },

  saveSettings(settings) {
    try {
      const current = this.getSettings();
      const updated = { ...current, ...settings };
      storage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      return updated;
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  }
};

  window.BookStorage = BookStorage;
})();
