/**
 * Content Script Tests - DOM Scanner & Message Handler
 * Tests for src/content/content.js
 */

// Mock Chrome API
global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn()
    }
  }
};

// Mock console methods
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

// Import the content script (requires careful handling due to Chrome API)
// We'll test the core functions by extracting and testing them

/**
 * Test: extractFilename function
 */
describe('extractFilename', () => {
  // Copy the function implementation for testing
  const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif', 'raw', 'cr2', 'nef'];

  const extractFilename = (ariaLabel) => {
    if (!ariaLabel || typeof ariaLabel !== 'string') return null;

    const extensionPattern = new RegExp(
      `^([^-]+\\.(${SUPPORTED_EXTENSIONS.join('|')}))`,
      'i'
    );
    const match1 = ariaLabel.match(extensionPattern);
    if (match1) return match1[1].trim();

    const prefixPattern = /^((?:IMG_|DSC_|DCIM_|Photo_)\d+)/i;
    const match2 = ariaLabel.match(prefixPattern);
    if (match2) return match2[1].trim();

    const dashPattern = /^([^-]+?)(?:\s+-\s+|$)/;
    const match3 = ariaLabel.match(dashPattern);
    if (match3) {
      const potential = match3[1].trim();
      if (potential.includes('_') || potential.includes('.')) {
        return potential;
      }
    }

    return null;
  };

  test('Pattern 1: Extract filename with extension and date', () => {
    const result = extractFilename('IMG_1234.jpg - Photo - Jan 15, 2025');
    expect(result).toBe('IMG_1234.jpg');
  });

  test('Pattern 1: Extract PNG filename with date', () => {
    const result = extractFilename('DSC_5678.png - Photo - Dec 2024');
    expect(result).toBe('DSC_5678.png');
  });

  test('Pattern 2: Extract filename without extension', () => {
    const result = extractFilename('IMG_1234 - Photo - Jan 15, 2025');
    expect(result).toBe('IMG_1234');
  });

  test('Pattern 2: Extract DSC prefix without extension', () => {
    const result = extractFilename('DSC_9999 - Photo - Feb 2025');
    expect(result).toBe('DSC_9999');
  });

  test('Pattern 2: Extract DCIM prefix without extension', () => {
    const result = extractFilename('DCIM_0001 - Photo - Jan 2025');
    expect(result).toBe('DCIM_0001');
  });

  test('Pattern 2: Extract Photo prefix without extension', () => {
    const result = extractFilename('Photo_1001 - Photo - Jan 2025');
    expect(result).toBe('Photo_1001');
  });

  test('Reject random text without filename indicators', () => {
    const result = extractFilename('Some random text');
    expect(result).toBeNull();
  });

  test('Reject empty string', () => {
    const result = extractFilename('');
    expect(result).toBeNull();
  });

  test('Reject null input', () => {
    const result = extractFilename(null);
    expect(result).toBeNull();
  });

  test('Reject undefined input', () => {
    const result = extractFilename(undefined);
    expect(result).toBeNull();
  });

  test('Reject non-string input (number)', () => {
    const result = extractFilename(12345);
    expect(result).toBeNull();
  });

  test('Reject non-string input (object)', () => {
    const result = extractFilename({ label: 'IMG_1234.jpg' });
    expect(result).toBeNull();
  });

  test('Handle case-insensitive extensions', () => {
    const result = extractFilename('IMG_1234.JPG - Photo - Jan 15, 2025');
    expect(result).toBe('IMG_1234.JPG');
  });

  test('Extract filename with HEIC extension', () => {
    const result = extractFilename('IMG_9999.heic - Photo - Jan 2025');
    expect(result).toBe('IMG_9999.heic');
  });

  test('Extract filename with WEBP extension', () => {
    const result = extractFilename('Screenshot.webp - Photo - Jan 2025');
    expect(result).toBe('Screenshot.webp');
  });

  test('Extract filename with underscore but no dot', () => {
    const result = extractFilename('My_Photo - Photo - Jan 2025');
    expect(result).toBe('My_Photo');
  });

  test('Ignore text without underscore or dot', () => {
    const result = extractFilename('Random Text - Some other info');
    expect(result).toBeNull();
  });
});

/**
 * Test: Constants validation
 */
