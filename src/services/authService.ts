import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth } from './firebase';

/**
 * Real Firebase Authentication.
 * Sign-up is intentionally NOT exposed in the app UI — accounts are created
 * manually in the Firebase Console (Authentication tab) by an admin, and a
 * matching role is set in the `users/{uid}` Firestore collection. This keeps
 * the app invite-only instead of letting anyone self-register.
 */

export function watchAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function signIn(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}
