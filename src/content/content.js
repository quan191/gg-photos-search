/**
 * Google Photos Search - Content Script (ISOLATED world)
 * Handles Chrome extension messaging and DOM operations
 * Injects MAIN world code inline to avoid CSP issues
 * @module content
 */

/** Dev mode detection */
const IS_DEV = typeof chrome !== 'undefined' && chrome.runtime?.getManifest && !chrome.runtime.getManifest().update_url;

const logger = {
  info: (msg, ...args) => IS_DEV && console.log(`[GGPhotoSearch:Content] ${msg}`, ...args),
  warn: (msg, ...args) => IS_DEV && console.warn(`[GGPhotoSearch:Content] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[GGPhotoSearch:Content] ${msg}`, ...args)
};

// ===== MAIN WORLD COMMUNICATION =====

let mainWorldReady = false;
const pendingRequests = new Map();
let requestId = 0;

// Set up listener FIRST (before injection) to catch ready signal
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data) return;

  if (event.data.type === 'GG_PHOTO_MAIN_READY') {
    mainWorldReady = true;
    logger.info('MAIN world ready');
  }

  if (event.data.type === 'GG_PHOTO_RESPONSE') {
    const { id, response } = event.data;
    const resolver = pendingRequests.get(id);
    if (resolver) {
      resolver(response);
      pendingRequests.delete(id);
    }
  }

  if (event.data.type === 'GG_PHOTO_PROGRESS') {
    try {
      chrome.runtime.sendMessage({ type: 'loadProgress', count: event.data.count });
    } catch (e) { }
  }
});

// MAIN world script is loaded separately via manifest.json with world: "MAIN"

function waitForMainWorld(timeout = 5000) {
  if (mainWorldReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (mainWorldReady) {
        resolve();
      } else if (Date.now() - start > timeout) {
        reject(new Error('Page not ready. Please refresh.'));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

function sendToMainWorld(action, payload = {}, timeout = 120000) {
  return new Promise(async (resolve, reject) => {
    try {
      await waitForMainWorld();
    } catch (err) {
      reject(err);
      return;
    }
    const id = ++requestId;
    pendingRequests.set(id, resolve);
    window.postMessage({ type: 'GG_PHOTO_REQUEST', id, action, payload }, '*');
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, timeout);
  });
}

// ===== DOM SCANNER =====

const IMAGE_SELECTORS = [
  '[aria-label*="Tên tệp"]', '[aria-label*="File name"]', '[aria-label*="Filename"]',
  '[aria-label*=".jpg"]', '[aria-label*=".JPG"]', '[aria-label*=".jpeg"]', '[aria-label*=".JPEG"]',
  '[aria-label*=".png"]', '[aria-label*=".PNG"]', '[aria-label*=".heic"]', '[aria-label*=".HEIC"]',
  '[aria-label*=".webp"]', '[aria-label*=".WEBP"]',
  '[aria-label*="IMG_"]', '[aria-label*="DSC_"]', '[aria-label*="DSCF"]', '[aria-label*="DCIM"]'
];

const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif', 'raw', 'cr2', 'nef'];

const PATTERNS = {
  localizedFilename: /(?:Tên tệp|File name|Filename):\s*([^\s,]+)/i,
  extension: new RegExp(`([\\w\\-]+\\.(${SUPPORTED_EXTENSIONS.join('|')}))`, 'i'),
  prefix: /\b((?:IMG_|DSC_|DSCF|DCIM_|Photo_)[\w\d]+)/i,
  dash: /^([^-]+?)(?:\s+-\s+|$)/
};

let cache = { images: [], timestamp: 0, maxAge: 2000 };
let domObserver = null;

function extractFilename(label) {
  if (!label || typeof label !== 'string') return null;
  const m0 = label.match(PATTERNS.localizedFilename);
  if (m0) return m0[1].trim();
  const m1 = label.match(PATTERNS.extension);
  if (m1) return m1[1].trim();
  const m2 = label.match(PATTERNS.prefix);
  if (m2) return m2[1].trim();
  const m3 = label.match(PATTERNS.dash);
  if (m3 && (m3[1].includes('_') || m3[1].includes('.'))) return m3[1].trim();
  return null;
}

function scanImages() {
  const now = Date.now();
  if (cache.images.length > 0 && (now - cache.timestamp) < cache.maxAge) return cache.images;

  const images = [];
  const seen = new Set();

  IMAGE_SELECTORS.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        if (seen.has(el)) return;
        const label = el.getAttribute('aria-label');
        const filename = extractFilename(label);
        if (filename) {
          seen.add(el);
          images.push({ filename, element: el, label });
        }
      });
    } catch (e) { }
  });

  cache = { images, timestamp: now, maxAge: 2000 };
  return images;
}

function findImages(query) {
  if (!query) return [];
  const q = query.toLowerCase().trim();
  return scanImages()
    .map((img, i) => ({ ...img, index: i }))
    .filter(img => img.filename.toLowerCase().includes(q));
}

