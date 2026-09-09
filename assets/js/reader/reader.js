/**
 * Full-featured In-Browser eBook Reader Controller
 */

(() => {
function escapeHtmlSafe(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToastSafe(msg) {
  if (typeof window.showToast === 'function') {
    window.showToast(msg);
  } else {
    console.log(msg);
  }
}

const escapeHtml = escapeHtmlSafe;
const showToast = showToastSafe;

class ReaderApp {
  constructor() {
    this.currentBook = null;
    this.parsedBook = null;
    this.currentChapterIndex = 0;
    this.settings = typeof BookStorage !== 'undefined' ? BookStorage.getSettings() : {};
    this.isControlsVisible = true;
    this.hideControlsTimer = null;
    this.jumpOrigin = null;
    this.undoTimer = null;
    this.isScrubbing = false;
    this.scrubPendingOrigin = null;
    this.undoInitialScrollTop = 0;
    this.dom = {};
  }

  init() {
    this.cacheDom();
    if (!this.dom.readerOverlay) return;
    this.isStandalone = document.body.classList.contains('reader-standalone');
    this.bindEvents();
    this.applySettings(this.settings);
  }

  cacheDom() {
    this.dom = {
      readerOverlay: document.getElementById('reader-overlay'),
      topProgress: document.getElementById('reader-top-progress'),
      backdrop: document.getElementById('reader-backdrop'),
      loadingModal: document.getElementById('reader-loading'),
      loadingText: document.getElementById('reader-loading-text'),
      loadingProgress: document.getElementById('reader-loading-progress'),
      topBar: document.getElementById('reader-top-bar'),
      bottomBar: document.getElementById('reader-bottom-bar'),
      contentArea: document.getElementById('reader-content-area'),
      bookTitleEl: document.getElementById('reader-book-title'),
      chapterTitleEl: document.getElementById('reader-chapter-title'),
      chapterContentEl: document.getElementById('reader-chapter-content'),
      prevChapBtn: document.getElementById('reader-prev-chap'),
      nextChapBtn: document.getElementById('reader-next-chap'),
      chapSlider: document.getElementById('reader-chap-slider'),
      chapProgressText: document.getElementById('reader-progress-text'),
      scrubBubble: document.getElementById('reader-scrub-bubble'),
      scrubBubbleTitle: document.getElementById('scrub-bubble-title'),
      scrubBubbleSub: document.getElementById('scrub-bubble-sub'),
      undoChip: document.getElementById('reader-undo-chip'),
      undoBtn: document.getElementById('reader-undo-btn'),
      undoText: document.getElementById('reader-undo-text'),
      undoClose: document.getElementById('reader-undo-close'),
      fullscreenBtn: document.getElementById('reader-fullscreen-btn'),
      tocBtn: document.getElementById('reader-toc-btn'),
      tocDrawer: document.getElementById('reader-toc-drawer'),
      tocDrawerClose: document.getElementById('reader-toc-close'),
      tocList: document.getElementById('reader-toc-list'),
      tocSearchInput: document.getElementById('reader-toc-search'),
      tocSearchClear: document.getElementById('reader-toc-search-clear'),
      tocCount: document.getElementById('reader-toc-count'),
      settingsBtn: document.getElementById('reader-settings-btn'),
      settingsPanel: document.getElementById('reader-settings-panel'),
      settingsClose: document.getElementById('reader-settings-close'),
      favBtn: document.getElementById('reader-fav-btn'),
      cacheBtn: document.getElementById('reader-cache-btn'),
      exitBtn: document.getElementById('reader-exit-btn'),
      infoBtn: document.getElementById('reader-info-btn'),
      infoModal: document.getElementById('reader-info-modal'),
      infoCloseBtn: document.getElementById('reader-info-close'),
      infoModalBody: document.getElementById('reader-info-body'),
      // Settings controls
      themeBtns: document.querySelectorAll('.reader-theme-btn'),
      fontFamilySelect: document.getElementById('reader-font-family'),
      fontSizeVal: document.getElementById('reader-font-size-val'),
      fontSizeDec: document.getElementById('reader-font-size-dec'),
      fontSizeInc: document.getElementById('reader-font-size-inc'),
      lineHeightBtns: document.querySelectorAll('.reader-lh-btn'),
      contentWidthBtns: document.querySelectorAll('.reader-width-btn')
    };
  }

  bindEvents() {
    // Exit
    this.dom.exitBtn.addEventListener('click', () => {
      if (this.isStandalone || document.body.classList.contains('reader-standalone')) {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = 'index.html';
        }
      } else {
        this.close();
      }
    });

    // Book Detail / Info Modal
    if (this.dom.infoBtn) {
      this.dom.infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleInfoModal();
      });
    }
    if (this.dom.infoCloseBtn) {
      this.dom.infoCloseBtn.addEventListener('click', () => this.closeInfoModal());
    }
    if (this.dom.infoModal) {
      this.dom.infoModal.addEventListener('click', (e) => {
        if (e.target === this.dom.infoModal) this.closeInfoModal();
      });
    }

    // Fullscreen Toggle
    if (this.dom.fullscreenBtn) {
      this.dom.fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFullscreen();
      });
    }

    // Navigation
    this.dom.prevChapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.prevChapter();
    });
    this.dom.nextChapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.nextChapter();
    });

    // Slider: live preview on drag with scrub bubble, load chapter on release
    const handleScrubStart = () => {
      this.isScrubbing = true;
      this.scrubPendingOrigin = this.getReadingPositionSnapshot();
    };

    if (this.dom.chapSlider) {
      this.dom.chapSlider.addEventListener('pointerdown', handleScrubStart);
      this.dom.chapSlider.addEventListener('touchstart', handleScrubStart, { passive: true });
      this.dom.chapSlider.addEventListener('mousedown', handleScrubStart);

      this.dom.chapSlider.addEventListener('input', (e) => {
        if (!this.isScrubbing) {
          this.scrubPendingOrigin = this.getReadingPositionSnapshot();
          this.isScrubbing = true;
        }
        const idx = parseInt(e.target.value, 10);
        if (this.parsedBook && this.parsedBook.chapters && this.parsedBook.chapters[idx]) {
          const title = this.parsedBook.chapters[idx].title;
          const total = this.parsedBook.chapters.length;
          const percent = total > 0 ? Math.round(((idx + 1) / total) * 100) : 0;
          this.dom.chapterTitleEl.textContent = title;
          this.dom.chapProgressText.textContent = `第 ${idx + 1} / ${total} 节 · ${percent}%`;
          this.updateScrubBubble(idx, title, total, percent);
        }
      });

      this.dom.chapSlider.addEventListener('change', (e) => {
        const idx = parseInt(e.target.value, 10);
        this.hideScrubBubble();
        const origin = this.scrubPendingOrigin;
        if (origin && idx !== origin.index) {
          this.jumpOrigin = origin;
          this.goToChapter(idx);
          this.showUndoChip(origin);
        } else if (idx !== this.currentChapterIndex) {
          this.goToChapter(idx);
        }
        this.isScrubbing = false;
        this.scrubPendingOrigin = null;
      });

      const handleScrubEnd = () => {
        this.hideScrubBubble();
        this.isScrubbing = false;
      };
      this.dom.chapSlider.addEventListener('pointerup', handleScrubEnd);
      this.dom.chapSlider.addEventListener('touchend', handleScrubEnd);
      this.dom.chapSlider.addEventListener('pointercancel', handleScrubEnd);
      this.dom.chapSlider.addEventListener('touchcancel', handleScrubEnd);
      window.addEventListener('mouseup', handleScrubEnd);
    }

    // Undo Jump Button & Close Events
    if (this.dom.undoBtn) {
      this.dom.undoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.jumpOrigin) {
          const origin = this.jumpOrigin;
          this.jumpOrigin = null;
          this.hideUndoChip();
          this.goToChapter(origin.index, origin.scrollPercent);
          showToast('已返回原阅读进度');
        }
      });
    }

    if (this.dom.undoClose) {
      this.dom.undoClose.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideUndoChip();
      });
    }

    // Backdrop click / touch: close TOC or settings or info
    if (this.dom.backdrop) {
      const dismissOverlays = (e) => {
        e.stopPropagation();
        this.closeToc();
        this.closeSettings();
        this.closeInfoModal();
      };
      this.dom.backdrop.addEventListener('click', dismissOverlays);
    }

    const sheetHandle = document.querySelector('.sheet-handle');
    if (sheetHandle) {
      sheetHandle.addEventListener('click', () => this.closeSettings());
    }

    // TOC Toggle
    this.dom.tocBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleToc();
    });
    this.dom.tocDrawerClose.addEventListener('click', () => this.closeToc());

    // TOC Search Filter
    if (this.dom.tocSearchInput) {
      this.dom.tocSearchInput.addEventListener('input', (e) => {
        this.filterToc(e.target.value);
      });
    }
    if (this.dom.tocSearchClear) {
      this.dom.tocSearchClear.addEventListener('click', () => {
        if (this.dom.tocSearchInput) {
          this.dom.tocSearchInput.value = '';
          this.filterToc('');
        }
      });
    }

    // Settings Toggle
    this.dom.settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSettings();
    });
    this.dom.settingsClose.addEventListener('click', () => this.closeSettings());

    // Favorite Toggle
    this.dom.favBtn.addEventListener('click', () => {
      if (!this.currentBook) return;
      const isFav = BookStorage.toggleFavorite(this.currentBook.id);
      this.updateFavBtn(isFav);
      showToast(isFav ? '已加入书房收藏' : '已取消收藏');
      if (window.renderFavorites) window.renderFavorites();
    });

    // Offline Cache Toggle
    this.dom.cacheBtn.addEventListener('click', () => this.toggleOfflineCache());

    // Content area click to toggle controls (mobile/immersive)
    this.dom.contentArea.addEventListener('click', (e) => {
      // Don't toggle controls if user clicked a link, button, input or navigation card
      if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.reader-bottom-nav-card') || e.target.closest('input')) {
        return;
      }
      if (this.dom.tocDrawer && this.dom.tocDrawer.classList.contains('active')) {
        this.closeToc();
        return;
      }
      if (this.dom.settingsPanel && this.dom.settingsPanel.classList.contains('active')) {
        this.closeSettings();
        return;
      }
      if (this.dom.infoModal && this.dom.infoModal.classList.contains('active')) {
        this.closeInfoModal();
        return;
      }

      // If bars were hidden by scroll, restore them
      if (this.dom.topBar.classList.contains('scrolled-hidden') || this.dom.bottomBar.classList.contains('scrolled-hidden')) {
        this.dom.topBar.classList.remove('scrolled-hidden');
        this.dom.bottomBar.classList.remove('scrolled-hidden');
        this.isControlsVisible = true;
        this.dom.topBar.classList.remove('hidden');
        this.dom.bottomBar.classList.remove('hidden');
        return;
      }

      this.toggleControls();
    });

    // Scroll progress save with debounce + scroll direction auto-hide on mobile
    let scrollTimer = null;
    let lastScrollTop = 0;
    this.dom.contentArea.addEventListener('scroll', () => {
      const st = this.dom.contentArea.scrollTop;
      const diff = st - lastScrollTop;

      // Auto dismiss undo chip if reader scrolls reading content
      if (this.dom.undoChip && this.dom.undoChip.classList.contains('visible')) {
        if (Math.abs(st - (this.undoInitialScrollTop || 0)) > 60) {
          this.hideUndoChip();
        }
      }

      // Detect scroll direction: down hides bars, up reveals bars
      if (diff > 14 && st > 30) {
        clearTimeout(this.hideControlsTimer);
        if (!this.dom.topBar.classList.contains('scrolled-hidden')) {
          this.dom.topBar.classList.add('scrolled-hidden');
          this.dom.bottomBar.classList.add('scrolled-hidden');
          this.hideUndoChip();
        }
      } else if (diff < -24) {
        clearTimeout(this.hideControlsTimer);
        if (this.dom.topBar.classList.contains('scrolled-hidden')) {
          this.dom.topBar.classList.remove('scrolled-hidden');
          this.dom.bottomBar.classList.remove('scrolled-hidden');
        }
      }
      lastScrollTop = Math.max(0, st);

      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => this.saveScrollPosition(), 150);
    }, { passive: true });


    // Settings Controls
    this.dom.themeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.getAttribute('data-theme');
        this.updateSetting('theme', theme);
      });
    });

    this.dom.fontFamilySelect.addEventListener('change', (e) => {
      this.updateSetting('fontFamily', e.target.value);
    });

    this.dom.fontSizeDec.addEventListener('click', () => {
      const size = Math.max(14, this.settings.fontSize - 1);
      this.updateSetting('fontSize', size);
    });

    this.dom.fontSizeInc.addEventListener('click', () => {
      const size = Math.min(32, this.settings.fontSize + 1);
      this.updateSetting('fontSize', size);
    });

    this.dom.lineHeightBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const lh = parseFloat(btn.getAttribute('data-lh'));
        this.updateSetting('lineHeight', lh);
      });
    });

    this.dom.contentWidthBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const w = parseInt(btn.getAttribute('data-width'), 10);
        this.updateSetting('maxWidth', w);
      });
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        this.nextChapter();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this.prevChapter();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        this.toggleFullscreen();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        if (this.dom.tocDrawer.classList.contains('active')) {
          this.closeToc();
        } else {
          this.openToc();
        }
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.toggleSettings();
      } else if (e.key === 'Escape') {
        if (this.dom.tocDrawer.classList.contains('active')) {
          this.closeToc();
        } else if (this.dom.settingsPanel.classList.contains('active')) {
          this.closeSettings();
        } else {
          this.close();
        }
      }
    });

    // Touch Swipe Navigation for Mobile
    let touchStartX = 0;
    let touchStartY = 0;
    this.dom.contentArea.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    this.dom.contentArea.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1) {
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        // Horizontal swipe if abs(deltaX) > 60 and abs(deltaX) > 1.8 * abs(deltaY)
        if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.8) {
          if (deltaX < 0) {
            this.nextChapter();
          } else {
            this.prevChapter();
          }
        }
      }
    }, { passive: true });
  }

  isOpen() {
    return this.dom.readerOverlay.classList.contains('active');
  }

  async openBook(bookMeta, options = {}) {
    if (!this.dom.readerOverlay) this.init();
    this.currentBook = bookMeta;
    this.isStandalone = !!options.isStandalone || document.body.classList.contains('reader-standalone');
    this.dom.readerOverlay.classList.add('active');
    document.body.classList.add('reader-active');
    document.body.style.overflow = 'hidden';

    // Save host styling for clean restoration upon closing modal
    const currentMeta = document.querySelector('meta[name="theme-color"]');
    this.prevThemeColor = currentMeta ? currentMeta.getAttribute('content') : '#f8fafc';
    this.prevDocBg = document.documentElement.style.backgroundColor;
    this.prevBodyBg = document.body.style.backgroundColor;

    this.applySettings(this.settings);

    this.updateFavBtn(BookStorage.isFavorite(bookMeta.id));
    this.checkCacheStatus();

    this.dom.bookTitleEl.textContent = bookMeta.title;
    this.showLoading('正在加载图书数据...');

    try {
      let buffer = null;
      if (bookMeta.blob) {
        this.showLoading('从本地读取图书中...');
        buffer = await bookMeta.blob.arrayBuffer();
        BookDB.saveBook(bookMeta.id, bookMeta.blob, {
          title: bookMeta.title,
          author: bookMeta.author || '本地导入',
          format: bookMeta.format,
          isCustom: true,
          size: bookMeta.blob.size
        }).then(() => this.checkCacheStatus());
      } else {
        // 1. Check local IndexedDB first
        const cachedBlob = await BookDB.getBook(bookMeta.id);
        if (cachedBlob) {
          this.showLoading('从本地离线缓存读取中...');
          buffer = await cachedBlob.arrayBuffer();
        } else {
          // 2. Fetch via network
          const downloadUrl = (typeof window.getDownloadUrl === 'function') ? window.getDownloadUrl(bookMeta) : encodeURI(bookMeta.path || '');
          this.showLoading('正在下载电子书...');
          const res = await fetch(downloadUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}: 无法获取电子书文件`);
          const blob = await res.blob();
          buffer = await blob.arrayBuffer();
          
          // Silently cache in IndexedDB for seamless offline resumption
          BookDB.saveBook(bookMeta.id, blob, {
            title: bookMeta.title,
            author: bookMeta.author,
            format: bookMeta.format,
            path: bookMeta.path,
            size: bookMeta.size
          }).then(() => this.checkCacheStatus());
        }
      }

      // 3. Parse eBook
      this.showLoading('正在解析排版与章节...');
      this.parsedBook = await BookParser.parse(buffer, bookMeta.format, bookMeta.title);

      // 4. Determine chapter & progress
      let targetChapter = 0;
      let targetScroll = 0;

      if (typeof options.initialChapter === 'number' && options.initialChapter >= 0 && options.initialChapter < this.parsedBook.chapters.length) {
        targetChapter = options.initialChapter;
        targetScroll = options.initialScroll || 0;
      } else {
        const savedProgress = BookStorage.getProgress(bookMeta.id);
        if (savedProgress && savedProgress.chapterIndex < this.parsedBook.chapters.length) {
          targetChapter = savedProgress.chapterIndex;
          targetScroll = savedProgress.scrollPercent || 0;
        }
      }

      this.initToc();
      this.hideLoading();
      this.goToChapter(targetChapter, targetScroll);

      if (window.innerWidth <= 640) {
        clearTimeout(this.hideControlsTimer);
        this.hideControlsTimer = setTimeout(() => {
          if (this.isOpen() && !this.dom.settingsPanel?.classList.contains('active') && !this.dom.tocDrawer?.classList.contains('active')) {
            this.hideControls();
          }
        }, 2200);
      }

    } catch (err) {
      console.error('Failed to open book in reader:', err);
      this.hideLoading();
      alert(`无法打开此书: ${err.message || err}`);
      if (this.isStandalone) {
        window.location.href = 'index.html';
      } else {
        this.close();
      }
    }
  }

  close() {
    this.dom.readerOverlay.classList.remove('active');
    document.body.classList.remove('reader-active');
    document.documentElement.removeAttribute('data-reader-theme');
    document.body.removeAttribute('data-reader-theme');
    document.documentElement.style.backgroundColor = this.prevDocBg || '';
    document.body.style.backgroundColor = this.prevBodyBg || '';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', this.prevThemeColor || '#f8fafc');
    }
    document.body.style.overflow = '';
    this.closeToc();
    this.closeSettings();
    this.closeInfoModal();
    this.currentBook = null;
    this.parsedBook = null;
    if (window.renderRecentBooks) window.renderRecentBooks();
  }

  showLoading(text) {
    this.dom.loadingModal.style.display = 'flex';
    this.dom.loadingText.textContent = text;
  }

  hideLoading() {
    this.dom.loadingModal.style.display = 'none';
  }

  initToc() {
    if (!this.parsedBook || !this.parsedBook.chapters) return;
    const total = this.parsedBook.chapters.length;
    this.dom.chapSlider.max = Math.max(0, total - 1);
    if (this.dom.tocCount) {
      this.dom.tocCount.textContent = `共 ${total} 节`;
    }
    if (this.dom.tocSearchInput) {
      this.dom.tocSearchInput.value = '';
    }
    if (this.dom.tocSearchClear) {
      this.dom.tocSearchClear.style.display = 'none';
    }

    this.renderTocList(this.parsedBook.chapters);
  }

  renderTocList(chaptersList) {
    if (!chaptersList || chaptersList.length === 0) {
      this.dom.tocList.innerHTML = '<div class="reader-toc-empty">无匹配章节</div>';
      return;
    }

    this.dom.tocList.innerHTML = chaptersList.map((chap) => `
      <div class="reader-toc-item ${chap.index === this.currentChapterIndex ? 'active' : ''}" data-index="${chap.index}">
        <span class="toc-num">${chap.index + 1}</span>
        <span class="toc-name">${escapeHtml(chap.title)}</span>
      </div>
    `).join('');

    this.dom.tocList.querySelectorAll('.reader-toc-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.getAttribute('data-index'), 10);
        if (idx !== this.currentChapterIndex) {
          const origin = this.getReadingPositionSnapshot();
          if (origin) {
            this.jumpOrigin = origin;
            this.goToChapter(idx);
            this.showUndoChip(origin);
          } else {
            this.goToChapter(idx);
          }
        }
        this.closeToc();
      });
    });
  }

  filterToc(query) {
    if (!this.parsedBook || !this.parsedBook.chapters) return;
    const q = (query || '').trim().toLowerCase();
    if (this.dom.tocSearchClear) {
      this.dom.tocSearchClear.style.display = q ? 'block' : 'none';
    }

    if (!q) {
      this.renderTocList(this.parsedBook.chapters);
      return;
    }

    const filtered = this.parsedBook.chapters.filter(chap => 
      chap.title.toLowerCase().includes(q) || String(chap.index + 1).includes(q)
    );
    this.renderTocList(filtered);
  }

  goToChapter(index, scrollPercent = 0) {
    if (!this.parsedBook || !this.parsedBook.chapters) return;
    const chapters = this.parsedBook.chapters;
    if (index < 0) index = 0;
    if (index >= chapters.length) index = chapters.length - 1;

    this.currentChapterIndex = index;
    const chapter = chapters[index];

    // Update UI Header & Footer
    this.dom.chapterTitleEl.textContent = chapter.title;
    this.dom.chapSlider.value = index;
    const percent = Math.round(((index + 1) / chapters.length) * 100);
    this.dom.chapProgressText.textContent = `第 ${index + 1} / ${chapters.length} 节 · ${percent}%`;

    this.dom.prevChapBtn.disabled = (index === 0);
    this.dom.nextChapBtn.disabled = (index === chapters.length - 1);

    // Highlight active in TOC
    this.dom.tocList.querySelectorAll('.reader-toc-item').forEach(el => {
      el.classList.toggle('active', parseInt(el.getAttribute('data-index'), 10) === index);
    });

    // In-page bottom navigation buttons HTML
    const prevTitle = index > 0 ? chapters[index - 1].title : '已经是第一节';
    const nextTitle = index < chapters.length - 1 ? chapters[index + 1].title : '已经是最后一节';

    const inPageNavHtml = `
      <div class="reader-chapter-bottom-nav">
        <button class="reader-bottom-nav-card prev ${index === 0 ? 'disabled' : ''}" id="inpage-prev-btn" title="阅读上一节">
          <span class="reader-bottom-nav-label">‹ 上一节</span>
          <span class="reader-bottom-nav-title">${escapeHtml(prevTitle)}</span>
        </button>
        <button class="reader-bottom-nav-card next ${index === chapters.length - 1 ? 'disabled' : ''}" id="inpage-next-btn" title="阅读下一节">
          <span class="reader-bottom-nav-label">下一节 ›</span>
          <span class="reader-bottom-nav-title">${escapeHtml(nextTitle)}</span>
        </button>
      </div>
    `;

    // Render HTML content with spacers to prevent toolbar text obstruction
    this.dom.chapterContentEl.innerHTML = `
      <div class="reader-chapter-heading">${escapeHtml(chapter.title)}</div>
      <div class="reader-chapter-body">${chapter.content}</div>
      <div class="reader-chapter-end-spacer"></div>
      ${inPageNavHtml}
      <div class="reader-chapter-end-spacer"></div>
    `;

    // Bind in-page bottom navigation events
    const inpagePrev = document.getElementById('inpage-prev-btn');
    const inpageNext = document.getElementById('inpage-next-btn');
    if (inpagePrev && index > 0) {
      inpagePrev.addEventListener('click', (e) => {
        e.stopPropagation();
        this.prevChapter();
      });
    }
    if (inpageNext && index < chapters.length - 1) {
      inpageNext.addEventListener('click', (e) => {
        e.stopPropagation();
        this.nextChapter();
      });
    }

    // Scroll positioning
    if (scrollPercent > 0) {
      setTimeout(() => {
        const targetScrollTop = (this.dom.contentArea.scrollHeight - this.dom.contentArea.clientHeight) * scrollPercent;
        this.dom.contentArea.scrollTo({ top: targetScrollTop, behavior: 'auto' });
      }, 50);
    } else {
      this.dom.contentArea.scrollTo({ top: 0, behavior: 'auto' });
    }

    // URL sync in standalone mode
    if (this.currentBook && window.history && window.history.replaceState) {
      try {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.pathname.includes('reader.html')) {
          currentUrl.searchParams.set('id', this.currentBook.id);
          currentUrl.searchParams.set('chapter', index);
          window.history.replaceState(null, '', currentUrl.toString());
        }
      } catch (e) {}
    }

    this.saveProgress();
  }

  nextChapter() {
    if (!this.parsedBook) return;
    if (this.currentChapterIndex < this.parsedBook.chapters.length - 1) {
      this.goToChapter(this.currentChapterIndex + 1);
    } else {
      showToast('已读到本书最后一章！');
    }
  }

  prevChapter() {
    if (!this.parsedBook) return;
    if (this.currentChapterIndex > 0) {
      this.goToChapter(this.currentChapterIndex - 1);
    } else {
      showToast('已在本书第一章');
    }
  }

  getReadingPositionSnapshot() {
    if (!this.parsedBook || !this.parsedBook.chapters) return null;
    const chap = this.parsedBook.chapters[this.currentChapterIndex];
    const scrollHeight = this.dom.contentArea ? (this.dom.contentArea.scrollHeight - this.dom.contentArea.clientHeight) : 0;
    const scrollPercent = scrollHeight > 0 ? (this.dom.contentArea.scrollTop / scrollHeight) : 0;
    return {
      index: this.currentChapterIndex,
      title: chap ? chap.title : `第 ${this.currentChapterIndex + 1} 节`,
      scrollPercent: scrollPercent,
      scrollTop: this.dom.contentArea ? this.dom.contentArea.scrollTop : 0
    };
  }

  updateScrubBubble(idx, title, total, percent) {
    if (!this.dom.scrubBubble || !this.dom.chapSlider) return;
    const max = Math.max(1, total - 1);
    const ratio = Math.min(1, Math.max(0, idx / max));

    // Thumb is 18px wide. At ratio=0 center is at +9px, at ratio=1 center is at -9px.
    const offsetPx = (0.5 - ratio) * 18;
    this.dom.scrubBubble.style.left = `calc(${ratio * 100}% + ${offsetPx}px)`;

    if (this.dom.scrubBubbleTitle) {
      this.dom.scrubBubbleTitle.textContent = title || `第 ${idx + 1} 节`;
    }
    if (this.dom.scrubBubbleSub) {
      this.dom.scrubBubbleSub.textContent = `第 ${idx + 1} / ${total} 节 · ${percent}%`;
    }
    this.dom.scrubBubble.classList.add('visible');
  }

  hideScrubBubble() {
    if (this.dom.scrubBubble) {
      this.dom.scrubBubble.classList.remove('visible');
    }
  }

  showUndoChip(origin) {
    if (!origin || !this.dom.undoChip) return;
    const cleanTitle = (origin.title || '').trim();
    const pctStr = origin.scrollPercent > 0.02 ? ` · ${Math.round(origin.scrollPercent * 100)}%` : '';
    if (this.dom.undoText) {
      this.dom.undoText.textContent = `${cleanTitle || `第 ${origin.index + 1} 节`}${pctStr}`;
    }
    this.undoInitialScrollTop = this.dom.contentArea ? this.dom.contentArea.scrollTop : 0;
    this.dom.undoChip.classList.add('visible');
    clearTimeout(this.undoTimer);
    this.undoTimer = setTimeout(() => {
      this.hideUndoChip();
    }, 10000);
  }

  hideUndoChip() {
    if (this.dom.undoChip) {
      this.dom.undoChip.classList.remove('visible');
    }
    clearTimeout(this.undoTimer);
  }

  saveScrollPosition() {
    if (!this.currentBook || !this.parsedBook) return;
    const scrollHeight = this.dom.contentArea.scrollHeight - this.dom.contentArea.clientHeight;
    const scrollPercent = scrollHeight > 0 ? (this.dom.contentArea.scrollTop / scrollHeight) : 0;
    this.saveProgress(scrollPercent);
  }

  saveProgress(scrollPercent = 0) {
    if (!this.currentBook || !this.parsedBook) return;
    const total = this.parsedBook.chapters.length;
    const overallPercent = Math.min(100, Math.round(((this.currentChapterIndex + (scrollPercent || 0)) / total) * 100));

    // Update top subtle progress indicator line
    if (this.dom.topProgress) {
      this.dom.topProgress.style.width = `${overallPercent}%`;
    }

    BookStorage.saveProgress(this.currentBook.id, {
      title: this.currentBook.title,
      author: this.currentBook.author,
      format: this.currentBook.format,
      path: this.currentBook.path,
      category: this.currentBook.category,
      chapterIndex: this.currentChapterIndex,
      chapterTitle: this.parsedBook.chapters[this.currentChapterIndex]?.title || '',
      totalChapters: total,
      scrollPercent: scrollPercent,
      overallPercent: overallPercent
    });
  }

  // Controls Visibility Toggle
  toggleControls() {
    this.isControlsVisible = !this.isControlsVisible;
    this.dom.topBar.classList.remove('scrolled-hidden');
    this.dom.bottomBar.classList.remove('scrolled-hidden');
    this.dom.topBar.classList.toggle('hidden', !this.isControlsVisible);
    this.dom.bottomBar.classList.toggle('hidden', !this.isControlsVisible);
  }

  showControls() {
    this.isControlsVisible = true;
    this.dom.topBar.classList.remove('hidden', 'scrolled-hidden');
    this.dom.bottomBar.classList.remove('hidden', 'scrolled-hidden');
  }

  hideControls() {
    this.isControlsVisible = false;
    this.dom.topBar.classList.add('scrolled-hidden');
    this.dom.bottomBar.classList.add('scrolled-hidden');
  }

  // Fullscreen Mode Toggle
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  // Book Detail / Info Modal
  toggleInfoModal() {
    if (!this.dom.infoModal) return;
    if (this.dom.infoModal.classList.contains('active')) {
      this.closeInfoModal();
    } else {
      this.openInfoModal();
    }
  }

  openInfoModal() {
    if (!this.dom.infoModal || !this.currentBook) return;
    this.closeToc();
    this.closeSettings();
    const book = this.currentBook;
    const pal = (typeof BookUI !== 'undefined' && BookUI.getPalette) ? BookUI.getPalette(book) : { bg: 'linear-gradient(135deg, #1e293b, #0f172a)', icon: '📖' };
    const sizeStr = (typeof BookUI !== 'undefined' && BookUI.formatSize) ? BookUI.formatSize(book.size) : (book.size ? `${(book.size/1024/1024).toFixed(1)} MB` : '未知大小');
    const progress = (typeof BookStorage !== 'undefined') ? BookStorage.getProgress(book.id) : null;
    const pct = progress ? `${progress.overallPercent || 0}% (第 ${progress.chapterIndex + 1} 节)` : '尚未开始';

    if (this.dom.infoModalBody) {
      this.dom.infoModalBody.innerHTML = `
        <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 0.5rem;">
          <div style="width: 58px; height: 76px; background: ${pal.bg}; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; box-shadow: 0 4px 10px rgba(0,0,0,0.15); flex-shrink: 0;">
            ${pal.icon || '📖'}
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700;">${escapeHtml(book.title)}</h3>
            <p style="margin: 0.25rem 0 0; color: var(--r-muted); font-size: 0.85rem;">${escapeHtml(book.author || '佚名')} · ${escapeHtml(book.category || '精选文集')}</p>
          </div>
        </div>
        <div class="reader-modal-row"><span class="reader-modal-label">电子书格式:</span><span class="reader-modal-val"><span style="text-transform: uppercase; font-weight: 700; color: var(--r-active);">${escapeHtml(book.format || 'EPUB')}</span></span></div>
        <div class="reader-modal-row"><span class="reader-modal-label">文件体积:</span><span class="reader-modal-val">${sizeStr}</span></div>
        <div class="reader-modal-row"><span class="reader-modal-label">当前进度:</span><span class="reader-modal-val">${pct}</span></div>
        <div class="reader-modal-row"><span class="reader-modal-label">离线缓存:</span><span class="reader-modal-val">${this.dom.cacheBtn && this.dom.cacheBtn.classList.contains('cached') ? '✅ 本地已缓存 (断网可读)' : '⚪ 未缓存 (在线按需读取)'}</span></div>
        ${book.tags && book.tags.length ? `<div class="reader-modal-row"><span class="reader-modal-label">内容标签:</span><span class="reader-modal-val">${book.tags.map(t => '#' + escapeHtml(t)).join(' ')}</span></div>` : ''}
        ${book.description || book.excerpt ? `
          <div style="margin-top: 0.4rem;">
            <div class="reader-modal-label" style="margin-bottom: 0.35rem;">书籍简介:</div>
            <div class="reader-modal-desc">${escapeHtml(book.description || book.excerpt)}</div>
          </div>
        ` : ''}
      `;
    }
    this.dom.infoModal.classList.add('active');
  }

  closeInfoModal() {
    if (this.dom.infoModal) {
      this.dom.infoModal.classList.remove('active');
    }
  }

  // Drawer / Modals with Backdrop synchronization
  toggleToc() {
    if (this.dom.tocDrawer.classList.contains('active')) {
      this.closeToc();
    } else {
      this.openToc();
    }
  }

  openToc() {
    this.closeSettings();
    this.closeInfoModal();
    this.dom.tocDrawer.classList.add('active');
    if (this.dom.tocBtn) this.dom.tocBtn.classList.add('active');
    if (this.dom.backdrop) this.dom.backdrop.classList.add('active');

    // Auto-scroll active item into center of view
    setTimeout(() => {
      const activeEl = this.dom.tocList.querySelector('.reader-toc-item.active');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 120);
  }

  closeToc() {
    this.dom.tocDrawer.classList.remove('active');
    if (this.dom.tocBtn) this.dom.tocBtn.classList.remove('active');
    if (this.dom.backdrop && !this.dom.settingsPanel.classList.contains('active')) {
      this.dom.backdrop.classList.remove('active');
    }
  }

  toggleSettings() {
    if (this.dom.settingsPanel.classList.contains('active')) {
      this.closeSettings();
    } else {
      this.closeToc();
      this.closeInfoModal();
      this.dom.settingsPanel.classList.add('active');
      if (this.dom.settingsBtn) this.dom.settingsBtn.classList.add('active');
      if (this.dom.backdrop) this.dom.backdrop.classList.add('active');
    }
  }

  closeSettings() {
    this.dom.settingsPanel.classList.remove('active');
    if (this.dom.settingsBtn) this.dom.settingsBtn.classList.remove('active');
    if (this.dom.backdrop && !this.dom.tocDrawer.classList.contains('active')) {
      this.dom.backdrop.classList.remove('active');
    }
  }

  // Settings Application
  updateSetting(key, val) {
    this.settings[key] = val;
    BookStorage.saveSettings({ [key]: val });
    this.applySettings(this.settings);
  }

  applySettings(s) {
    const THEME_COLORS = {
      paper: '#fcfbfa',
      sepia: '#f6eedb',
      dark: '#1c1c22',
      black: '#000000'
    };
    const themeColor = THEME_COLORS[s.theme] || '#fcfbfa';

    // Theme
    this.dom.readerOverlay.setAttribute('data-reader-theme', s.theme);
    this.dom.themeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-theme') === s.theme);
    });

    // Update document root and body theme attributes and background when reader is active or standalone
    if (this.isOpen() || this.isStandalone) {
      document.documentElement.setAttribute('data-reader-theme', s.theme);
      document.body.setAttribute('data-reader-theme', s.theme);
      document.documentElement.style.backgroundColor = themeColor;
      document.body.style.backgroundColor = themeColor;
      document.documentElement.style.setProperty('--r-bg', themeColor);
      document.documentElement.style.setProperty('--r-bar-bg', themeColor);
      document.body.style.setProperty('--r-bg', themeColor);
      document.body.style.setProperty('--r-bar-bg', themeColor);

      // Force WebKit/Safari to immediately update the status bar and bottom toolbar
      document.querySelectorAll('meta[name="theme-color"]').forEach(el => el.remove());
      const newMeta = document.createElement('meta');
      newMeta.name = 'theme-color';
      newMeta.id = 'reader-theme-color-meta';
      newMeta.content = themeColor;
      document.head.appendChild(newMeta);

      const appleStatusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (appleStatusMeta) {
        appleStatusMeta.setAttribute('content', (s.theme === 'dark' || s.theme === 'black') ? 'black' : 'default');
      }
    }

    // Font Family
    this.dom.readerOverlay.setAttribute('data-reader-font', s.fontFamily);
    if (this.dom.fontFamilySelect) this.dom.fontFamilySelect.value = s.fontFamily;

    // Font Size
    if (this.dom.fontSizeVal) this.dom.fontSizeVal.textContent = `${s.fontSize}px`;
    this.dom.chapterContentEl.style.fontSize = `${s.fontSize}px`;

    // Line Height
    this.dom.chapterContentEl.style.lineHeight = s.lineHeight;
    this.dom.lineHeightBtns.forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.getAttribute('data-lh')) === s.lineHeight);
    });

    // Max Width
    this.dom.chapterContentEl.style.maxWidth = `${s.maxWidth}px`;
    this.dom.contentWidthBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.getAttribute('data-width'), 10) === s.maxWidth);
    });
  }

  updateFavBtn(isFav) {
    this.dom.favBtn.innerHTML = isFav
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    this.dom.favBtn.title = isFav ? '已在书房收藏' : '加入收藏';
  }

  async checkCacheStatus() {
    if (!this.currentBook) return;
    const isCached = await BookDB.hasBook(this.currentBook.id);
    this.dom.cacheBtn.classList.toggle('cached', isCached);
    this.dom.cacheBtn.title = isCached ? '已缓存到本地，支持离线阅读' : '点击下载并缓存到本地';
  }

  async toggleOfflineCache() {
    if (!this.currentBook) return;
    const isCached = await BookDB.hasBook(this.currentBook.id);
    if (isCached) {
      await BookDB.deleteBook(this.currentBook.id);
      this.checkCacheStatus();
      showToast('已从本地缓存移除');
    } else {
      this.showLoading('正在下载并缓存整本图书...');
      try {
        const downloadUrl = (typeof getDownloadUrl === 'function') ? getDownloadUrl(this.currentBook) : this.currentBook.path;
        const res = await fetch(downloadUrl);
        const blob = await res.blob();
        await BookDB.saveBook(this.currentBook.id, blob, {
          title: this.currentBook.title,
          author: this.currentBook.author,
          format: this.currentBook.format,
          path: this.currentBook.path,
          size: this.currentBook.size
        });
        this.hideLoading();
        this.checkCacheStatus();
        showToast('缓存成功！离线断网状态下亦可畅读');
      } catch (e) {
        this.hideLoading();
        alert('缓存失败: ' + e.message);
      }
    }
  }
}

window.Reader = new ReaderApp();
window.readerApp = window.Reader;

document.addEventListener('DOMContentLoaded', () => {
  if (window.Reader) {
    window.Reader.init();
  }
});
})();


