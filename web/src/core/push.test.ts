import { describe, expect, it } from 'vitest';
import { deviceLabel, needsHomeScreen, sameKey } from './push.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

describe('push', () => {
  it('deviceLabel', () => {
    expect(deviceLabel(IPHONE)).toBe('iPhone, Safari');
    expect(deviceLabel(ANDROID)).toBe('Android, Chrome');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0')).toBe('Windows, Edge');
    expect(deviceLabel('')).toBe('Urządzenie');
  });
  it('needsHomeScreen: tylko iOS poza ikoną', () => {
    expect(needsHomeScreen(IPHONE, false)).toBe(true);
    expect(needsHomeScreen(IPHONE, true)).toBe(false);
    expect(needsHomeScreen(ANDROID, false)).toBe(false);
  });
  it('sameKey: porównanie klucza subskrypcji z kluczem serwera', () => {
    const k = new Uint8Array([1, 2, 3]);
    expect(sameKey(new Uint8Array([1, 2, 3]).buffer, k)).toBe(true);
    expect(sameKey(new Uint8Array([1, 2, 4]).buffer, k)).toBe(false);
    expect(sameKey(new Uint8Array([1, 2]).buffer, k)).toBe(false);
    expect(sameKey(null, k)).toBe(false);
  });
});
