import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_STORAGE_KEY,
  detectLocale,
  getLocale,
  getStrings,
  initLocale,
  resetLocale,
  setLocale,
  stringsFor,
  subscribeLocale,
  type Locale,
} from '@/lib/i18n';

/** Minimal localStorage stand-in — the unit suite runs in the node environment. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  get length() {
    return this.map.size;
  }
}

const g = globalThis as { localStorage?: Storage; navigator?: Navigator };
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function stubEnv(languages: string[]) {
  g.localStorage = new MemoryStorage() as unknown as Storage;
  Object.defineProperty(globalThis, 'navigator', {
    value: { languages, language: languages[0] ?? '' },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  resetLocale();
  stubEnv([]);
});

afterEach(() => {
  resetLocale();
  delete g.localStorage;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete g.navigator;
});

describe('detectLocale', () => {
  it('maps ko* to ko, zh* to zh and everything else to en', () => {
    expect(detectLocale(['ko-KR'])).toBe('ko');
    expect(detectLocale(['ko'])).toBe('ko');
    expect(detectLocale(['zh-Hans-CN'])).toBe('zh');
    expect(detectLocale(['zh-TW'])).toBe('zh');
    expect(detectLocale(['en-GB'])).toBe('en');
    expect(detectLocale(['fr-FR'])).toBe('en');
  });

  it('falls back to the default when nothing is advertised', () => {
    expect(detectLocale([])).toBe(DEFAULT_LOCALE);
  });

  it('uses the first advertised language', () => {
    expect(detectLocale(['zh-CN', 'ko-KR'])).toBe('zh');
  });
});

describe('locale store', () => {
  it('initializes from navigator.language when nothing is stored', () => {
    stubEnv(['zh-CN']);
    expect(initLocale()).toBe('zh');
    expect(getStrings().start).toBe(stringsFor('zh').start);
  });

  it('persists the choice to localStorage', () => {
    stubEnv(['en-US']);
    initLocale();
    setLocale('ko');
    expect(g.localStorage?.getItem(LOCALE_STORAGE_KEY)).toBe('ko');
    expect(getLocale()).toBe('ko');
  });

  it('prefers the stored locale over the browser language', () => {
    stubEnv(['en-US']);
    g.localStorage?.setItem(LOCALE_STORAGE_KEY, 'zh');
    expect(initLocale()).toBe('zh');
  });

  it('ignores a corrupt stored value', () => {
    stubEnv(['en-US']);
    g.localStorage?.setItem(LOCALE_STORAGE_KEY, 'klingon');
    expect(initLocale()).toBe('en');
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    stubEnv(['en-US']);
    initLocale();
    let calls = 0;
    const unsubscribe = subscribeLocale(() => {
      calls += 1;
    });
    setLocale('ko');
    setLocale('ko'); // no-op: same locale
    expect(calls).toBe(1);
    unsubscribe();
    setLocale('zh');
    expect(calls).toBe(1);
  });
});

describe('dictionary completeness', () => {
  const keysOf = (value: unknown, prefix = ''): string[] => {
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return [path, ...keysOf(child, path)];
    });
  };

  it('every locale exposes an identical key set', () => {
    const reference = keysOf(stringsFor(DEFAULT_LOCALE)).sort();
    expect(reference.length).toBeGreaterThan(20);
    for (const locale of LOCALES) {
      expect(keysOf(stringsFor(locale)).sort(), locale).toEqual(reference);
    }
  });

  it('every locale has a non-empty value of the same type for every key', () => {
    const reference = stringsFor(DEFAULT_LOCALE) as Record<string, unknown>;
    for (const locale of LOCALES) {
      const table = stringsFor(locale) as Record<string, unknown>;
      for (const key of Object.keys(reference)) {
        expect(typeof table[key], `${locale}.${key}`).toBe(typeof reference[key]);
        if (typeof table[key] === 'string') {
          expect((table[key] as string).length, `${locale}.${key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('renders a share message per locale containing the score and url', () => {
    for (const locale of LOCALES as Locale[]) {
      const text = stringsFor(locale).shareText(1234, 'https://example.com');
      expect(text, locale).toContain('1234');
      expect(text, locale).toContain('https://example.com');
    }
  });
});
