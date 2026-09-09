/**
 * Kindle Free Books - Dedicated Bookshelf Page Controller
 */

(() => {
  const state = {
    allBooks: [],
    customBooks: [],
    cachedBooks: [],
    favorites: [],
    history: [],
    activeTab: 'favs', // 'favs' | 'history' | 'cached' | 'custom'
    searchQuery: '',
    viewMode: window.BookStore ? window.BookStore.getViewMode() : 'grid',
    activeBook: null
  };

  const dom = {
    // Stats
    statFavs: document.getElementById('stat-favs'),
    statHistory: document.getElementById('stat-history'),
    statCached: document.getElementById('stat-cached'),
    statCustom: document.getElementById('stat-custom'),
    // Tab buttons & badges
    tabFavs: document.getElementById('tab-favs-btn'),
    tabHistory: document.getElementById('tab-history-btn'),
    tabCached: document.getElementById('tab-cached-btn'),
    tabCustom: document.getElementById('tab-custom-btn'),
    badgeFavs: document.getElementById('tab-favs-count'),
    badgeHistory: document.getElementById('tab-history-count'),
    badgeCached: document.getElementById('tab-cached-count'),
    badgeCustom: document.getElementById('tab-custom-count'),
    // Search & view mode
    searchInput: document.getElementById('bs-search-input'),
    viewGridBtn: document.getElementById('view-grid-btn'),
    viewListBtn: document.getElementById('view-list-btn'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    // Containers
    booksContainer: document.getElementById('bookshelf-container'),
    // Upload & Theme & Navbar
    uploadBtn: document.getElementById('nav-upload-btn'),
    shelfCountBadge: document.getElementById('shelf-count-badge'),
    fileInput: document.getElementById('local-book-input'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    // Drawer
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    drawer: document.getElementById('book-drawer'),
    drawerCloseBtn: document.getElementById('drawer-close-btn'),
    drawerBody: document.getElementById('drawer-body'),
    drawerReadBtn: document.getElementById('drawer-read-btn'),
    drawerDownloadBtn: document.getElementById('drawer-download-btn'),
    drawerCopyBtn: document.getElementById('drawer-copy-btn')
  };

  async function init() {
    BookUI.initTheme(dom.themeToggleBtn);
    BookUI.initMobileHeader();
    setupEvents();

    // Check URL query param for default tab: e.g. ?tab=history
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (['favs', 'history', 'cached', 'custom'].includes(tabParam)) {
      state.activeTab = tabParam;
    }

    // Render immediate local state from localStorage before remote fetch
    refreshStateData();
    renderStats();
    renderTabs();
    renderBooks();

    await loadData();
    renderStats();
    renderTabs();
    renderBooks();

    window.bookshelfReady = true;

    // Listen to store changes (favorites, progress, etc.)
    if (window.BookStore) {
      window.BookStore.onChange(() => {
        refreshStateData();
        renderStats();
        renderTabs();
        renderBooks();
      });
    }
  }

  async function loadData() {
    // 1. Fetch catalog
    try {
      const res = await fetch(window.AppConfig?.catalogUrl || 'books.json');
      if (res.ok) {
        const data = await res.json();
        state.allBooks = BookUI.groupBooks(data.books || []);
      }
    } catch (e) {
      console.warn('Failed to load books.json:', e);
    }

    // 2. Custom books from IndexedDB
    try {
      if (window.BookStore) {
        state.customBooks = await window.BookStore.getCustomBooks();
      }
    } catch (e) {
      console.warn('Failed to load custom books:', e);
    }

    // 3. Cached offline books
    try {
      if (window.BookStore) {
        state.cachedBooks = await window.BookStore.getCachedBooks();
      }
    } catch (e) {
      console.warn('Failed to load cached books:', e);
    }

    refreshStateData();
  }

  function refreshStateData() {
    if (window.BookStore) {
      state.favorites = window.BookStore.getFavorites();
      state.history = window.BookStore.getRecentBooks(200);
    }
  }

  function getBookById(id) {
    // Check in allBooks
    let b = state.allBooks.find(item => item.id === id || (item.formats && item.formats.some(f => f.id === id)));
    if (b) return b;
    // Check in customBooks
    b = state.customBooks.find(item => item.id === id);
    if (b) return b;
    // Check in history
    const hist = state.history.find(item => item.bookId === id);
    if (hist) {
      return {
        id: hist.bookId,
        title: hist.title || '未知书名',
        author: hist.author || '佚名',
        category: hist.category || '我的书架',
        format: hist.format || 'mobi',
        path: hist.path || '',
        blob: hist.blob || null
      };
    }
    // Check in cachedBooks
    const cached = state.cachedBooks.find(item => item.id === id);
    if (cached) {
      return {
        id: cached.id,
        title: cached.title || '离线图书',
        author: cached.author || '佚名',
        category: '离线缓存',
        format: cached.format || 'mobi',
        size: cached.size || 0
      };
    }
    // Fallback stub if id exists in favorites but books.json hasn't finished loading yet
    return {
      id: id,
      title: '正在加载图书...',
      author: '',
      category: '书房',
      format: 'mobi',
      path: ''
    };
  }

  function renderStats() {
    if (dom.statFavs) dom.statFavs.textContent = state.favorites.length;
    if (dom.statHistory) dom.statHistory.textContent = state.history.length;
    if (dom.statCached) dom.statCached.textContent = state.cachedBooks.length;
    if (dom.statCustom) dom.statCustom.textContent = state.customBooks.length;
    if (dom.shelfCountBadge) {
      const uniqueShelf = new Set([
        ...state.favorites,
        ...state.history.map(h => h.id),
        ...state.cachedBooks.map(c => c.id),
        ...state.customBooks.map(c => c.id)
      ]);
      dom.shelfCountBadge.textContent = uniqueShelf.size;
    }
  }

  function renderTabs() {
    const tabs = [
      { id: 'favs', btn: dom.tabFavs, badge: dom.badgeFavs, count: state.favorites.length },
      { id: 'history', btn: dom.tabHistory, badge: dom.badgeHistory, count: state.history.length },
      { id: 'cached', btn: dom.tabCached, badge: dom.badgeCached, count: state.cachedBooks.length },
      { id: 'custom', btn: dom.tabCustom, badge: dom.badgeCustom, count: state.customBooks.length },
    ];

    tabs.forEach(t => {
      if (!t.btn) return;
      t.btn.classList.toggle('active', state.activeTab === t.id);
      if (t.badge) t.badge.textContent = t.count;
    });

    if (dom.clearHistoryBtn) {
      dom.clearHistoryBtn.style.display = (state.activeTab === 'history' && state.history.length > 0) ? 'inline-flex' : 'none';
    }
  }

  function getBooksForCurrentTab() {
    let list = [];
    if (state.activeTab === 'favs') {
      list = state.favorites.map(id => getBookById(id)).filter(Boolean);
    } else if (state.activeTab === 'history') {
      list = state.history.map(hist => {
        const fullBook = getBookById(hist.bookId);
        return {
          ...(fullBook || {}),
          id: hist.bookId,
          title: hist.title || (fullBook ? fullBook.title : '未知书名'),
          author: hist.author || (fullBook ? fullBook.author : '佚名'),
          category: (fullBook && fullBook.category) || '历史记录',
          format: hist.format || (fullBook ? fullBook.format : 'txt'),
          historyMeta: hist
        };
      });
    } else if (state.activeTab === 'cached') {
      list = state.cachedBooks.map(cb => {
        const fullBook = getBookById(cb.id);
        return {
          ...(fullBook || {}),
          id: cb.id,
          title: cb.title || (fullBook ? fullBook.title : '离线图书'),
          author: cb.author || (fullBook ? fullBook.author : '佚名'),
          format: cb.format || (fullBook ? fullBook.format : 'mobi'),
          category: (fullBook && fullBook.category) || '离线缓存',
          size: cb.size || (fullBook ? fullBook.size : 0),
          sizeFormatted: BookUI.formatSize(cb.size || (fullBook ? fullBook.size : 0)),
          isCachedOffline: true
        };
      });
    } else if (state.activeTab === 'custom') {
      list = state.customBooks;
    }

    // Filter by search query
    const q = state.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(b => {
        const title = (b.title || '').toLowerCase();
        const author = (b.author || '').toLowerCase();
        const cat = (b.category || '').toLowerCase();
        return title.includes(q) || author.includes(q) || cat.includes(q);
      });
    }

    return list;
  }

  function renderBooks() {
    const books = getBooksForCurrentTab();

    if (books.length === 0) {
      renderEmptyState();
      return;
    }

    if (state.viewMode === 'grid') {
      renderGridView(books);
    } else {
      renderListView(books);
    }
  }

  function renderEmptyState() {
    const emptyConfigs = {
      favs: {
        icon: '⭐',
        title: '书架暂无收藏书籍',
        desc: '在藏书阁浏览任何书籍时，点击卡片右上角的小星星 ⭐，即可加入专属书房。',
        btnText: '探索藏书阁',
        btnHref: 'index.html'
      },
      history: {
        icon: '📖',
        title: '暂无阅读记录',
        desc: '您阅读的任何章节与进度都会自动保存在这里，换章节或重启浏览器都能秒级继续阅读。',
        btnText: '去挑选一本书开始阅读',
        btnHref: 'index.html'
      },
      cached: {
        icon: '💾',
        title: '暂无离线缓存书籍',
        desc: '阅读任意图书时，点击顶部工具栏的「💾 离线」按钮，整本书将缓存至浏览器本地，断网也能阅读。',
        btnText: '去藏书阁挑选书籍',
        btnHref: 'index.html'
      },
      custom: {
        icon: '📥',
        title: '暂无本地导入书籍',
        desc: '支持导入您本地的 .epub、.mobi、.txt 电子书，数据完全保存在您的本地浏览器中，绝不上载云端。',
        btnText: '立即导入本地电子书',
        action: () => dom.fileInput && dom.fileInput.click()
      }
    };

    const cfg = emptyConfigs[state.activeTab] || emptyConfigs.favs;

    dom.booksContainer.innerHTML = `
      <div class="bookshelf-empty-state">
        <div class="empty-icon">${cfg.icon}</div>
        <h3 class="empty-title">${BookUI.escapeHtml(cfg.title)}</h3>
        <p class="empty-desc">${BookUI.escapeHtml(cfg.desc)}</p>
        ${cfg.btnHref ? `
          <a href="${cfg.btnHref}" class="btn btn-read empty-action-btn">${BookUI.escapeHtml(cfg.btnText)}</a>
        ` : `
          <button class="btn btn-read empty-action-btn" id="empty-action-btn">${BookUI.escapeHtml(cfg.btnText)}</button>
        `}
      </div>
    `;

    const emptyBtn = document.getElementById('empty-action-btn');
    if (emptyBtn && cfg.action) {
      emptyBtn.onclick = cfg.action;
    }
  }

  function renderGridView(books) {
    const html = `
      <div class="book-grid">
        ${books.map(book => {
          const pal = BookUI.getPalette(book);
          const isFav = window.BookStore.isFavorite(book.id);
          const hist = state.activeTab === 'history' ? book.historyMeta : window.BookStore.getProgress(book.id);

          let historyInfo = '';
          if (hist) {
            const pct = hist.overallPercent || 0;
            const chap = hist.chapterTitle || `第 ${(hist.chapterIndex || 0) + 1} 节`;
            const timeAgo = BookUI.formatTimeAgo(hist.lastReadTime);
            historyInfo = `
              <div class="card-history-meta">
                <div class="history-progress-wrap">
                  <div class="history-progress-fill" style="width: ${pct}%;"></div>
                </div>
                <div class="history-text-row">
                  <span>${BookUI.escapeHtml(chap)} (${pct}%)</span>
                  <span class="history-time">${BookUI.escapeHtml(timeAgo)}</span>
                </div>
              </div>
            `;
          }

          const offlineBadge = (book.isCachedOffline || state.activeTab === 'cached')
            ? `<span class="badge badge-offline">离线可用</span>`
            : '';

          return `
            <article class="book-card" data-id="${book.id}">
              <div class="book-cover" style="background: ${pal.bg};" onclick="openDrawer('${book.id}')">
                <div class="cover-header">
                  <div class="cover-badges">
                    <span class="cover-category-badge">${BookUI.escapeHtml(book.category || '书籍')}</span>
                    <span class="cover-format-badge">${BookUI.escapeHtml((book.format || '').toUpperCase())}</span>
                  </div>
                  <button class="cover-fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleBookFav('${book.id}');" title="${isFav ? '已收藏' : '加入收藏'}">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? '#fbbf24' : 'none'}" stroke="${isFav ? '#fbbf24' : '#ffffff'}" stroke-width="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                  </button>
                </div>
                <div class="cover-title" title="${BookUI.escapeHtml(book.title)}">${BookUI.escapeHtml(book.title)}</div>
              </div>
              
              <div class="card-content">
                <div class="card-header-info">
                  <div class="card-author">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    <span>${BookUI.escapeHtml(book.author || '佚名')}</span>
                  </div>
                  ${historyInfo}
                  <div class="card-desc">${BookUI.escapeHtml(book.description || book.excerpt || '')}</div>
                </div>

                <div class="card-footer">
                  <div class="file-info">
                    <span>${BookUI.escapeHtml(book.sizeFormatted || BookUI.formatSize(book.size))}</span>
                    ${offlineBadge}
                  </div>
                  <div class="card-buttons">
                    <button class="btn btn-read" onclick="event.stopPropagation(); openReader('${book.id}');" title="立即免插件在浏览器中阅读">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                      ${hist ? '继续阅读' : '阅读'}
                    </button>
                    ${state.activeTab === 'history' ? `
                      <button class="btn btn-secondary" onclick="event.stopPropagation(); deleteHistoryItem('${book.id}');" title="清除该条阅读进度">移除</button>
                    ` : (state.activeTab === 'cached' ? `
                      <button class="btn btn-secondary" onclick="event.stopPropagation(); removeCachedItem('${book.id}');" title="删除离线缓存">移除</button>
                    ` : (state.activeTab === 'custom' ? `
                      <button class="btn btn-secondary" onclick="event.stopPropagation(); deleteCustomBookItem('${book.id}');" title="删除本地书">删除</button>
                    ` : `
                      <button class="btn btn-secondary" onclick="openDrawer('${book.id}')">详情</button>
                    `))}
                  </div>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
    dom.booksContainer.innerHTML = html;
  }

  function renderListView(books) {
    const html = `
      <div class="table-container">
        <table class="library-table">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">收藏</th>
              <th>书名</th>
              <th>作者</th>
              <th>分类</th>
              <th>格式</th>
              <th>阅读进度 / 大小</th>
              <th style="text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            ${books.map(book => {
              const isFav = book.formats && book.formats.length > 0
                ? book.formats.some(f => window.BookStore.isFavorite(f.id))
                : window.BookStore.isFavorite(book.id);
              const hist = state.activeTab === 'history' ? book.historyMeta : window.BookStore.getProgress(book.id);
              const progressHtml = hist
                ? `<div class="list-row-progress" style="font-size: 0.78rem; color: #10b981; font-weight: 700;">已读 ${hist.overallPercent || 0}% · ${BookUI.formatTimeAgo(hist.lastReadTime)}</div>`
                : `<div class="list-row-progress" style="font-size: 0.78rem; color: var(--text-faint);">未读</div>`;
              const formatUpper = (book.format || '').toUpperCase();
              const multiBadge = (book.formats && book.formats.length > 1)
                ? `<span class="badge-multi-inline" title="包含多种格式版本">+${book.formats.length - 1}</span>`
                : '';

              return `
                <tr class="table-card-row" data-id="${book.id}">
                  <td class="col-fav" style="text-align: center;">
                    <button class="table-fav-btn" style="background: none; border: none; cursor: pointer; padding: 4px;" onclick="toggleBookFav('${book.id}');" title="${isFav ? '已收藏' : '加入收藏'}">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? '#fbbf24' : 'none'}" stroke="${isFav ? '#fbbf24' : 'var(--text-faint)'}" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                      </svg>
                    </button>
                  </td>
                  <td class="col-title">
                    <strong class="table-book-title" style="color: var(--text-main); cursor: pointer;" onclick="openDrawer('${book.id}')">${BookUI.escapeHtml(book.title)}</strong>
                  </td>
                  <td class="col-author">${BookUI.escapeHtml(book.author || '佚名')}</td>
                  <td class="col-cat">${BookUI.escapeHtml(book.category || '书房')}</td>
                  <td class="col-format">
                    <span class="cover-format-badge" style="background: var(--bg-hover); color: var(--text-main);">${BookUI.escapeHtml(formatUpper)}${multiBadge}</span>
                  </td>
                  <td class="col-meta">
                    ${progressHtml}
                    <div class="col-size" style="font-size: 0.75rem; color: var(--text-faint);">${BookUI.escapeHtml(book.sizeFormatted || BookUI.formatSize(book.size))}</div>
                  </td>
                  <td class="col-actions" style="text-align: right; white-space: nowrap;">
                    <div class="table-actions-group">
                      <button class="btn btn-read table-action-btn" onclick="openReader('${book.id}')">
                        ${hist ? '继续阅读' : '阅读'}
                      </button>
                      ${state.activeTab === 'history' ? `
                        <button class="btn btn-secondary table-action-btn" onclick="deleteHistoryItem('${book.id}')">移除</button>
                      ` : (state.activeTab === 'cached' ? `
                        <button class="btn btn-secondary table-action-btn" onclick="removeCachedItem('${book.id}')">移除</button>
                      ` : (state.activeTab === 'custom' ? `
                        <button class="btn btn-secondary table-action-btn" onclick="deleteCustomBookItem('${book.id}')">删除</button>
                      ` : `
                        <button class="btn btn-secondary table-action-btn" onclick="openDrawer('${book.id}')">详情</button>
                      `))}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    dom.booksContainer.innerHTML = html;
  }

  // Event handlers
  function setupEvents() {
    // Tabs
    const tabMap = {
      'tab-favs-btn': 'favs',
      'tab-history-btn': 'history',
      'tab-cached-btn': 'cached',
      'tab-custom-btn': 'custom'
    };
    Object.entries(tabMap).forEach(([btnId, tabKey]) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.onclick = () => {
          state.activeTab = tabKey;
          renderTabs();
          renderBooks();
          // Sync URL query without reloading
          const url = new URL(window.location.href);
          url.searchParams.set('tab', tabKey);
          window.history.replaceState({}, '', url);
        };
      }
    });

    // Search
    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderBooks();
      });
    }

    // View mode
    if (dom.viewGridBtn && dom.viewListBtn) {
      dom.viewGridBtn.onclick = () => setViewMode('grid');
      dom.viewListBtn.onclick = () => setViewMode('list');
      updateViewModeBtns();
    }

    // Clear history
    if (dom.clearHistoryBtn) {
      dom.clearHistoryBtn.onclick = () => {
        if (confirm('确定要清空所有阅读记录吗？这不会影响您的收藏或离线书籍。')) {
          window.BookStore.clearAllHistory();
          BookUI.showToast('已清空所有阅读进度');
          refreshStateData();
          renderStats();
          renderTabs();
          renderBooks();
        }
      };
    }

    // Drawer close events
    if (dom.drawerCloseBtn) dom.drawerCloseBtn.onclick = closeDrawer;
    if (dom.drawerBackdrop) dom.drawerBackdrop.onclick = closeDrawer;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.drawer && dom.drawer.classList.contains('active')) {
        closeDrawer();
      }
    });

    // File Upload
    if (dom.uploadBtn && dom.fileInput) {
      dom.uploadBtn.onclick = () => dom.fileInput.click();
      dom.fileInput.onchange = handleFileUpload;
    }
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    if (window.BookStore) window.BookStore.saveViewMode(mode);
    updateViewModeBtns();
    renderBooks();
  }

  function updateViewModeBtns() {
    if (dom.viewGridBtn) dom.viewGridBtn.classList.toggle('active', state.viewMode === 'grid');
    if (dom.viewListBtn) dom.viewListBtn.classList.toggle('active', state.viewMode === 'list');
  }

  // Actions
  window.toggleBookFav = function(id) {
    if (!window.BookStore) return;
    const isFav = window.BookStore.toggleFavorite(id);
    BookUI.showToast(isFav ? '已加入书房收藏' : '已取消收藏');
    refreshStateData();
    renderStats();
    renderTabs();
    renderBooks();

    if (dom.drawer && dom.drawer.classList.contains('active') && state.activeBook && state.activeBook.id === id) {
      const favBtn = dom.drawer.querySelector('.cover-fav-btn');
      if (favBtn) {
        favBtn.classList.toggle('active', isFav);
        favBtn.title = isFav ? '已收藏' : '收藏';
        const svg = favBtn.querySelector('svg');
        if (svg) {
          svg.setAttribute('fill', isFav ? '#fbbf24' : 'none');
          svg.setAttribute('stroke', isFav ? '#fbbf24' : '#ffffff');
        }
      }
    }
  };

  window.deleteHistoryItem = function(id) {
    if (!window.BookStore) return;
    window.BookStore.deleteProgress(id);
    BookUI.showToast('已清除该阅读记录');
    refreshStateData();
    renderStats();
    renderTabs();
    renderBooks();
  };

  window.removeCachedItem = async function(id) {
    if (typeof BookDB !== 'undefined') {
      await BookDB.deleteBook(id);
      BookUI.showToast('已移除离线缓存文件');
      state.cachedBooks = await BookDB.getAllCachedBooks();
      renderStats();
      renderTabs();
      renderBooks();
    }
  };

  window.deleteCustomBookItem = async function(id) {
    if (confirm('确定要删除这本本地导入的书籍吗？')) {
      if (typeof BookDB !== 'undefined') {
        await BookDB.deleteBook(id);
        if (window.BookStore) window.BookStore.deleteProgress(id);
        BookUI.showToast('已删除本地图书');
        state.customBooks = await BookDB.getAllCustomBooks();
        renderStats();
        renderTabs();
        renderBooks();
      }
    }
  };

  // Open Reader
  window.openReader = function(id) {
    window.location.href = `reader.html?id=${encodeURIComponent(id)}`;
  };

  // Tag navigation helper
  window.navigateToLibraryTag = function(tag) {
    window.location.href = `index.html?search=${encodeURIComponent(tag)}`;
  };

  // Open Detail Drawer
  window.openDrawer = async function(id) {
    if (!state.allBooks || state.allBooks.length === 0) {
      try {
        await loadData();
      } catch (e) {}
    }
    const book = getBookById(id);
    if (!book) return;
    state.activeBook = book;

    const formatsList = book.formats || [{
      id: book.id,
      format: book.format || 'mobi',
      size: book.size || 0,
      sizeFormatted: book.sizeFormatted || BookUI.formatSize(book.size || 0),
      path: book.path || '',
      blob: book.blob || null
    }];

    let selectedFormatId = formatsList.some(f => f.id === id) ? id : formatsList[0].id;
    let selectedFormatObj = formatsList.find(f => f.id === selectedFormatId) || formatsList[0];

    const isFav = book.formats && book.formats.length > 0
      ? book.formats.some(f => window.BookStore.isFavorite(f.id))
      : window.BookStore.isFavorite(book.id);
    const progress = window.BookStore ? window.BookStore.getProgress(book.id) : null;
    let isCached = false;
    if (window.BookDB && window.BookDB.hasBook) {
      try {
        isCached = await window.BookDB.hasBook(selectedFormatObj.id);
      } catch (e) {}
    }

    function renderDrawer() {
      dom.drawerBody.innerHTML = BookUI.renderDrawerContent(book, {
        isFav,
        progress,
        isCached,
        selectedFormatId: selectedFormatObj.id,
        onTagClick: 'navigateToLibraryTag'
      });

      updateDrawerActions();

      const formatBtns = dom.drawerBody.querySelectorAll('.drawer-format-btn');
      formatBtns.forEach(btn => {
        btn.onclick = async () => {
          const fid = btn.dataset.fid;
          const target = formatsList.find(f => f.id === fid);
          if (target) {
            selectedFormatObj = target;
            if (window.BookDB && window.BookDB.hasBook) {
              try { isCached = await window.BookDB.hasBook(target.id); } catch (e) {}
            }
            renderDrawer();
          }
        };
      });
    }

    function updateDrawerActions() {
      if (dom.drawerReadBtn) {
        dom.drawerReadBtn.onclick = () => {
          closeDrawer();
          openReader(selectedFormatObj.id);
        };
      }

      if (dom.drawerDownloadBtn) {
        if (selectedFormatObj.blob) {
          dom.drawerDownloadBtn.href = '#';
          dom.drawerDownloadBtn.onclick = (e) => {
            e.preventDefault();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(selectedFormatObj.blob);
            a.download = `${book.title}.${selectedFormatObj.format}`;
            a.click();
          };
        } else {
          dom.drawerDownloadBtn.onclick = null;
          dom.drawerDownloadBtn.href = selectedFormatObj.path
            ? (window.AppConfig?.resolveBookUrl(selectedFormatObj) || encodeURI(selectedFormatObj.path))
            : '#';
          dom.drawerDownloadBtn.download = `${book.title}.${selectedFormatObj.format}`;
        }
      }

      if (dom.drawerCopyBtn) {
        dom.drawerCopyBtn.onclick = () => {
          const url = `${window.location.origin}${window.location.pathname.replace('bookshelf.html', 'index.html')}?book=${encodeURIComponent(selectedFormatObj.id)}`;
          navigator.clipboard.writeText(url).then(() => {
            BookUI.showToast('已复制图书直达链接');
          }).catch(() => {
            BookUI.showToast('复制失败');
          });
        };
      }
    }

    renderDrawer();

    dom.drawerBackdrop.classList.add('active');
    dom.drawer.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  function closeDrawer() {
    if (dom.drawerBackdrop) dom.drawerBackdrop.classList.remove('active');
    if (dom.drawer) dom.drawer.classList.remove('active');
    document.body.style.overflow = '';
  }
  window.closeDrawer = closeDrawer;

  // Handle local file upload
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.epub', '.mobi', '.txt', '.azw', '.prc'].includes(ext)) {
      alert('目前仅支持导入 .epub, .mobi, .txt 格式的电子书！');
      return;
    }

    BookUI.showToast('正在解析并保存本地图书...');
    const bookId = 'custom_' + Date.now();
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '');

    const customBook = {
      id: bookId,
      title: cleanTitle,
      author: '本地上传',
      category: '本地导入',
      format: ext.replace('.', ''),
      size: file.size,
      sizeFormatted: BookUI.formatSize(file.size),
      isCustom: true,
      blob: file
    };

    try {
      if (typeof BookDB !== 'undefined') {
        await BookDB.saveBook(bookId, file, {
          title: cleanTitle,
          author: '本地上传',
          category: '本地导入',
          format: customBook.format,
          isCustom: true
        });
      }
      state.customBooks.unshift(customBook);
      state.activeTab = 'custom';
      renderStats();
      renderTabs();
      renderBooks();
      BookUI.showToast(`成功导入《${cleanTitle}》！`);
    } catch (err) {
      console.error('Failed to import book:', err);
      alert('导入失败，请稍后重试');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
