/**
 * Google Photos Auth - Extract authentication tokens from page globals
 * Tokens are needed for internal API calls (batchexecute)
 * @module google-photos-auth
 */

/** Dev mode detection */
const IS_DEV_AUTH = typeof chrome !== 'undefined' && chrome.runtime?.getManifest && !chrome.runtime.getManifest().update_url;

const authLogger = {
  info: (msg) => IS_DEV_AUTH && console.log(`[GGPhotoSearch:Auth] ${msg}`),
  warn: (msg) => IS_DEV_AUTH && console.warn(`[GGPhotoSearch:Auth] ${msg}`),
  error: (msg) => console.error(`[GGPhotoSearch:Auth] ${msg}`)
};

/** Cached tokens to avoid repeated extraction */
let cachedTokens = null;

/**
 * Extract auth tokens from Google Photos page globals (WIZ_global_data)
 * @returns {Object|null} Auth tokens or null if unavailable
 */
function getAuthTokens() {
  // Return cached if available
  if (cachedTokens && validateTokens(cachedTokens)) {
    return cachedTokens;
  }

  try {
    const wizData = window.WIZ_global_data;
    if (!wizData) {
      authLogger.warn('WIZ_global_data not found - page may not be fully loaded');
      return null;
    }

    const tokens = {
      at: wizData.SNlM0e || null,        // Access token (required)
      'f.sid': wizData.FdrFJe || null,   // Session ID (required)
      bl: wizData.cfb2h || null,         // Build label
      path: wizData.eptZe || '/'         // Source path
    };

    if (!validateTokens(tokens)) {
      authLogger.warn('Required tokens (at, f.sid) not found');
      return null;
    }

    cachedTokens = tokens;
    authLogger.info('Auth tokens extracted successfully');
    return tokens;

  } catch (e) {
    authLogger.error('Auth extraction failed: ' + e.message);
    return null;
  }
}

/**
 * Validate auth tokens are present and non-empty
 * @param {Object} tokens - Token object to validate
 * @returns {boolean} True if valid
 */
function validateTokens(tokens) {
  return tokens &&
         typeof tokens.at === 'string' && tokens.at.length > 0 &&
         typeof tokens['f.sid'] === 'string' && tokens['f.sid'].length > 0;
}

/**
 * Clear cached tokens (useful for retry on failure)
 */
function clearAuthCache() {
  cachedTokens = null;
  authLogger.info('Auth cache cleared');
}

// Export for use by other modules
window.GGPhotoAuth = {
  getAuthTokens,
  validateTokens,
  clearAuthCache
};
