/**
 * Lightweight i18n. No library: a typed dictionary plus a tiny module-level
 * store, so `src/game/**` (canvas rendering) can read strings through
 * `getStrings()` without pulling in React.
 *
 * Adding a key means adding it to EVERY locale — `Strings` is derived from the
 * Korean table, so TypeScript fails the build if `en`/`zh` drift.
 */

export type Locale = 'ko' | 'en' | 'zh';

export const LOCALES: readonly Locale[] = ['ko', 'en', 'zh'] as const;

export const LOCALE_STORAGE_KEY = 'katabbang.locale';

export const DEFAULT_LOCALE: Locale = 'ko';

/** BCP-47 tag per locale — used for `Number.toLocaleString` and `<html lang>`. */
export const LOCALE_TAG: Record<Locale, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  zh: 'zh-CN',
};

/** Label shown in the language toggle. */
export const LOCALE_LABEL: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  zh: '中文',
};

const ko = {
  /** Title screen + shared branding. */
  title: '어깨빵 응징 러너',
  hintLine1: '스와이프로 피하고, 어깨빵 시전자가 오면 탭!',
  hintLine2: '데스크톱: ←/→ 이동, Space/Enter 응징',
  muteHint: '우측 상단 🔊 버튼으로 음소거',
  start: '시작하기',
  loading: '불러오는 중…',

  /** Canvas HUD (drawn, never React state). */
  hudJustice: '정의',
  hudCombo: '콤보',

  /** Canvas comic FX + result banner. */
  fxPerfect: '퍼펙트!',
  fxPow: 'POW!',
  fxWhiff: '으악!',
  fxOuch: '아야!',
  fxCombo: 'COMBO',
  gradePerfect: '정의구현!',
  gradeGood: '굿!',
  gradeMiss: '으악!',
  tapNow: '지금이야! 탭!',

  /** Game over overlay. */
  gameOver: '게임 오버',
  scoreSuffix: '점',
  bestComboLabel: '최고 콤보',
  justiceLabel: '저스티스',
  retry: '다시 하기',
  bestRecord: '최고 기록',

  /** Nickname + submission. */
  nicknamePlaceholder: '닉네임 (한글/영문/중문/숫자 2~12자)',
  nicknameAria: '닉네임',
  submit: '랭킹 등록',
  submitting: '등록 중…',
  submitFailed: '등록에 실패했어요. 잠시 후 다시 시도해 주세요.',
  nicknameFormat: '닉네임은 한글/영문/중문/숫자 2~12자여야 해요.',
  nicknameBanned: '사용할 수 없는 단어가 포함되어 있어요.',

  /** Share. */
  share: '공유하기',
  shareCopied: '점수 링크를 복사했어요!',
  shareFailed: '공유에 실패했어요.',
  shareText: (score: number, url: string) =>
    `어깨빵 응징 러너에서 ${score}점! 정의구현 하러 가기 → ${url}`,

  /** Leaderboard. */
  top100Link: 'TOP 100 보기',
  leaderboardHeading: 'TOP 100',
  leaderboardSub: '어깨빵 응징 러너 글로벌 랭킹',
  leaderboardCardTitle: '리더보드',
  leaderboardPending: '리더보드 준비 중',
  leaderboardError: '리더보드를 불러오지 못했어요.',
  leaderboardEmpty: '아직 등록된 기록이 없어요. 1등이 되어보세요!',
  leaderboardEllipsis: '더 많은 순위',
  colRank: '순위',
  colName: '닉네임',
  colScore: '점수',
  backToGame: '← 게임하러 가기',
  submitShort: '등록',
  youLabel: '나',

  /** Language toggle. */
  languageLabel: '언어',
};

export type Strings = typeof ko;

const en: Strings = {
  title: 'Shoulder Check Payback',
  hintLine1: 'Swipe to dodge — when a shoulder-checker charges in, TAP!',
  hintLine2: 'Desktop: ←/→ to move, Space/Enter to strike back',
  muteHint: 'Tap the 🔊 button (top right) to mute',
  start: 'Start',
  loading: 'Loading…',

  hudJustice: 'JUSTICE',
  hudCombo: 'COMBO',

  fxPerfect: 'PERFECT!',
  fxPow: 'POW!',
  fxWhiff: 'MISS!',
  fxOuch: 'OUCH!',
  fxCombo: 'COMBO',
  gradePerfect: 'JUSTICE!',
  gradeGood: 'NICE!',
  gradeMiss: 'MISS!',
  tapNow: 'NOW! TAP!',

  gameOver: 'Game Over',
  scoreSuffix: ' pts',
  bestComboLabel: 'Best combo',
  justiceLabel: 'Justice',
  retry: 'Play again',
  bestRecord: 'Best',

  nicknamePlaceholder: 'Nickname (letters/numbers/CJK, 2–12)',
  nicknameAria: 'Nickname',
  submit: 'Submit score',
  submitting: 'Submitting…',
  submitFailed: 'Submission failed. Please try again shortly.',
  nicknameFormat: 'Nickname must be 2–12 letters, numbers or CJK characters.',
  nicknameBanned: 'That nickname contains a blocked word.',

  share: 'Share',
  shareCopied: 'Score link copied!',
  shareFailed: 'Sharing failed.',
  shareText: (score: number, url: string) =>
    `I scored ${score} in Shoulder Check Payback! Serve some justice → ${url}`,

  top100Link: 'View TOP 100',
  leaderboardHeading: 'TOP 100',
  leaderboardSub: 'Shoulder Check Payback global ranking',
  leaderboardCardTitle: 'LEADERBOARD',
  leaderboardPending: 'Leaderboard coming soon',
  leaderboardError: 'Could not load the leaderboard.',
  leaderboardEmpty: 'No scores yet. Be the first!',
  leaderboardEllipsis: 'More ranks',
  colRank: 'Rank',
  colName: 'Name',
  colScore: 'Score',
  backToGame: '← Back to the game',
  submitShort: 'Submit',
  youLabel: 'You',

  languageLabel: 'Language',
};