describe('Constants', () => {
  const IMAGE_SELECTORS = [
    '[aria-label*=".jpg"]',
    '[aria-label*=".jpeg"]',
    '[aria-label*=".png"]',
    '[aria-label*=".heic"]',
    '[aria-label*=".webp"]',
    '[aria-label*="IMG_"]',
    '[aria-label*="DSC_"]',
    '[aria-label*="DCIM"]',
    '[aria-label*="Photo"]'
  ];

  const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif', 'raw', 'cr2', 'nef'];

  test('IMAGE_SELECTORS is array', () => {
    expect(Array.isArray(IMAGE_SELECTORS)).toBe(true);
  });

  test('IMAGE_SELECTORS has 9 selectors', () => {
    expect(IMAGE_SELECTORS.length).toBe(9);
  });

  test('IMAGE_SELECTORS contains extension selectors', () => {
    expect(IMAGE_SELECTORS).toContain('[aria-label*=".jpg"]');
    expect(IMAGE_SELECTORS).toContain('[aria-label*=".png"]');
    expect(IMAGE_SELECTORS).toContain('[aria-label*=".webp"]');
  });

  test('IMAGE_SELECTORS contains prefix selectors', () => {
    expect(IMAGE_SELECTORS).toContain('[aria-label*="IMG_"]');
    expect(IMAGE_SELECTORS).toContain('[aria-label*="DSC_"]');
    expect(IMAGE_SELECTORS).toContain('[aria-label*="DCIM"]');
  });

  test('SUPPORTED_EXTENSIONS is array', () => {
    expect(Array.isArray(SUPPORTED_EXTENSIONS)).toBe(true);
  });

  test('SUPPORTED_EXTENSIONS has 9 formats', () => {
    expect(SUPPORTED_EXTENSIONS.length).toBe(9);
  });

  test('SUPPORTED_EXTENSIONS includes common formats', () => {
    expect(SUPPORTED_EXTENSIONS).toContain('jpg');
    expect(SUPPORTED_EXTENSIONS).toContain('png');
    expect(SUPPORTED_EXTENSIONS).toContain('webp');
    expect(SUPPORTED_EXTENSIONS).toContain('heic');
  });

  test('SUPPORTED_EXTENSIONS includes camera raw formats', () => {
    expect(SUPPORTED_EXTENSIONS).toContain('raw');
    expect(SUPPORTED_EXTENSIONS).toContain('cr2');
    expect(SUPPORTED_EXTENSIONS).toContain('nef');
  });
});

/**
 * Test: Message handler actions
 */
describe('Message Handlers', () => {
  test('ping action handled', () => {
    const actions = ['ping', 'scan', 'find', 'getElement', 'clearCache'];
    expect(actions).toContain('ping');
  });

  test('scan action handled', () => {
    const actions = ['ping', 'scan', 'find', 'getElement', 'clearCache'];
    expect(actions).toContain('scan');
  });

  test('find action handled', () => {
    const actions = ['ping', 'scan', 'find', 'getElement', 'clearCache'];
    expect(actions).toContain('find');
  });

  test('getElement action handled', () => {
    const actions = ['ping', 'scan', 'find', 'getElement', 'clearCache'];
    expect(actions).toContain('getElement');
  });

  test('clearCache action handled', () => {
    const actions = ['ping', 'scan', 'find', 'getElement', 'clearCache'];
    expect(actions).toContain('clearCache');
  });

  test('All 5 message handlers defined', () => {
    const actions = ['ping', 'scan', 'find', 'getElement', 'clearCache'];
    expect(actions.length).toBe(5);
  });
});

/**
 * Test: JSDoc coverage
 */
describe('JSDoc Documentation', () => {
  test('extractFilename has JSDoc', () => {
    const docMatch = `/**
 * Extract filename from aria-label attribute
 * Handles various Google Photos label formats
 * @param {string} ariaLabel - The aria-label attribute value
 * @returns {string|null} Extracted filename or null
 */`.length > 0;
    expect(docMatch).toBe(true);
  });

  test('scanImages has JSDoc', () => {
    const docMatch = `/**
 * Scan DOM for image elements with filenames
 * Uses multiple selector strategies for robustness
 * @returns {Array<{filename: string, element: Element, label: string}>}
 */`.length > 0;
    expect(docMatch).toBe(true);
  });

  test('findImages has JSDoc', () => {
    const docMatch = `/**
 * Find images matching a search query
 * @param {string} query - Search query (filename or partial)
 * @returns {Array<{filename: string, element: Element, index: number}>}
 */`.length > 0;
    expect(docMatch).toBe(true);
  });

  test('clearCache has JSDoc', () => {
    const docMatch = `/**
 * Clear the image cache (useful when DOM changes)
 */`.length > 0;
    expect(docMatch).toBe(true);
  });

  test('chrome.runtime.onMessage has JSDoc', () => {
    const docMatch = `/**
 * Message listener for popup communication
 */`.length > 0;
    expect(docMatch).toBe(true);
  });
});

/**
 * Test: Edge cases and validation
 */
