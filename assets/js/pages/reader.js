/**
 * Kindle Free Books - Standalone Reader Page Controller
 * Handles URL parameter parsing (?id=...&chapter=...), metadata lookup,
 * automatic resumption, and mobile viewport stabilization.
 */

(() => {
  async function loadBookMetadata(bookId) {
    // 1. Check custom uploaded books in IndexedDB
    if (typeof BookDB !== 'undefined' && BookDB.getAllCustomBooks) {
      try {
        const customBooks = await BookDB.getAllCustomBooks();
        const custom = customBooks.find(b => b.id === bookId);
        if (custom) return custom;
      } catch (e) {
        console.warn('Failed to query custom books:', e);
      }
    }

    // 2. Check books.json catalog
    try {
      const res = await fetch(window.AppConfig?.catalogUrl || 'books.json');
      if (res.ok) {
        const data = await res.json();
        const found = (data.books || []).find(b => b.id === bookId);
        if (found) return found;
      }
    } catch (e) {
      console.warn('Failed to load books.json:', e);
    }

    // 3. Check localStorage reading history
    if (typeof BookStore !== 'undefined') {
      const saved = BookStore.getProgress(bookId);
      if (saved) return saved;
    }

    return null;
  }

  function showMissingBookUI(message = '未指定要阅读的书籍') {
    const loading = document.getElementById('reader-loading');
    if (loading) loading.style.display = 'none';

    const contentArea = document.getElementById('reader-chapter-content');
    if (contentArea) {
      contentArea.innerHTML = `
        <div style="text-align: center; padding: 5rem 1.5rem; max-width: 500px; margin: 0 auto;">
          <div style="font-size: 3.5rem; margin-bottom: 1rem;">📖</div>
          <h2 style="font-size: 1.4rem; margin-bottom: 0.75rem; color: var(--r-text);">${message}</h2>
          <p style="color: var(--r-muted); font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem;">
            请从藏书阁或个人书房中选择一本图书开启阅读，享受沉浸式排版与自动记忆。
          </p>
          <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
            <a href="index.html" class="reader-nav-btn" style="text-decoration: none; display: inline-block;">🏛️ 前往藏书阁</a>
            <a href="bookshelf.html" class="reader-nav-btn" style="text-decoration: none; display: inline-block;">🔖 我的书房</a>
          </div>
        </div>
      `;
    }
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    let bookId = params.get('id');
    const chapterParam = params.get('chapter');
    const initialChapter = chapterParam !== null ? parseInt(chapterParam, 10) : null;

    // Adapt exit button label based on referrer
    const exitTextEl = document.getElementById('reader-exit-text');
    if (exitTextEl && document.referrer) {
      if (document.referrer.includes('bookshelf.html')) {
        exitTextEl.textContent = '书架';
      } else if (document.referrer.includes('index.html')) {
        exitTextEl.textContent = '书库';
      }
    }

    // If no book id in URL, try to auto-resume the most recent book
    if (!bookId) {
      if (typeof BookStore !== 'undefined') {
        const recents = BookStore.getRecentBooks(1);
        if (recents && recents.length > 0) {
          bookId = recents[0].bookId;
          // Silently update URL
          const url = new URL(window.location.href);
          url.searchParams.set('id', bookId);
          window.history.replaceState(null, '', url.toString());
        }
      }
    }

    if (!bookId) {
      showMissingBookUI();
      return;
    }

    // Show loading
    if (window.Reader) {
      window.Reader.showLoading('正在检索图书信息...');
    }

    const book = await loadBookMetadata(bookId);

    if (!book) {
      showMissingBookUI('未找到该书籍数据，可能已被移除');
      return;
    }

    document.title = `${book.title} · 在线阅读 · Kindle Free Books`;

    // Open book in standalone mode
    if (window.Reader) {
      window.Reader.openBook(book, {
        isStandalone: true,
        initialChapter: (initialChapter !== null && !isNaN(initialChapter)) ? initialChapter : null
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
