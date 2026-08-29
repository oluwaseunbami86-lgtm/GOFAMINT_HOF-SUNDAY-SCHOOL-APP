import React, { useState } from 'react';
import { UserPlus, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { createStaffLogin } from '../../services/adminUserApi';

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

/**
 * Lets a GENERAL_SUPERINTENDENT / GENERAL_SECRETARY / SUPER_ADMIN create a new
 * Firebase login for staff, right from inside the app — no Firebase Console
 * access needed. The server (src/server/app.ts, /api/admin/create-user)
 * independently re-checks the caller's real role before allowing this, so
 * this panel being visible in the UI isn't itself a security boundary.
 */
export const CloudUserManagementPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleType, setRoleType] = useState('TEACHER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

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

    setIsSubmitting(true);
    const res = await createStaffLogin({ email, password, roleType, displayName: displayName || undefined });
    setIsSubmitting(false);

    if (res.success) {
      setResult({ ok: true, message: `Login created for ${email} as ${roleType}.` });
      setDisplayName('');
      setEmail('');
      setPassword('');
    } else {
      setResult({ ok: false, message: res.error || 'Something went wrong.' });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6">
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
                onChange={(e) => setRoleType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                disabled={isSubmitting}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

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
  );
};
