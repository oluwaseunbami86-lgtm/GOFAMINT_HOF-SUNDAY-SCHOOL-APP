import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Cloud Firestore with multi-tab persistent offline cache
let firestoreDb;
try {
  // If specific databaseId is configured in firebase-applet-config.json
  const dbId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, dbId === '(default)' ? undefined : dbId);
} catch (e) {
  // Fallback to standard getFirestore if already initialized
  firestoreDb = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || undefined);
}

export const db = firestoreDb;
export default app;
