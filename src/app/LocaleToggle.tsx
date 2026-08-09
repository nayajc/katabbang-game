'use client';

import { useEffect } from 'react';
import { LOCALES, LOCALE_LABEL, LOCALE_TAG, initLocale, setLocale } from '@/lib/i18n';
import { useLocale, useStrings } from '@/lib/useLocale';
import styles from './locale.module.css';

/**
 * 🌐 language cycler (KO → EN → 中文). Rendered on the DOM overlays only; the
 * canvas picks the change up on its next frame via `getStrings()`.
 */
export default function LocaleToggle({ className }: { className?: string }) {
  const locale = useLocale();
  const s = useStrings();

  // Resolve the stored/browser locale after hydration and keep <html lang> in sync.
  useEffect(() => {
    document.documentElement.lang = LOCALE_TAG[initLocale()];
  }, []);

  useEffect(() => {
    document.documentElement.lang = LOCALE_TAG[locale];
  }, [locale]);

  const cycle = () => {
    const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];
    setLocale(next);
  };

  return (
    <button
      type="button"
      className={className ? `${styles.toggle} ${className}` : styles.toggle}
      onClick={cycle}
      aria-label={s.languageLabel}
      title={s.languageLabel}
      data-testid="locale-toggle"
      data-locale={locale}
    >
      🌐 {LOCALE_LABEL[locale]}
    </button>
  );
}
