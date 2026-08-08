/**
 * Lazy Firebase bootstrap.
 *
 * The whole app must build and run with NO Firebase env vars set: every export
 * here degrades to `null` / `false` instead of throwing, and the leaderboard UI
 * falls back to the local best score (see `src/lib/bestScore.ts`).
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True only when the minimum set of env vars needed to talk to Firestore is present. */
export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId);
}

let app: FirebaseApp | null = null;
let appCheckStarted = false;

/**
 * The Firebase SDK is loaded via dynamic `import()` only — a static import here
 * would pull the whole SDK into the first-load bundle of every page that
 * transitively touches this module.
 */
async function getApp(): Promise<FirebaseApp | null> {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    const { initializeApp, getApps } = await import('firebase/app');
    app = getApps()[0] ?? initializeApp(config as Required<typeof config>);
  }
  return app;
}

/**
 * App Check (reCAPTCHA v3) is the real write defence — anonymous uids are
 * unlimited, so per-uid rules only stop naive spam. Skipped without a site key.
 */
async function ensureAppCheck(instance: FirebaseApp): Promise<void> {
  if (appCheckStarted) return;
  appCheckStarted = true;
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
  if (!siteKey || typeof window === 'undefined') return;
  try {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
    initializeAppCheck(instance, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    // App Check failing must never break gameplay.
  }
}

export async function getDb(): Promise<Firestore | null> {
  const instance = await getApp();
  if (!instance) return null;
  await ensureAppCheck(instance);
  const { getFirestore } = await import('firebase/firestore');
  return getFirestore(instance);
}

/** Signs in anonymously on first need and returns the uid (null when unconfigured). */
export async function ensureAnonymousUid(): Promise<string | null> {
  const instance = await getApp();
  if (!instance) return null;
  await ensureAppCheck(instance);
  const { getAuth, signInAnonymously } = await import('firebase/auth');
  const auth: Auth = getAuth(instance);
  if (auth.currentUser) return auth.currentUser.uid;
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}
