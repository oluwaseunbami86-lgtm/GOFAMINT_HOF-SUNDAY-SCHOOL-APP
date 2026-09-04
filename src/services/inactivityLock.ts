/**
 * Local-only 4-digit PIN storage for the inactivity lock screen.
 *
 * This is a courtesy privacy lock, not a replacement for real authentication
 * (Firebase Auth / class passwords remain the actual security boundary).
 * Everything here reads/writes localStorage only — zero network calls to
 * set, verify, or clear a PIN, so it works fully offline.
 *
 * The PIN is scoped per Firebase account (uid), since `cloudUser` is always
 * present once signed in, regardless of which portal (Admin, Worker, Class
 * Secretary/Teacher) is active — see App.tsx.
 */

const STORAGE_PREFIX = 'gofamint_inactivity_pin_';

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function storageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`;
}

export function hasPinSet(uid: string): boolean {
  return !!localStorage.getItem(storageKey(uid));
}

export async function setPin(uid: string, pin: string): Promise<void> {
  const hash = await sha256Hex(pin);
  localStorage.setItem(storageKey(uid), hash);
}

export async function verifyPin(uid: string, pin: string): Promise<boolean> {
  const stored = localStorage.getItem(storageKey(uid));
  if (!stored) return false;
  const hash = await sha256Hex(pin);
  return hash === stored;
}

export function clearPin(uid: string): void {
  localStorage.removeItem(storageKey(uid));
}
