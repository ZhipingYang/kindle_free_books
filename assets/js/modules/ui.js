/**
 * Kindle Free Books - Reusable UI Components & Helpers Module
 */

(() => {
  const CATEGORY_PALETTES = {
    '二十四史': { bg: 'linear-gradient(145deg, #78350f, #3f1d0b)', accent: '#f59e0b' },
    '历史人文': { bg: 'linear-gradient(145deg, #b45309, #78350f)', accent: '#fbbf24' },
    '古典文学': { bg: 'linear-gradient(145deg, #047857, #064e3b)', accent: '#34d399' },
    '哲学宗教': { bg: 'linear-gradient(145deg, #475569, #1e293b)', accent: '#94a3b8' },
    '外国文学': { bg: 'linear-gradient(145deg, #6d28d9, #431407)', accent: '#c084fc' },
    '天天向上': { bg: 'linear-gradient(145deg, #0d9488, #115e59)', accent: '#2dd4bf' },
    '学习资料': { bg: 'linear-gradient(145deg, #4338ca, #312e81)', accent: '#818cf8' },
    '现代文学': { bg: 'linear-gradient(145deg, #1d4ed8, #1e3a8a)', accent: '#60a5fa' },
    '武侠小说': { bg: 'linear-gradient(145deg, #b91c1c, #7f1d1d)', accent: '#f87171' },
    '百家讲坛': { bg: 'linear-gradient(145deg, #0369a1, #0c4a6e)', accent: '#38bdf8' },
    '网络小说': { bg: 'linear-gradient(145deg, #be185d, #831843)', accent: '#f472b6' },
    'default':  { bg: 'linear-gradient(145deg, #374151, #1f2937)', accent: '#9ca3af' }
  };

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(msg, duration = 2200) {
    let shelf = document.getElementById('toast-shelf');
    if (!shelf) {
      shelf = document.createElement('div');
      shelf.id = 'toast-shelf';
      shelf.className = 'toast-shelf';
      document.body.appendChild(shelf);
    }
    const t = document.createElement('div');
    t.className = 'toast-msg';
    t.innerHTML = `<span>✓</span> <span>${escapeHtml(msg)}</span>`;
    shelf.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(12px)';
      t.style.transition = 'all 0.2s ease';
      setTimeout(() => t.remove(), 250);
    }, duration);
  }

  function formatSize(sizeBytes) {
    if (!sizeBytes) return '0 B';
    if (sizeBytes >= 1024 * 1024 * 1024) return (sizeBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (sizeBytes >= 1024 * 1024) return (sizeBytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (sizeBytes >= 1024) return (sizeBytes / 1024).toFixed(1) + ' KB';
    return sizeBytes + ' B';
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return new Date(timestamp).toLocaleDateString();
  }

  function getPalette(book) {
    if (book.subCategory && CATEGORY_PALETTES[book.subCategory]) {
      return CATEGORY_PALETTES[book.subCategory];
    }
    if (CATEGORY_PALETTES[book.category]) {
      return CATEGORY_PALETTES[book.category];
    }
    return CATEGORY_PALETTES['default'];
  }

  function initTheme(toggleBtn) {
    const ls = window.localStorage;
    const theme = (ls && ls.getItem('kfb_theme')) || 
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(toggleBtn, theme);

    if (toggleBtn) {
      toggleBtn.onclick = () => {
        const curr = document.documentElement.getAttribute('data-theme') || 'light';
        const next = curr === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        if (ls) ls.setItem('kfb_theme', next);
        updateThemeIcon(toggleBtn, next);
      };
    }
  }

  function updateThemeIcon(btn, theme) {
    if (!btn) return;
    btn.innerHTML = theme === 'dark'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
  }

  /**
   * On phones, release the full viewport while reading the catalog: the
   * single-row site header follows the same direction as Safari's chrome.
   */
  function initMobileHeader() {
    const header = document.querySelector('.navbar');
    if (!header || header.dataset.mobileScrollReady === 'true') return;

    const mobileQuery = window.matchMedia('(max-width: 640px)');
    let lastY = Math.max(0, window.scrollY);
    let ticking = false;

    const update = () => {
      const currentY = Math.max(0, window.scrollY);
      const delta = currentY - lastY;

      if (!mobileQuery.matches || currentY < 24) {
        header.classList.remove('is-hidden');
      } else if (delta > 6 && currentY > 96) {
        header.classList.add('is-hidden');
      } else if (delta < -6) {
        header.classList.remove('is-hidden');
      }

      lastY = currentY;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };

    const onViewportChange = () => {
      lastY = Math.max(0, window.scrollY);
      if (!mobileQuery.matches) header.classList.remove('is-hidden');
    };

    header.dataset.mobileScrollReady = 'true';
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
    if (mobileQuery.addEventListener) {
      mobileQuery.addEventListener('change', onViewportChange);
    } else {
      mobileQuery.addListener(onViewportChange);
    }
  }

  /**
   * Render single book card HTML (Grid or List mode)
   */
  function renderBookCard(book, options = {}) {
    const isList = options.viewMode === 'list';
    const isFav = window.BookStore ? (
      book.formats && book.formats.length > 0
        ? book.formats.some(f => window.BookStore.isFavorite(f.id))
        : window.BookStore.isFavorite(book.id)
    ) : false;

    let progress = null;
    if (window.BookStore) {
      if (book.formats && book.formats.length > 0) {
        for (const f of book.formats) {
          const p = window.BookStore.getProgress(f.id);
          if (p) {
            if (!progress || (p.lastReadTime || 0) > (progress.lastReadTime || 0)) {
              progress = p;
            }
          }
        }
      } else {
        progress = window.BookStore.getProgress(book.id);
      }
    }

    const palette = getPalette(book);

    const tags = (book.tags || []).slice(0, 3);
    const tagHtml = tags.map(t => `<span class="book-tag">${escapeHtml(t)}</span>`).join('');

    const formatUpper = (book.format || '').toUpperCase();
    const canRead = ['EPUB', 'MOBI', 'TXT'].includes(formatUpper);

    // Reading progress markup
    let progressHtml = '';
    if (progress && progress.overallPercent !== undefined) {
      const pct = Math.min(100, Math.max(0, progress.overallPercent));
      const chap = progress.chapterTitle || `第 ${(progress.chapterIndex || 0) + 1} 节`;
      progressHtml = `
        <div class="book-card-progress">
          <div class="card-progress-bar"><div class="card-progress-fill" style="width: ${pct}%;"></div></div>
          <div class="card-progress-text">
            <span>读至 ${escapeHtml(chap)}</span>
            <span class="card-progress-num">${pct}%</span>
          </div>
        </div>
      `;
    }

    if (isList) {
      const multiFormatBadge = (book.formats && book.formats.length > 1) ? `<span class="badge badge-multi" title="包含多种格式版本">多格式 (${book.formats.length})</span>` : '';
      return `
        <div class="book-card-list ${isFav ? 'is-fav' : ''}" data-id="${book.id}">
          <div class="list-cover" style="background: ${palette.bg};">
            <span class="list-cover-title">${escapeHtml(book.title)}</span>
          </div>
          <div class="list-info">
            <div class="list-title-row">
              <h3 class="list-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h3>
              <div class="list-badges">
                <span class="badge badge-format">${escapeHtml(formatUpper)}</span>
                ${multiFormatBadge}
                <span class="badge badge-cat">${escapeHtml(book.category)}</span>
              </div>
            </div>
            <div class="list-author">👤 ${escapeHtml(book.author || '佚名')}</div>
            <p class="list-desc">${escapeHtml(book.description || book.excerpt || '')}</p>
            ${progressHtml}
            <div class="list-meta">
              <span class="meta-item">💾 ${escapeHtml(book.sizeFormatted || formatSize(book.size))}</span>
              <div class="book-tags">${tagHtml}</div>
            </div>
          </div>
          <div class="list-actions">
            ${canRead ? `
              <button class="btn btn-read btn-read-action" data-id="${book.id}">
                ${progress ? '▶ 继续阅读' : '📖 在线阅读'}
              </button>
            ` : ''}
            <button class="btn btn-detail btn-detail-action" data-id="${book.id}">详情导读</button>
            <button class="btn-fav-card ${isFav ? 'active' : ''}" data-id="${book.id}" title="${isFav ? '取消收藏' : '加入收藏'}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    // Grid Card Mode
    const formatBadgeText = (book.formats && book.formats.length > 1)
      ? `${formatUpper} +${book.formats.length - 1}`
      : formatUpper;

    return `
      <div class="book-card ${isFav ? 'is-fav' : ''}" data-id="${book.id}">
        <div class="book-cover" style="background: ${palette.bg};">
          <div class="book-cover-spine"></div>
          <div class="book-cover-content">
            <span class="book-cover-category">${escapeHtml(book.category)}</span>
            <h3 class="book-cover-title">${escapeHtml(book.title)}</h3>
            <span class="book-cover-author">${escapeHtml(book.author || '佚名')}</span>
          </div>
          <div class="book-cover-meta">
            <span class="badge badge-format" ${book.formats && book.formats.length > 1 ? 'title="包含多种格式版本"' : ''}>${escapeHtml(formatBadgeText)}</span>
            <span class="badge-size">${escapeHtml(book.sizeFormatted || formatSize(book.size))}</span>
          </div>
          <button class="book-fav-icon ${isFav ? 'active' : ''}" data-id="${book.id}" title="${isFav ? '取消收藏' : '加入收藏'}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </button>
        </div>
        <div class="book-info">
          <h4 class="book-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h4>
          <p class="book-author">${escapeHtml(book.author || '佚名')}</p>
          <p class="book-desc">${escapeHtml(book.description || book.excerpt || '')}</p>
          ${progressHtml}
          <div class="book-tags">${tagHtml}</div>
          <div class="book-actions">
            ${canRead ? `
              <button class="btn btn-read btn-read-action" data-id="${book.id}">
                ${progress ? '▶ 继续' : '📖 阅读'}
              </button>
            ` : ''}
            <button class="btn btn-detail btn-detail-action" data-id="${book.id}">详情导读</button>
          </div>
        </div>
      </div>
    `;
  }

  // Format Priority Map: EPUB > MOBI > TXT (TXT has lowest priority)
  const FORMAT_PRIORITY = {
    epub: 3,
    mobi: 2,
    txt: 1
  };

  function getFormatPriority(fmt) {
    return FORMAT_PRIORITY[(fmt || '').toLowerCase()] || 0;
  }

  function normalizeTitle(title) {
    if (!title) return '';
    return String(title)
      .replace(/[（\(][^）\)]*?(全集|插图版|含图版|文字版|全\d+册|第\d+卷|完美全集|新订版)[^）\)]*?[）\)]/gi, '')
      .replace(/[\s\-_:：·\.]+/g, '')
      .toLowerCase();
  }

  function normalizeAuthor(author) {
    if (!author || author === '佚名') return '';
    return String(author)
      .replace(/[\s\-_:：·\.]+/g, '')
      .toLowerCase();
  }

  function groupBooks(rawList) {
    if (!Array.isArray(rawList)) return [];
    const map = new Map();
    for (const b of rawList) {
      const titleNorm = normalizeTitle(b.title || '');
      const authorNorm = normalizeAuthor(b.author || '');
      const key = `${titleNorm}::${authorNorm}`;

      const fmtEntry = {
        id: b.id,
        format: (b.format || 'mobi').toLowerCase(),
        size: b.size || 0,
        sizeFormatted: b.sizeFormatted || formatSize(b.size || 0),
        path: b.path || '',
        blob: b.blob || null
      };

      if (!map.has(key)) {
        const primary = {
          ...b,
          formats: [fmtEntry],
          primaryFormat: fmtEntry.format
        };
        map.set(key, primary);
      } else {
        const existing = map.get(key);
        if (!existing.formats.some(f => f.id === b.id)) {
          existing.formats.push(fmtEntry);
        }
        if (Array.isArray(b.tags)) {
          const tagSet = new Set([...(existing.tags || []), ...b.tags]);
          existing.tags = Array.from(tagSet);
        }
        // Sort formats by priority: epub > mobi > txt
        existing.formats.sort((f1, f2) => getFormatPriority(f2.format) - getFormatPriority(f1.format));

        const bestFmt = existing.formats[0];
        existing.id = bestFmt.id;
        existing.format = bestFmt.format;
        existing.primaryFormat = bestFmt.format;
        existing.size = bestFmt.size;
        existing.sizeFormatted = bestFmt.sizeFormatted;
        existing.path = bestFmt.path;
        if (bestFmt.blob) existing.blob = bestFmt.blob;
      }
    }
    return Array.from(map.values());
  }

  /**
   * Render rich book drawer content HTML
   */
  function renderDrawerContent(book, options = {}) {
    const pal = getPalette(book);
    const isFav = options.isFav !== undefined ? options.isFav : (window.BookStore ? (
      book.formats && book.formats.length > 0
        ? book.formats.some(f => window.BookStore.isFavorite(f.id))
        : window.BookStore.isFavorite(book.id)
    ) : false);

    let progress = options.progress !== undefined ? options.progress : null;
    if (progress === null && window.BookStore) {
      if (book.formats && book.formats.length > 0) {
        for (const f of book.formats) {
          const p = window.BookStore.getProgress(f.id);
          if (p) {
            if (!progress || (p.lastReadTime || 0) > (progress.lastReadTime || 0)) {
              progress = p;
            }
          }
        }
      } else {
        progress = window.BookStore.getProgress(book.id);
      }
    }
    const isCached = options.isCached !== undefined ? options.isCached : false;
    const onTagClick = options.onTagClick || '';

    const tags = book.tags || [];
    const tagsHtml = tags.map(t => {
      const clickAttr = onTagClick ? `onclick="${onTagClick}('${escapeHtml(t)}');"` : '';
      return `<span class="tag-chip" style="font-size: 0.78rem;" ${clickAttr}>#${escapeHtml(t)}</span>`;
    }).join('');

    let progressHtml = '';
    if (progress && progress.overallPercent !== undefined && progress.overallPercent > 0) {
      const pct = Math.min(100, Math.max(0, progress.overallPercent));
      const chapName = progress.chapterTitle || `第 ${(progress.chapterIndex || 0) + 1} 节`;
      progressHtml = `
        <div style="background: var(--primary-subtle); border: 1px solid var(--primary-border); padding: 0.85rem 1rem; border-radius: var(--radius-md);">
          <div style="display: flex; justify-content: space-between; font-size: 0.82rem; font-weight: 700; color: var(--primary); margin-bottom: 0.35rem;">
            <span>📖 阅读记录：读至 ${escapeHtml(chapName)}</span>
            <span>${pct}%</span>
          </div>
          <div style="width: 100%; height: 6px; background: var(--bg-surface); border-radius: 3px; overflow: hidden;">
            <div style="height: 100%; width: ${pct}%; background: var(--primary); border-radius: 3px;"></div>
          </div>
        </div>
      `;
    }

    // Format Selector if book has multiple formats
    const formatsList = book.formats || [{
      id: book.id,
      format: book.format || 'mobi',
      size: book.size || 0,
      sizeFormatted: book.sizeFormatted || formatSize(book.size || 0),
      path: book.path || ''
    }];

    const selectedFormatId = options.selectedFormatId || book.id;
    const selectedFormatObj = formatsList.find(f => f.id === selectedFormatId) || formatsList[0];

    let formatPickerHtml = '';
    if (formatsList.length > 1) {
      formatPickerHtml = `
        <div class="drawer-format-picker">
          <div class="drawer-section-title">📦 版本格式选择（系统推荐优先阅读排版较优版本）</div>
          <div class="drawer-format-options" id="drawer-format-options">
            ${formatsList.map((f, idx) => {
              const isActive = f.id === selectedFormatId;
              const fUpper = (f.format || '').toUpperCase();
              const badgeLabel = f.format.toLowerCase() === 'txt' ? '纯文本' : (idx === 0 ? '首选推荐' : '');
              return `
                <button type="button" class="drawer-format-btn ${isActive ? 'active' : ''}" data-fid="${f.id}" data-fmt="${f.format}" data-path="${escapeHtml(f.path || '')}" data-size="${escapeHtml(f.sizeFormatted || formatSize(f.size))}">
                  <span class="fmt-pill-name">${fUpper}</span>
                  <span class="fmt-pill-size">${f.sizeFormatted || formatSize(f.size)}</span>
                  ${badgeLabel ? `<span class="fmt-pill-badge ${f.format.toLowerCase() === 'txt' ? 'low' : 'rec'}">${badgeLabel}</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    const currentFmtUpper = (selectedFormatObj.format || book.format || '').toUpperCase();
    const currentSizeText = selectedFormatObj.sizeFormatted || formatSize(selectedFormatObj.size || book.size);
    const excerpt = book.excerpt || '';
    const desc = book.description || excerpt || '暂无详细介绍。';

    return `
      <div class="drawer-book-hero">
        <div class="drawer-cover-preview" style="background: ${pal.bg}; position: relative;">
          <button class="cover-fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); if(window.toggleBookFav) window.toggleBookFav('${book.id}');" style="position: absolute; top: 0.5rem; right: 0.5rem;" title="${isFav ? '已收藏' : '收藏'}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? '#fbbf24' : 'none'}" stroke="${isFav ? '#fbbf24' : '#ffffff'}" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </button>
          <span class="cover-format-badge" style="font-size: 0.7rem; align-self: flex-start;">${escapeHtml(currentFmtUpper)}</span>
          <div style="font-family: var(--font-serif); font-size: 0.95rem; font-weight: 800; line-height: 1.25; margin-top: auto;">${escapeHtml(book.title)}</div>
        </div>
        <div class="drawer-hero-meta">
          <h2 class="drawer-book-title">${escapeHtml(book.title)}</h2>
          <div class="drawer-book-author">👤 ${escapeHtml(book.author || '佚名')}</div>
          <div style="font-size: 0.82rem; color: var(--text-faint);">
            分类：${escapeHtml(book.category || '精选藏书')}${book.subCategory ? ` / ${escapeHtml(book.subCategory)}` : ''}
          </div>
          ${tagsHtml ? `<div style="display:flex; flex-wrap:wrap; gap: 0.3rem; margin-top: 0.4rem;">${tagsHtml}</div>` : ''}
        </div>
      </div>

      ${progressHtml}

      ${formatPickerHtml}

      <div>
        <div class="drawer-section-title">📖 作品简介 / 导读</div>
        <div class="drawer-desc-box">${escapeHtml(desc)}</div>
      </div>

      ${excerpt && excerpt !== desc ? `
        <div>
          <div class="drawer-section-title">🔍 精彩试读节选</div>
          <div class="drawer-excerpt-box">“ ${escapeHtml(excerpt)} ... ”</div>
        </div>
      ` : ''}

      <div>
        <div class="drawer-section-title">📊 文件规格与离线存储</div>
        <div class="meta-grid">
          <div class="meta-grid-item">
            <span>文件格式</span>
            <strong>${escapeHtml(currentFmtUpper)}</strong>
          </div>
          <div class="meta-grid-item">
            <span>文件大小</span>
            <strong>${escapeHtml(currentSizeText)}</strong>
          </div>
          <div class="meta-grid-item">
            <span>离线状态</span>
            <strong style="color: ${isCached ? '#10b981' : 'var(--text-muted)'};">${isCached ? '💾 已离线缓存' : '☁️ 未缓存'}</strong>
          </div>
          <div class="meta-grid-item">
            <span>书房收藏</span>
            <strong style="color: ${isFav ? '#fbbf24' : 'var(--text-muted)'};">${isFav ? '⭐ 已收藏' : '未收藏'}</strong>
          </div>
          <div class="meta-grid-item" style="grid-column: span 2;">
            <span>存储路径</span>
            <code style="font-size: 0.75rem; word-break: break-all;">${escapeHtml(selectedFormatObj.path || (book.blob ? '本地已导入存储 (IndexedDB)' : 'books.json 预置馆藏'))}</code>
          </div>
        </div>
      </div>

      <div style="background: var(--bg-subtle); padding: 0.85rem 1rem; border-radius: var(--radius-md); font-size: 0.82rem; color: var(--text-muted); line-height: 1.5; border-left: 3px solid var(--primary);">
        💡 <strong>在线阅读与本地存储说明：</strong><br>
        • 本站支持在浏览器端免安装在线阅读 EPUB、MOBI、TXT 格式图书。<br>
        • 阅读进度及排版习惯会自动保存至浏览器，下次打开自动断点续读。<br>
        • 点击阅读器顶部的离线下载图标即可缓存整本图书，断网离线无网环境下亦可畅读。
      </div>
    `;
  }

  window.BookUI = {
    CATEGORY_PALETTES,
    escapeHtml,
    showToast,
    formatSize,
    formatTimeAgo,
    getPalette,
    initTheme,
    initMobileHeader,
    renderBookCard,
    renderDrawerContent,
    FORMAT_PRIORITY,
    getFormatPriority,
    groupBooks
  };

  // Keep backward compatibility
  window.escapeHtml = escapeHtml;
  window.showToast = showToast;
})();
