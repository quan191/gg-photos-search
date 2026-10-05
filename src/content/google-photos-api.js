/**
 * Google Photos API - batchexecute API client for fetching photos
 * Uses internal Google Photos API to get all photos with metadata
 * @module google-photos-api
 */

/** Dev mode detection */
const IS_DEV_API = typeof chrome !== 'undefined' && chrome.runtime?.getManifest && !chrome.runtime.getManifest().update_url;

const apiLogger = {
  info: (msg) => IS_DEV_API && console.log(`[GGPhotoSearch:API] ${msg}`),
  warn: (msg) => IS_DEV_API && console.warn(`[GGPhotoSearch:API] ${msg}`),
  error: (msg) => console.error(`[GGPhotoSearch:API] ${msg}`)
};

const BATCH_ENDPOINT = '/_/PhotosUi/data/batchexecute';
const RPC_ID = 'lcxiM'; // RPC ID for getting items by date

/**
 * Build direct photo URL based on current page context
 * @param {string} photoId - The photo's unique ID
 * @returns {string} Direct URL to photo
 */
function buildPhotoUrl(photoId) {
  const url = window.location.href;

  if (url.includes('/share/')) {
    // Shared album: extract share token
    const match = url.match(/\/share\/([^/]+)/);
    const token = match ? match[1] : '';
    return `https://photos.google.com/share/${token}/photo/${photoId}`;
  } else if (url.includes('/album/')) {
    // Album: extract album ID
    const match = url.match(/\/album\/([^/]+)/);
    const albumId = match ? match[1] : '';
    return `https://photos.google.com/album/${albumId}/photo/${photoId}`;
  }

  // Default: library photo
  return `https://photos.google.com/photo/${photoId}`;
}

/**
 * Parse batchexecute response to extract photo data
 * @param {string} text - Raw response text
 * @returns {{items: Array<{filename, photoId, url}>, nextPageId: string|null}}
 */
function parseResponse(text) {
  const items = [];
  let nextPageId = null;

  try {
    // Response format: lines starting with numbers, containing JSON
    const lines = text.split('\n');

    for (const line of lines) {
      if (!line.includes('"wrb.fr"')) continue;

      try {
        // Parse the outer array
        const parsed = JSON.parse(line);
        if (!Array.isArray(parsed) || parsed.length < 3) continue;

        // The data is in parsed[0][2] as a JSON string
        const dataStr = parsed[0][2];
        if (!dataStr) continue;

        const data = JSON.parse(dataStr);
        if (!Array.isArray(data)) continue;

        // Extract photos from data structure
        // Structure varies but photos are typically in nested arrays
        const photoArray = data[0];
        if (Array.isArray(photoArray)) {
          for (const item of photoArray) {
            if (!Array.isArray(item)) continue;

            // Photo ID is typically at index 0
            const photoId = item[0];
            // Filename might be at various positions, try common ones
            let filename = null;

            // Try to find filename in the item structure
            if (item[1] && typeof item[1] === 'string' && item[1].includes('.')) {
              filename = item[1];
            } else if (item[2] && typeof item[2] === 'string' && item[2].includes('.')) {
              filename = item[2];
            } else if (Array.isArray(item[1])) {
              // Nested structure - look for filename
              for (const sub of item[1]) {
                if (typeof sub === 'string' && /\.(jpg|jpeg|png|heic|webp|gif)/i.test(sub)) {
                  filename = sub;
                  break;
                }
              }
            }

            if (photoId && typeof photoId === 'string') {
              items.push({
                photoId,
                filename: filename || `photo_${photoId.slice(0, 8)}`,
                url: buildPhotoUrl(photoId)
              });
            }
          }
        }

        // Look for nextPageId (pagination token)
        // Usually at the end of the data array
        if (data[1] && typeof data[1] === 'string') {
          nextPageId = data[1];
        }

      } catch (e) {
        // Skip malformed lines
        continue;
      }
    }
  } catch (e) {
    apiLogger.error('Parse error: ' + e.message);
  }

  return { items, nextPageId };
}

/**
 * Get items by uploaded date with pagination
 * @param {Object} auth - Auth tokens from getAuthTokens()
 * @param {string|null} pageId - Pagination token (null for first page)
 * @returns {Promise<{items: Array, nextPageId: string|null}>}
 */
async function getItemsByUploadedDate(auth, pageId = null) {
  // Build request payload
  const payload = [null, pageId, null, null, 1];
  const data = [[[RPC_ID, JSON.stringify(payload), null, 'generic']]];

  // Encode body
  const body = new URLSearchParams({
    'f.req': JSON.stringify(data),
    'at': auth.at
  });

  // Build URL with query params
  const url = new URL(BATCH_ENDPOINT, window.location.origin);
  url.searchParams.set('rpcids', RPC_ID);
  url.searchParams.set('source-path', auth.path || '/');
  url.searchParams.set('f.sid', auth['f.sid']);
  if (auth.bl) {
    url.searchParams.set('bl', auth.bl);
  }

  apiLogger.info(`Fetching page ${pageId ? '(continuation)' : '(first)'}`);

  // Add timeout to fetch
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      credentials: 'include',
      body: body.toString(),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const text = await response.text();
    return parseResponse(text);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('API request timed out');
    }
    throw err;
  }
}

/**
 * Load all photos with pagination
 * @param {Function} onProgress - Callback(count) called after each page
 * @returns {Promise<Array<{filename, photoId, url}>>}
 */
async function loadAllPhotos(onProgress) {
  const auth = window.GGPhotoAuth?.getAuthTokens();
  if (!auth) {
    throw new Error('Auth tokens unavailable. Please refresh the page.');
  }

  const allItems = [];
  let pageId = null;
  let pageCount = 0;

  do {
    const { items, nextPageId } = await getItemsByUploadedDate(auth, pageId);
    allItems.push(...items);
    pageId = nextPageId;
    pageCount++;

    apiLogger.info(`Page ${pageCount}: ${items.length} items (total: ${allItems.length})`);

    if (onProgress) {
      onProgress(allItems.length);
    }

    // Delay to avoid rate limiting (300ms is safer for Google APIs)
    if (pageId) {
      await new Promise(r => setTimeout(r, 300));
    }
  } while (pageId && pageCount < 100); // Safety limit

  apiLogger.info(`Loaded ${allItems.length} photos in ${pageCount} pages`);
  return allItems;
}

// Export for use by other modules
window.GGPhotoAPI = {
  loadAllPhotos,
  buildPhotoUrl
};
