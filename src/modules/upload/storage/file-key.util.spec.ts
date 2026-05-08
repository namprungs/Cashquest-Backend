import { createUploadKey, sanitizeFilename } from './file-key.util';

describe('file-key.util', () => {
  describe('sanitizeFilename', () => {
    it('keeps the extension lowercase and replaces unsafe characters', () => {
      expect(sanitizeFilename('My Report (Final)!!.PDF')).toBe(
        'My-Report-Final.pdf',
      );
    });

    it('uses a fallback name when the filename has no safe base characters', () => {
      expect(sanitizeFilename('????.PNG')).toBe('file.png');
    });

    it('limits long base names while preserving the extension', () => {
      const filename = `${'a'.repeat(120)}.jpg`;

      expect(sanitizeFilename(filename)).toBe(`${'a'.repeat(80)}.jpg`);
    });
  });

  describe('createUploadKey', () => {
    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(1777576444294);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('prefixes sanitized filenames with the upload folder and timestamp', () => {
      expect(createUploadKey('solar panel.JPG')).toBe(
        'uploads/1777576444294-solar-panel.jpg',
      );
    });
  });
});
