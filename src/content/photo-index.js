/**
 * Photo Index - In-memory index for fast filename search
 * Stores photos from API for quick lookup
 * @module photo-index
 */

// Development mode - set to true for debugging, false for production
const IS_DEV_INDEX = false;

const indexLogger = {
  info: (msg) => IS_DEV_INDEX && console.log(`[GGPhotoSearch:Index] ${msg}`),
  warn: (msg) => IS_DEV_INDEX && console.warn(`[GGPhotoSearch:Index] ${msg}`)
};

/**
 * In-memory photo index for fast search
 */
const PhotoIndex = {
  /** @type {Map<string, Object>} lowercase filename -> photo data */
  _index: new Map(),

  /** @type {Array<{filename, photoId, url}>} all photos in order */
  _photos: [],

  /**
   * Add photos to index
   * @param {Array<{filename, photoId, url}>} photos - Photos from API
   */
  addPhotos(photos) {
    let added = 0;
    for (const photo of photos) {
      if (photo.filename && photo.photoId) {
        const key = photo.filename.toLowerCase();
        if (!this._index.has(key)) {
          this._index.set(key, photo);
          this._photos.push(photo);
          added++;
        }
      }
    }
    indexLogger.info(`Added ${added} photos (total: ${this._photos.length})`);
  },

  /**
   * Search photos by filename (partial match)
   * @param {string} query - Search query
   * @returns {Array<{filename, photoId, url}>} Matching photos
   */
  search(query) {
    if (!query || typeof query !== 'string') return [];
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const matches = this._photos.filter(p =>
      p.filename.toLowerCase().includes(q)
    );

    indexLogger.info(`Search "${query}": ${matches.length} matches`);
    return matches;
  },

  /**
   * Get total photo count
   * @returns {number}
   */
  getCount() {
    return this._photos.length;
  },

  /**
   * Check if index is loaded with photos
   * @returns {boolean}
   */
  isLoaded() {
    return this._photos.length > 0;
  },

  /**
   * Clear index
   */
  clear() {
    this._index.clear();
    this._photos = [];
    indexLogger.info('Index cleared');
  }
};

// Export for use by other modules
window.GGPhotoIndex = PhotoIndex;
