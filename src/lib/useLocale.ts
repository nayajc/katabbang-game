'use client';

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_LOCALE,
  getLocale,
  stringsFor,
  subscribeLocale,
  type Locale,
  type Strings,
} from './i18n';

/**
 * Subscribes a component to the module-level locale store. The server snapshot
 * is the default locale, so SSR/hydration match and React re-renders once the
 * stored/browser locale resolves on the client.
 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => DEFAULT_LOCALE);
}

export function useStrings(): Strings {
  return stringsFor(useLocale());
}
