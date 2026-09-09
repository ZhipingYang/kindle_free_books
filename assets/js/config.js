/**
 * Runtime deployment configuration.
 *
 * Keep catalog metadata with the website and, when the library grows, point
 * assetBaseUrl at an object-storage/CDN origin. Existing relative `books/...`
 * paths in books.json continue to work unchanged.
 */
(() => {
  const config = {
    catalogUrl: 'books.json',
    assetBaseUrl: ''
  };

  function joinUrl(base, path) {
    if (!base) return encodeURI(path || '');
    return `${base.replace(/\/$/, '')}/${encodeURI((path || '').replace(/^\//, ''))}`;
  }

  window.AppConfig = Object.freeze({
    ...config,
    resolveBookUrl(bookOrPath) {
      const path = typeof bookOrPath === 'string' ? bookOrPath : bookOrPath?.path;
      return joinUrl(config.assetBaseUrl, path);
    }
  });
  window.getDownloadUrl = (book) => window.AppConfig.resolveBookUrl(book);
})();
