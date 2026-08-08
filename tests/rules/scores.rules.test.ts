/**
 * Firestore Rules suite. Requires the Firestore emulator (Java 11+):
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, deleteDoc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let testEnv: RulesTestEnvironment;

const validEntry = (uid: string) => ({
  nickname: '응징자',
  score: 12345,
  distance: 4200,
  combo: 17,
  createdAt: serverTimestamp(),
  uid,
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'katabbang-rules-test',
    firestore: {
      rules: readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('scores rules', () => {
  it('rejects a write from an unauthenticated client', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'scores/a'), validEntry('anyone')));
  });

  it('accepts a valid create from an authenticated client', async () => {
    const db = testEnv.authenticatedContext('uid-1').firestore();
    await assertSucceeds(setDoc(doc(db, 'scores/a'), validEntry('uid-1')));
  });

  it('rejects a create whose uid does not match the caller', async () => {
    const db = testEnv.authenticatedContext('uid-1').firestore();
    await assertFails(setDoc(doc(db, 'scores/a'), validEntry('uid-2')));
  });

  it('allows public reads', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'scores/a'), { ...validEntry('uid-1'), createdAt: new Date() });
    });
    const db = testEnv.unauthenticatedContext().firestore();
    const snapshot = await assertSucceeds(getDoc(doc(db, 'scores/a')));
    expect(snapshot.exists()).toBe(true);
  });

  it('rejects update and delete', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'scores/a'), { ...validEntry('uid-1'), createdAt: new Date() });
    });
    const db = testEnv.authenticatedContext('uid-1').firestore();
    await assertFails(updateDoc(doc(db, 'scores/a'), { score: 99999 }));
    await assertFails(deleteDoc(doc(db, 'scores/a')));
  });

  describe('schema validation', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['nickname too short', { nickname: 'ㄱ' }],
      ['nickname too long', { nickname: '가나다라마바사아자차카타파' }],
      ['nickname with symbols', { nickname: 'bad!!name' }],
      ['negative score', { score: -1 }],
      ['score over the cap', { score: 10000001 }],
      ['non-integer score', { score: 1.5 }],
      ['string score', { score: '100' }],
      ['client-set createdAt', { createdAt: new Date(0) }],
      ['extra field', { cheat: true }],
    ];

    for (const [name, patch] of cases) {
      it(`rejects ${name}`, async () => {
        const db = testEnv.authenticatedContext('uid-1').firestore();
        await assertFails(setDoc(doc(db, 'scores/a'), { ...validEntry('uid-1'), ...patch }));
      });
    }

    it('rejects a create missing a required field', async () => {
      const db = testEnv.authenticatedContext('uid-1').firestore();
      await assertFails(
        setDoc(doc(db, 'scores/a'), {
          nickname: '응징자',
          score: 100,
          createdAt: serverTimestamp(),
          uid: 'uid-1',
        }),
      );
    });
  });
});
