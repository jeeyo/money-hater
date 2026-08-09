import { describe, expect, it } from 'vitest';
import { detectPlatform } from './platform';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const DESKTOP =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe('detectPlatform', () => {
  it('recognises the two phones whose instructions differ', () => {
    expect(detectPlatform(IPHONE)).toBe('ios');
    expect(detectPlatform(ANDROID)).toBe('android');
  });

  it('falls back to other on a desktop', () => {
    expect(detectPlatform(DESKTOP)).toBe('other');
  });

  it('does not mistake an Android tablet for an iPad', () => {
    expect(detectPlatform(ANDROID.replace('Mobile ', ''))).toBe('android');
  });
});
