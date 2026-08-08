import { describe, expect, it } from 'vitest';
import { checkNickname, NICKNAME_PATTERN } from '@/lib/nickname';
import { shareText } from '@/lib/share';

describe('checkNickname', () => {
  it('accepts Korean, alphanumeric and mixed nicknames of 2–12 chars', () => {
    for (const name of ['응징자', 'abc', 'A1', '정의구현123', 'zzzzzzzzzzzz']) {
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

  it('trims surrounding whitespace before validating', () => {
    expect(checkNickname('  응징자  ').ok).toBe(true);
  });

  it('keeps the pattern anchored so it matches the Firestore rule', () => {
    expect(NICKNAME_PATTERN.source).toBe('^[가-힣a-zA-Z0-9]{2,12}$');
  });
});

describe('shareText', () => {
  it('includes the score and the url', () => {
    expect(shareText(1234, 'https://example.com')).toBe(
      '어깨빵 응징 러너에서 1234점! 정의구현 하러 가기 → https://example.com',
    );
  });
});
