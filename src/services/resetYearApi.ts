import { auth } from './firebase';

/**
 * Calls the server-side /api/admin/reset-year endpoint, which is the ONLY
 * place the actual reset happens — against the centralized Firestore
 * database, with the caller's role re-verified server-side. This client
 * function does no data manipulation itself; it just carries the signed-in
 * user's Firebase ID token to the server and relays the result.
 *
 * After a successful reset, call `hydrateLocalFromCloud()` (from
 * cloudSyncManager.ts) to pull the fresh state down into this device's local
 * IndexedDB cache — the existing cloud sync pipeline already does exactly
 * that, so there's no separate mechanism needed here.
 */
export interface ResetYearParams {
  confirmYearId: string;
  newYearName: string;
  newOverallTheme?: string;
}

export interface ResetYearResult {
  success: boolean;
  error?: string;
  newYearId?: string;
  newYearName?: string;
  deletedCounts?: Record<string, number>;
}

export async function resetYearOnServer(params: ResetYearParams): Promise<ResetYearResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'You must be signed in to do this.' };
  }

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/admin/reset-year', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || `Request failed (${res.status})` };
    }
    return {
      success: true,
      newYearId: data.newYearId,
      newYearName: data.newYearName,
      deletedCounts: data.deletedCounts,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error while resetting the year.' };
  }
}
