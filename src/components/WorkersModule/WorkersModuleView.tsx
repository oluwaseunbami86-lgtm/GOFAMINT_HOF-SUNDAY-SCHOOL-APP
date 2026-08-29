import React, { useState, useEffect, useCallback } from 'react';
import { 
  WorkerProfile, 
  WorkerAttendanceRecord, 
  WorkerPrepAttendanceRecord, 
  ClockInConfig, 
  WorkerCategoryDef,
  SundaySchoolYear,
  QuarterNumber,
  AdminProfile
} from '../../types';
import { 
  getAllWorkers, 
  saveWorker, 
  deleteWorker, 
  saveBulkWorkers, 
  getAllWorkerAttendance, 
  recordWorkerAttendance, 
  recordBulkWorkerAttendance,
  getAllWorkerPrepAttendance, 
  recordWorkerPrepAttendance, 
  recordBulkWorkerPrepAttendance,
  getClockInConfig, 
  saveClockInConfig, 
  getAllWorkerCategories, 
  saveWorkerCategory,
  deleteWorkerCategory,
  getAllDepartmentsList,
  addDepartmentToYear,
  getSundaySchoolYear,
  getAllAdminProfiles,
  saveAdminProfile
} from '../../db/indexedDB';
import { 
  DEFAULT_WORKERS_SEED, 
  DEFAULT_WORKER_CATEGORIES, 
  DEFAULT_CLOCK_IN_CONFIG 
} from '../../data/mockWorkersData';
import { INITIAL_SUNDAY_SCHOOL_YEAR } from '../../data/mockQuarterLessons';

import { WorkersDirectoryView } from './WorkersDirectoryView';
import { SundayClockInKiosk } from './SundayClockInKiosk';
import { PreparatoryAttendanceView } from './PreparatoryAttendanceView';
import { WorkerMyAttendanceView } from './WorkerMyAttendanceView';
import { WorkersDashboardView } from './WorkersDashboardView';
import { QuarterPunctualityAdmonitionView } from './QuarterPunctualityAdmonitionView';
import { SpecialEventsView } from './SpecialEventsView';

import { WorkerProfileModal } from './WorkerProfileModal';
import { BulkWorkerImportModal } from './BulkWorkerImportModal';
import { WorkerQrPassModal } from './WorkerQrPassModal';

import { 
  Users, QrCode, BookOpen, Layers, UserCheck, 
  BarChart3, Plus, Upload, Sparkles, ArrowLeft,
  Lock, KeyRound, ShieldAlert, LogOut, Eye, EyeOff, CheckCircle2,
  Trophy, Calendar
} from 'lucide-react';
import { GofamintLogo } from '../GofamintLogo';

export type WorkersModuleTab = 
  | 'DIRECTORY' 
  | 'SUNDAY_CLOCK_IN' 
  | 'PREP_ATTENDANCE' 
  | 'SPECIAL_EVENTS'
  | 'ADMONITION_HONORS' 
  | 'MY_ATTENDANCE' 
  | 'DASHBOARD';

interface WorkersModuleViewProps {
  onBackToMain?: () => void;
  onBack?: () => void;
}

