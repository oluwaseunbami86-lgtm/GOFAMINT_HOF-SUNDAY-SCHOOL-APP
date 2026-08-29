import { auth } from './firebase';

export async function createStaffLogin(params: {
  email: string;
  password: string;
  roleType: string;
  displayName?: string;
}): Promise<{ success: boolean; error?: string; uid?: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'You must be signed in to do this.' };
  }

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/admin/create-user', {
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
    return { success: true, uid: data.uid };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error creating login.' };
  }
}
