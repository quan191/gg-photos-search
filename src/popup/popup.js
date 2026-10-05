/**
 * Google Photos Search - Popup Script
 * Simple UI for searching photos by filename
 */

// Development mode detection - disabled when installed from Chrome Web Store
const IS_DEV = typeof chrome !== 'undefined' && chrome.runtime?.getManifest && !chrome.runtime.getManifest().update_url;

const GOOGLE_PHOTOS_URL = 'https://photos.google.com/';
const MAX_QUERY_LENGTH = 255;
const STATE_KEY = 'ggPhotoSearchState';

/** Validate URL is a safe Google Photos URL */
function isValidPhotoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'photos.google.com';
  } catch {
    return false;
  }
}

/** Sanitize text for display */
function sanitizeForDisplay(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/[<>'\"&]/g, c => ({
    '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '&': '&amp;'
  }[c]));
}

/** Sanitize search query with Unicode normalization */
function sanitizeSearchQuery(input) {
  if (!input || typeof input !== 'string') return '';
  return input
    .normalize('NFKC')                    // Normalize Unicode
    .replace(/[\x00-\x1F\x7F]/g, '')      // Remove control chars
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .replace(/[<>'\"&]/g, '');
}

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const statusText = document.getElementById('statusText');
  const resultEl = document.getElementById('result');
  const resultFilename = document.getElementById('resultFilename');
  const openPhotoBtn = document.getElementById('openPhotoBtn');
  const scrolledText = document.getElementById('scrolledText');
  const loadBtn = document.getElementById('loadBtn');
  const progressEl = document.getElementById('progress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const versionEl = document.querySelector('.version');

  const footer = document.getElementById('footer');

  // State
  let isSearching = false;
  let isLoading = false;
  let photosLoaded = false;
  let currentPhotoUrl = null;
  let lastSearchResult = null;

  /** Get current page session ID from content script */
  async function getPageSessionId() {
    try {
      const response = await sendToContent('getPageSession');
      return response?.pageSessionId || null;
    } catch {
      return null;
    }
  }

  /** Save state to session storage with page session ID */
  async function saveState() {
    try {
      const pageSessionId = await getPageSessionId();
      await chrome.storage.session.set({
        [STATE_KEY]: {
          searchQuery: searchInput.value,
          currentPhotoUrl,
          lastSearchResult,
          photosLoaded,
          pageSessionId,
          timestamp: Date.now()
        }
      });
    } catch (e) {
      IS_DEV && console.log('[GGPhotoSearch:Popup] saveState error:', e);
    }
  }

  /** Restore state - only if same page session (not reloaded) */
  async function restoreState() {
    try {
      const currentSessionId = await getPageSessionId();
      const data = await chrome.storage.session.get(STATE_KEY);
      const state = data[STATE_KEY];
      // Only restore if same page session and within 5 minutes
      if (state && state.pageSessionId === currentSessionId && (Date.now() - state.timestamp) < 5 * 60 * 1000) {
        if (state.searchQuery) searchInput.value = state.searchQuery;
        if (state.photosLoaded) photosLoaded = state.photosLoaded;
        if (state.lastSearchResult) {
          lastSearchResult = state.lastSearchResult;
          showResult(lastSearchResult);
          setStatus('Result restored', 'success');
        }
        return true;
      }
    } catch (e) {
      IS_DEV && console.log('[GGPhotoSearch:Popup] restoreState error:', e);
    }
    return false;
  }

  // Display version
  try {
    const manifest = chrome.runtime.getManifest();
    versionEl.textContent = `v${manifest.version}`;
  } catch {}

  // Initialize - try restore state first, then check page
  const stateRestored = await restoreState();
  await checkPage();
  // If state wasn't restored with results, checkPage status is shown

  // Event listeners
  searchBtn.addEventListener('click', handleSearch);
  searchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') handleSearch();
  });
  loadBtn.addEventListener('click', handleLoad);
  openPhotoBtn.addEventListener('click', handleOpenPhoto);

  // Listen for load progress
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'loadProgress') {
      progressText.textContent = `Loading... ${msg.count} photos`;
      const pct = Math.min((msg.count / 500) * 100, 95);
      progressFill.style.width = `${pct}%`;
    }
  });

  /** Set status */
  function setStatus(message, type = '') {
    statusText.textContent = message;
    statusText.classList.remove('error', 'success');
    if (type) statusText.classList.add(type);
  }

  /** Check if on Google Photos */
  async function checkPage() {
    try {
      const tab = await getActiveTab();
      IS_DEV && console.log('[GGPhotoSearch:Popup] checkPage - tab URL:', tab.url);
      if (!tab.url?.startsWith(GOOGLE_PHOTOS_URL)) {
        setStatus('Please open Google Photos first', 'error');
        searchBtn.disabled = true;
        loadBtn.disabled = true;
        return;
      }

      // Check if photos already loaded
      try {
        const status = await sendToContent('getIndexStatus');
        IS_DEV && console.log('[GGPhotoSearch:Popup] Index status:', status);
        if (status.isLoaded) {
          photosLoaded = true;
          setStatus(`Ready to search (${status.count} photos)`, 'success');
          return;
        }
      } catch (e) {
        IS_DEV && console.log('[GGPhotoSearch:Popup] getIndexStatus error:', e);
      }

      // Tell user to load photos for full search
      setStatus('Click "Load all photos" for full search');
    } catch {
      setStatus('Please refresh the page', 'error');
      searchBtn.disabled = true;
    }
  }

  /** Handle search */
  async function handleSearch() {
    if (isSearching) return;
    const query = sanitizeSearchQuery(searchInput.value);
    if (!query) return;

    isSearching = true;
    setStatus('Searching...');
    searchBtn.disabled = true;
    resultEl.classList.add('hidden');

    IS_DEV && console.log('[GGPhotoSearch:Popup] Searching for:', query, 'photosLoaded:', photosLoaded);

    try {
      // Use API search if photos are loaded
      if (photosLoaded) {
        const result = await sendToContent('apiSearch', { query });
        IS_DEV && console.log('[GGPhotoSearch:Popup] Search result:', result);
        if (result.found && result.matches?.length > 0) {
          showResult(result.matches[0]);
          setStatus(`Found! (${result.count} match${result.count > 1 ? 'es' : ''})`, 'success');
          return;
        } else {
          setStatus('Not found', 'error');
          return;
        }
      }

      // Fallback to DOM search for visible photos
      const result = await sendToContent('find', { query });
      if (result.found && result.matches?.length > 0) {
        const match = result.matches[0];
        showResult({ filename: match.filename, url: null });
        setStatus(`Found in view (${result.count})`, 'success');
        await sendToContent('scrollTo', { query, matchIndex: 0 });
      } else {
        setStatus('Load photos first for full search', 'error');
      }
    } catch (err) {
      setStatus('Search failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      isSearching = false;
      searchBtn.disabled = false;
    }
  }

  /** Show result with URL */
  function showResult(match) {
    resultFilename.textContent = sanitizeForDisplay(match.filename);
    if (isValidPhotoUrl(match.url)) {
      currentPhotoUrl = match.url;
      openPhotoBtn.classList.remove('hidden');
      scrolledText.classList.add('hidden');
    } else {
      currentPhotoUrl = null;
      openPhotoBtn.classList.add('hidden');
      scrolledText.classList.remove('hidden');
    }
    resultEl.classList.remove('hidden');
    // Store for persistence
    lastSearchResult = match;
    saveState();
  }

  /** Handle load all */
  async function handleLoad() {
    if (isLoading) return;

    isLoading = true;
    loadBtn.disabled = true;
    searchBtn.disabled = true;
    footer.classList.add('hidden');
    progressEl.classList.remove('hidden');
    progressFill.style.width = '5%';
    progressText.textContent = 'Connecting to Google Photos...';
    setStatus('Loading photos...');

    try {
      const result = await sendToContent('loadAll');
      if (result.success) {
        photosLoaded = true;
        progressFill.style.width = '100%';
        progressText.textContent = `Done! ${result.count} photos`;
        setStatus(`Ready to search (${result.count} photos)`, 'success');
      } else {
        progressFill.style.width = '0%';
        progressText.textContent = 'Failed';
        setStatus(result.error || 'Load failed. Try refreshing.', 'error');
      }
    } catch (err) {
      progressFill.style.width = '0%';
      progressText.textContent = 'Error';
      const msg = err.message || 'Unknown error';
      if (msg.includes('timeout')) {
        setStatus('Timed out. Please refresh the page.', 'error');
      } else if (msg.includes('Connection')) {
        setStatus('Cannot connect. Please refresh the page.', 'error');
      } else {
        setStatus('Load failed. Try refreshing.', 'error');
      }
    } finally {
      isLoading = false;
      loadBtn.disabled = false;
      searchBtn.disabled = false;
      setTimeout(() => {
        progressEl.classList.add('hidden');
        footer.classList.remove('hidden');
      }, 2000);
    }
  }

  /** Handle open photo */
  function handleOpenPhoto(e) {
    e.preventDefault();
    if (currentPhotoUrl && isValidPhotoUrl(currentPhotoUrl)) {
      // Save state before opening (popup may close)
      saveState();
      chrome.tabs.create({ url: currentPhotoUrl });
      // Don't call window.close() - let user continue searching
    }
  }

  /** Get active tab */
  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  /** Send message to content script */
  async function sendToContent(action, data = {}) {
    const tab = await getActiveTab();
    if (!tab.url?.startsWith(GOOGLE_PHOTOS_URL)) {
      throw new Error('Not on Google Photos');
    }
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { action, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Connection failed'));
        } else {
          resolve(response);
        }
      });
    });
  }
});