function clearCache() {
  cache = { images: [], timestamp: 0, maxAge: 2000 };
}

function setupObserver() {
  if (domObserver) return;
  let timer = null;
  domObserver = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (cache.images.length > 0) clearCache();
    }, 500);
  });
  if (document.body) {
    domObserver.observe(document.body, { childList: true, subtree: true });
  }
}

// ===== HIGHLIGHT =====

let currentHighlight = null;
let highlightTimeoutId = null;

function injectHighlightStyles() {
  if (document.getElementById('gg-photo-search-styles')) return;
  const style = document.createElement('style');
  style.id = 'gg-photo-search-styles';
  style.textContent = `
    .gg-photo-highlight {
      outline: 4px solid #1a73e8 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 20px rgba(26, 115, 232, 0.5) !important;
      z-index: 9999 !important;
      position: relative !important;
      animation: gg-photo-pulse 1s ease-in-out 3;
    }
    @keyframes gg-photo-pulse {
      0%, 100% { outline-color: #1a73e8; }
      50% { outline-color: #4285f4; }
    }
  `;
  document.head.appendChild(style);
}

function scrollToElement(element) {
  element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
}

function highlightElement(element) {
  clearHighlight();
  element.classList.add('gg-photo-highlight');
  currentHighlight = element;
  highlightTimeoutId = setTimeout(() => {
    if (currentHighlight === element) clearHighlight();
  }, 10000);
}

function clearHighlight() {
  if (highlightTimeoutId) {
    clearTimeout(highlightTimeoutId);
    highlightTimeoutId = null;
  }
  if (currentHighlight) {
    currentHighlight.classList.remove('gg-photo-highlight');
    currentHighlight = null;
  }
  document.querySelectorAll('.gg-photo-highlight').forEach(el => {
    el.classList.remove('gg-photo-highlight');
  });
}

// ===== INIT =====

// Unique session ID for this page load - used to detect page reloads
const pageSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

injectHighlightStyles();
setupObserver();
// MAIN world script is loaded by Chrome via manifest.json with world: "MAIN"
logger.info('Content script loaded (ISOLATED world), sessionId:', pageSessionId);

// ===== MESSAGE HANDLER =====

chrome.runtime.onMessage.addListener((req, sender, respond) => {
  logger.info('Message:', req.action);

  try {
    switch (req.action) {
      case 'ping':
        respond({ status: 'ok', pageSessionId });
        break;

      case 'getPageSession':
        respond({ pageSessionId });
        break;

      case 'scan': {
        const imgs = scanImages();
        respond({ success: true, count: imgs.length, filenames: imgs.map(i => i.filename) });
        break;
      }

      case 'find': {
        const matches = findImages(req.query);
        if (matches.length > 0) {
          respond({
            success: true, found: true, count: matches.length,
            matches: matches.map(m => ({ filename: m.filename, index: m.index }))
          });
        } else {
          const total = scanImages().length;
          respond({
            success: true, found: false, count: 0, totalScanned: total,
            message: total === 0 ? 'No images found. Try scrolling.' : `Not found in ${total} images.`
          });
        }
        break;
      }

      case 'getElement': {
        const imgs = scanImages();
        if (req.index >= 0 && req.index < imgs.length) {
          respond({ success: true, found: true, filename: imgs[req.index].filename });
        } else {
          respond({ success: false, error: 'Index out of range' });
        }
        break;
      }

      case 'clearCache':
        clearCache();
        respond({ success: true });
        break;

      case 'scrollTo': {
        const matches = findImages(req.query);
        if (matches.length > 0) {
          const target = matches[req.matchIndex || 0];
          scrollToElement(target.element);
          highlightElement(target.element);
          respond({ success: true, found: true, filename: target.filename });
        } else {
          respond({ success: true, found: false, message: 'Image not found' });
        }
        break;
      }

      case 'clearHighlight':
        clearHighlight();
        respond({ success: true });
        break;

      // API actions - delegate to MAIN world
      case 'loadAll': {
        sendToMainWorld('loadAll')
          .then(response => respond(response))
          .catch(err => respond({ success: false, error: err.message }));
        return true;
      }

      case 'apiSearch': {
        logger.info('apiSearch query:', req.query);
        sendToMainWorld('apiSearch', { query: req.query })
          .then(response => {
            logger.info('apiSearch response:', response);
            respond(response);
          })
          .catch(err => respond({ success: false, error: err.message }));
        return true;
      }

      case 'getIndexStatus': {
        sendToMainWorld('getIndexStatus')
          .then(response => respond(response))
          .catch(err => respond({ success: false, error: err.message }));
        return true;
      }

      default:
        respond({ error: 'Unknown action' });
    }
  } catch (err) {
    logger.error('Handler error:', err);
    respond({ error: 'Internal error' });
  }

  return true;
});
