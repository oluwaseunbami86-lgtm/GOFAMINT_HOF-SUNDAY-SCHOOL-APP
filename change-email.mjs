// One-off script: change a Firebase Auth user's email directly via the
// Admin SDK. Bypasses the Firebase Console UI entirely.
//
// HOW TO RUN:
// 1. Save this file as change-email.mjs in your project's root folder
//    (same folder as package.json).
// 2. Make sure firebase-admin is already installed (it is — your server
//    already depends on it).
// 3. In your terminal, set the same service account key your server uses.
//    - If you have a .env or .env.local file with FIREBASE_SERVICE_ACCOUNT_KEY
//      in it already, this script will pick it up automatically (see below).
//    - Otherwise, copy the value from Vercel -> your project -> Settings ->
//      Environment Variables -> FIREBASE_SERVICE_ACCOUNT_KEY.
// 4. Edit the CURRENT_EMAIL / NEW_EMAIL values below.
// 5. Run:  node change-email.mjs

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';

// ---- EDIT THESE TWO LINES ----
const CURRENT_EMAIL = 'oluwaseunbami@gmail.com'; // the account's CURRENT email, exactly as shown in Firebase Console
const NEW_EMAIL = 'oluwaseunbami86@gmail.com';               // the email you want it changed TO
// -------------------------------

function loadServiceAccountKey() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  }
  // Fallback: try to read a .env or .env.local file directly, in case it's
  // not already exported into the shell environment.
  for (const filename of ['.env.local', '.env']) {
    if (existsSync(filename)) {
      const content = readFileSync(filename, 'utf8');
      const match = content.match(/FIREBASE_SERVICE_ACCOUNT_KEY\s*=\s*(.+)/);
      if (match) {
        let value = match[1].trim();
        // Strip surrounding quotes if present.
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return JSON.parse(value);
      }
    }
  }
  throw new Error(
    'Could not find FIREBASE_SERVICE_ACCOUNT_KEY. Set it as an environment variable, or put it in a .env/.env.local file in this folder.'
  );
}

async function main() {
  const serviceAccount = loadServiceAccountKey();
  const app = initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth();
  const db = getFirestore(app, 'ai-studio-remixremixremixr-e1005fdc-a3ec-4e1c-8527-666bdea0d747');

  const user = await auth.getUserByEmail(CURRENT_EMAIL);
  console.log(`Found user: ${user.uid} (${user.email})`);

  // Step 1: the real login credential in Firebase Authentication.
  const updated = await auth.updateUser(user.uid, { email: NEW_EMAIL });
  console.log(`✅ Auth email updated to: ${updated.email}`);

  // Step 2: the mirrored display field in Firestore, so the app's User
  // Management screen (and anywhere else that reads users/{uid}.email)
  // shows the new address too. Only runs if that doc actually exists —
  // some accounts (e.g. the old adminProfiles-based logins) may not have one.
  const userDocRef = db.collection('users').doc(user.uid);
  const userDocSnap = await userDocRef.get();
  if (userDocSnap.exists) {
    await userDocRef.update({ email: NEW_EMAIL, updatedAt: new Date().toISOString() });
    console.log(`✅ Firestore users/${user.uid}.email updated to: ${NEW_EMAIL}`);
  } else {
    console.log(`ℹ️  No users/${user.uid} Firestore doc found — nothing to sync there. If this account`);
    console.log(`   should have one (e.g. it's an exec/office login), create it via the app's User`);
    console.log(`   Management screen or manually in Firestore Console.`);
  }

  console.log(`\nDone. Sign out and sign back in with the new email to confirm.`);
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
