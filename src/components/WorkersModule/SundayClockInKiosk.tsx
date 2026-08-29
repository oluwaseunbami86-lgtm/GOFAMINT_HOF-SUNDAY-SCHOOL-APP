import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  WorkerProfile, 
  WorkerAttendanceRecord, 
  ClockInConfig, 
  SundayAttendanceStatus 
} from '../../types';
import { 
  QrCode, Search, Camera, CheckCircle, AlertTriangle, 
  Clock, Sparkles, Settings, Volume2, VolumeX, Users, 
  RefreshCw, Check, ArrowRight, ShieldCheck, UserCheck, Flame
} from 'lucide-react';
import confetti from 'canvas-confetti';
import jsQR from 'jsqr';
import { GofamintLogo } from '../GofamintLogo';

interface SundayClockInKioskProps {
  workers: WorkerProfile[];
  todayAttendance: WorkerAttendanceRecord[];
  config: ClockInConfig;
  onClockIn: (record: WorkerAttendanceRecord) => Promise<void>;
  onUpdateConfig: (config: ClockInConfig) => Promise<void>;
  onNavigateToTab: (tab: any) => void;
}

export const SundayClockInKiosk: React.FC<SundayClockInKioskProps> = ({
  workers,
  todayAttendance,
  config,
  onClockIn,
  onUpdateConfig,
  onNavigateToTab
}) => {
  const [activeMethod, setActiveMethod] = useState<'NAME_SEARCH' | 'QR_SCAN' | 'DEPT_LIST'>('NAME_SEARCH');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [currentDateStr, setCurrentDateStr] = useState<string>('');
  
  // Camera Scanning State
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Feedback / Modal states
  const [celebrationWorker, setCelebrationWorker] = useState<{
    worker: WorkerProfile;
    record: WorkerAttendanceRecord;
  } | null>(null);
  
  const [duplicateWarning, setDuplicateWarning] = useState<{
    worker: WorkerProfile;
    existingRecord: WorkerAttendanceRecord;
  } | null>(null);

  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [editStartTime, setEditStartTime] = useState(config.serviceStartTime || '08:00');
  const [editGraceMins, setEditGraceMins] = useState(config.gracePeriodMinutes ?? 15);
  const [editSound, setEditSound] = useState(config.autoSoundFeedback ?? true);
  const [editCelebration, setEditCelebration] = useState(config.showCelebration ?? true);

  // Sunday from 7:00 AM schedule restriction & Administrator rehearsal override
  const [adminTestOverride, setAdminTestOverride] = useState<boolean>(false);
  
  // Real-time schedule evaluation
  const nowForSchedule = new Date();
  const isActualSunday = nowForSchedule.getDay() === 0;
  const isActualAfter7AM = nowForSchedule.getHours() >= 7;
  const isClockInScheduleAllowed = (isActualSunday && isActualAfter7AM) || adminTestOverride;

  // Video and Canvas refs for QR Scanning
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const lastScannedTokenRef = useRef<{ token: string; time: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Clock Ticker
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setCurrentDateStr(now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Play gentle success audio chime using Web Audio API
  const playAudioFeedback = useCallback((type: 'success' | 'late' | 'duplicate') => {
    if (!config.autoSoundFeedback) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'late') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(554.37, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.setValueAtTime(200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch {
      // Audio context not allowed or failed, ignore gracefully
    }
  }, [config.autoSoundFeedback]);

  // Compute if late based on current time & configuration
  const evaluatePunctuality = (clockInDate: Date): { status: SundayAttendanceStatus; isLate: boolean } => {
    const [startHour, startMin] = (config.serviceStartTime || '08:00').split(':').map(Number);
    const serviceStartToday = new Date(clockInDate);
    serviceStartToday.setHours(startHour, startMin, 0, 0);

    const graceMs = (config.gracePeriodMinutes || 15) * 60 * 1000;
    const lateThreshold = new Date(serviceStartToday.getTime() + graceMs);

    if (clockInDate > lateThreshold) {
      return { status: 'LATE', isLate: true };
    }
    return { status: 'PRESENT', isLate: false };
  };

  // Perform the actual Clock-In
  const processWorkerClockIn = useCallback(async (
    worker: WorkerProfile, 
    method: 'QR_SCAN' | 'NAME_SEARCH' | 'DEPT_QUICK_ACCESS' | 'MANUAL_OVERRIDE'
  ) => {
    const todayStr = config.serviceDate || new Date().toISOString().split('T')[0];
    
    // 0. Enforce Sunday from 7:00 AM restriction
    const nowCheck = new Date();
    const isNowSunday = nowCheck.getDay() === 0;
    const isNowAfter7AM = nowCheck.getHours() >= 7;
    const isNowAllowed = (isNowSunday && isNowAfter7AM) || adminTestOverride;

    if (!isNowAllowed) {
      alert('Clock-in terminal is restricted: Clock-in is only permitted on Sundays from 7:00 AM. (Enable Admin Test Override if you are conducting an administrative rehearsal).');
      return;
    }

    // 1. Check for Duplicate Clock-In
    const existing = todayAttendance.find(
      a => (a.workerId === worker.id || (a.workerName || '').toLowerCase() === (worker.fullName || '').toLowerCase()) && a.serviceDate === todayStr
    );

    if (existing) {
      playAudioFeedback('duplicate');
      setDuplicateWarning({ worker, existingRecord: existing });
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const { status, isLate } = evaluatePunctuality(now);

    const newRecord: WorkerAttendanceRecord = {
      id: `${worker.id}_${todayStr}`,
      workerId: worker.id,
      workerName: worker.fullName,
      department: worker.department,
      serviceDate: todayStr,
      serviceName: config.serviceName || 'Sunday Morning Service',
      clockInTime: timeStr,
      timestamp: now.getTime(),
      status,
      isLate,
      method,
      createdAt: now.toISOString()
    };

    await onClockIn(newRecord);

    if (isLate) {
      playAudioFeedback('late');
    } else {
      playAudioFeedback('success');
    }

    // Trigger celebration effects
    if (config.showCelebration) {
      confetti({
        particleCount: isLate ? 35 : 70,
        spread: 60,
        origin: { y: 0.6 }
      });
    }

    setCelebrationWorker({ worker, record: newRecord });
    setSearchQuery('');

    // Auto-dismiss celebration after 4.5 seconds for kiosk throughput
    setTimeout(() => {
      setCelebrationWorker(prev => {
        if (prev?.record.id === newRecord.id) {
          return null;
        }
        return prev;
      });
    }, 4500);

  }, [config, todayAttendance, onClockIn, playAudioFeedback]);

  // Handle QR scan detection
  const handleQrTokenDetected = useCallback((token: string) => {
    if (!token) return;
    const now = Date.now();
    // Debounce duplicate scans within 3 seconds
    if (lastScannedTokenRef.current && lastScannedTokenRef.current.token === token && now - lastScannedTokenRef.current.time < 3000) {
      return;
    }
    lastScannedTokenRef.current = { token, time: now };

    const trimmed = token.trim();
    const trimmedLower = trimmed.toLowerCase();
    const matchedWorker = workers.find(
      w => w.qrCodeToken === trimmed || w.id === trimmed || w.phone === trimmed || (w.fullName || '').toLowerCase() === trimmedLower
    );

    if (matchedWorker) {
      processWorkerClockIn(matchedWorker, 'QR_SCAN');
    } else {
      console.warn('Scanned QR token did not match any worker:', token);
    }
  }, [workers, processWorkerClockIn]);

  // Camera video feed initialization
  useEffect(() => {
    if (activeMethod !== 'QR_SCAN' || !isCameraActive) {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      return;
    }

    let stream: MediaStream | null = null;

    navigator.mediaDevices?.getUserMedia({
      video: { facingMode: cameraFacing }
    }).then(s => {
      stream = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play().catch(err => console.warn('Video play error:', err));
      }
      setCameraError(null);
    }).catch(err => {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError('Camera not accessible. Please grant permissions or use Name Search.');
    });

    const scanFrame = () => {
      if (
        videoRef.current && 
        videoRef.current.readyState >= 2 && 
        videoRef.current.videoWidth > 0 && 
        videoRef.current.videoHeight > 0
      ) {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            try {
              canvas.height = videoRef.current.videoHeight;
              canvas.width = videoRef.current.videoWidth;
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
              });

              if (code && code.data) {
                handleQrTokenDetected(code.data);
              }
            } catch (err) {
              console.warn('QR scan error in Sunday kiosk:', err);
            }
          }
        }
      }
      animationFrameId.current = requestAnimationFrame(scanFrame);
    };

    animationFrameId.current = requestAnimationFrame(scanFrame);

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [activeMethod, isCameraActive, cameraFacing, handleQrTokenDetected]);

  // Focus search input when switching to NAME_SEARCH
  useEffect(() => {
    if (activeMethod === 'NAME_SEARCH') {
      setTimeout(() => searchInputRef.current?.focus(), 150);
    }
  }, [activeMethod]);

  // Filtered active workers (Archived excluded)
  const activeWorkersList = useMemo(() => {
    return workers
      .filter(w => w.status === 'ACTIVE')
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [workers]);

  // Filtered workers for search / department methods
  const matchingWorkers = useMemo(() => {
    if (activeMethod === 'NAME_SEARCH') {
      if (!searchQuery.trim()) return activeWorkersList;
      const q = (searchQuery || '').toLowerCase();
      return activeWorkersList.filter(w => 
        (w.fullName || '').toLowerCase().includes(q) ||
        (w.phone || '').includes(q) ||
        (w.department || '').toLowerCase().includes(q) ||
        (w.categories || []).some(c => (c || '').toLowerCase().includes(q))
      );
    }
    if (activeMethod === 'DEPT_LIST') {
      if (selectedDept === 'ALL') return activeWorkersList;
      return activeWorkersList.filter(w => w.department === selectedDept);
    }
    return activeWorkersList;
  }, [activeMethod, searchQuery, selectedDept, activeWorkersList]);

  const uniqueDepartments = useMemo(() => {
    return Array.from(new Set(activeWorkersList.map(w => w.department)));
  }, [activeWorkersList]);

  const clockedInCount = todayAttendance.length;
  const activeWorkersCount = activeWorkersList.length;
  const lateCount = todayAttendance.filter(a => a.isLate).length;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: ClockInConfig = {
      ...config,
      serviceStartTime: editStartTime,
      gracePeriodMinutes: Number(editGraceMins),
      autoSoundFeedback: editSound,
      showCelebration: editCelebration
    };
    await onUpdateConfig(updated);
    setShowSettingsModal(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Kiosk Hero Clock & Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        
        {/* Ambient Top Pattern */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          
          {/* Title & Organization */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Sunday Clock-In Terminal</span>
              </div>
              <span className="text-xs text-slate-400 font-semibold">
                GOFAMINT_HOF Workers Directorate
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black font-['Cinzel',serif] tracking-tight text-white">
              {config.serviceName || 'Sunday Morning Service'}
            </h1>
            
            <p className="text-xs sm:text-sm text-slate-300 flex items-center gap-2">
              <span>Start Time: <strong>{config.serviceStartTime || '08:00 AM'}</strong></span>
              <span>•</span>
              <span>Grace: <strong>{config.gracePeriodMinutes || 15} mins</strong></span>
              <span>•</span>
              <span className="text-amber-300">Late cutoff: {config.serviceStartTime ? `${config.serviceStartTime} + ${config.gracePeriodMinutes}m` : '08:15 AM'}</span>
            </p>
          </div>

          {/* Big Live Digital Clock */}
          <div className="flex flex-col items-start md:items-end justify-center bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 sm:px-6 shadow-inner">
            <div className="text-3xl sm:text-4xl font-black font-mono tracking-widest text-amber-400 drop-shadow-sm">
              {currentTimeStr || '08:00:00 AM'}
            </div>
            <div className="text-xs text-slate-300 font-medium mt-0.5">
              {currentDateStr || 'Sunday'}
            </div>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="mt-2 text-[11px] font-bold text-slate-400 hover:text-amber-300 flex items-center gap-1 transition"
            >
              <Settings className="w-3 h-3" />
              <span>Clock-in Settings</span>
            </button>
          </div>

        </div>

        {/* Live Counters Banner */}
        <div className="grid grid-cols-3 gap-3 pt-6 mt-6 border-t border-slate-800/80 text-center">
          <div className="bg-slate-800/50 rounded-xl p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Clocked In</span>
            <div className="text-xl sm:text-2xl font-black text-emerald-400">{clockedInCount}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">On-Time Arrivals</span>
            <div className="text-xl sm:text-2xl font-black text-blue-300">{clockedInCount - lateCount}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Late Arrivals</span>
            <div className="text-xl sm:text-2xl font-black text-amber-400">{lateCount}</div>
          </div>
        </div>

      </div>

      {/* Schedule Window Status & Admin Override Indicator */}
      {!isClockInScheduleAllowed ? (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-500 text-slate-950 rounded-xl font-bold shrink-0 mt-0.5">
              <Clock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-amber-950 flex items-center gap-2">
                <span>Clock-In Window Restricted (Sundays from 7:00 AM)</span>
                <span className="bg-amber-200 text-amber-900 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">LOCKED</span>
              </h3>
              <p className="text-xs text-amber-900/90 leading-relaxed max-w-2xl">
                Worker Sunday clock-in is strictly scheduled for <strong>Sundays from 7:00 AM</strong>.
                Today is <strong>{currentDateStr}</strong> ({currentTimeStr}). 
                Administrators conducting drills or system verification can enable Test Override below.
              </p>
            </div>
          </div>

          <button
            onClick={() => setAdminTestOverride(true)}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-xs shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>Enable Admin Test Override</span>
          </button>
        </div>
      ) : (
        adminTestOverride && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-700 shrink-0" />
              <span>
                <strong>Admin Test Override Active:</strong> Live clock-in and QR scanning are enabled for administrative testing.
              </span>
            </div>
            <button
              onClick={() => setAdminTestOverride(false)}
              className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold transition shrink-0"
            >
              Disable Override
            </button>
          </div>
        )
      )}

      {/* Main Clock-In Method Switcher Tabs */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-300 max-w-xl mx-auto shadow-inner">
        <button
          onClick={() => {
            setActiveMethod('NAME_SEARCH');
            setIsCameraActive(false);
          }}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
            activeMethod === 'NAME_SEARCH'
              ? 'bg-blue-900 text-white shadow-md'
              : 'text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Search className="w-4 h-4 text-amber-400" />
          <span>1. Find & List Names</span>
        </button>

        <button
          onClick={() => {
            setActiveMethod('QR_SCAN');
            setIsCameraActive(true);
          }}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
            activeMethod === 'QR_SCAN'
              ? 'bg-blue-900 text-white shadow-md'
              : 'text-slate-700 hover:bg-slate-200'
          }`}
        >
          <QrCode className="w-4 h-4 text-amber-400" />
          <span>2. QR Code Scanner</span>
        </button>

        <button
          onClick={() => {
            setActiveMethod('DEPT_LIST');
            setIsCameraActive(false);
          }}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
            activeMethod === 'DEPT_LIST'
              ? 'bg-blue-900 text-white shadow-md'
              : 'text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Users className="w-4 h-4 text-amber-400" />
          <span>3. Department</span>
        </button>
      </div>

      {/* ---------------- METHOD 1: QR CODE SCANNER ---------------- */}
      {activeMethod === 'QR_SCAN' && (
        <div className="max-w-2xl mx-auto bg-white border-2 border-slate-200 rounded-3xl p-6 shadow-lg text-center space-y-5">
          
          <div className="space-y-1">
            <h2 className="text-lg font-black text-slate-900 font-['Cinzel',serif] uppercase">
              Hold QR Badge in Front of Camera
            </h2>
            <p className="text-xs text-slate-600">
              Personal ID badges will be instantly recognized with immediate attendance confirmation.
            </p>
          </div>

          {/* Camera Viewfinder Box */}
          <div className="relative mx-auto w-full max-w-md aspect-square bg-slate-950 rounded-3xl overflow-hidden border-4 border-slate-900 shadow-2xl flex items-center justify-center">
            
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              playsInline
              muted
            />

            {/* Hidden canvas for image analysis */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Viewfinder Target Reticle */}
            <div className="absolute inset-8 border-2 border-amber-400/70 rounded-2xl pointer-events-none flex flex-col justify-between p-2 shadow-[0_0_15px_rgba(251,191,36,0.3)]">
              <div className="flex justify-between">
                <div className="w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-md" />
                <div className="w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-md" />
              </div>
              <div className="text-center font-mono text-[11px] font-black text-amber-300 uppercase tracking-widest bg-slate-900/60 py-1 px-3 rounded-full mx-auto backdrop-blur-xs">
                Scanning QR Code...
              </div>
              <div className="flex justify-between">
                <div className="w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-md" />
                <div className="w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-md" />
              </div>
            </div>

            {/* Camera Error Message */}
            {cameraError && (
              <div className="absolute inset-4 bg-slate-900/90 rounded-2xl p-6 flex flex-col items-center justify-center text-white space-y-3">
                <Camera className="w-8 h-8 text-amber-400" />
                <p className="text-xs text-slate-200 text-center max-w-xs">{cameraError}</p>
                <button
                  onClick={() => setActiveMethod('NAME_SEARCH')}
                  className="px-4 py-2 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs hover:bg-amber-400 transition"
                >
                  Use Name Search Instead
                </button>
              </div>
            )}

            {/* Camera Controls Overlay */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <button
                onClick={() => setCameraFacing(f => f === 'user' ? 'environment' : 'user')}
                className="p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl text-xs backdrop-blur-xs transition"
                title="Switch Camera (Front/Back)"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

          </div>

          {/* Quick Simulation / Test QR Trigger for Demonstration */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Quick Test Scanner (1-Tap Simulation):
            </span>
            <div className="flex flex-wrap items-center justify-center gap-1.5 max-h-24 overflow-y-auto">
              {workers.slice(0, 8).map(w => {
                const isClocked = todayAttendance.some(a => a.workerId === w.id);
                return (
                  <button
                    key={w.id}
                    onClick={() => handleQrTokenDetected(w.qrCodeToken)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 border ${
                      isClocked 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 opacity-60' 
                        : 'bg-slate-50 hover:bg-blue-50 text-slate-800 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    {isClocked ? <Check className="w-3 h-3 text-emerald-600" /> : <QrCode className="w-3 h-3 text-slate-400" />}
                    <span>{w.fullName}</span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* ---------------- METHOD 2: FIND & LIST NAMES (BACKUP 1 & ROSTER) ---------------- */}
      {activeMethod === 'NAME_SEARCH' && (
        <div className="max-w-3xl mx-auto bg-white border-2 border-slate-200 rounded-3xl p-6 shadow-lg space-y-5">
          
          <div className="text-center space-y-1">
            <h2 className="text-lg font-black text-slate-900 font-['Cinzel',serif] uppercase">
              Find or Select Your Name to Clock In
            </h2>
            <p className="text-xs text-slate-600">
              Type your name/phone above to search, or scroll down to find your name in the active roster below.
            </p>
          </div>

          {/* Big Search Input with Clear Button */}
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone number, or department..."
              className="w-full pl-12 pr-10 py-3.5 bg-slate-50 border-2 border-slate-300 focus:border-blue-900 rounded-2xl text-sm font-bold text-slate-900 focus:bg-white outline-hidden shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full"
              >
                Clear
              </button>
            )}
          </div>

          {/* Quick Department Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="font-bold text-slate-500 shrink-0 text-[11px] uppercase tracking-wider">Filter:</span>
            <button
              type="button"
              onClick={() => setSelectedDept('ALL')}
              className={`px-3 py-1 rounded-xl font-black text-xs transition shrink-0 cursor-pointer ${
                selectedDept === 'ALL'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Active ({activeWorkersList.length})
            </button>
            {uniqueDepartments.map(dept => {
              const count = activeWorkersList.filter(w => w.department === dept).length;
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => setSelectedDept(selectedDept === dept ? 'ALL' : dept)}
                  className={`px-3 py-1 rounded-xl font-bold text-xs transition shrink-0 cursor-pointer ${
                    selectedDept === dept
                      ? 'bg-blue-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {dept} ({count})
                </button>
              );
            })}
          </div>

          {/* Results & Full Active Roster */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs text-slate-500 font-bold border-b border-slate-200 pb-2">
              <span className="uppercase tracking-wider">
                {searchQuery.trim()
                  ? `Search Results (${matchingWorkers.length})`
                  : `Active Workers Name List (${matchingWorkers.length})`}
              </span>
              <span>1-Tap Clock In</span>
            </div>

            {matchingWorkers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <p className="font-bold">No active worker found matching "{searchQuery}".</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedDept('ALL');
                  }}
                  className="px-4 py-2 bg-blue-900 text-white rounded-xl text-xs font-bold"
                >
                  Show All Active Workers
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {matchingWorkers.map(w => {
                  const existing = todayAttendance.find(a => a.workerId === w.id);
                  return (
                    <div
                      key={w.id}
                      className="p-3.5 bg-slate-50 hover:bg-slate-100/90 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 transition"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-black text-slate-900 text-sm truncate">{w.fullName}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded font-bold text-[10px]">
                            {w.department}
                          </span>
                          {w.phone && (
                            <span className="font-mono text-[11px] text-slate-600">{w.phone}</span>
                          )}
                        </div>
                      </div>

                      {existing ? (
                        <div className="px-3 py-1.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          <span>Clocked In ({existing.clockInTime})</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => processWorkerClockIn(w, 'NAME_SEARCH')}
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Clock In Now</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ---------------- METHOD 3: DEPARTMENT QUICK ACCESS (BACKUP 2) ---------------- */}
      {activeMethod === 'DEPT_LIST' && (
        <div className="max-w-3xl mx-auto bg-white border-2 border-slate-200 rounded-3xl p-6 shadow-lg space-y-4">
          
          <div className="text-center space-y-1">
            <h2 className="text-lg font-black text-slate-900 font-['Cinzel',serif] uppercase">
              Select Your Department
            </h2>
            <p className="text-xs text-slate-600">
              Browse workers assigned to each church ministry for rapid roster clock-in.
            </p>
          </div>

          {/* Department Chips */}
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <button
              onClick={() => setSelectedDept('ALL')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
                selectedDept === 'ALL'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Departments ({workers.length})
            </button>
            {uniqueDepartments.map(dept => {
              const count = workers.filter(w => w.department === dept).length;
              return (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
                    selectedDept === dept
                      ? 'bg-blue-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {dept} ({count})
                </button>
              );
            })}
          </div>

          {/* Workers in selected department */}
          <div className="space-y-2 pt-3 max-h-96 overflow-y-auto">
            {matchingWorkers.map(w => {
              const existing = todayAttendance.find(a => a.workerId === w.id);
              return (
                <div
                  key={w.id}
                  className="p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 transition"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900 text-xs sm:text-sm">{w.fullName}</div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-blue-900">{w.department}</span>
                      {w.categories.slice(0, 2).map((c, i) => (
                        <span key={i} className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {existing ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{existing.clockInTime}</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => processWorkerClockIn(w, 'DEPT_QUICK_ACCESS')}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white rounded-xl text-xs font-black transition flex items-center gap-1 shadow-xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Clock In</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* ---------------- TODAY'S LIVE ATTENDANCE STREAM ---------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-900" />
            <h3 className="text-sm font-black text-slate-900 font-['Cinzel',serif] uppercase">
              Today's Live Clock-In Stream ({todayAttendance.length})
            </h3>
          </div>
          <button
            onClick={() => onNavigateToTab('DASHBOARD')}
            className="text-xs font-bold text-blue-900 hover:text-blue-700 flex items-center gap-1"
          >
            <span>View Full Attendance Monitor</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {todayAttendance.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
            No workers have clocked in yet for this service date. Scan QR codes or use search above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {todayAttendance.slice().reverse().map(att => (
              <div
                key={att.id}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="font-bold text-slate-900 text-xs truncate">{att.workerName}</div>
                  <div className="text-[10px] text-slate-500">{att.department} • {att.method}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs font-black text-slate-800">{att.clockInTime}</div>
                  <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                    att.isLate 
                      ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                      : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  }`}>
                    {att.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- CELEBRATION / WELCOME POPUP MODAL ---------------- */}
      {celebrationWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border-4 border-amber-400 text-center space-y-5 animate-scale-up">
            
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 border-2 border-emerald-300 text-emerald-800 mx-auto flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-emerald-600" />
            </div>

            <div className="space-y-2">
              <span className="inline-block px-3 py-1 bg-amber-100 text-amber-950 font-black text-xs uppercase tracking-wider rounded-full border border-amber-300">
                Attendance Recorded
              </span>
              <h2 className="text-2xl font-black text-slate-900 font-['Cinzel',serif]">
                Welcome to Church, {celebrationWorker.worker.fullName}!
              </h2>
              <p className="text-xs text-slate-600 font-medium">
                The Gospel Faith Mission International (House of Favour) appreciates your faithful service today.
              </p>
            </div>

            {/* Card details */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-left text-xs space-y-2 font-medium">
              <div className="flex justify-between">
                <span className="text-slate-500">Department:</span>
                <strong className="text-slate-900">{celebrationWorker.worker.department}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Clock-In Time:</span>
                <strong className="text-blue-900 font-mono">{celebrationWorker.record.clockInTime}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Punctuality Status:</span>
                <span className={`px-2.5 py-0.5 rounded-full font-black text-[10px] uppercase ${
                  celebrationWorker.record.isLate
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                }`}>
                  {celebrationWorker.record.status === 'LATE' ? 'Present (Late Arrival)' : 'Present (On Time)'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setCelebrationWorker(null)}
              className="w-full py-3.5 bg-blue-900 hover:bg-blue-800 text-white rounded-2xl text-sm font-black transition flex items-center justify-center gap-2 shadow-lg"
            >
              <span>Next Worker Scan</span>
              <ArrowRight className="w-4 h-4 text-amber-300" />
            </button>

          </div>
        </div>
      )}

      {/* ---------------- DUPLICATE WARNING MODAL ---------------- */}
      {duplicateWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border-2 border-amber-400 text-center space-y-5">
            
            <div className="w-16 h-16 rounded-2xl bg-amber-100 border-2 border-amber-300 text-amber-900 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-amber-600" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-black text-slate-900 font-['Cinzel',serif]">
                Already Clocked In Today!
              </h2>
              <p className="text-xs text-slate-600 font-medium">
                <strong>{duplicateWarning.worker.fullName}</strong> has already recorded attendance for this service.
              </p>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-1.5 text-slate-800 text-left">
              <div className="flex justify-between">
                <span className="text-slate-600">Recorded At:</span>
                <strong className="font-mono text-blue-900">{duplicateWarning.existingRecord.clockInTime}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Status:</span>
                <strong className="text-emerald-700">{duplicateWarning.existingRecord.status}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Method:</span>
                <span>{duplicateWarning.existingRecord.method}</span>
              </div>
            </div>

            <button
              onClick={() => setDuplicateWarning(null)}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black transition"
            >
              Acknowledge & Continue
            </button>

          </div>
        </div>
      )}

      {/* ---------------- SETTINGS MODAL ---------------- */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-5">
            
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-black text-slate-900 font-['Cinzel',serif]">
                Clock-In Terminal Configuration
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              
              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase tracking-wider">
                  Service Start Time (24hr / HH:MM)
                </label>
                <input
                  type="time"
                  value={editStartTime}
                  onChange={e => setEditStartTime(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-sm font-bold text-slate-900"
                />
                <p className="text-[11px] text-slate-500">Official scheduled commencement for church workers.</p>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase tracking-wider">
                  Late Grace Period (Minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={editGraceMins}
                  onChange={e => setEditGraceMins(Number(e.target.value))}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-sm font-bold text-slate-900"
                />
                <p className="text-[11px] text-slate-500">
                  Workers arriving after {editStartTime} + {editGraceMins}m are automatically flagged as LATE.
                </p>
              </div>

              <div className="pt-2 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editSound}
                    onChange={e => setEditSound(e.target.checked)}
                    className="rounded text-blue-900 w-4 h-4"
                  />
                  <span className="font-bold text-slate-800">Play Audio Chime on Scan</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editCelebration}
                    onChange={e => setEditCelebration(e.target.checked)}
                    className="rounded text-blue-900 w-4 h-4"
                  />
                  <span className="font-bold text-slate-800">Trigger Confetti & Welcome Message</span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl font-black"
                >
                  Save Settings
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
