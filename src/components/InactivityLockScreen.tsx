import React, { useState, useEffect } from 'react';
import { Lock, Delete, ShieldCheck, AlertTriangle } from 'lucide-react';
import { GofamintLogo } from './GofamintLogo';
import { hasPinSet, setPin, verifyPin } from '../services/inactivityLock';
import { signOutUser } from '../services/authService';

interface InactivityLockScreenProps {
  uid: string;
  onUnlock: () => void;
}

/**
 * Renders ON TOP of whatever portal is currently active whenever the
 * inactivity lock trips. It never signs the user out or touches any loaded
 * data — entering the correct PIN just tells useInactivityLock() to flip
 * isLocked back to false. Everything here is local-only: no network call is
 * made to check, set, or clear the PIN, so this works fully offline.
 */
export const InactivityLockScreen: React.FC<InactivityLockScreenProps> = ({ uid, onUnlock }) => {
  const [mode, setMode] = useState<'checking' | 'setup' | 'enter'>('checking');
  const [digits, setDigits] = useState('');
  const [confirmDigits, setConfirmDigits] = useState('');
  const [setupStage, setSetupStage] = useState<'choose' | 'confirm'>('choose');
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [showForgotConfirm, setShowForgotConfirm] = useState(false);

  useEffect(() => {
    setMode(hasPinSet(uid) ? 'enter' : 'setup');
  }, [uid]);

  const triggerError = (message: string) => {
    setError(message);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 400);
    setTimeout(() => setDigits(''), 250);
  };

  const handleDigitPress = (digit: string) => {
    setError(null);
    if (mode === 'setup') {
      if (setupStage === 'choose') {
        if (digits.length < 4) setDigits((d) => d + digit);
        return;
      } else {
        if (confirmDigits.length < 4) setConfirmDigits((d) => d + digit);
        return;
      }
    }
    if (digits.length < 4) setDigits((d) => d + digit);
  };

  const handleBackspace = () => {
    setError(null);
    if (mode === 'setup' && setupStage === 'confirm') {
      setConfirmDigits((d) => d.slice(0, -1));
    } else {
      setDigits((d) => d.slice(0, -1));
    }
  };

  // Advance the setup flow once 4 digits are chosen
  useEffect(() => {
    if (mode !== 'setup') return;
    if (setupStage === 'choose' && digits.length === 4) {
      setTimeout(() => setSetupStage('confirm'), 150);
    }
  }, [digits, mode, setupStage]);

  // Verify the confirmation matches, then save
  useEffect(() => {
    if (mode !== 'setup' || setupStage !== 'confirm') return;
    if (confirmDigits.length !== 4) return;
    (async () => {
      if (confirmDigits !== digits) {
        triggerError("PINs didn't match — let's try again.");
        setConfirmDigits('');
        setDigits('');
        setSetupStage('choose');
        return;
      }
      await setPin(uid, digits);
      onUnlock();
    })();
  }, [confirmDigits, digits, mode, setupStage, uid, onUnlock]);

  // Verify PIN entry mode
  useEffect(() => {
    if (mode !== 'enter') return;
    if (digits.length !== 4) return;
    (async () => {
      const ok = await verifyPin(uid, digits);
      if (ok) {
        onUnlock();
      } else {
        triggerError('Incorrect PIN. Please try again.');
      }
    })();
  }, [digits, mode, uid, onUnlock]);

  const handleForgotPin = async () => {
    await signOutUser();
  };

  const activeDigits = mode === 'setup' && setupStage === 'confirm' ? confirmDigits : digits;

  return (
    <div className="fixed inset-0 z-[9999] bg-blue-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-5">
        <GofamintLogo size={56} />
      </div>

      <div className="flex items-center gap-2 mb-1.5">
        {mode === 'setup' ? (
          <ShieldCheck className="w-4 h-4 text-amber-400" />
        ) : (
          <Lock className="w-4 h-4 text-amber-400" />
        )}
        <h1 className="text-sm font-bold text-white font-['Cinzel',serif] tracking-wide">
          {mode === 'setup'
            ? setupStage === 'choose'
              ? 'Set Up a Screen-Lock PIN'
              : 'Confirm Your PIN'
            : 'Enter PIN to Continue'}
        </h1>
      </div>

      <p className="text-xs text-blue-200 max-w-xs mb-8">
        {mode === 'setup'
          ? setupStage === 'choose'
            ? 'Choose a 4-digit PIN. You\'ll use this to quickly unlock the screen after it locks from inactivity — nothing else here is affected.'
            : 'Enter the same 4 digits again to confirm.'
          : 'The screen locked after a period of inactivity. Your data is safe and untouched.'}
      </p>

      <div className={`flex gap-4 mb-8 ${isShaking ? 'animate-shake-once' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-colors ${
              activeDigits.length > i ? 'bg-amber-400 border-amber-400' : 'border-blue-700'
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-rose-300 text-xs mb-4 -mt-4">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            onClick={() => handleDigitPress(d)}
            className="aspect-square rounded-2xl bg-blue-900 hover:bg-blue-800 active:bg-blue-700 text-white text-xl font-bold transition"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          onClick={() => handleDigitPress('0')}
          className="aspect-square rounded-2xl bg-blue-900 hover:bg-blue-800 active:bg-blue-700 text-white text-xl font-bold transition"
        >
          0
        </button>
        <button
          onClick={handleBackspace}
          className="aspect-square rounded-2xl bg-blue-900/50 hover:bg-blue-800 active:bg-blue-700 text-white flex items-center justify-center transition"
        >
          <Delete className="w-5 h-5" />
        </button>
      </div>

      {mode === 'enter' && (
        <div className="mt-8">
          {!showForgotConfirm ? (
            <button
              onClick={() => setShowForgotConfirm(true)}
              className="text-xs text-blue-300 underline underline-offset-2"
            >
              Forgot PIN?
            </button>
          ) : (
            <div className="bg-blue-900/60 border border-blue-800 rounded-xl p-3 max-w-xs">
              <p className="text-[11px] text-blue-100 mb-2">
                This will sign you out completely — you'll need to sign back in. Your data is safe either way.
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={handleForgotPin}
                  className="text-[11px] font-bold bg-rose-600 text-white px-3 py-1.5 rounded-lg"
                >
                  Sign Out
                </button>
                <button
                  onClick={() => setShowForgotConfirm(false)}
                  className="text-[11px] text-blue-200 px-3 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
