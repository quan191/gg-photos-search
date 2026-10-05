/**
 * Google Photos Search - Batch Mode
 * Handles batch search functionality with chip display
 */

// Development mode detection - disabled when installed from Chrome Web Store
const IS_DEV_BATCH = typeof chrome !== 'undefined' && chrome.runtime?.getManifest && !chrome.runtime.getManifest().update_url;

const MAX_BATCH_SIZE = 100;
const BATCH_STATE_KEY = 'ggPhotoBatchState';

function parseBatchFilenames(text, sanitizeQuery, maxSize = MAX_BATCH_SIZE) {
  if (!text || typeof text !== 'string') return [];
  const seen = new Set();
  const filenames = [];

  for (const line of text.split(/[\n,]+/)) {
    const sanitized = sanitizeQuery(line.trim());
    const lower = sanitized.toLowerCase();
    if (sanitized.length > 0 && !seen.has(lower)) {
      seen.add(lower);
      filenames.push(sanitized);
      if (filenames.length >= maxSize) break;
    }
  }

  return filenames;
}

function initBatchMode(elements, sendToContent, sanitizeQuery, sanitizeDisplay, validateUrl, getPhotosLoaded, getPageSessionId) {
  const {
    batchInput, findAllBtn, batchStatusText,
    chipsContainer, batchResultsEl, batchSummary,
    copyLinksBtn, copyToast
  } = elements;

  let batchResults = [];

  /** Save batch state with page session ID */
  async function saveBatchState() {
    try {
      const pageSessionId = getPageSessionId ? await getPageSessionId() : null;
      await chrome.storage.session.set({
        [BATCH_STATE_KEY]: {
          batchInput: batchInput.value,
          batchResults,
          pageSessionId,
          timestamp: Date.now()
        }
      });
    } catch (e) {
      IS_DEV_BATCH && console.log('[GGPhotoSearch:BatchMode] saveBatchState error:', e);
    }
  }

  /** Restore batch state - only if same page session (not reloaded) */
  async function restoreBatchState() {
    try {
      const currentSessionId = getPageSessionId ? await getPageSessionId() : null;
      const data = await chrome.storage.session.get(BATCH_STATE_KEY);
      const state = data[BATCH_STATE_KEY];
      // Only restore if same page session and within 5 minutes
      if (state && state.pageSessionId === currentSessionId && (Date.now() - state.timestamp) < 5 * 60 * 1000) {
        if (state.batchInput) batchInput.value = state.batchInput;
        if (state.batchResults?.length > 0) {
          batchResults = state.batchResults;
          renderChips();
          const foundCount = batchResults.filter(r => r.found).length;
          batchStatusText.textContent = `Found ${foundCount} of ${batchResults.length} (restored)`;
        }
        return true;
      }
    } catch (e) {
      IS_DEV_BATCH && console.log('[GGPhotoSearch:BatchMode] restoreBatchState error:', e);
    }
    return false;
  }

  // Restore state on init
  restoreBatchState();

  // Batch handlers
  findAllBtn.addEventListener('click', handleFindAll);
  if (copyLinksBtn) copyLinksBtn.addEventListener('click', handleCopyLinks);

  /** Parse batch input - supports newline and comma separated, deduplicates filenames */
  function parseBatchInput() {
    return parseBatchFilenames(batchInput.value, sanitizeQuery);
  }

  /** Handle Find All button */
  async function handleFindAll() {
    const filenames = parseBatchInput();
    if (filenames.length === 0) {
      batchStatusText.textContent = 'Enter at least one filename';
      return;
    }

    batchStatusText.textContent = 'Searching...';
    batchResults = [];
    findAllBtn.disabled = true;

    // Use apiSearch if photos are loaded (same as single search)
    const useApi = getPhotosLoaded && getPhotosLoaded();

    for (const filename of filenames) {
      try {
        const action = useApi ? 'apiSearch' : 'find';
        const result = await sendToContent(action, { query: filename });

        if (result.found && result.matches?.length > 0) {
          const match = result.matches[0];
          batchResults.push({
            filename,
            found: true,
            count: result.count || 1,
            url: match.url || null,
            photoId: match.photoId || null
          });
        } else {
          batchResults.push({
            filename,
            found: false,
            count: 0,
            url: null,
            photoId: null
          });
        }
      } catch (err) {
        batchResults.push({ filename, found: false, error: err.message, url: null, photoId: null });
      }
    }

    findAllBtn.disabled = false;
    const foundCount = batchResults.filter(r => r.found).length;
    batchStatusText.textContent = `Found ${foundCount} of ${filenames.length}`;

    renderChips();
    saveBatchState();
  }

  /**
   * Render chips for all batch results
   * Creates clickable buttons for found photos and disabled ones for not-found
   */
  function renderChips() {
    if (!chipsContainer || !batchResultsEl) return;

    chipsContainer.replaceChildren();

    batchResults.forEach((result) => {
      const chip = document.createElement('button');
      chip.className = result.found ? 'chip chip-found' : 'chip chip-not-found';
      chip.textContent = sanitizeDisplay(result.filename);
      chip.title = result.found ? 'Click to open in new tab' : 'Not found';
      chip.setAttribute('aria-label', result.found
        ? `Open ${result.filename} in new tab`
        : `${result.filename} not found`);

      if (result.found && result.url) {
        chip.dataset.url = result.url;
        chip.addEventListener('click', () => handleChipClick(result.url));
      } else {
        chip.disabled = true;
      }

      chipsContainer.appendChild(chip);
    });

    batchResultsEl.classList.remove('hidden');

    const foundCount = batchResults.filter(r => r.found && r.url).length;
    if (batchSummary) {
      batchSummary.textContent = `Found ${foundCount} of ${batchResults.length} photos`;
    }

    // Show/hide copy button based on found links
    if (copyLinksBtn) {
      copyLinksBtn.disabled = foundCount === 0;
      copyLinksBtn.classList.toggle('hidden', foundCount === 0);
    }
  }

  /**
   * Handle chip click - open photo in new tab
   * @param {string} url - The photo URL to open
   */
  function handleChipClick(url) {
    if (!url || !validateUrl(url)) return;
    try {
      saveBatchState();
      chrome.tabs.create({ url });
    } catch (err) {
      IS_DEV_BATCH && console.error('[GGPhotoSearch:BatchMode] Failed to open tab:', err);
    }
  }

  /** Get all found photo URLs */
  function getFoundLinks() {
    return batchResults
      .filter(r => r.found && r.url)
      .map(r => r.url);
  }

  /** Handle copy links button */
  async function handleCopyLinks() {
    const links = getFoundLinks();
    if (links.length === 0) return;

    const linksText = links.join('\n');

    try {
      await navigator.clipboard.writeText(linksText);
      showCopyToast(`${links.length} link${links.length > 1 ? 's' : ''} copied!`);
    } catch {
      fallbackCopy(linksText);
    }
  }

  /** Fallback copy using textarea for older browsers */
  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showCopyToast('Links copied!');
    } catch (err) {
      IS_DEV_BATCH && console.error('[GGPhotoSearch:BatchMode] Copy failed:', err);
    }
    document.body.removeChild(textarea);
  }

  /** Show copy success toast */
  function showCopyToast(message) {
    if (!copyToast) return;
    copyToast.textContent = message;
    copyToast.classList.remove('hidden');
    // Reset animation using CSS reflow trick
    copyToast.style.animation = 'none';
    copyToast.offsetHeight; // Force reflow
    copyToast.style.animation = '';
    setTimeout(() => copyToast.classList.add('hidden'), 2000);
  }
}

// Export
if (typeof window !== 'undefined') {
  window.GGPhotoBatchMode = { init: initBatchMode };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseBatchFilenames };
}
