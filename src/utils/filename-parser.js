/**
 * Google Photos Search - Filename Parser Utility
 * Extracts filenames from Google Photos aria-label attributes
 * @module utils/filename-parser
 */

/**
 * Supported image file extensions
 */
const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif', 'raw', 'cr2', 'nef'];

/**
 * Pre-compiled regex patterns for filename extraction (performance optimization)
 */
const FILENAME_PATTERNS = {
  extension: new RegExp(`^([^-]+\\.(${SUPPORTED_EXTENSIONS.join('|')}))`, 'i'),
  prefix: /^((?:IMG_|DSC_|DCIM_|Photo_)\d+)/i,
  dash: /^([^-]+?)(?:\s+-\s+|$)/
};

/**
 * Extract filename from aria-label attribute
 * Handles various Google Photos label formats
 * @param {string} ariaLabel - The aria-label attribute value
 * @returns {string|null} Extracted filename or null
 */
function extractFilename(ariaLabel) {
  if (!ariaLabel || typeof ariaLabel !== 'string') return null;

  // Pattern 1: "IMG_1234.jpg - Photo - Jan 15, 2025" (uses pre-compiled regex)
  const match1 = ariaLabel.match(FILENAME_PATTERNS.extension);
  if (match1) return match1[1].trim();

  // Pattern 2: "IMG_1234 - Photo - Jan 15, 2025" (no extension shown)
  const match2 = ariaLabel.match(FILENAME_PATTERNS.prefix);
  if (match2) return match2[1].trim();

  // Pattern 3: Just the filename at start before " - "
  const match3 = ariaLabel.match(FILENAME_PATTERNS.dash);
  if (match3) {
    const potential = match3[1].trim();
    // Only return if it looks like a filename (has underscore or dot)
    if (potential.includes('_') || potential.includes('.')) {
      return potential;
    }
  }

  return null;
}

// Export for use in content script and tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractFilename, SUPPORTED_EXTENSIONS, FILENAME_PATTERNS };
}