const zh: Strings = {
  title: '撞肩制裁跑酷',
  hintLine1: '滑动闪避，撞肩者冲来时——点击!',
  hintLine2: '桌面端: ←/→ 移动, Space/Enter 反击',
  muteHint: '点击右上角 🔊 按钮静音',
  start: '开始游戏',
  loading: '加载中…',

  hudJustice: '正义',
  hudCombo: '连击',

  fxPerfect: '完美!',
  fxPow: '砰!',
  fxWhiff: '失手!',
  fxOuch: '哎哟!',
  fxCombo: '连击',
  gradePerfect: '正义制裁!',
  gradeGood: '不错!',
  gradeMiss: '失手!',
  tapNow: '就是现在! 点击!',

  gameOver: '游戏结束',
  scoreSuffix: ' 分',
  bestComboLabel: '最高连击',
  justiceLabel: '正义值',
  retry: '再来一局',
  bestRecord: '最高纪录',

  nicknamePlaceholder: '昵称 (中英文/数字 2~12 个字符)',
  nicknameAria: '昵称',
  submit: '提交排行',
  submitting: '提交中…',
  submitFailed: '提交失败，请稍后再试。',
  nicknameFormat: '昵称需为 2~12 个中英文或数字字符。',
  nicknameBanned: '昵称包含被禁用的词语。',

  share: '分享',
  shareCopied: '已复制分数链接!',
  shareFailed: '分享失败。',
  shareText: (score: number, url: string) =>
    `我在《撞肩制裁跑酷》拿到 ${score} 分! 一起来制裁 → ${url}`,

  top100Link: '查看 TOP 100',
  leaderboardHeading: 'TOP 100',
  leaderboardSub: '《撞肩制裁跑酷》全球排行',
  leaderboardCardTitle: '排行榜',
  leaderboardPending: '排行榜准备中',
  leaderboardError: '排行榜加载失败。',
  leaderboardEmpty: '还没有记录，来当第一名吧!',
  leaderboardEllipsis: '更多排名',
  colRank: '排名',
  colName: '昵称',
  colScore: '分数',
  backToGame: '← 返回游戏',
  submitShort: '提交',
  youLabel: '我',

  languageLabel: '语言',
};

const TABLE: Record<Locale, Strings> = { ko, en, zh };

export function stringsFor(locale: Locale): Strings {
  return TABLE[locale];
}

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** navigator.language(s) → locale. `ko*` → ko, `zh*` → zh, everything else → en. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const raw of languages) {
    const tag = raw.toLowerCase();
    if (tag.startsWith('ko')) return 'ko';
    if (tag.startsWith('zh')) return 'zh';
    if (tag) return 'en';
  }
  return DEFAULT_LOCALE;
}

// --- store -----------------------------------------------------------------

let current: Locale | null = null;
const listeners = new Set<() => void>();

function browserLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  const nav = navigator as Navigator & { languages?: readonly string[] };
  return [...(nav.languages ?? []), nav.language].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

function readStored(): Locale | null {
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Stored choice wins over the browser language. Safe to call repeatedly. */
export function initLocale(): Locale {
  const resolved = readStored() ?? detectLocale(browserLanguages());
  if (resolved !== current) {
    current = resolved;
    for (const listener of listeners) listener();
  }
  return resolved;
}

export function getLocale(): Locale {
  if (current === null) {
    // On the server there is no storage/navigator, so this resolves to the default.
    return typeof window === 'undefined' ? DEFAULT_LOCALE : initLocale();
  }
  return current;
}

export function setLocale(locale: Locale): void {
  if (!isLocale(locale) || locale === current) return;
  current = locale;
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private-mode storage failures must never break the toggle.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = LOCALE_TAG[locale];
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The accessor `src/game/**` uses — resolved at draw/spawn time, never cached. */
export function getStrings(): Strings {
  return stringsFor(getLocale());
}

export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE_TAG[getLocale()]);
}

/** Test-only: drops the resolved locale so the next read re-detects. */
export function resetLocale(): void {
  current = null;
}
