const { parseBatchFilenames } = require('./batch-mode');

const sanitize = (value) => value.trim().slice(0, 255).replace(/[<>'"&]/g, '');

describe('parseBatchFilenames', () => {
  test('parses newline and comma separated values in order', () => {
    expect(parseBatchFilenames('IMG_1.jpg\nIMG_2.jpg, IMG_3.jpg', sanitize))
      .toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_3.jpg']);
  });

  test('removes empty entries and case-insensitive duplicates', () => {
    expect(parseBatchFilenames('IMG_1.jpg\n\nimg_1.JPG\nIMG_2.jpg', sanitize))
      .toEqual(['IMG_1.jpg', 'IMG_2.jpg']);
  });

  test('enforces the configured maximum size', () => {
    expect(parseBatchFilenames('a\nb\nc', sanitize, 2)).toEqual(['a', 'b']);
  });

  test('sanitizes entries through the supplied query sanitizer', () => {
    expect(parseBatchFilenames('<IMG_1.jpg>', sanitize)).toEqual(['IMG_1.jpg']);
  });

  test('returns an empty list for empty or invalid input', () => {
    expect(parseBatchFilenames('', sanitize)).toEqual([]);
    expect(parseBatchFilenames(null, sanitize)).toEqual([]);
  });
});
