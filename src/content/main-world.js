/**
 * Google Photos Search - MAIN World Script
 * Runs in page context to access WIZ_global_data and make API calls
 * Communicates with content.js via postMessage
 * @module main-world
 */

(function() {
  'use strict';

  // Development mode - set to true for debugging, false for production
  const IS_DEV_MAIN = false;

  // Prevent double execution
  if (window.__ggPhotoSearchMain) {
    window.postMessage({ type: 'GG_PHOTO_MAIN_READY' }, '*');
    return;
  }
  window.__ggPhotoSearchMain = true;

  // ===== CONSTANTS =====
  const MAX_PAGES = 500;              // ~25,000 photos max
  const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes max for loadAll
  const MAX_INDEX_SIZE = 50000;       // Memory limit for photo index
  const RATE_LIMIT_DELAY = 300;       // Delay between API calls (ms)
  const RATE_LIMIT_JITTER = 200;      // Random jitter for rate limiting
  const CONCURRENT_FETCH_LIMIT = 5;   // Parallel filename fetch limit (reduced for safety)
  const MAX_RETRY_ATTEMPTS = 3;       // Max retries for rate-limited requests
  const MAX_FILENAME_LENGTH = 255;    // Max filename length to prevent issues

  // ===== STATE MANAGEMENT =====
  let isLoadingAll = false;           // Mutex for loadAll to prevent race conditions

  /** Safe JSON parse with fallback */
  function safeJsonParse(text, fallback = null) {
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  /**
   * Fetch with retry logic for rate-limited (429) responses
   * Uses exponential backoff: 1s, 2s, 4s
   * @param {string} url - Request URL
   * @param {RequestInit} options - Fetch options
   * @param {number} attempt - Current attempt number (internal)
   * @returns {Promise<Response>}
   */
  async function fetchWithRetry(url, options, attempt = 1) {
    const response = await fetch(url, options);

    if (response.status === 429 && attempt < MAX_RETRY_ATTEMPTS) {
      // Rate limited - wait with exponential backoff
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
      IS_DEV_MAIN && console.warn('[GGPhotoSearch:MAIN] Rate limited, waiting', waitMs, 'ms (attempt', attempt + ')');
      await new Promise(r => setTimeout(r, waitMs));
      return fetchWithRetry(url, options, attempt + 1);
    }

    return response;
  }

  /**
   * Truncate filename to safe length while preserving extension
   * @param {string} filename - Original filename
   * @returns {string} Truncated filename
   */
  function truncateFilename(filename) {
    if (!filename || filename.length <= MAX_FILENAME_LENGTH) return filename;
    const extMatch = filename.match(/\.[^.]+$/);
    const ext = extMatch ? extMatch[0] : '';
    const base = filename.slice(0, MAX_FILENAME_LENGTH - ext.length);
    return base + ext;
  }

  // ===== AUTH MODULE =====
  let cachedTokens = null;

  function getAuthTokens() {
    if (cachedTokens) return cachedTokens;
    try {
      const wizData = window.WIZ_global_data;
      if (!wizData) return null;
      const tokens = {
        at: wizData.SNlM0e || null,
        'f.sid': wizData.FdrFJe || null,
        bl: wizData.cfb2h || null,
        path: wizData.eptZe || '/'
      };
      if (!tokens.at || !tokens['f.sid']) return null;
      cachedTokens = tokens;
      return tokens;
    } catch (e) {
      return null;
    }
  }

  // ===== API MODULE =====
  const BATCH_ENDPOINT = '/_/PhotosUi/data/batchexecute';
  const RPC_ID_LIST = 'lcxiM';       // List photos by date (library only)
  const RPC_ID_ALBUM = 'snAcKc';     // Get album page (for albums/shared albums)
  const RPC_ID_DETAILS = 'fDcn4b';   // Get photo details including filename

  // Key separators used by Google Photos in URL encoding
  const KEY_PHOTO_SEPARATOR = '/photo/';
  const KEY_PARAM_SEPARATOR = '?key=';

  /**
   * Extract base share key from URL-encoded key parameter
   * Google Photos appends navigation paths to the key when viewing photos
   * e.g., key=baseKey%2Fphoto%2FphotoId... -> we only need the base key
   * @param {string} encodedKey - Raw URL-encoded key parameter
   * @returns {string|null} Base key or null
   */
  function extractBaseKey(encodedKey) {
    if (!encodedKey) return null;
    const decoded = decodeURIComponent(encodedKey);
    const baseKey = decoded.split(KEY_PHOTO_SEPARATOR)[0].split(KEY_PARAM_SEPARATOR)[0].trim();
    return baseKey || null;
  }

  // Extract share key from URL (for shared albums) - this is the authKey
  function getShareKey() {
    const url = new URL(window.location.href);
    return extractBaseKey(url.searchParams.get('key'));
  }

  // Extract share token from URL path - this is the albumMediaKey for shared albums
  function getShareToken() {
    const match = window.location.pathname.match(/\/share\/([^/]+)/);
    return match ? match[1] : null;
  }

  // Extract album ID from URL path - for regular albums
  function getAlbumId() {
    const match = window.location.pathname.match(/\/album\/([^/]+)/);
    return match ? match[1] : null;
  }

  // Detect current page context
  function getPageContext() {
    const url = window.location.href;
    if (url.includes('/share/')) {
      return { type: 'shared', albumMediaKey: getShareToken(), authKey: getShareKey() };
    } else if (url.includes('/album/')) {
      return { type: 'album', albumMediaKey: getAlbumId(), authKey: null };
    }
    return { type: 'library', albumMediaKey: null, authKey: null };
  }

  /**
   * Build direct photo URL based on current page context
   * Uses URL constructor for safe URL building
   * @param {string} photoId - The photo's unique ID
   * @returns {string} Direct URL to photo
   */
  function buildPhotoUrl(photoId) {
    const currentUrl = window.location.href;
    const BASE_URL = 'https://photos.google.com';

    if (currentUrl.includes('/share/')) {
      const shareToken = getShareToken();
      const shareKey = getShareKey();
      const photoUrl = new URL(`/share/${shareToken}/photo/${photoId}`, BASE_URL);
      if (shareKey) {
        photoUrl.searchParams.set('key', shareKey);
      }
      return photoUrl.toString();
    } else if (currentUrl.includes('/album/')) {
      const albumId = getAlbumId();
      return new URL(`/album/${albumId}/photo/${photoId}`, BASE_URL).toString();
    }
    return new URL(`/photo/${photoId}`, BASE_URL).toString();
  }

  function parseResponse(text) {
    const items = [];
    let nextPageId = null;
    try {
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.includes('"wrb.fr"')) continue;
        try {
          const parsed = safeJsonParse(line);
          if (!Array.isArray(parsed) || parsed.length < 3) continue;
          const dataStr = parsed[0]?.[2];
          if (!dataStr) continue;
          const data = safeJsonParse(dataStr);
          if (!Array.isArray(data)) continue;


          const photoArray = data[0];
          if (Array.isArray(photoArray)) {
            for (const item of photoArray) {
              if (!Array.isArray(item)) continue;
              const photoId = item[0];
              let filename = null;

              // Try multiple positions for filename - different RPC IDs store it differently
              // Check common positions: indices 1, 2, 3, and nested arrays
              const checkForFilename = (val) => {
                if (typeof val === 'string' && /\.(jpg|jpeg|png|heic|webp|gif|mp4|mov|raw|cr2|nef)/i.test(val)) {
                  return val;
                }
                return null;
              };

              // Direct string positions
              for (let i = 1; i <= 5; i++) {
                if (!filename) filename = checkForFilename(item[i]);
              }

              // Nested arrays - common structure: item[X][Y] where Y contains filename
              for (let i = 1; i <= 10 && !filename; i++) {
                if (Array.isArray(item[i])) {
                  for (let j = 0; j < Math.min(item[i].length, 10); j++) {
                    filename = checkForFilename(item[i][j]);
                    if (filename) break;
                    // Check one more level deep
                    if (Array.isArray(item[i][j])) {
                      for (const deeper of item[i][j]) {
                        filename = checkForFilename(deeper);
                        if (filename) break;
                      }
                    }
                  }
                }
              }


              if (photoId && typeof photoId === 'string') {
                items.push({ photoId, filename: filename || 'photo_' + photoId.slice(0, 8), url: buildPhotoUrl(photoId) });
              }
            }
          }
          if (data[1] && typeof data[1] === 'string') {
            nextPageId = data[1];
          }
        } catch (e) { continue; }
      }
    } catch (e) { }
    return { items, nextPageId };
  }

  async function getItemsByUploadedDate(auth, pageId) {
    const payload = [null, pageId, null, null, 1];
    const data = [[[RPC_ID_LIST, JSON.stringify(payload), null, 'generic']]];
    const body = new URLSearchParams({ 'f.req': JSON.stringify(data), 'at': auth.at });
    const url = new URL(BATCH_ENDPOINT, window.location.origin);
    url.searchParams.set('rpcids', RPC_ID_LIST);
    url.searchParams.set('source-path', auth.path || '/');
    url.searchParams.set('f.sid', auth['f.sid']);
    if (auth.bl) url.searchParams.set('bl', auth.bl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetchWithRetry(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: body.toString(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error('API error: ' + response.status);
      return parseResponse(await response.text());
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  /**
   * Get album page using snAcKc RPC - works for both regular albums and shared albums
   * Payload structure: [albumMediaKey, pageId, null, authKey]
   * @param {Object} auth - Auth tokens
   * @param {string} albumMediaKey - Album identifier (share token or album ID)
   * @param {string|null} pageId - Pagination token
   * @param {string|null} authKey - Auth key for shared albums (from ?key= param)
   * @returns {Promise<{items: Array, nextPageId: string|null}>}
   */
  async function getAlbumPage(auth, albumMediaKey, pageId = null, authKey = null) {
    // Payload: [albumMediaKey, pageId, null, authKey]
    const payload = [albumMediaKey, pageId, null, authKey];
    const data = [[[RPC_ID_ALBUM, JSON.stringify(payload), null, 'generic']]];
    const body = new URLSearchParams({ 'f.req': JSON.stringify(data), 'at': auth.at });

    const url = new URL(BATCH_ENDPOINT, window.location.origin);
    url.searchParams.set('rpcids', RPC_ID_ALBUM);
    url.searchParams.set('source-path', window.location.pathname);
    url.searchParams.set('f.sid', auth['f.sid']);
    if (auth.bl) url.searchParams.set('bl', auth.bl);
    // Add authKey to URL params for shared album authentication
    if (authKey) url.searchParams.set('key', authKey);

    // Log first request for debugging
    if (!window.__ggLoggedAlbumUrl) {
      window.__ggLoggedAlbumUrl = true;
      IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Album API URL:', url.toString().slice(0, 200));
      IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Album payload:', JSON.stringify(payload));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetchWithRetry(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: body.toString(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error('Album API error: ' + response.status);
      return parseAlbumResponse(await response.text());
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  /**
   * Parse snAcKc album response - different structure from lcxiM
   * @param {string} text - Raw response text
   * @returns {{items: Array<{filename, photoId, url}>, nextPageId: string|null}}
   */
  function parseAlbumResponse(text) {
    const items = [];
    let nextPageId = null;

    try {
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.includes('"wrb.fr"')) continue;
        try {
          const parsed = safeJsonParse(line);
          if (!Array.isArray(parsed) || parsed.length < 3) continue;
          const dataStr = parsed[0]?.[2];
          if (!dataStr) continue;
          const data = safeJsonParse(dataStr);
          if (!Array.isArray(data)) continue;

          // snAcKc response structure: data[1] contains photo array
          // Each photo: [photoId, url, timestamp, ..., [metadata with filename]]
          const photoArray = data[1];
          if (Array.isArray(photoArray)) {
            for (const item of photoArray) {
              if (!Array.isArray(item)) continue;

              const photoId = item[0];
              let filename = null;

              // Search for filename in various positions
              const checkForFilename = (val) => {
                if (typeof val === 'string' && /\.(jpg|jpeg|png|heic|webp|gif|mp4|mov|raw|cr2|nef)/i.test(val)) {
                  return val;
                }
                return null;
              };

              // Check direct positions (1-5)
              for (let i = 1; i <= 5 && !filename; i++) {
                filename = checkForFilename(item[i]);
              }

              // Check nested arrays for filename
              for (let i = 1; i <= 15 && !filename; i++) {
                if (Array.isArray(item[i])) {
                  for (let j = 0; j < Math.min(item[i].length, 15); j++) {
                    filename = checkForFilename(item[i][j]);
                    if (filename) break;
                    // One level deeper
                    if (Array.isArray(item[i][j])) {
                      for (const deeper of item[i][j]) {
                        filename = checkForFilename(deeper);
                        if (filename) break;
                      }
                    }
                  }
                }
              }

              if (photoId && typeof photoId === 'string') {
                items.push({
                  photoId,
                  filename: filename || 'photo_' + photoId.slice(0, 8),
                  url: buildPhotoUrl(photoId)
                });
              }
            }
          }

          // Pagination token - usually at data[2] for album responses
          if (data[2] && typeof data[2] === 'string') {
            nextPageId = data[2];
          } else if (data[1] && typeof data[data.length - 1] === 'string') {
            // Alternative position
            nextPageId = data[data.length - 1];
          }
        } catch (e) { continue; }
      }
    } catch (e) {
      IS_DEV_MAIN && console.error('[GGPhotoSearch:MAIN] Album parse error:', e);
    }

    IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Parsed album page:', items.length, 'items, nextPageId:', !!nextPageId);
    return { items, nextPageId };
  }

  async function loadAllPhotos(onProgress) {
    // Mutex to prevent concurrent loadAll calls (race condition)
    if (isLoadingAll) {
      IS_DEV_MAIN && console.warn('[GGPhotoSearch:MAIN] loadAll already in progress, skipping');
      throw new Error('Loading already in progress');
    }
    isLoadingAll = true;

    try {
      return await _loadAllPhotosInternal(onProgress);
    } finally {
      isLoadingAll = false;
    }
  }

  async function _loadAllPhotosInternal(onProgress) {
    const auth = getAuthTokens();
    if (!auth) throw new Error('Not logged in or page not ready');

    const context = getPageContext();
    const allItems = [];
    let pageId = null;
    let pageCount = 0;
    const startTime = Date.now();

    IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Loading photos... Context:', context.type);
    IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] albumMediaKey:', context.albumMediaKey, 'authKey:', context.authKey ? '***' : 'null');

    // Use album-specific API for album/shared album pages, library API for library
    const isAlbumContext = context.type === 'album' || context.type === 'shared';

    do {
      // Time-based escape hatch
      if (Date.now() - startTime > MAX_DURATION_MS) {
        IS_DEV_MAIN && console.warn('[GGPhotoSearch:MAIN] Load timeout - partial index created');
        break;
      }

      let result;
      if (isAlbumContext && context.albumMediaKey) {
        // Use snAcKc RPC for albums - gets photos from the specific album
        result = await getAlbumPage(auth, context.albumMediaKey, pageId, context.authKey);
      } else {
        // Fallback to library API (lcxiM) - only for library pages
        result = await getItemsByUploadedDate(auth, pageId);
      }

      const { items, nextPageId } = result;
      allItems.push(...items);
      pageId = nextPageId;
      pageCount++;

      IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Page', pageCount + ':', items.length, 'items (total:', allItems.length + ')');
      if (onProgress) onProgress(allItems.length);

      // Rate limiting with jitter to avoid detection
      if (pageId) {
        const delay = RATE_LIMIT_DELAY + Math.random() * RATE_LIMIT_JITTER;
        await new Promise(r => setTimeout(r, delay));
      }
    } while (pageId && pageCount < MAX_PAGES);

    IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Found', allItems.length, 'photos from', context.type);

    // For album context, filenames might already be in the response
    // Only fetch details if filename is missing
    const photosNeedingFilenames = allItems.filter(p => !p.filename || p.filename.startsWith('photo_'));

    if (photosNeedingFilenames.length > 0) {
      IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Fetching filenames for', photosNeedingFilenames.length, 'photos (parallel, limit:', CONCURRENT_FETCH_LIMIT + ')...');
      let successCount = 0;
      let errorCount = 0;
      let processed = 0;

      // Process in parallel batches for better performance
      for (let batchStart = 0; batchStart < photosNeedingFilenames.length; batchStart += CONCURRENT_FETCH_LIMIT) {
        const batch = photosNeedingFilenames.slice(batchStart, batchStart + CONCURRENT_FETCH_LIMIT);

        // Fetch all photos in this batch concurrently
        const results = await Promise.allSettled(
          batch.map(async (photo) => {
            const details = await getPhotoDetails(photo.photoId);
            return { photo, details };
          })
        );

        // Process results
        for (const result of results) {
          processed++;
          if (result.status === 'fulfilled' && result.value.details.filename) {
            result.value.photo.filename = result.value.details.filename;
            successCount++;
            IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN]   [' + processed + '] ' + result.value.details.filename);
          } else if (result.status === 'rejected') {
            errorCount++;
            IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN]   [' + processed + '] Error: ' + (result.reason?.message || 'Unknown'));
          } else {
            IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN]   [' + processed + '] (no filename)');
          }
        }

        // Progress update after each batch
        if (onProgress) onProgress(allItems.length);

        // Small delay between batches to avoid rate limiting (not between each request)
        if (batchStart + CONCURRENT_FETCH_LIMIT < photosNeedingFilenames.length) {
          await new Promise(r => setTimeout(r, 50));
        }
      }

      IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Loaded', successCount, 'filenames,', errorCount, 'errors');
    } else {
      IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] All photos already have filenames');
    }

    return allItems;
  }

  // Get photo details including filename using fDcn4b RPC
  async function getPhotoDetails(photoId) {
    const auth = getAuthTokens();
    if (!auth) throw new Error('Not logged in or page not ready');

    const shareKey = getShareKey();
    const shareToken = getShareToken();

    // For shared albums, pathParam should be the FULL shareKey (not modified)
    // Note: shareKey is already decoded in extractBaseKey(), no need to decode again
    let pathParam = null;
    if (shareKey) {
      pathParam = shareKey;  // Already decoded, avoid double-decoding
    }

    // Log what we're using (first request only)
    if (!window.__ggLoggedPath) {
      window.__ggLoggedPath = true;
      IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Using pathParam:', pathParam ? pathParam.slice(0, 100) : 'null');
    }

    // Payload: [photoId, null, pathParam, null, null, [2]]
    const payload = [photoId, null, pathParam, null, null, [2]];

    // Warning if no shareKey/shareToken - API might return wrong data
    if (!pathParam && !window.__ggWarnedNoPath) {
      window.__ggWarnedNoPath = true;
      IS_DEV_MAIN && console.warn('[GGPhotoSearch:MAIN] No pathParam - results may be from personal library');
    }

    const data = [[[RPC_ID_DETAILS, JSON.stringify(payload), null, '1']]];
    const body = new URLSearchParams({ 'f.req': JSON.stringify(data), 'at': auth.at });

    const url = new URL(BATCH_ENDPOINT, window.location.origin);
    url.searchParams.set('rpcids', RPC_ID_DETAILS);
    // Extract base album path (up to /photo/ if present)
    let sourcePath = window.location.pathname || auth.path || '/';
    const photoIdx = sourcePath.indexOf('/photo/');
    if (photoIdx > 0) {
      sourcePath = sourcePath.substring(0, photoIdx);
    }
    url.searchParams.set('source-path', sourcePath);
    url.searchParams.set('f.sid', auth['f.sid']);
    if (auth.bl) url.searchParams.set('bl', auth.bl);
    // Add share key for shared album authentication (use base key only for URL param)
    // Note: shareKey is already decoded in extractBaseKey(), no need to decode again
    if (shareKey) {
      const baseKey = shareKey.split('/photo/')[0];
      url.searchParams.set('key', baseKey);
    }

    // Log first request URL for debugging
    if (!window.__ggLoggedUrl) {
      window.__ggLoggedUrl = true;
      IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] fDcn4b URL:', url.toString().slice(0, 200));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetchWithRetry(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: body.toString(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error('Details API error: ' + response.status);

      const text = await response.text();
      return parseDetailsResponse(text, photoId);
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  // Parse fDcn4b response - filename is at index 2
  function parseDetailsResponse(text, photoId) {
    try {
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.includes('"wrb.fr"')) continue;
        try {
          const parsed = safeJsonParse(line);
          const dataStr = parsed?.[0]?.[2];
          if (!dataStr) continue;
          const data = safeJsonParse(dataStr);

          // Response format: [photoId, "", "filename.ext", ...]
          // The data might be wrapped in another array
          let item = data;
          if (Array.isArray(data) && Array.isArray(data[0])) {
            item = data[0]; // Unwrap if nested
          }

          if (Array.isArray(item) && item.length >= 3) {
            const returnedPhotoId = item[0];
            const filename = item[2];

            if (typeof filename === 'string' && filename.includes('.')) {
              return { photoId: returnedPhotoId || photoId, filename };
            }
          }
        } catch (e) { continue; }
      }
    } catch (e) {}
    return { photoId, filename: null };
  }

  // ===== INDEX MODULE =====
  const photoIndex = {
    _photos: [],
    _seenIds: new Set()
  };

  photoIndex.addPhotos = function(photos) {
    let added = 0;
    for (const p of photos) {
      // Memory limit check
      if (this._photos.length >= MAX_INDEX_SIZE) {
        IS_DEV_MAIN && console.warn('[GGPhotoSearch:MAIN] Index limit reached (' + MAX_INDEX_SIZE + ')');
        break;
      }
      // Deduplicate by photoId
      if (p.photoId && !this._seenIds.has(p.photoId)) {
        this._photos.push(p);
        this._seenIds.add(p.photoId);
        added++;
      }
    }
    return added;
  };

  photoIndex.search = function(query) {
    if (!query) return [];
    const q = query.toLowerCase().trim();
    return this._photos.filter(p => p.filename && p.filename.toLowerCase().includes(q));
  };

  photoIndex.getCount = function() { return this._photos.length; };
  photoIndex.isLoaded = function() { return this._photos.length > 0; };
  photoIndex.clear = function() {
    this._photos = [];
    this._seenIds.clear();
  };

  // ===== MESSAGE BRIDGE =====
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.type !== 'GG_PHOTO_REQUEST') return;

    const { id, action, payload } = event.data;
    let response = { success: false, error: 'Unknown action' };

    try {
      switch (action) {
        case 'loadAll':
          photoIndex.clear();
          const photos = await loadAllPhotos((count) => {
            window.postMessage({ type: 'GG_PHOTO_PROGRESS', count }, '*');
          });
          photoIndex.addPhotos(photos);
          response = { success: true, count: photoIndex.getCount() };
          break;

        case 'apiSearch':
          // Search loaded index by filename
          IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Search request:', payload);
          IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Index loaded:', photoIndex.isLoaded(), 'count:', photoIndex.getCount());
          if (!photoIndex.isLoaded()) {
            response = { success: false, error: 'Click "Load all photos" first', needsLoad: true };
          } else {
            const matches = photoIndex.search(payload.query);
            IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Search results:', matches.length, 'matches for query:', payload.query);
            response = {
              success: true,
              found: matches.length > 0,
              count: matches.length,
              matches: matches
            };
          }
          break;

        case 'getIndexStatus':
          IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] getIndexStatus - loaded:', photoIndex.isLoaded(), 'count:', photoIndex.getCount());
          response = { success: true, isLoaded: photoIndex.isLoaded(), count: photoIndex.getCount() };
          break;
      }
    } catch (err) {
      response = { success: false, error: err.message || 'Unknown error' };
    }

    window.postMessage({ type: 'GG_PHOTO_RESPONSE', id, response }, '*');
  });

  // Debug: expose photoIndex for testing (frozen to prevent tampering)
  window.__ggPhotoIndex = Object.freeze({
    search: (q) => photoIndex.search(q),
    getCount: () => photoIndex.getCount(),
    isLoaded: () => photoIndex.isLoaded()
  });

  // Cleanup on page unload to prevent memory leaks
  function cleanup() {
    photoIndex.clear();
    cachedTokens = null;
    isLoadingAll = false;
    IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Cleanup complete');
  }

  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);

  // Signal ready
  window.postMessage({ type: 'GG_PHOTO_MAIN_READY' }, '*');
  IS_DEV_MAIN && console.log('[GGPhotoSearch:MAIN] Ready');
})();
