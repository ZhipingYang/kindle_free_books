/**
 * Universal eBook Parser for EPUB, MOBI, and TXT in pure browser JS.
 */

(() => {
// PalmDOC LZ77 decompressor for MOBI
function decompressPalmDoc(buf) {
  const bytes = new Uint8Array(buf);
  const out = [];
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const c = bytes[i++];
    if (c >= 1 && c <= 8) {
      for (let j = 0; j < c; j++) out.push(bytes[i++]);
    } else if (c < 128) {
      out.push(c);
    } else if (c >= 192) {
      out.push(32);
      out.push(c ^ 128);
    } else {
      if (i >= n) break;
      const c2 = bytes[i++];
      const dist = (((c << 8) | c2) >> 3) & 0x7ff;
      const len = (c2 & 7) + 3;
      for (let j = 0; j < len; j++) {
        const pos = out.length - dist;
        out.push(pos >= 0 ? out[pos] : 32);
      }
    }
  }
  return new Uint8Array(out);
}

const BookParser = {
  /**
   * Main entry point
   * @param {ArrayBuffer} buffer - Book binary data
   * @param {string} format - 'epub', 'mobi', or 'txt'
   * @param {string} fallbackTitle - Fallback book title
   * @returns {Promise<{title: string, author: string, chapters: Array<{title: string, content: string}>}>}
   */
  async parse(buffer, format, fallbackTitle = '未命名书籍') {
    const fmt = (format || '').toLowerCase();
    if (fmt === 'epub') {
      return this.parseEpub(buffer, fallbackTitle);
    } else if (fmt === 'mobi' || fmt === 'prc' || fmt === 'azw') {
      return this.parseMobi(buffer, fallbackTitle);
    } else if (fmt === 'txt') {
      return this.parseTxt(buffer, fallbackTitle);
    } else {
      throw new Error(`暂不支持 ${fmt} 格式的在线阅读`);
    }
  },

  // 1. EPUB Parser
  async parseEpub(buffer, fallbackTitle) {
    const jszip = (typeof window !== 'undefined' && window.JSZip) ? window.JSZip : (typeof JSZip !== 'undefined' ? JSZip : null);
    if (!jszip) {
      throw new Error('JSZip 依赖库未就绪');
    }
    const zip = await jszip.loadAsync(buffer);
    
    // Find container.xml
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) throw new Error('无效的 EPUB 格式: 缺少 container.xml');
    const containerText = await containerFile.async('text');
    const opfMatch = containerText.match(/full-path=["']([^"']+)["']/i);
    const opfPath = opfMatch ? opfMatch[1] : 'content.opf';
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    const opfFile = zip.file(opfPath);
    if (!opfFile) throw new Error('无法定位 EPUB OPF 文件');
    const opfText = await opfFile.async('text');

    // Parse XML
    const parser = new DOMParser();
    const opfDoc = parser.parseFromString(opfText, 'application/xml');

    // Title & Author
    const titleEl = opfDoc.querySelector('title');
    const creatorEl = opfDoc.querySelector('creator');
    const title = titleEl ? titleEl.textContent.trim() : fallbackTitle;
    const author = creatorEl ? creatorEl.textContent.trim() : '';

    // Manifest: id -> href
    const manifest = {};
    opfDoc.querySelectorAll('manifest > item').forEach(item => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      manifest[id] = href;
    });

    // Spine: ordered idref
    const spineIds = [];
    opfDoc.querySelectorAll('spine > itemref').forEach(item => {
      const idref = item.getAttribute('idref');
      if (idref && manifest[idref]) {
        spineIds.push(idref);
      }
    });

    // TOC: parse NCX or Nav if available
    const tocMap = {};
    const ncxItem = opfDoc.querySelector('item[media-type="application/x-dtbncx+xml"]');
    if (ncxItem) {
      const ncxHref = ncxItem.getAttribute('href');
      const ncxFile = zip.file(opfDir + ncxHref);
      if (ncxFile) {
        try {
          const ncxText = await ncxFile.async('text');
          const ncxDoc = parser.parseFromString(ncxText, 'application/xml');
          ncxDoc.querySelectorAll('navPoint').forEach(np => {
            const label = np.querySelector('navLabel > text')?.textContent?.trim();
            const src = np.querySelector('content')?.getAttribute('src')?.split('#')[0];
            if (label && src) tocMap[src] = label;
          });
        } catch (e) {}
      }
    }

    // Process Spine into chapters
    const chapters = [];
    let chapterCounter = 1;

    for (const idref of spineIds) {
      const rawHref = manifest[idref];
      if (!rawHref) continue;
      const fullHref = opfDir + rawHref;
      const chapFile = zip.file(fullHref);
      if (!chapFile) continue;

      let html = await chapFile.async('text');

      // Replace internal images with Object URLs from ZIP
      const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
      for (const m of imgMatches) {
        const imgSrc = m[1];
        if (!imgSrc.startsWith('http') && !imgSrc.startsWith('data:')) {
          const imgPath = opfDir + imgSrc.replace(/^\.\//, '');
          const imgZipFile = zip.file(imgPath);
          if (imgZipFile) {
            try {
              const imgBlob = await imgZipFile.async('blob');
              const blobUrl = URL.createObjectURL(imgBlob);
              html = html.replace(m[0], m[0].replace(imgSrc, blobUrl));
            } catch (e) {}
          }
        }
      }

      // Sanitize chapter title
      const chapDoc = parser.parseFromString(html, 'text/html');
      let chapTitle = tocMap[rawHref] || chapDoc.querySelector('h1, h2, h3, title')?.textContent?.trim();
      if (!chapTitle || chapTitle.length > 30) {
        chapTitle = `第 ${chapterCounter} 节`;
      }

      // Extract body content
      const bodyEl = chapDoc.querySelector('body');
      let content = bodyEl ? bodyEl.innerHTML : html;

      // Filter out empty placeholder chapters (e.g. pure cover image or empty page)
      const textOnly = content.replace(/<[^>]+>/g, '').trim();
      if (textOnly.length > 5 || content.includes('<img')) {
        chapters.push({
          title: chapTitle,
          content: content,
          index: chapters.length
        });
        chapterCounter++;
      }
    }

    if (chapters.length === 0) {
      chapters.push({ title: '全书内容', content: '<p>未能解析出章节内容</p>', index: 0 });
    }

    return { title, author, chapters };
  },

  // 2. MOBI Parser
  async parseMobi(buffer, fallbackTitle) {
    const view = new DataView(buffer);
    if (buffer.byteLength < 92) throw new Error('无效的 MOBI 文件: 文件过小');

    const numRecords = view.getUint16(76, false);
    const rec0Offset = view.getUint32(78, false);

    // PalmDOC compression type
    const compression = view.getUint16(rec0Offset, false);
    const textRecordsCount = view.getUint16(rec0Offset + 8, false);

    // Extract Title from MOBI header if available
    let title = fallbackTitle;
    try {
      const titleOffset = view.getUint32(rec0Offset + 84, false);
      const titleLen = view.getUint32(rec0Offset + 88, false);
      if (titleOffset + titleLen <= buffer.byteLength) {
        const titleBytes = new Uint8Array(buffer, rec0Offset + titleOffset, titleLen);
        title = new TextDecoder('utf-8').decode(titleBytes).trim() || fallbackTitle;
      }
    } catch (e) {}

    // Decompress text records
    const textDecoder = new TextDecoder('utf-8');
    let fullHtml = '';

    for (let r = 1; r <= Math.min(textRecordsCount, numRecords - 1); r++) {
      const offset = view.getUint32(78 + r * 8, false);
      const nextOffset = (r < numRecords - 1) ? view.getUint32(78 + (r + 1) * 8, false) : buffer.byteLength;
      const slice = buffer.slice(offset, nextOffset);

      if (compression === 2) {
        const decomp = decompressPalmDoc(slice);
        fullHtml += textDecoder.decode(decomp);
      } else {
        fullHtml += textDecoder.decode(slice);
      }
    }

    // Split MOBI HTML into chapters
    return this.splitHtmlIntoChapters(fullHtml, title);
  },

  // 3. TXT Parser
  async parseTxt(buffer, fallbackTitle) {
    let text = '';
    for (const enc of ['utf-8', 'gb18030', 'gbk']) {
      try {
        text = new TextDecoder(enc, { fatal: true }).decode(buffer);
        break;
      } catch (e) {}
    }
    if (!text) {
      text = new TextDecoder('utf-8').decode(buffer);
    }

    const lines = text.split(/\r?\n/);
    const chapters = [];
    let currentTitle = '引言 / 开篇';
    let currentLines = [];

    // Comprehensive chapter regex: supports 章/回/节/卷/集/部/篇/幕/景/折/话/讲, Chapter/ACT, and 序言/自序/前言/尾声/后记
    const chapterRegex = /^\s*((?:第[0-9一二三四五六七八九十百千]+[章回节卷集部篇幕场景折话讲]|Chapter\s+\d+|ACT\s+\d+|[【\[(]?(?:序言|自序|前言|引言|引子|楔子|尾声|后记|附录|终章)[\])】]?)[^\n]{0,35})$/i;

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.length <= 40 ? trimmed.match(chapterRegex) : null;
      if (match) {
        const hasContent = currentLines.some(l => l.trim().length > 0);
        if (!hasContent) {
          // File started directly with chapter 1 title: adopt title without preamble chapter
          currentTitle = match[1].trim();
          currentLines = [];
        } else {
          chapters.push({
            title: currentTitle,
            content: this.formatTxtLines(currentLines),
            index: chapters.length
          });
          currentTitle = match[1].trim();
          currentLines = [];
        }
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      chapters.push({
        title: currentTitle,
        content: this.formatTxtLines(currentLines),
        index: chapters.length
      });
    }

    // If no chapters were detected, split into chunks of ~3500 chars
    if (chapters.length <= 1 && text.length > 4500) {
      return this.chunkPlainText(text, fallbackTitle);
    }

    return {
      title: fallbackTitle,
      author: '',
      chapters
    };
  },

  // Helper: format TXT paragraphs
  formatTxtLines(lines) {
    return lines
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => `<p>${this.escape(l)}</p>`)
      .join('\n');
  },

  chunkPlainText(text, title) {
    const chapters = [];
    const chunkSize = 3500;
    let pos = 0;
    let idx = 1;
    while (pos < text.length) {
      let nextPos = Math.min(pos + chunkSize, text.length);
      if (nextPos < text.length) {
        const nl = text.indexOf('\n', nextPos);
        if (nl !== -1 && nl - nextPos < 300) nextPos = nl + 1;
      }
      const chunk = text.substring(pos, nextPos);
      const lines = chunk.split(/\r?\n/);
      chapters.push({
        title: `第 ${idx} 节`,
        content: this.formatTxtLines(lines),
        index: chapters.length
      });
      pos = nextPos;
      idx++;
    }
    return { title, author: '', chapters };
  },

  // Helper: split big HTML string into chapters (for MOBI)
  splitHtmlIntoChapters(html, title) {
    // 1. Clean legacy MOBI / PalmDOC tags and scripts
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
               .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
               .replace(/<guide[^>]*>[\s\S]*?<\/guide>/gi, '')
               .replace(/<reference[^>]*\/?>/gi, '')
               .replace(/<font\b[^>]*>/gi, '')
               .replace(/<\/font>/gi, '');

    // 2. Primary split: by <mbp:pagebreak> or chapter <div>
    const rawParts = html.split(/<mbp:pagebreak[^>]*\/?>|<div[^>]*class=["'][^"']*chapter[^"']*["'][^>]*>/i);

    // 3. Smart Sub-Splitting: if parts are too large (>40KB) or whole book wasn't split
    let subParts = [];
    for (const part of rawParts) {
      if (part.length > 40000) {
        // Try sub-splitting by <h1> ~ <h3>
        const hParts = part.split(/(?=<h[1-3][^>]*>)/i);
        if (hParts.length > 1) {
          subParts.push(...hParts);
          continue;
        }
        // Try sub-splitting by <p> chapter heading pattern
        const pParts = part.split(/(?=<p[^>]*>\s*(?:第[0-9一二三四五六七八九十百千]+[章回节卷集部篇幕场景折话讲]|Chapter\s+\d+|[【\[(]?(?:序言|自序|前言|引言|引子|楔子|尾声|后记|附录|终章)[\])】]?)[^<]{0,40}<\/p>)/i);
        if (pParts.length > 1) {
          subParts.push(...pParts);
          continue;
        }
      }
      subParts.push(part);
    }

    // If still <= 2 parts across entire book, try regex splitting on whole html
    if (subParts.length <= 2) {
      const hParts = html.split(/(?=<h[1-3][^>]*>)/i);
      if (hParts.length > subParts.length) {
        subParts = hParts;
      } else {
        const pParts = html.split(/(?=<p[^>]*>\s*(?:第[0-9一二三四五六七八九十百千]+[章回节卷集部篇幕场景折话讲]|Chapter\s+\d+|[【\[(]?(?:序言|自序|前言|引言|引子|楔子|尾声|后记|附录|终章)[\])】]?)[^<]{0,40}<\/p>)/i);
        if (pParts.length > subParts.length) {
          subParts = pParts;
        }
      }
    }

    const chapters = [];
    let counter = 1;

    for (const part of subParts) {
      const cleanText = part.replace(/<[^>]+>/g, '').trim();
      if (cleanText.length < 25) continue; // skip empty headers or whitespace

      // Extract chapter title
      const titleMatch = part.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) || 
                         part.match(/<p[^>]*>\s*(?:<strong>|<b>)?\s*((?:第[0-9一二三四五六七八九十百千]+[章回节卷集部篇幕场景折话讲]|Chapter\s+\d+|[【\[(]?(?:序言|自序|前言|引言|引子|楔子|尾声|后记|附录|终章)[\])】]?)[^<]{0,40})/i) ||
                         part.match(/<b>([^<]{2,30})<\/b>/i) ||
                         cleanText.match(/^((?:第[0-9一二三四五六七八九十百千]+[章回节卷集部篇幕场景折话讲]|Chapter\s+\d+|[【\[(]?(?:序言|自序|前言|引言|引子|楔子|尾声|后记|附录|终章)[\])】]?)[^\n]{0,30})/);
      
      let chapTitle = '';
      if (titleMatch) {
        chapTitle = (titleMatch[2] || titleMatch[1]).replace(/<[^>]+>/g, '').trim();
      }
      if (!chapTitle || chapTitle.length > 40) {
        chapTitle = `第 ${counter} 节`;
      }

      // Sanitize chapter content HTML
      let cleanContent = part
        .replace(/<mbp:pagebreak[^>]*\/?>/gi, '')
        .replace(/height=["']?[^"' >]+["']?/gi, '')
        .replace(/width=["']?[^"' >]+["']?/gi, '');

      chapters.push({
        title: chapTitle,
        content: cleanContent,
        index: chapters.length
      });
      counter++;
    }

    if (chapters.length === 0) {
      chapters.push({
        title: '开始阅读',
        content: html,
        index: 0
      });
    }

    return { title, author: '', chapters };
  },

  escape(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};

  window.BookParser = BookParser;
})();
