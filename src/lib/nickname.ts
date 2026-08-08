/**
 * Nickname validation. The regex here MUST stay identical to the one in
 * `firestore.rules` — the client message is UX, the rule is the enforcement.
 * The profanity list is a v1 client-side filter only (server filter is v2).
 */
export const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]{2,12}$/;

const BANNED = [
  '시발', '씨발', '씨빨', '병신', '개새끼', '새끼', '지랄', '좆',
  '니미', '엠창', '창녀', '자지', '보지', '섹스', '강간', '한남', '한녀',
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'asshole',
  'nigger', 'nigga', 'faggot', 'rape', 'sex',
];

export type NicknameCheck = { ok: true } | { ok: false; reason: string };

export function checkNickname(raw: string): NicknameCheck {
  const nickname = raw.trim();
  if (!NICKNAME_PATTERN.test(nickname)) {
    return { ok: false, reason: '닉네임은 한글/영문/숫자 2~12자여야 해요.' };
  }
  const lowered = nickname.toLowerCase();
  if (BANNED.some((word) => lowered.includes(word))) {
    return { ok: false, reason: '사용할 수 없는 단어가 포함되어 있어요.' };
  }
  return { ok: true };
}
