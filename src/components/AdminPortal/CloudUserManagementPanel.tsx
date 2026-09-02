import React, { useState, useEffect } from 'react';
import { UserPlus, Users, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Trash2, Ban, RotateCcw, Pencil, X } from 'lucide-react';
import {
  createStaffLogin,
  listStaffLogins,
  updateStaffLogin,
  setStaffLoginStatus,
  deleteStaffLoginPermanently,
  StaffLoginRecord
} from '../../services/adminUserApi';
import { ClassProfile } from '../../types';

const ASSIGNABLE_ROLES = [
  { value: 'GENERAL_SUPERINTENDENT', label: 'General Superintendent' },
  { value: 'GENERAL_SECRETARY', label: 'General Secretary' },
  { value: 'ASST_GENERAL_SECRETARY', label: 'Asst. General Secretary' },
  { value: 'TREASURER', label: 'Treasurer' },
  { value: 'RECORD_OFFICER', label: 'Record Officer' },
  { value: 'ENROLLMENT_OFFICER', label: 'Enrollment Officer' },
  { value: 'TEACHER', label: 'Teacher' },
  { value: 'CLASS_SECRETARY', label: 'Class Secretary' },
  { value: 'WORKER', label: 'Worker' },
];
const CLASS_BOUND_ROLES = ['TEACHER', 'CLASS_SECRETARY'];
const PROTECTED_ROLES = ['SUPER_ADMIN', 'GENERAL_SUPERINTENDENT', 'GENERAL_SECRETARY'];

const roleLabel = (value: string) => ASSIGNABLE_ROLES.find((r) => r.value === value)?.label || value;

interface CloudUserManagementPanelProps {
  allClasses: ClassProfile[];
}

/**
 * Lets a GENERAL_SUPERINTENDENT / GENERAL_SECRETARY / SUPER_ADMIN create,
 * edit, deactivate, reactivate, or permanently delete a staff Firebase
 * login — right from inside the app, no Firebase Console access needed.
 * Every action here is re-checked server-side (src/server/app.ts) against
 * the caller's real role before it's allowed, so this panel being visible
 * in the UI isn't itself a security boundary. General Superintendent and
 * General Secretary accounts are always shown as protected and cannot be
 * edited, deactivated, or deleted from here — by anyone, including
 * themselves.
 */
