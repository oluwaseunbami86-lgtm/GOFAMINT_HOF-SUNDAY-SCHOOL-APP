import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Server-side only. Never import this file from client code (src/components,
 * src/App.tsx, etc.) — it requires a secret service account key that must
 * never reach the browser.
 *
 * Setup: In Firebase Console → Project Settings → Service Accounts →
 * "Generate new private key". This downloads a JSON file. Take its full
 * contents and set them (as one line) as the FIREBASE_SERVICE_ACCOUNT_KEY
 * environment variable (in .env locally, and in Vercel's Environment
 * Variables in production). Never commit that file or its contents to git.
 */

let adminApp: App | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY is not set. Generate a service account key in Firebase Console → ' +
      'Project Settings → Service Accounts, and set its full JSON contents as this environment variable.'
    );
  }

  const serviceAccount = JSON.parse(raw);
  adminApp = initializeApp({ credential: cert(serviceAccount) });
  return adminApp;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
