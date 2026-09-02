import { auth } from './firebase';

export interface StaffLoginRecord {
  uid: string;
  roleType: string;
  email: string | null;
  displayName: string | null;
  classId: string | null;
  status: 'ACTIVE' | 'DEACTIVATED';
  createdAt?: string;
}

async function authedPost(path: string, body: any): Promise<{ success: boolean; error?: string; [key: string]: any }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'You must be signed in to do this.' };
  }
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || `Request failed (${res.status})` };
    return { success: true, ...data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error.' };
  }
}

export async function createStaffLogin(params: {
  email: string;
  password: string;
  roleType: string;
  displayName?: string;
  classId?: string;
}): Promise<{ success: boolean; error?: string; uid?: string }> {
  return authedPost('/api/admin/create-user', params);
}

export async function listStaffLogins(): Promise<{ success: boolean; error?: string; users?: StaffLoginRecord[] }> {
  const currentUser = auth.currentUser;
  if (!currentUser) return { success: false, error: 'You must be signed in to do this.' };
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/admin/list-users', { headers: { Authorization: `Bearer ${idToken}` } });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || `Request failed (${res.status})` };
    return { success: true, users: data.users };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error loading users.' };
  }
}

export async function updateStaffLogin(params: {
  targetUid: string;
  roleType?: string;
  classId?: string | null;
  displayName?: string;
}): Promise<{ success: boolean; error?: string }> {
  return authedPost('/api/admin/update-user', params);
}

export async function setStaffLoginStatus(targetUid: string, status: 'ACTIVE' | 'DEACTIVATED'): Promise<{ success: boolean; error?: string }> {
  return authedPost('/api/admin/set-user-status', { targetUid, status });
}

export async function deleteStaffLoginPermanently(targetUid: string): Promise<{ success: boolean; error?: string }> {
  return authedPost('/api/admin/delete-user-permanently', { targetUid });
}