export const CloudUserManagementPanel: React.FC<CloudUserManagementPanelProps> = ({ allClasses }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleType, setRoleType] = useState('TEACHER');
  const [classId, setClassId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [isListOpen, setIsListOpen] = useState(false);
  const [users, setUsers] = useState<StaffLoginRecord[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editClassId, setEditClassId] = useState('');
  const [editName, setEditName] = useState('');

  const classNameFor = (id: string | null) => allClasses.find((c) => c.id === id)?.className || (id || '—');

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    setListError(null);
    const res = await listStaffLogins();
    setIsLoadingUsers(false);
    if (res.success) {
      setUsers(res.users || []);
    } else {
      setListError(res.error || 'Failed to load staff logins.');
    }
  };

  useEffect(() => {
    if (isListOpen) loadUsers();
  }, [isListOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    if (!email.trim() || !password) {
      setResult({ ok: false, message: 'Email and password are required.' });
      return;
    }
    if (password.length < 6) {
      setResult({ ok: false, message: 'Password must be at least 6 characters.' });
      return;
    }
    if (CLASS_BOUND_ROLES.includes(roleType) && !classId) {
      setResult({ ok: false, message: 'Please select which class this login belongs to.' });
      return;
    }

    setIsSubmitting(true);
    const res = await createStaffLogin({
      email,
      password,
      roleType,
      displayName: displayName || undefined,
      classId: CLASS_BOUND_ROLES.includes(roleType) ? classId : undefined
    });
    setIsSubmitting(false);

    if (res.success) {
      setResult({ ok: true, message: `Login created for ${email} as ${roleLabel(roleType)}.` });
      setDisplayName('');
      setEmail('');
      setPassword('');
      setClassId('');
      if (isListOpen) loadUsers();
    } else {
      setResult({ ok: false, message: res.error || 'Something went wrong.' });
    }
  };

  const startEdit = (u: StaffLoginRecord) => {
    setEditingUid(u.uid);
    setEditRole(u.roleType);
    setEditClassId(u.classId || '');
    setEditName(u.displayName || '');
  };

  const saveEdit = async () => {
    if (!editingUid) return;
    setBusyUid(editingUid);
    const res = await updateStaffLogin({
      targetUid: editingUid,
      roleType: editRole,
      classId: CLASS_BOUND_ROLES.includes(editRole) ? editClassId : null,
      displayName: editName
    });
    setBusyUid(null);
    if (res.success) {
      setEditingUid(null);
      loadUsers();
    } else {
      setListError(res.error || 'Failed to update user.');
    }
  };

  const toggleStatus = async (u: StaffLoginRecord) => {
    setBusyUid(u.uid);
    const res = await setStaffLoginStatus(u.uid, u.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE');
    setBusyUid(null);
    if (res.success) {
      loadUsers();
    } else {
      setListError(res.error || 'Failed to update status.');
    }
  };

  const confirmDelete = async (uid: string) => {
    setBusyUid(uid);
    const res = await deleteStaffLoginPermanently(uid);
    setBusyUid(null);
    setConfirmDeleteUid(null);
    if (res.success) {
      loadUsers();
    } else {
      setListError(res.error || 'Failed to delete user.');
    }
  };

  return (
    <div className="space-y-4 mb-6">
      {/* CREATE */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-5 py-4 text-left"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-900" />
            <span className="font-semibold text-slate-800 text-sm">Create a Staff Login</span>
          </div>
          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {isOpen && (
          <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name (optional)</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="e.g. Sister Grace Adeyemi"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
                <select
                  value={roleType}
                  onChange={(e) => { setRoleType(e.target.value); setClassId(''); }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  disabled={isSubmitting}
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {CLASS_BOUND_ROLES.includes(roleType) && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Which class?</label>
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  disabled={isSubmitting}
                >
                  <option value="">Select a class…</option>
                  {allClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.className}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="staffmember@example.com"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Temporary Password</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="At least 6 characters — share this with them securely"
                disabled={isSubmitting}
              />
            </div>

            {result && (
              <div
                className={`flex items-start gap-2 text-xs rounded-lg p-2 border ${
                  result.ok ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200'
                }`}
              >
                {result.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                <span>{result.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-950 hover:bg-blue-900 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {isSubmitting ? 'Creating…' : 'Create Login'}
            </button>
          </form>
        )}
      </div>

      {/* MANAGE EXISTING */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <button
          type="button"
          onClick={() => setIsListOpen(!isListOpen)}
          className="w-full flex items-center justify-between px-5 py-4 text-left"
        >
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-900" />
            <span className="font-semibold text-slate-800 text-sm">Manage Existing Logins</span>
          </div>
          {isListOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {isListOpen && (
          <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-2">
            {isLoadingUsers && <p className="text-xs text-slate-500">Loading…</p>}
            {listError && (
              <div className="flex items-start gap-2 text-xs rounded-lg p-2 border text-red-600 bg-red-50 border-red-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{listError}</span>
              </div>
            )}
            {!isLoadingUsers && users.length === 0 && !listError && (
              <p className="text-xs text-slate-500">No staff logins created yet.</p>
            )}

            {users.map((u) => {
              const isProtected = PROTECTED_ROLES.includes(u.roleType);
              const isBusy = busyUid === u.uid;
              const isEditing = editingUid === u.uid;
              return (
                <div key={u.uid} className="border border-slate-200 rounded-lg p-3 text-sm">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                        placeholder="Full name"
                      />
                      <select
                        value={editRole}
                        onChange={(e) => { setEditRole(e.target.value); setEditClassId(''); }}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                      >
                        {ASSIGNABLE_ROLES.filter((r) => !PROTECTED_ROLES.includes(r.value)).map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      {CLASS_BOUND_ROLES.includes(editRole) && (
                        <select
                          value={editClassId}
                          onChange={(e) => setEditClassId(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                        >
                          <option value="">Select a class…</option>
                          {allClasses.map((c) => (
                            <option key={c.id} value={c.id}>{c.className}</option>
                          ))}
                        </select>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={isBusy}
                          className="flex-1 bg-blue-950 text-white rounded py-1.5 text-xs font-semibold disabled:opacity-60"
                        >
                          {isBusy ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingUid(null)}
                          className="px-3 rounded border border-slate-300 text-xs text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 truncate">{u.displayName || u.email}</div>
                        <div className="text-xs text-slate-500 truncate">{u.email}</div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                            {roleLabel(u.roleType)}
                          </span>
                          {u.classId && (
                            <span className="text-[10px] font-bold uppercase bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded">
                              {classNameFor(u.classId)}
                            </span>
                          )}
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${u.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                            {u.status === 'ACTIVE' ? 'Active' : 'Deactivated'}
                          </span>
                          {isProtected && (
                            <span className="text-[10px] font-bold uppercase bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded">
                              Protected
                            </span>
                          )}
                        </div>
                      </div>

                      {!isProtected && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            title="Edit"
                            onClick={() => startEdit(u)}
                            disabled={isBusy}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title={u.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                            onClick={() => toggleStatus(u)}
                            disabled={isBusy}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                          >
                            {u.status === 'ACTIVE' ? <Ban className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          </button>
                          {confirmDeleteUid === u.uid ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => confirmDelete(u.uid)}
                                disabled={isBusy}
                                className="text-[10px] font-bold bg-rose-600 text-white px-2 py-1 rounded"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmDeleteUid(null)}
                                className="text-[10px] text-slate-500 px-1"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              title="Delete permanently"
                              onClick={() => setConfirmDeleteUid(u.uid)}
                              disabled={isBusy}
                              className="p-1.5 rounded hover:bg-rose-50 text-rose-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
