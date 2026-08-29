import React, { useState } from 'react';
import { Lock, Church, AlertCircle } from 'lucide-react';
import { signIn } from '../services/authService';

interface CloudLoginGateProps {
  onSignedIn: () => void;
}

/**
 * Full-screen sign-in gate. Rendered by App.tsx BEFORE any class data,
 * members, or admin views are shown. There is no self-signup here on
 * purpose — accounts are created by an admin in the Firebase Console.
 */
export const CloudLoginGate: React.FC<CloudLoginGateProps> = ({ onSignedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter both your email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await signIn(email, password);
      onSignedIn();
    } catch (err: any) {
      const code = err?.code || '';
      if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
        setError('Incorrect email or password.');
      } else if (code.includes('too-many-requests')) {
        setError('Too many attempts. Please wait a moment and try again.');
      } else {
        setError('Could not sign in. Please check your connection and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-full bg-blue-950 flex items-center justify-center mb-3">
            <Church className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 text-center font-['Cinzel',serif]">
            THE GOSPEL FAITH MISSION INTL
          </h1>
          <p className="text-xs text-slate-500 mt-1 text-center">Sunday School Secretary — Sign In</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
              autoComplete="email"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg p-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-950 hover:bg-blue-900 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-[11px] text-slate-400 text-center mt-5">
          Don't have an account? Ask your Sunday School administrator to create one for you.
        </p>
      </div>
    </div>
  );
};
