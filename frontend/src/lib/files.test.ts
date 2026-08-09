import { describe, expect, it } from 'vitest';
import { formatBytes, looksLikeImage } from './files';

function file(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe('looksLikeImage', () => {
  it('accepts the usual photo types', () => {
    expect(looksLikeImage(file('a.jpg', 'image/jpeg'))).toBe(true);
    expect(looksLikeImage(file('a.heic', 'image/heic'))).toBe(true);
  });

  it('accepts a photo the phone gave no type for', () => {
    // Android galleries and the share sheet routinely hand over an empty type;
    // dropping those here is a photo the user picked that never uploads.
    expect(looksLikeImage(file('IMG_0042.HEIC', ''))).toBe(true);
    expect(looksLikeImage(file('20260808_1230.jpg', ''))).toBe(true);
  });

  it('still rejects things that are plainly not photos', () => {
    expect(looksLikeImage(file('notes.pdf', 'application/pdf'))).toBe(false);
    expect(looksLikeImage(file('archive.zip', ''))).toBe(false);
  });
});

describe('formatBytes', () => {
  it('scales to the readable unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
