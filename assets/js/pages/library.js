/**
 * Kindle Free Books - Library Catalog Page Controller
 * Powers index.html with instant search, category/tag/format filtering,
 * pagination, continue-reading banner, and modal detail views.
 */

(() => {
  const state = {
    allBooks: [],
    customBooks: [],
    meta: {},
    filteredBooks: [],
    searchQuery: '',
    selectedCategory: '全部',
    selectedFormat: '全部',
    selectedTag: '',
    sortBy: 'default',
    viewMode: window.BookStore ? window.BookStore.getViewMode() : 'grid',
    currentPage: 1,
    pageSize: 36,
    activeBook: null,
    isCatExpanded: false,
    isTagsExpanded: false,
    _lastIsMobile: typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  };

  const dom = {
    searchInput: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search-btn'),
    sortSelect: document.getElementById('sort-select'),
    categoryChips: document.getElementById('category-chips'),
    tagChips: document.getElementById('tag-chips'),
    formatChips: document.getElementById('format-chips'),
    booksContainer: document.getElementById('books-container'),
    paginationContainer: document.getElementById('pagination-container'),
    matchInfo: document.getElementById('match-info-text'),
    viewGridBtn: document.getElementById('view-grid-btn'),
    viewListBtn: document.getElementById('view-list-btn'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    statTotalBooks: document.getElementById('stat-total-books'),
    statTotalSize: document.getElementById('stat-total-size'),
    statTotalCategories: document.getElementById('stat-total-categories'),
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    drawer: document.getElementById('book-drawer'),
    drawerCloseBtn: document.getElementById('drawer-close-btn'),
    drawerBody: document.getElementById('drawer-body'),
    drawerReadBtn: document.getElementById('drawer-read-btn'),
    drawerDownloadBtn: document.getElementById('drawer-download-btn'),
    drawerCopyBtn: document.getElementById('drawer-copy-btn'),
    toastShelf: document.getElementById('toast-shelf'),
    shelfCountBadge: document.getElementById('shelf-count-badge'),
    navUploadBtn: document.getElementById('nav-upload-btn'),
    localBookInput: document.getElementById('local-book-input'),
    recentReadingSection: document.getElementById('recent-reading-section'),
    recentBookTitle: document.getElementById('recent-book-title'),
    recentBookMeta: document.getElementById('recent-book-meta'),
    recentProgressBarFill: document.getElementById('recent-progress-bar-fill'),
    recentContinueBtn: document.getElementById('recent-continue-btn')
  };

  function isBookFav(book) {
    if (!window.BookStore || !book) return false;
    if (book.formats && book.formats.length > 0) {
      return book.formats.some(f => window.BookStore.isFavorite(f.id));
    }
    return window.BookStore.isFavorite(book.id);
  }

  function getBookProgress(book) {
    if (!window.BookStore || !book) return null;
    if (book.formats && book.formats.length > 0) {
      let best = null;
      for (const f of book.formats) {
        const p = window.BookStore.getProgress(f.id);
        if (p) {
          if (!best || (p.lastReadTime || 0) > (best.lastReadTime || 0)) {
            best = { ...p, formatId: f.id };
          }
        }
      }
      return best;
    }
    return window.BookStore.getProgress(book.id);
  }

  function getDownloadUrl(book) {
    if (!book) return '#';
    if (book.blob) return '#';
    return window.AppConfig
      ? window.AppConfig.resolveBookUrl(book)
      : encodeURI(book.path || '');
  }

  async function init() {
    BookUI.initTheme(dom.themeToggleBtn);
    setupEvents();

    // Check custom books
    if (window.BookStore) {
      try {
        state.customBooks = await window.BookStore.getCustomBooks();
      } catch (e) {}
    }

    try {
      const res = await fetch(window.AppConfig?.catalogUrl || 'books.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rawList = [...state.customBooks, ...(data.books || [])];
      state.allBooks = BookUI.groupBooks(rawList);
      state.meta = data.meta || {};
      state.meta.totalWorks = state.allBooks.length;

      renderStats();
      renderRecentBooks();
      updateShelfBadge();
      renderFilters();
      applyFilters();
    } catch (err) {
      console.error('Error loading books.json:', err);
      if (state.customBooks.length > 0) {
        state.allBooks = BookUI.groupBooks([...state.customBooks]);
        renderRecentBooks();
        updateShelfBadge();
        renderFilters();
        applyFilters();
      } else {
        dom.booksContainer.innerHTML = `
          <div style="text-align:center; padding: 4rem 1rem; color: var(--text-muted);">
            <h2>⚠️ 暂未加载到图书索引</h2>
            <p style="margin-top:0.5rem;">请确认 books.json 存在且网络可正常读取。</p>
          </div>
        `;
      }
    }

    if (window.BookStore) {
      window.BookStore.onChange(() => {
        updateShelfBadge();
        renderRecentBooks();
      });
    }
  }

  function renderStats() {
    if (dom.statTotalBooks) dom.statTotalBooks.textContent = state.meta.totalWorks || state.allBooks.length;
    if (dom.statTotalSize) dom.statTotalSize.textContent = state.meta.totalSizeFormatted || '1.03 GB';
    if (dom.statTotalCategories) {
      dom.statTotalCategories.textContent = Object.keys(state.meta.categories || {}).length;
    }
    const badge = document.getElementById('nav-book-badge');
    if (badge) badge.textContent = `${state.allBooks.length} 部作品`;
  }

  function renderRecentBooks() {
    if (!dom.recentReadingSection || !window.BookStore) return;
    const recentList = window.BookStore.getRecentBooks(1);
    if (!recentList || recentList.length === 0) {
      dom.recentReadingSection.style.display = 'none';
      return;
    }

    const recent = recentList[0];
    dom.recentReadingSection.style.display = 'block';
    dom.recentBookTitle.textContent = recent.title || '最近阅读';
    const chapTitle = recent.chapterTitle || `第 ${(recent.chapterIndex || 0) + 1} 节`;
    const pct = recent.overallPercent || 0;
    dom.recentBookMeta.innerHTML = `
      <span>👤 ${BookUI.escapeHtml(recent.author || '未知作者')}</span>
      <span>·</span>
      <span>📑 读至 ${BookUI.escapeHtml(chapTitle)}</span>
      <span>·</span>
      <span style="color: var(--primary); font-weight: 700;">${pct}%</span>
    `;
    if (dom.recentProgressBarFill) {
      dom.recentProgressBarFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }

    dom.recentContinueBtn.onclick = () => {
      window.openReader(recent.bookId);
    };
  }
  window.renderRecentBooks = renderRecentBooks;

  function updateShelfBadge() {
    if (!dom.shelfCountBadge || !window.BookStore) return;
    const favs = window.BookStore.getFavorites();
    const history = Object.keys(window.BookStore.getAllProgress());
    const uniqueShelf = new Set([...favs, ...history, ...state.customBooks.map(b => b.id)]);
    dom.shelfCountBadge.textContent = uniqueShelf.size;
  }
  window.updateShelfBadge = updateShelfBadge;

  window.openReader = function(id) {
    window.location.href = `reader.html?id=${encodeURIComponent(id)}`;
  };

  window.toggleBookFav = function(id) {
    if (!window.BookStore) return;
    const book = state.allBooks.find(b => b.id === id || (b.formats && b.formats.some(f => f.id === id)));
    const targetId = book ? book.id : id;
    const isFav = window.BookStore.toggleFavorite(targetId);
    BookUI.showToast(isFav ? '已加入书房收藏' : '已取消收藏');
    updateShelfBadge();

    const idsToUpdate = book && book.formats ? book.formats.map(f => f.id) : [targetId];
    idsToUpdate.forEach(checkId => {
      document.querySelectorAll(`[data-id="${checkId}"]`).forEach(el => {
        const favBtn = el.querySelector('.cover-fav-btn, .table-fav-btn');
        if (favBtn) {
          favBtn.classList.toggle('active', isFav);
          favBtn.setAttribute('title', isFav ? '已收藏' : '加入收藏');
          const isTable = favBtn.classList.contains('table-fav-btn');
          favBtn.innerHTML = `<svg width="${isTable ? 18 : 15}" height="${isTable ? 18 : 15}" viewBox="0 0 24 24" fill="${isFav ? '#fbbf24' : 'none'}" stroke="${isFav ? '#fbbf24' : (isTable ? 'var(--text-faint)' : '#ffffff')}" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>`;
        }
      });
    });

    if (dom.drawer && dom.drawer.classList.contains('active') && state.activeBook) {
      const match = state.activeBook.id === targetId || (state.activeBook.formats && state.activeBook.formats.some(f => f.id === targetId));
      if (match) {
        const favBtn = dom.drawer.querySelector('.cover-fav-btn');
        if (favBtn) {
          favBtn.classList.toggle('active', isFav);
          favBtn.setAttribute('title', isFav ? '已收藏' : '收藏');
          const svg = favBtn.querySelector('svg');
          if (svg) {
            svg.setAttribute('fill', isFav ? '#fbbf24' : 'none');
            svg.setAttribute('stroke', isFav ? '#fbbf24' : '#ffffff');
          }
        }
      }
    }
  };

  function renderFilters() {
    // Categories
    const categories = ['全部', ...(Object.keys(state.meta.categories || {}))];
    const catCounts = {};
    state.allBooks.forEach(b => {
      catCounts[b.category] = (catCounts[b.category] || 0) + 1;
    });

    const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 640 : false;
    const catLimit = isMobile ? 6 : categories.length;
    const visibleCats = state.isCatExpanded ? categories : categories.slice(0, catLimit);

    let catHtml = visibleCats.map(cat => {
      const count = cat === '全部' ? state.allBooks.length : (catCounts[cat] || state.meta.categories?.[cat] || 0);
      const active = state.selectedCategory === cat ? 'active' : '';
      return `<button class="chip-btn ${active}" data-cat="${BookUI.escapeHtml(cat)}">${BookUI.escapeHtml(cat)} <span class="chip-count">${count}</span></button>`;
    }).join('');

    if (categories.length > catLimit) {
      catHtml += `<button class="chip-btn toggle-more-btn" id="toggle-cat-btn" title="${state.isCatExpanded ? '收起分类' : '查看更多分类'}">${state.isCatExpanded ? '收起 ▴' : `更多分类 (${categories.length - catLimit}) ▾`}</button>`;
    }
    dom.categoryChips.innerHTML = catHtml;

    // Tags
    const tags = state.meta.popularTags || [];
    const allTagsActive = !state.selectedTag ? 'active' : '';
    const allTagsHtml = `<button class="tag-pill ${allTagsActive}" data-tag="">全部标签</button>`;
    
    const tagLimit = 10;
    const visibleTags = state.isTagsExpanded ? tags : tags.slice(0, tagLimit);

    const tagItemsHtml = visibleTags.map(item => {
      const isSelected = state.selectedTag === item.tag;
      const active = isSelected ? 'active' : '';
      return `<button class="tag-pill ${active}" data-tag="${BookUI.escapeHtml(item.tag)}" title="${isSelected ? '点击取消筛选' : '筛选 #' + BookUI.escapeHtml(item.tag)}">
        <span class="tag-hash">#</span><span class="tag-name">${BookUI.escapeHtml(item.tag)}</span>
        <span class="tag-count">${item.count}</span>
        ${isSelected ? '<span class="tag-clear-x">✕</span>' : ''}
      </button>`;
    }).join('');

    let moreTagsBtn = '';
    if (tags.length > tagLimit) {
      moreTagsBtn = `<button class="tag-pill toggle-more-btn" id="toggle-tags-btn" title="${state.isTagsExpanded ? '收起标签墙' : '展开所有标签'}">${state.isTagsExpanded ? '收起 ▴' : `🏷️ 更多标签 (+${tags.length - tagLimit}) ▾`}</button>`;
    }
    dom.tagChips.innerHTML = allTagsHtml + tagItemsHtml + moreTagsBtn;

    // Formats
    const formats = ['全部', 'epub', 'mobi', 'txt'];
    const fmtCounts = { epub: 0, mobi: 0, txt: 0 };
    state.allBooks.forEach(b => {
      if (b.formats && b.formats.length > 0) {
        b.formats.forEach(f => {
          const k = (f.format || '').toLowerCase();
          if (fmtCounts[k] !== undefined) fmtCounts[k]++;
        });
      } else {
        const k = (b.format || '').toLowerCase();
        if (fmtCounts[k] !== undefined) fmtCounts[k]++;
      }
    });

    dom.formatChips.innerHTML = formats.map(fmt => {
      const active = state.selectedFormat === fmt ? 'active' : '';
      const upper = fmt === '全部' ? '全部' : fmt.toUpperCase();
      const count = fmt === '全部' ? state.allBooks.length : (fmtCounts[fmt] || 0);
      return `<button class="chip-btn ${active}" data-fmt="${BookUI.escapeHtml(fmt)}">${BookUI.escapeHtml(upper)} <span class="chip-count">${count}</span></button>`;
    }).join('');
  }

  function applyFilters() {
    let list = state.allBooks;

    if (state.selectedCategory !== '全部') {
      list = list.filter(b => b.category === state.selectedCategory);
    }

    if (state.selectedFormat !== '全部') {
      const targetFmt = state.selectedFormat.toLowerCase();
      list = list.filter(b => {
        if (b.formats && b.formats.length > 0) {
          return b.formats.some(f => (f.format || '').toLowerCase() === targetFmt);
        }
        return (b.format || '').toLowerCase() === targetFmt;
      });
    }

    if (state.selectedTag) {
      list = list.filter(b => b.tags && b.tags.includes(state.selectedTag));
    }

    const query = state.searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter(b => {
        return (b.title && b.title.toLowerCase().includes(query)) ||
               (b.author && b.author.toLowerCase().includes(query)) ||
               (b.originalName && b.originalName.toLowerCase().includes(query)) ||
               (b.tags && b.tags.some(t => t.toLowerCase().includes(query)));
      });
    }

    // Sort
    list = sortBooks(list, state.sortBy);
    state.filteredBooks = list;
    state.currentPage = 1;
    renderBooksList();
  }

  function sortBooks(list, method) {
    const arr = [...list];
    switch (method) {
      case 'title':
        return arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN'));
      case 'author':
        return arr.sort((a, b) => (a.author || '').localeCompare(b.author || '', 'zh-CN'));
      case 'size-desc':
        return arr.sort((a, b) => b.size - a.size);
      case 'size-asc':
        return arr.sort((a, b) => a.size - b.size);
      default:
        return arr;
    }
  }

  function renderBooksList() {
    const total = state.filteredBooks.length;
    let tagNotice = state.selectedTag ? ` · 包含标签「#${state.selectedTag}」` : '';
    dom.matchInfo.textContent = `精选馆藏：找到 ${total} 本书籍${tagNotice}`;

    if (total === 0) {
      dom.booksContainer.innerHTML = `
        <div style="text-align:center; padding: 4rem 1rem; background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: var(--radius-lg);">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🔍</div>
          <h3 style="font-size: 1.15rem; font-weight: 700;">未找到符合条件的书籍</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0.4rem 0 1.25rem;">请尝试减少筛选条件或输入不同的关键词。</p>
          <button class="btn btn-secondary" id="reset-all-btn">清除所有筛选</button>
        </div>
      `;
      document.getElementById('reset-all-btn')?.addEventListener('click', resetFilters);
      dom.paginationContainer.innerHTML = '';
      return;
    }

    const start = (state.currentPage - 1) * state.pageSize;
    const currentBooks = state.filteredBooks.slice(start, start + state.pageSize);

    if (state.viewMode === 'grid') {
      renderGridView(currentBooks);
    } else {
      renderListView(currentBooks);
    }

    renderPagination(total);
  }

  function renderGridView(books) {
    const html = `
      <div class="book-grid">
        ${books.map(book => {
          const pal = BookUI.getPalette(book);
          const isFav = isBookFav(book);
          const progress = getBookProgress(book);
          const formatUpper = (book.format || '').toUpperCase();
          const formatBadgeText = (book.formats && book.formats.length > 1)
            ? `${formatUpper} +${book.formats.length - 1}`
            : formatUpper;
          const multiFormats = book.formats && book.formats.length > 1;

          const tagsHtml = (book.tags || []).slice(0, 3).map(t => `
            <span class="mini-tag" onclick="event.stopPropagation(); filterByTag('${BookUI.escapeHtml(t)}');">#${BookUI.escapeHtml(t)}</span>
          `).join('');

          const progressTagHtml = (progress && progress.overallPercent > 0)
            ? `<span class="card-progress-tag">已读 ${progress.overallPercent}%</span>`
            : '';

          const downloadUrl = getDownloadUrl(book);

          return `
            <article class="book-card" data-id="${book.id}">
              <div class="book-cover" style="background: ${pal.bg};" onclick="openDrawer('${book.id}')">
                <div class="cover-header">
                  <div class="cover-badges">
                    <span class="cover-category-badge">${BookUI.escapeHtml(book.category)}</span>
                    <span class="cover-format-badge" ${multiFormats ? 'title="包含多种格式版本，点击详情可选"' : ''}>${BookUI.escapeHtml(formatBadgeText)}</span>
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
                  <div class="card-desc">${BookUI.escapeHtml(book.description || '')}</div>
                  <div class="card-tags">${tagsHtml}</div>
                </div>

                <div class="card-footer">
                  <div class="file-info">
                    <span>${BookUI.escapeHtml(book.sizeFormatted || BookUI.formatSize(book.size))}</span>
                    ${progressTagHtml}
                  </div>
                  <div class="card-buttons">
                    <button class="btn btn-read" onclick="event.stopPropagation(); openReader('${progress?.formatId || book.id}');" title="立即免插件在浏览器中阅读">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                      ${progress ? '继续' : '阅读'}
                    </button>
                    <a href="${downloadUrl}" download="${BookUI.escapeHtml(book.title + '.' + book.format)}" class="btn btn-secondary" onclick="event.stopPropagation();" title="下载到本地">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      下载
                    </a>
                    <button class="btn btn-secondary" onclick="openDrawer('${book.id}')">详情</button>
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
              <th>分类 / 标签</th>
              <th>格式</th>
              <th>大小 / 进度</th>
              <th style="text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            ${books.map(book => {
              const downloadUrl = getDownloadUrl(book);
              const isFav = isBookFav(book);
              const progress = getBookProgress(book);
              const firstTag = (book.tags && book.tags[0]) ? `#${BookUI.escapeHtml(book.tags[0])}` : '';
              const progressHtml = (progress && progress.overallPercent > 0)
                ? `<div class="list-row-progress" style="font-size: 0.75rem; color: #10b981; font-weight: 600;">已读 ${progress.overallPercent}%</div>`
                : '';
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
                  <td class="col-cat">
                    <span class="cat-name">${BookUI.escapeHtml(book.category)}</span>
                    ${firstTag ? `<span class="cat-tag" style="font-size: 0.75rem; color: var(--text-faint); margin-left: 0.35rem;">${firstTag}</span>` : ''}
                  </td>
                  <td class="col-format">
                    <span class="cover-format-badge" style="background: var(--bg-hover); color: var(--text-main);">${BookUI.escapeHtml(formatUpper)}${multiBadge}</span>
                  </td>
                  <td class="col-meta">
                    <div class="col-size">${BookUI.escapeHtml(book.sizeFormatted || BookUI.formatSize(book.size))}</div>
                    ${progressHtml}
                  </td>
                  <td class="col-actions" style="text-align: right; white-space: nowrap;">
                    <div class="table-actions-group">
                      <button class="btn btn-read table-action-btn" onclick="openReader('${progress?.formatId || book.id}')">
                        ${progress ? '继续' : '阅读'}
                      </button>
                      <a href="${downloadUrl}" download="${BookUI.escapeHtml(book.title + '.' + book.format)}" class="btn btn-secondary table-action-btn">下载</a>
                      <button class="btn btn-secondary table-action-btn" onclick="openDrawer('${book.id}')">详情</button>
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

  function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / state.pageSize);
    if (totalPages <= 1) {
      dom.paginationContainer.innerHTML = '';
      return;
    }

    let pages = [];
    const curr = state.currentPage;

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (curr > 3) pages.push('...');
      const start = Math.max(2, curr - 1);
      const end = Math.min(totalPages - 1, curr + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (curr < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    const html = `
      <div class="pagination">
        <button class="page-btn" ${curr === 1 ? 'disabled' : ''} onclick="goToPage(${curr - 1})">‹ 上一页</button>
        ${pages.map(p => {
          if (p === '...') return `<span style="padding: 0 0.35rem; color: var(--text-faint);">…</span>`;
          return `<button class="page-btn ${p === curr ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
        }).join('')}
        <button class="page-btn" ${curr === totalPages ? 'disabled' : ''} onclick="goToPage(${curr + 1})">下一页 ›</button>
      </div>
    `;
    dom.paginationContainer.innerHTML = html;
  }

  window.goToPage = function(page) {
    const totalPages = Math.ceil(state.filteredBooks.length / state.pageSize);
    if (page < 1 || page > totalPages) return;
    state.currentPage = page;
    renderBooksList();
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  window.filterByTag = function(tag) {
    state.selectedTag = (state.selectedTag === tag) ? '' : tag;
    renderFilters();
    applyFilters();
  };

  function resetFilters() {
    state.selectedCategory = '全部';
    state.selectedFormat = '全部';
    state.selectedTag = '';
    state.searchQuery = '';
    if (dom.searchInput) dom.searchInput.value = '';
    renderFilters();
    applyFilters();
  }

  window.navigateToLibraryTag = function(tag) {
    filterByTag(tag);
    closeDrawer();
  };

  window.openDrawer = async function(id) {
    const book = state.allBooks.find(b => b.id === id || (b.formats && b.formats.some(f => f.id === id)));
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

    // Determine initial format selection
    let selectedFormatId = null;
    if (state.selectedFormat && state.selectedFormat !== '全部') {
      const matchFmt = formatsList.find(f => f.format.toLowerCase() === state.selectedFormat.toLowerCase());
      if (matchFmt) selectedFormatId = matchFmt.id;
    }
    if (!selectedFormatId && formatsList.some(f => f.id === id)) {
      selectedFormatId = id;
    }
    if (!selectedFormatId && window.BookStore) {
      for (const f of formatsList) {
        if (window.BookStore.getProgress(f.id)) {
          selectedFormatId = f.id;
          break;
        }
      }
    }
    if (!selectedFormatId) {
      selectedFormatId = formatsList[0].id;
    }

    let selectedFormatObj = formatsList.find(f => f.id === selectedFormatId) || formatsList[0];

    const isFav = isBookFav(book);
    const progress = getBookProgress(book);
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
      const downloadUrl = getDownloadUrl(selectedFormatObj);
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
          dom.drawerDownloadBtn.href = downloadUrl;
          dom.drawerDownloadBtn.download = `${book.title}.${selectedFormatObj.format}`;
        }
      }

      if (dom.drawerCopyBtn) {
        dom.drawerCopyBtn.onclick = () => {
          const url = `${window.location.origin}${window.location.pathname}?book=${encodeURIComponent(selectedFormatObj.id)}`;
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
    dom.drawerBackdrop.classList.remove('active');
    dom.drawer.classList.remove('active');
    document.body.style.overflow = '';
  }
  window.closeDrawer = closeDrawer;

  function setupEvents() {
    let debounceTimer;
    dom.searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      state.searchQuery = e.target.value;
      debounceTimer = setTimeout(() => applyFilters(), 180);
    });

    dom.clearSearch.addEventListener('click', () => {
      dom.searchInput.value = '';
      state.searchQuery = '';
      applyFilters();
    });

    dom.sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      applyFilters();
    });

    dom.categoryChips.addEventListener('click', (e) => {
      if (e.target.closest('#toggle-cat-btn')) {
        state.isCatExpanded = !state.isCatExpanded;
        renderFilters();
        return;
      }
      const btn = e.target.closest('.chip-btn, .chip');
      if (!btn) return;
      state.selectedCategory = btn.dataset.cat;
      renderFilters();
      applyFilters();
    });

    dom.formatChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn, .chip');
      if (!btn) return;
      state.selectedFormat = btn.dataset.fmt;
      renderFilters();
      applyFilters();
    });

    dom.tagChips.addEventListener('click', (e) => {
      if (e.target.closest('#toggle-tags-btn')) {
        state.isTagsExpanded = !state.isTagsExpanded;
        renderFilters();
        return;
      }
      const btn = e.target.closest('.tag-pill, .tag-chip');
      if (!btn) return;
      const t = btn.dataset.tag || '';
      state.selectedTag = (state.selectedTag === t) ? '' : t;
      renderFilters();
      applyFilters();
    });

    window.addEventListener('resize', () => {
      const isMobile = window.innerWidth <= 640;
      if (state._lastIsMobile !== isMobile) {
        state._lastIsMobile = isMobile;
        renderFilters();
      }
    });

    // View toggles
    dom.viewGridBtn.addEventListener('click', () => {
      state.viewMode = 'grid';
      if (window.BookStore) window.BookStore.saveViewMode('grid');
      dom.viewGridBtn.classList.add('active');
      dom.viewListBtn.classList.remove('active');
      renderBooksList();
    });

    dom.viewListBtn.addEventListener('click', () => {
      state.viewMode = 'list';
      if (window.BookStore) window.BookStore.saveViewMode('list');
      dom.viewListBtn.classList.add('active');
      dom.viewGridBtn.classList.remove('active');
      renderBooksList();
    });

    // Drawer close
    dom.drawerCloseBtn.addEventListener('click', closeDrawer);
    dom.drawerBackdrop.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.drawer.classList.contains('active')) {
        closeDrawer();
      }
    });

    // Local file upload
    if (dom.navUploadBtn && dom.localBookInput) {
      dom.navUploadBtn.addEventListener('click', () => dom.localBookInput.click());
      dom.localBookInput.addEventListener('change', async (e) => {
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

        if (window.BookStore) {
          await window.BookStore.saveCustomBook(bookId, file, {
            title: cleanTitle,
            author: '本地上传',
            category: '本地导入',
            format: customBook.format
          });
        }
        state.customBooks.unshift(customBook);
        state.allBooks.unshift(customBook);
        renderFilters();
        applyFilters();
        updateShelfBadge();
        BookUI.showToast(`成功导入《${cleanTitle}》！已加入书架。`);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
