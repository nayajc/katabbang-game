import { describe, expect, it } from 'vitest';
import { checkNickname, NICKNAME_PATTERN } from '@/lib/nickname';
import { shareText } from '@/lib/share';

describe('checkNickname', () => {
  it('accepts Korean, CJK, alphanumeric and mixed nicknames of 2–12 chars', () => {
    for (const name of ['응징자', 'abc', 'A1', '정의구현123', 'zzzzzzzzzzzz', '正义制裁', '玩家01']) {
      expect(checkNickname(name).ok, name).toBe(true);
    }
  });

  it('rejects lengths outside 2–12', () => {
    expect(checkNickname('a').ok).toBe(false);
    expect(checkNickname('a'.repeat(13)).ok).toBe(false);
  });

  it('rejects symbols, spaces, emoji and lone jamo', () => {
    for (const name of ['bad name', 'hi!', '응징 자', '😀😀', 'ㄱㄴ']) {
      expect(checkNickname(name).ok, name).toBe(false);
    }
  });

  it('rejects profanity in either language, case-insensitively', () => {
    expect(checkNickname('병신').ok).toBe(false);
    expect(checkNickname('FuCk').ok).toBe(false);
  });

  it('returns a localizable reason code rather than a message', () => {
    expect(checkNickname('a')).toEqual({ ok: false, reason: 'format' });
    expect(checkNickname('FuCk')).toEqual({ ok: false, reason: 'banned' });
  });

  it('trims surrounding whitespace before validating', () => {
    expect(checkNickname('  응징자  ').ok).toBe(true);
  });

  it('keeps the pattern anchored so it matches the Firestore rule', () => {
    expect(NICKNAME_PATTERN.source).toBe('^[가-힣a-zA-Z0-9一-龥]{2,12}$');
  });
});

describe('shareText', () => {
  it('includes the score and the url', () => {
    expect(shareText(1234, 'https://example.com')).toBe(
      '어깨빵 참교육에서 1234점! 정의구현 하러 가기 → https://example.com',
    );
  });
});