export const WorkersModuleView: React.FC<WorkersModuleViewProps> = ({
  onBackToMain,
  onBack
}) => {
  const handleExit = onBack || onBackToMain;
  const [activeTab, setActiveTab] = useState<WorkersModuleTab>('DASHBOARD');
  
  // Workers Admin Authentication Gate State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('gofamint_workers_admin_auth') === 'true';
  });
  const [adminProfiles, setAdminProfiles] = useState<AdminProfile[]>([]);
  const [authViewMode, setAuthViewMode] = useState<'LOGIN' | 'CLAIM_SPOT' | 'CHANGE_PASSWORD'>('LOGIN');
  
  // Login input state
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [showPasswordText, setShowPasswordText] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessNotice, setAuthSuccessNotice] = useState<string | null>(null);

  // Claim Spot form state
  const [claimName, setClaimName] = useState<string>('');
  const [claimPassword, setClaimPassword] = useState<string>('');
  const [claimConfirmPassword, setClaimConfirmPassword] = useState<string>('');
  const [showClaimPasswordText, setShowClaimPasswordText] = useState<boolean>(false);

  // Change Password form state
  const [currentPasswordInput, setCurrentPasswordInput] = useState<string>('');
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState<string>('');

  // Data State
  const [workers, setWorkers] = useState<WorkerProfile[]>([]);
  const [categories, setCategories] = useState<WorkerCategoryDef[]>([]);
  const [sundayAttendance, setSundayAttendance] = useState<WorkerAttendanceRecord[]>([]);
  const [prepAttendance, setPrepAttendance] = useState<WorkerPrepAttendanceRecord[]>([]);
  const [config, setConfig] = useState<ClockInConfig>(DEFAULT_CLOCK_IN_CONFIG);
  const [sundaySchoolYear, setSundaySchoolYear] = useState<SundaySchoolYear>(INITIAL_SUNDAY_SCHOOL_YEAR);
  const [selectedAdmonitionQuarter, setSelectedAdmonitionQuarter] = useState<QuarterNumber>(1);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<WorkerProfile | null>(null);

  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  
  const [isQrPassModalOpen, setIsQrPassModalOpen] = useState(false);
  const [selectedPassWorker, setSelectedPassWorker] = useState<WorkerProfile | null>(null);

  const [adminDepartments, setAdminDepartments] = useState<string[]>([]);

  // Load all initial data from IndexedDB
  const refreshAllData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [
        loadedWorkers,
        loadedCats,
        loadedSundayAtt,
        loadedPrepAtt,
        loadedConfig,
        loadedDepts,
        loadedYear,
        loadedProfiles
      ] = await Promise.all([
        getAllWorkers(),
        getAllWorkerCategories(),
        getAllWorkerAttendance(),
        getAllWorkerPrepAttendance(),
        getClockInConfig(),
        getAllDepartmentsList(),
        getSundaySchoolYear(),
        getAllAdminProfiles()
      ]);

      setWorkers(loadedWorkers);
      setCategories(loadedCats);
      setSundayAttendance(loadedSundayAtt);
      setPrepAttendance(loadedPrepAtt);
      setConfig(loadedConfig);
      setAdminDepartments(loadedDepts);
      setAdminProfiles(loadedProfiles);

      const asstGsec = loadedProfiles.find(p => p.roleType === 'ASST_GENERAL_SECRETARY');
      if (!asstGsec) {
        setAuthViewMode('CLAIM_SPOT');
      }

      if (loadedYear) {
        setSundaySchoolYear(loadedYear);
        setSelectedAdmonitionQuarter(loadedYear.activeQuarterNumber || 1);
      }
    } catch (err) {
      console.error('Error loading workers module data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  const asstGsecProfile = adminProfiles.find(p => p.roleType === 'ASST_GENERAL_SECRETARY');
  const gsProfile = adminProfiles.find(p => p.roleType === 'GENERAL_SUPERINTENDENT');
  const gsecProfile = adminProfiles.find(p => p.roleType === 'GENERAL_SECRETARY');

  // Distinct departments (Strictly 4 recognized: Adult, Youth, Teenagers, Children + any custom added ones)
  const legacyDeptsToRemove = new Set([
    'Sunday School', 'Ministers Council', 'Choir', 'Youth Ministry', 'Good Women', 'Men Fellowship',
    'Evangelism Board', 'Ushering Unit', 'Prayer Band', 'Sanctuary Keepers', 'Welfare Board',
    'Media & Technical Unit', 'Young Adults', 'Teens', 'Elders', 'Searchers / Believers',
    'Follow-Up Unit', 'Protocol Unit', 'Music Ministry', 'Christian Education', 'ADMIN', 'ADULT', 'YOUTH', 'TEENS', 'CHILDREN'
  ]);

  const departmentsList = Array.from(
    new Set([
      'Adult',
      'Youth',
      'Teenagers',
      'Children',
      ...adminDepartments.filter(d => !legacyDeptsToRemove.has(d)),
      ...workers.map(w => w.department).filter(d => !legacyDeptsToRemove.has(d))
    ].filter(Boolean))
  );

  // Claim Spot Handler for Assistant General Secretary
  const handleClaimSpotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessNotice(null);

    if (!claimName.trim()) {
      setAuthError('Please enter your full profile name (e.g. Sis. Blessing Alabi).');
      return;
    }
    if (claimPassword.length < 4) {
      setAuthError('Password must be at least 4 characters long.');
      return;
    }
    if (claimPassword !== claimConfirmPassword) {
      setAuthError('Passwords do not match. Please re-enter.');
      return;
    }

    const newProfile: AdminProfile = {
      id: 'ASST_GENERAL_SECRETARY',
      roleType: 'ASST_GENERAL_SECRETARY',
      title: 'Assistant General Secretary ID',
      profileName: claimName.trim(),
      username: 'asst_gsec_admin',
      passwordHash: claimPassword,
      isApproved: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await saveAdminProfile(newProfile);
    const updatedProfiles = await getAllAdminProfiles();
    setAdminProfiles(updatedProfiles);

    setIsAuthenticated(true);
    sessionStorage.setItem('gofamint_workers_admin_auth', 'true');
    setClaimName('');
    setClaimPassword('');
    setClaimConfirmPassword('');
    setAuthError(null);
    setAuthSuccessNotice(`Spot claimed successfully! Logged in as ${newProfile.profileName} (Assistant General Secretary).`);
    setActiveTab('DASHBOARD');
  };

  // Password Authentication Handler based on Assistant General Secretary's Password
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const input = adminPasswordInput.trim();
    if (!input) {
      setAuthError('Please enter your password.');
      return;
    }

    // Check Assistant General Secretary password
    const isAsstGsecMatch = asstGsecProfile && asstGsecProfile.passwordHash === input;
    // Check fallback admin passwords (GS, GSec, default)
    const isGsMatch = gsProfile && gsProfile.passwordHash === input;
    const isGsecMatch = gsecProfile && gsecProfile.passwordHash === input;
    const isDefaultMatch = ['admin123', 'workers123', 'gofamint123', 'admin'].includes((input || '').toLowerCase());

    if (isAsstGsecMatch || isGsMatch || isGsecMatch || isDefaultMatch) {
      setIsAuthenticated(true);
      sessionStorage.setItem('gofamint_workers_admin_auth', 'true');
      setAdminPasswordInput('');
      setActiveTab('DASHBOARD');
    } else {
      setAuthError(
        asstGsecProfile
          ? `Incorrect password for Assistant General Secretary (${asstGsecProfile.profileName}). Please enter the password configured for this spot.`
          : 'Invalid Workers Admin password. Please check your credentials.'
      );
    }
  };

  // Change Password Handler
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessNotice(null);

    if (!asstGsecProfile) {
      setAuthError('No Assistant General Secretary profile found to update.');
      return;
    }

    const isCurrentValid = 
      currentPasswordInput === asstGsecProfile.passwordHash ||
      ['admin123', 'workers123', 'gofamint123'].includes((currentPasswordInput || '').toLowerCase());

    if (!isCurrentValid) {
      setAuthError('Current password does not match.');
      return;
    }

    if (newPasswordInput.length < 4) {
      setAuthError('New password must be at least 4 characters long.');
      return;
    }

    if (newPasswordInput !== confirmNewPasswordInput) {
      setAuthError('New passwords do not match.');
      return;
    }

    const updated: AdminProfile = {
      ...asstGsecProfile,
      passwordHash: newPasswordInput,
      updatedAt: new Date().toISOString()
    };

    await saveAdminProfile(updated);
    const updatedProfiles = await getAllAdminProfiles();
    setAdminProfiles(updatedProfiles);
    setAuthSuccessNotice('Assistant General Secretary password updated successfully! Please log in with your new password.');
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmNewPasswordInput('');
    setAuthViewMode('LOGIN');
  };

  const handleAdminLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('gofamint_workers_admin_auth');
    setAdminPasswordInput('');
    setAuthError(null);
  };

  // Handlers for Worker Profiles
  const handleOpenAddWorker = () => {
    setEditingWorker(null);
    setIsProfileModalOpen(true);
  };

  const handleOpenEditWorker = (worker: WorkerProfile) => {
    setEditingWorker(worker);
    setIsProfileModalOpen(true);
  };

  const handleSaveWorkerProfile = async (workerData: WorkerProfile) => {
    await saveWorker(workerData);
    await refreshAllData();
  };

  const handleDeleteWorker = async (id: string) => {
    await deleteWorker(id);
    await refreshAllData();
  };

  const handleSaveBulkWorkers = async (newWorkers: WorkerProfile[]) => {
    await saveBulkWorkers(newWorkers);
    await refreshAllData();
  };

  // Handlers for QR Pass
  const handleOpenQrPass = (worker: WorkerProfile) => {
    setSelectedPassWorker(worker);
    setIsQrPassModalOpen(true);
  };

  // Handlers for Sunday Attendance
  const handleSundayClockIn = async (record: WorkerAttendanceRecord) => {
    await recordWorkerAttendance(record);
    const updated = await getAllWorkerAttendance();
    setSundayAttendance(updated);
  };

  const handleSaveSundayBulkRecords = async (records: WorkerAttendanceRecord[]) => {
    await recordBulkWorkerAttendance(records);
    const updated = await getAllWorkerAttendance();
    setSundayAttendance(updated);
  };

  const handleUpdateConfig = async (newConfig: ClockInConfig) => {
    await saveClockInConfig(newConfig);
    setConfig(newConfig);
  };

  // Handlers for Preparatory Attendance
  const handleSavePrepRecord = async (record: WorkerPrepAttendanceRecord) => {
    await recordWorkerPrepAttendance(record);
    const updated = await getAllWorkerPrepAttendance();
    setPrepAttendance(updated);
  };

  const handleSaveBulkPrepRecords = async (records: WorkerPrepAttendanceRecord[]) => {
    await recordBulkWorkerPrepAttendance(records);
    const updated = await getAllWorkerPrepAttendance();
    setPrepAttendance(updated);
  };

  const handleAddNewDepartment = async (deptName: string) => {
    await addDepartmentToYear(deptName);
    await refreshAllData();
  };

  // If Not Authenticated, Show Immediate Password Gate for Workers Admin
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-950 via-blue-950 to-slate-900 flex flex-col justify-between text-white p-4 sm:p-6 font-sans">
        
        {/* Top bar */}
        <div className="max-w-4xl w-full mx-auto flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <GofamintLogo size={36} />
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                GOFAMINT_HOF National
              </span>
              <h2 className="text-sm font-black font-['Cinzel',serif] text-slate-100">
                Workers Directorate & Clock-In Platform
              </h2>
            </div>
          </div>

          {handleExit && (
            <button
              type="button"
              onClick={handleExit}
              className="px-3.5 py-2 bg-slate-800/90 hover:bg-slate-700 text-amber-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-amber-400" />
              <span>Back to Portal</span>
            </button>
          )}
        </div>

        {/* Center Card */}
        <div className="max-w-md w-full mx-auto my-auto bg-slate-900/95 backdrop-blur-md rounded-3xl border-2 border-amber-500/40 p-6 sm:p-8 shadow-2xl space-y-6">
          
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center mx-auto text-amber-400 shadow-inner">
              <Lock className="w-7 h-7" />
            </div>

            <div className="flex items-center justify-center gap-2">
              <span className="inline-block px-3 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-[10px] font-black uppercase tracking-wider">
                Workers Directorate Security
              </span>
              {asstGsecProfile && (
                <span className="inline-block px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-bold">
                  Spot Claimed
                </span>
              )}
            </div>

            <h2 className="text-xl font-black font-['Cinzel',serif] text-white tracking-wide">
              {authViewMode === 'CLAIM_SPOT'
                ? 'Claim Spot: Asst. General Secretary'
                : authViewMode === 'CHANGE_PASSWORD'
                ? 'Update Asst. Gen. Sec. Password'
                : 'Workers Directorate Login'}
            </h2>
            <p className="text-xs text-slate-300">
              {authViewMode === 'CLAIM_SPOT'
                ? 'Set up your Assistant General Secretary profile and create your Directorate master password.'
                : authViewMode === 'CHANGE_PASSWORD'
                ? 'Enter current credentials to establish a new password for the Workers Directorate.'
                : asstGsecProfile
                ? `Enter the password configured by Assistant General Secretary (${asstGsecProfile.profileName}).`
                : 'Please verify your password to open the Sunday School Workers Directorate.'}
            </p>
          </div>

          {/* Feedback Notices */}
          {authError && (
            <div className="p-3.5 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-center gap-2.5 text-xs text-rose-300">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authSuccessNotice && (
            <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{authSuccessNotice}</span>
            </div>
          )}

          {/* MODE 1: CLAIM SPOT AS ASSISTANT GENERAL SECRETARY */}
          {authViewMode === 'CLAIM_SPOT' && (
            <form onSubmit={handleClaimSpotSubmit} className="space-y-4">
              <div className="bg-blue-950/60 border border-blue-800/60 rounded-2xl p-3.5 space-y-1">
                <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>Permanent Role Assignment</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  As the Assistant General Secretary, claim this spot to establish the official password for the Workers Directorate.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  Officer Full Name
                </label>
                <input
                  type="text"
                  value={claimName}
                  onChange={e => setClaimName(e.target.value)}
                  placeholder="e.g. Sis. Blessing Alabi"
                  className="w-full bg-slate-950/80 border border-slate-700 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-hidden"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Create Password</span>
                  <span className="text-[10px] text-slate-400">Min 4 characters</span>
                </label>
                <div className="relative">
                  <input
                    type={showClaimPasswordText ? 'text' : 'password'}
                    value={claimPassword}
                    onChange={e => setClaimPassword(e.target.value)}
                    placeholder="Enter new password..."
                    className="w-full bg-slate-950/80 border border-slate-700 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-hidden font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowClaimPasswordText(!showClaimPasswordText)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showClaimPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  Confirm Password
                </label>
                <input
                  type={showClaimPasswordText ? 'text' : 'password'}
                  value={claimConfirmPassword}
                  onChange={e => setClaimConfirmPassword(e.target.value)}
                  placeholder="Re-enter password..."
                  className="w-full bg-slate-950/80 border border-slate-700 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-hidden font-mono"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-linear-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Claim Spot & Set Password</span>
              </button>

              {asstGsecProfile && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError(null);
                      setAuthViewMode('LOGIN');
                    }}
                    className="text-xs text-amber-400 hover:underline cursor-pointer"
                  >
                    Return to Login with Existing Password
                  </button>
                </div>
              )}
            </form>
          )}

          {/* MODE 2: STANDARD LOGIN WITH ASST GEN SEC PASSWORD */}
          {authViewMode === 'LOGIN' && (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              {asstGsecProfile && (
                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                      Assigned Officer
                    </span>
                    <span className="text-xs font-bold text-white">
                      {asstGsecProfile.profileName}
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-blue-900/80 text-amber-300 rounded-lg font-bold">
                    Asst. Gen. Sec
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Assistant Gen. Sec. Password</span>
                  <span className="text-[10px] text-slate-400">Password-Protected</span>
                </label>

                <div className="relative">
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    value={adminPasswordInput}
                    onChange={e => setAdminPasswordInput(e.target.value)}
                    placeholder="Enter password..."
                    className="w-full bg-slate-950/80 border border-slate-700 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-hidden font-mono tracking-wider"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-linear-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>Verify & Unlock Directorate</span>
              </button>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    setAuthSuccessNotice(null);
                    setAuthViewMode('CHANGE_PASSWORD');
                  }}
                  className="text-slate-400 hover:text-amber-300 transition cursor-pointer"
                >
                  Change Password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    setAuthSuccessNotice(null);
                    setAuthViewMode('CLAIM_SPOT');
                  }}
                  className="text-amber-400 hover:underline transition cursor-pointer"
                >
                  {asstGsecProfile ? 'Reclaim / Switch Officer' : 'Claim Spot as Asst. Gen. Sec.'}
                </button>
              </div>
            </form>
          )}

          {/* MODE 3: CHANGE PASSWORD */}
          {authViewMode === 'CHANGE_PASSWORD' && (
            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPasswordInput}
                  onChange={e => setCurrentPasswordInput(e.target.value)}
                  placeholder="Enter current password..."
                  className="w-full bg-slate-950/80 border border-slate-700 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-hidden font-mono"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  New Password (Min 4 chars)
                </label>
                <input
                  type="password"
                  value={newPasswordInput}
                  onChange={e => setNewPasswordInput(e.target.value)}
                  placeholder="Enter new password..."
                  className="w-full bg-slate-950/80 border border-slate-700 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-hidden font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmNewPasswordInput}
                  onChange={e => setConfirmNewPasswordInput(e.target.value)}
                  placeholder="Re-enter new password..."
                  className="w-full bg-slate-950/80 border border-slate-700 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-hidden font-mono"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-linear-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save New Password</span>
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    setAuthViewMode('LOGIN');
                  }}
                  className="text-xs text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancel & Return to Login
                </button>
              </div>
            </form>
          )}

          <div className="text-center pt-2 border-t border-slate-800 text-[11px] text-slate-400">
            Governed by the Assistant General Secretary & Workers Directorate.
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="text-center text-xs text-slate-500 py-2">
          The Gospel Faith Mission International (House of Favour) • Sunday School & Workers Directorate Engine
        </div>

      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-900 selection:text-white">
      
      {/* Top Header Navigation */}
      <header className="bg-slate-900 text-white border-b-2 border-amber-500 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Brand & Exit */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GofamintLogo size={36} />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                    GOFAMINT_HOF National
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500 text-white rounded-full font-bold">
                    Authenticated
                  </span>
                  {asstGsecProfile && (
                    <span className="text-[9px] px-1.5 py-0.2 bg-blue-800 text-amber-300 rounded-full font-bold">
                      👤 {asstGsecProfile.profileName} (Asst. Gen. Sec)
                    </span>
                  )}
                </div>
                <h1 className="text-base font-black font-['Cinzel',serif] text-slate-100">
                  Sunday School Workers Directorate
                </h1>
              </div>
            </div>

            {/* Mobile Exit Button */}
            <div className="flex md:hidden items-center gap-2">
              <button
                onClick={handleAdminLogout}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs transition"
                title="Lock Session"
              >
                <LogOut className="w-4 h-4" />
              </button>
              {handleExit && (
                <button
                  onClick={handleExit}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl text-xs font-bold transition flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Portal</span>
                </button>
              )}
            </div>
          </div>

          {/* Action Links & Session Lock */}
          <div className="hidden md:flex items-center gap-3">
            {asstGsecProfile && (
              <div className="px-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-amber-300 font-bold">Officer:</span>
                <span>{asstGsecProfile.profileName}</span>
              </div>
            )}

            <button
              onClick={handleAdminLogout}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-amber-400" />
              <span>Lock Directorate</span>
            </button>

            {handleExit && (
              <button
                onClick={handleExit}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Portal</span>
              </button>
            )}
          </div>

        </div>

        {/* Sub-Navigation Tabs */}
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 border-t border-slate-800 bg-slate-950/60 overflow-x-auto">
          <div className="flex items-center gap-1 py-1.5 min-w-max">
            
            <button
              onClick={() => setActiveTab('DASHBOARD')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'DASHBOARD'
                  ? 'bg-blue-900 text-white shadow-xs font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
              <span>Executive Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('DIRECTORY')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'DIRECTORY'
                  ? 'bg-blue-900 text-white shadow-xs font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>Workers Directory</span>
            </button>

            <button
              onClick={() => setActiveTab('SUNDAY_CLOCK_IN')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'SUNDAY_CLOCK_IN'
                  ? 'bg-emerald-700 text-white shadow-xs font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <QrCode className="w-3.5 h-3.5 text-amber-300" />
              <span>Sunday Clock-In Terminal</span>
            </button>

            <button
              onClick={() => setActiveTab('PREP_ATTENDANCE')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'PREP_ATTENDANCE'
                  ? 'bg-blue-900 text-white shadow-xs font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Thursday Preparatory Class / Sunday Attendance</span>
            </button>

            <button
              onClick={() => setActiveTab('SPECIAL_EVENTS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'SPECIAL_EVENTS'
                  ? 'bg-blue-900 text-white shadow-xs font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Special Events & Training</span>
            </button>

            <button
              onClick={() => setActiveTab('ADMONITION_HONORS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'ADMONITION_HONORS'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                  : 'text-amber-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>12-Week Punctuality Honors & Admonition</span>
            </button>

            <button
              onClick={() => setActiveTab('MY_ATTENDANCE')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'MY_ATTENDANCE'
                  ? 'bg-blue-900 text-white shadow-xs font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>My Worker Pass</span>
            </button>

          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8">
        {isLoading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-blue-900 border-t-amber-400 rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-bold">
              Loading GOFAMINT_HOF Workers Directory & Records...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'DASHBOARD' && (
              <WorkersDashboardView
                workers={workers}
                sundayAttendance={sundayAttendance}
                prepAttendance={prepAttendance}
                departmentsList={departmentsList}
                config={config}
                sundaySchoolYear={sundaySchoolYear}
                onNavigateToTab={setActiveTab}
                onViewQrPass={handleOpenQrPass}
                onSaveSundayAttendance={handleSaveSundayBulkRecords}
                onSavePrepAttendance={handleSaveBulkPrepRecords}
              />
            )}

            {activeTab === 'DIRECTORY' && (
              <WorkersDirectoryView
                workers={workers}
                categoriesList={categories}
                departmentsList={departmentsList}
                onAddWorker={handleOpenAddWorker}
                onBulkImport={() => setIsBulkImportOpen(true)}
                onEditWorker={handleOpenEditWorker}
                onDeleteWorker={handleDeleteWorker}
                onSaveWorkerProfile={handleSaveWorkerProfile}
                onViewQrPass={handleOpenQrPass}
                onQuickClockIn={(worker) => {
                  setActiveTab('SUNDAY_CLOCK_IN');
                }}
                onNavigateToTab={setActiveTab}
              />
            )}

            {activeTab === 'SUNDAY_CLOCK_IN' && (
              <SundayClockInKiosk
                workers={workers}
                todayAttendance={sundayAttendance.filter(a => a.serviceDate === (config.serviceDate || new Date().toISOString().split('T')[0]))}
                config={config}
                onClockIn={handleSundayClockIn}
                onUpdateConfig={handleUpdateConfig}
                onNavigateToTab={setActiveTab}
              />
            )}

            {activeTab === 'PREP_ATTENDANCE' && (
              <PreparatoryAttendanceView
                workers={workers}
                prepRecords={prepAttendance}
                sundayAttendance={sundayAttendance}
                departmentsList={departmentsList}
                config={config}
                sundaySchoolYear={sundaySchoolYear}
                onSavePrepRecord={handleSavePrepRecord}
                onSaveBulkPrepRecords={handleSaveBulkPrepRecords}
                onSaveSundayRecord={handleSundayClockIn}
                onSaveBulkSundayRecords={handleSaveSundayBulkRecords}
                onNavigateToTab={setActiveTab}
              />
            )}

            {activeTab === 'SPECIAL_EVENTS' && (
              <SpecialEventsView
                workers={workers}
                onViewQrPass={handleOpenQrPass}
              />
            )}

            {activeTab === 'ADMONITION_HONORS' && (
              <QuarterPunctualityAdmonitionView
                workers={workers}
                sundayAttendance={sundayAttendance}
                prepAttendance={prepAttendance}
                sundaySchoolYear={sundaySchoolYear}
                selectedQuarterNumber={selectedAdmonitionQuarter}
                onSelectQuarter={setSelectedAdmonitionQuarter}
                onSaveWorkerProfile={handleSaveWorkerProfile}
                onDeleteWorker={handleDeleteWorker}
              />
            )}

            {activeTab === 'MY_ATTENDANCE' && (
              <WorkerMyAttendanceView
                workers={workers}
                sundayAttendance={sundayAttendance}
                prepAttendance={prepAttendance}
                onViewQrPass={handleOpenQrPass}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p className="font-bold text-slate-700">
          The Gospel Faith Mission International (House of Favour) (GOFAMINT_HOF) — Dedicated Workers Directorate Module
        </p>
        <p className="text-[11px] text-slate-400 mt-1">
          High-throughput Sunday Service QR Clock-In • Thursday Preparatory Class Roster • Pastoral Care
        </p>
      </footer>

      {/* Worker Profile Modal (Add/Edit) */}
      <WorkerProfileModal
        isOpen={isProfileModalOpen}
        worker={editingWorker}
        categoriesList={categories}
        departmentsList={departmentsList}
        sundaySchoolYear={sundaySchoolYear}
        sundayAttendance={sundayAttendance}
        prepAttendance={prepAttendance}
        onClose={() => setIsProfileModalOpen(false)}
        onSave={handleSaveWorkerProfile}
        onSaveSundayAttendance={handleSaveSundayBulkRecords}
        onSavePrepAttendance={handleSaveBulkPrepRecords}
        onAddNewDepartment={handleAddNewDepartment}
      />

      {/* Bulk Worker Import Modal */}
      <BulkWorkerImportModal
        isOpen={isBulkImportOpen}
        existingWorkers={workers}
        categoriesList={categories}
        departmentsList={departmentsList}
        onClose={() => setIsBulkImportOpen(false)}
        onSaveBulk={handleSaveBulkWorkers}
        onImportSuccess={handleSaveBulkWorkers}
      />

      {/* Worker Official QR Pass Modal */}
      <WorkerQrPassModal
        isOpen={isQrPassModalOpen}
        worker={selectedPassWorker}
        onClose={() => setIsQrPassModalOpen(false)}
        onQuickClockIn={(worker) => {
          setActiveTab('SUNDAY_CLOCK_IN');
        }}
      />

    </div>
  );
};