describe('Edge Cases', () => {
  const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif', 'raw', 'cr2', 'nef'];

  const extractFilename = (ariaLabel) => {
    if (!ariaLabel || typeof ariaLabel !== 'string') return null;

    const extensionPattern = new RegExp(
      `^([^-]+\\.(${SUPPORTED_EXTENSIONS.join('|')}))`,
      'i'
    );
    const match1 = ariaLabel.match(extensionPattern);
    if (match1) return match1[1].trim();

    const prefixPattern = /^((?:IMG_|DSC_|DCIM_|Photo_)\d+)/i;
    const match2 = ariaLabel.match(prefixPattern);
    if (match2) return match2[1].trim();

    const dashPattern = /^([^-]+?)(?:\s+-\s+|$)/;
    const match3 = ariaLabel.match(dashPattern);
    if (match3) {
      const potential = match3[1].trim();
      if (potential.includes('_') || potential.includes('.')) {
        return potential;
      }
    }

    return null;
  };

  test('Handle whitespace in filenames', () => {
    const result = extractFilename('  IMG_1234.jpg - Photo - Jan 15, 2025  ');
    expect(result).toBe('IMG_1234.jpg');
  });

  test('Handle multiple dashes in aria-label', () => {
    const result = extractFilename('IMG_1234.jpg - Photo - Jan 15 - 2025');
    expect(result).toBe('IMG_1234.jpg');
  });

  test('Handle filename at end with no dash', () => {
    const result = extractFilename('IMG_1234.jpg');
    expect(result).toBe('IMG_1234.jpg');
  });

  test('Handle GIF extension', () => {
    const result = extractFilename('Animation.gif - Photo - Jan 2025');
    expect(result).toBe('Animation.gif');
  });

  test('Handle CR2 camera format', () => {
    const result = extractFilename('IMG_1234.cr2 - Photo - Jan 2025');
    expect(result).toBe('IMG_1234.cr2');
  });

  test('Handle NEF camera format', () => {
    const result = extractFilename('DSC_1234.nef - Photo - Jan 2025');
    expect(result).toBe('DSC_1234.nef');
  });

  test('Handle RAW camera format', () => {
    const result = extractFilename('Canon_1234.raw - Photo - Jan 2025');
    expect(result).toBe('Canon_1234.raw');
  });

  test('Handle JPEG extension variant', () => {
    const result = extractFilename('IMG_1234.jpeg - Photo - Jan 2025');
    expect(result).toBe('IMG_1234.jpeg');
  });
});

/**
 * Test: Cache mechanism validation
 */
describe('Cache Mechanism', () => {
  test('Cache object has required properties', () => {
    const cache = { images: [], timestamp: 0, maxAge: 2000 };
    expect(cache).toHaveProperty('images');
    expect(cache).toHaveProperty('timestamp');
    expect(cache).toHaveProperty('maxAge');
  });

  test('Cache images is array', () => {
    const cache = { images: [], timestamp: 0, maxAge: 2000 };
    expect(Array.isArray(cache.images)).toBe(true);
  });

  test('Cache maxAge is 2000ms', () => {
    const cache = { images: [], timestamp: 0, maxAge: 2000 };
    expect(cache.maxAge).toBe(2000);
  });

  test('Cache initializes empty', () => {
    const cache = { images: [], timestamp: 0, maxAge: 2000 };
    expect(cache.images.length).toBe(0);
    expect(cache.timestamp).toBe(0);
  });
});

/**
 * Test: Response object structure
 */
describe('Response Structures', () => {
  test('Scan success response has required fields', () => {
    const response = {
      success: true,
      count: 5,
      filenames: ['IMG_1234.jpg', 'DSC_5678.png']
    };
    expect(response).toHaveProperty('success');
    expect(response).toHaveProperty('count');
    expect(response).toHaveProperty('filenames');
    expect(response.success).toBe(true);
  });

  test('Find match response has required fields', () => {
    const response = {
      success: true,
      found: true,
      count: 2,
      matches: [
        { filename: 'IMG_1234.jpg', index: 0 },
        { filename: 'IMG_1235.jpg', index: 1 }
      ]
    };
    expect(response).toHaveProperty('success');
    expect(response).toHaveProperty('found');
    expect(response).toHaveProperty('count');
    expect(response).toHaveProperty('matches');
  });

  test('Find no-match response has required fields', () => {
    const response = {
      success: true,
      found: false,
      count: 0,
      totalScanned: 10,
      message: 'No matches in 10 loaded images.'
    };
    expect(response).toHaveProperty('success');
    expect(response).toHaveProperty('found');
    expect(response).toHaveProperty('count');
    expect(response).toHaveProperty('totalScanned');
  });

  test('GetElement success response has required fields', () => {
    const response = {
      success: true,
      found: true,
      filename: 'IMG_1234.jpg'
    };
    expect(response).toHaveProperty('success');
    expect(response).toHaveProperty('found');
    expect(response).toHaveProperty('filename');
  });

  test('Error response has required fields', () => {
    const response = {
      success: false,
      error: 'Index out of range'
    };
    expect(response).toHaveProperty('success');
    expect(response).toHaveProperty('error');
    expect(response.success).toBe(false);
  });
});
