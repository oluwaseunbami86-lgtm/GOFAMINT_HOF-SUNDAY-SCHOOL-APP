import { useEffect, useRef, useState, useCallback } from 'react';

// Named constant so this is easy to tune per-role later (e.g. a shorter
// threshold for Treasurer/Record Officer than for a Teacher's class login).
export const INACTIVITY_LOCK_THRESHOLD_MS = 59 * 60 * 1000; // 59 minutes

const CHECK_INTERVAL_MS = 30 * 1000; // 30s poll, plus an immediate check on tab focus

/**
 * Tracks pointerdown/keydown/visibilitychange app-wide and flips `isLocked`
 * to true once genuine idle time exceeds INACTIVITY_LOCK_THRESHOLD_MS.
 *
 * Deliberately does nothing else: it never touches cloudUser, classProfile,
 * or any loaded data. Locking is a pure visual gate — see
 * InactivityLockScreen.tsx for what actually renders when isLocked is true.
 *
 * `enabled` should be false until the user is actually signed in (locking
 * makes no sense on the login screen itself).
 */
export function useInactivityLock(enabled: boolean) {
  const [isLocked, setIsLocked] = useState(false);
  const lastActiveRef = useRef<number>(Date.now());

  const recordActivity = useCallback(() => {
    lastActiveRef.current = Date.now();
  }, []);

  const checkIdle = useCallback(() => {
    if (Date.now() - lastActiveRef.current > INACTIVITY_LOCK_THRESHOLD_MS) {
      setIsLocked(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    lastActiveRef.current = Date.now();

    const handleActivity = () => recordActivity();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Check immediately on return rather than waiting for the next
        // poll — this is what actually catches someone reopening the app
        // on a phone after it sat backgrounded for over an hour.
        checkIdle();
      }
      // When going hidden, we deliberately do NOT touch lastActiveRef —
      // idle time keeps accruing correctly while the app is backgrounded.
    };

    window.addEventListener('pointerdown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    document.addEventListener('visibilitychange', handleVisibility);

    const interval = window.setInterval(checkIdle, CHECK_INTERVAL_MS);

    return () => {
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
    };
  }, [enabled, recordActivity, checkIdle]);

  const unlock = useCallback(() => {
    lastActiveRef.current = Date.now();
    setIsLocked(false);
  }, []);

  return { isLocked, unlock };
}
