/**
 * Nickname validation. The regex here MUST stay identical to the one in
 * `firestore.rules` — the client message is UX, the rule is the enforcement.
 * The profanity list is a v1 client-side filter only (server filter is v2).
 * CJK ideographs are allowed so Chinese players can register a name.
 */
export const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9一-龥]{2,12}$/;

const BANNED = [
  '시발', '씨발', '씨빨', '병신', '개새끼', '새끼', '지랄', '좆',
  '니미', '엠창', '창녀', '자지', '보지', '섹스', '강간', '한남', '한녀',
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'asshole',
  'nigger', 'nigga', 'faggot', 'rape', 'sex',
];

/** Reason code — the UI maps it to a localized message (see `src/lib/i18n.ts`). */
export type NicknameReason = 'format' | 'banned';

export type NicknameCheck = { ok: true } | { ok: false; reason: NicknameReason };

export function checkNickname(raw: string): NicknameCheck {
  const nickname = raw.trim();
  if (!NICKNAME_PATTERN.test(nickname)) {
    return { ok: false, reason: 'format' };
  }
  const lowered = nickname.toLowerCase();
  if (BANNED.some((word) => lowered.includes(word))) {
    return { ok: false, reason: 'banned' };
  }
  return { ok: true };
}
