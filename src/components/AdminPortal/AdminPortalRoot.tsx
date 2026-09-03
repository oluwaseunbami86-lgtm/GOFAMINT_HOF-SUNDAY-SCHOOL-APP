import React, { useState, useEffect } from 'react';
import {
  Shield,
  Crown,
  FileSpreadsheet,
  Coins,
  UserCheck,
  Briefcase,
  Lock,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  UserPlus,
  LogIn,
  KeyRound,
  LogOut,
  Camera,
  Check,
  Clock,
  Sparkles,
  Users,
  ClipboardList,
  BookCheck,
  Info,
  Download,
  Upload,
  Database,
  Trash2,
  Archive
} from 'lucide-react';
import { GofamintLogo } from '../GofamintLogo';
import { YearArchivesView } from './YearArchivesView';
import {
  AdminProfile,
  AdminRoleType,
  SundaySchoolYear,
  QuarterNumber,
  ClassProfile
} from '../../types';
import { PERMITTED_ADMIN_IDS } from '../../data/mockQuarterLessons';
import {
  getAllAdminProfiles,
  saveAdminProfile,
  approveAdminProfile,
  getSundaySchoolYear,
  saveSundaySchoolYear,
  distributeQuarterLessonsToClasses,
  archiveQuarterAndActivateNext,
  getAllClassesDirectory,
  approveClassById,
  addDepartmentToYear,
  updateDepartmentNameInYear,
  deleteDepartmentFromYear,
  putInStore
} from '../../db/indexedDB';
import { subscribeToCollection } from '../../services/firestoreDatabase';
import { GeneralSuperintendentView } from './GeneralSuperintendentView';
import { CloudUserManagementPanel } from './CloudUserManagementPanel';
import { GeneralSecretaryView } from './GeneralSecretaryView';
import { TreasurerView } from './TreasurerView';
import { RecordOfficerView } from './RecordOfficerView';
import { EnrollmentOfficerView } from './EnrollmentOfficerView';
import { AsstGeneralSecretaryView } from './AsstGeneralSecretaryView';
import { DatabaseBackupModal } from '../DatabaseBackupModal';

interface AdminPortalRootProps {
  onBackToPortalSelect: () => void;
  onEnterClassRegister?: () => void;
  onEnterWorkersModule?: () => void;
  // When provided, this admin is already authenticated via a real Firebase
  // Auth account with a `users/{uid}` role doc (created through User
  // Management, not the legacy local claim/password system) — so the local
  // claim/sign-in screen is skipped entirely and this role is used directly.
  // Undefined/omitted preserves the exact original behavior for any admin
  // who doesn't yet have a `users/{uid}` doc (legacy local-password access).
  firebaseUserRole?: { roleType: AdminRoleType; displayName: string };
}

export const AdminPortalRoot: React.FC<AdminPortalRootProps> = ({
  onBackToPortalSelect,
  onEnterClassRegister,
  onEnterWorkersModule,
  firebaseUserRole
}) => {
  const [adminProfiles, setAdminProfiles] = useState<AdminProfile[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState<AdminProfile | null>(() => {
    if (!firebaseUserRole) return null;
    const now = new Date().toISOString();
    return {
      id: firebaseUserRole.roleType,
      roleType: firebaseUserRole.roleType,
      title: firebaseUserRole.roleType.replace(/_/g, ' '),
      profileName: firebaseUserRole.displayName || firebaseUserRole.roleType.replace(/_/g, ' '),
      username: firebaseUserRole.roleType.toLowerCase(),
      passwordHash: '',
      isApproved: true,
      createdAt: now,
      updatedAt: now
    };
  });
  const [sundaySchoolYear, setSundaySchoolYear] = useState<SundaySchoolYear | null>(null);
  const [allClasses, setAllClasses] = useState<ClassProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showYearArchives, setShowYearArchives] = useState(false);

  // Data Backup / Restore Modal State
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupModalTab, setBackupModalTab] = useState<'SAVE' | 'LOAD' | 'RESET'>('SAVE');

  // Profile Switching Authentication State
  const [switchTargetProfile, setSwitchTargetProfile] = useState<AdminProfile | null>(null);
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchError, setSwitchError] = useState<string | null>(null);

  // Sign In / Create Profile Navigation
  const [authMode, setAuthMode] = useState<'EXISTING_PROFILE' | 'CREATE_PROFILE' | 'CLAIM_SPOT'>('EXISTING_PROFILE');

  // Claim Spot Form State (Foundational Claiming)
  const [claimingRole, setClaimingRole] = useState<'GENERAL_SUPERINTENDENT' | 'GENERAL_SECRETARY'>('GENERAL_SUPERINTENDENT');
  const [claimName, setClaimName] = useState('');
  const [claimPassword, setClaimPassword] = useState('');
  const [claimConfirmPassword, setClaimConfirmPassword] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  // Sign In Form State
  const [selectedSignInId, setSelectedSignInId] = useState<AdminRoleType>('GENERAL_SUPERINTENDENT');
  const [signInPassword, setSignInPassword] = useState('');
  const [signInError, setSignInError] = useState<string | null>(null);

  // Create Profile Form State (Secondary Roles)
  const [selectedRoleId, setSelectedRoleId] = useState<AdminRoleType>('TREASURER');
  const [profileName, setProfileName] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccessNotice, setCreateSuccessNotice] = useState<string | null>(null);

  // Refresh and load all data from IndexedDB
  const refreshAdminData = async () => {
    try {
      const profiles = await getAllAdminProfiles();
      const year = await getSundaySchoolYear();
      const classes = await getAllClassesDirectory();

      applyAdminProfiles(profiles);
      setSundaySchoolYear(year);
      setAllClasses(classes);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Shared by the initial local-cache load above AND the real-time
  // `adminProfiles` listener below, so "does GS/GSec still need to claim
  // their office" is always evaluated the same way regardless of source.
  const applyAdminProfiles = (profiles: AdminProfile[]) => {
    setAdminProfiles(profiles);
    const isGS = profiles.some(p => p.roleType === 'GENERAL_SUPERINTENDENT');
    const isGSec = profiles.some(p => p.roleType === 'GENERAL_SECRETARY');

    if (!isGS || !isGSec) {
      setAuthMode('CLAIM_SPOT');
      if (!isGS) {
        setClaimingRole('GENERAL_SUPERINTENDENT');
      } else if (!isGSec) {
        setClaimingRole('GENERAL_SECRETARY');
      }
    } else {
      setAuthMode((prev) => (prev === 'CLAIM_SPOT' ? 'EXISTING_PROFILE' : prev));
    }
  };

  useEffect(() => {
    refreshAdminData();
  }, []);

  // -------------------------------------------------------------------
  // REAL-TIME "NEEDS YOUR APPROVAL" SYNC — a class registering (pending
  // GS/GSec approval) or an officer claiming a role (pending isApproved)
  // now appears on this screen within about a second, on whichever
  // admin device happens to be open, instead of only refreshing after a
  // manual action or a page reload. Local cache is kept warm too
  // (skipCloudMirror=true — this data just came FROM the cloud).
  // -------------------------------------------------------------------
  useEffect(() => {
    const unsubClasses = subscribeToCollection<ClassProfile>('classes', (liveClasses) => {
      setAllClasses(liveClasses);
      liveClasses.forEach((c) => putInStore('allClasses', c, true).catch(() => {}));
    });
    const unsubProfiles = subscribeToCollection<AdminProfile>('adminProfiles', (liveProfiles) => {
      applyAdminProfiles(liveProfiles);
      liveProfiles.forEach((p) => putInStore('adminProfiles', p, true).catch(() => {}));
    });
    return () => {
      unsubClasses();
      unsubProfiles();
    };
  }, []);

  const gsProfile = adminProfiles.find(p => p.roleType === 'GENERAL_SUPERINTENDENT');
  const gsecProfile = adminProfiles.find(p => p.roleType === 'GENERAL_SECRETARY');
  const isGSClaimed = !!gsProfile;
  const isGSecClaimed = !!gsecProfile;
  const isFoundationalComplete = isGSClaimed && isGSecClaimed;

  // Registered Role IDs check (Strict Rule: One ID = One active administrative profile)
  const registeredRoleIds = adminProfiles.map(p => p.roleType);

  // Get auto-generated username for a role
  const getAutoUsername = (role: AdminRoleType) => {
    const def = PERMITTED_ADMIN_IDS.find(d => d.roleType === role);
    return def ? def.defaultUsername : `${(role || '').toLowerCase()}_admin`;
  };

  // Handle Foundational Spot Claiming (GS or GSec)
  const handleClaimSpotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaimError(null);
    setClaimSuccess(null);

    if (!claimName.trim()) {
      setClaimError('Please enter your full profile name (e.g. Pastor / Elder Name).');
      return;
    }
    if (claimPassword.length < 4) {
      setClaimError('Password must be at least 4 characters long.');
      return;
    }
    if (claimPassword !== claimConfirmPassword) {
      setClaimError('Passwords do not match. Please re-enter.');
      return;
    }

    const roleTitle = claimingRole === 'GENERAL_SUPERINTENDENT'
      ? 'General Superintendent ID'
      : 'General Secretary ID';

    const newProfile: AdminProfile = {
      id: claimingRole,
      roleType: claimingRole,
      title: roleTitle,
      profileName: claimName.trim(),
      username: getAutoUsername(claimingRole),
      passwordHash: claimPassword,
      isApproved: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await saveAdminProfile(newProfile);
    setClaimSuccess(`Successfully claimed ${roleTitle}! Spot is now permanently registered.`);
    setClaimName('');
    setClaimPassword('');
    setClaimConfirmPassword('');

    await refreshAdminData();
  };

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError(null);

    const profile = adminProfiles.find(p => p.roleType === selectedSignInId);
    if (!profile) {
      setSignInError('No profile found for this Administrative ID. Please claim or register this profile first.');
      return;
    }

    if (!profile.isApproved && profile.roleType !== 'GENERAL_SUPERINTENDENT') {
      setSignInError('This administrative profile is currently pending approval by the General Superintendent.');
      return;
    }

    if (signInPassword !== profile.passwordHash) {
      setSignInError('Incorrect password. Please verify your credentials and try again.');
      return;
    }

    setCurrentAdmin(profile);
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccessNotice(null);

    if (!profileName.trim()) {
      setCreateError('Please enter the full profile name.');
      return;
    }

    if (registeredRoleIds.includes(selectedRoleId)) {
      setCreateError(`An active profile for ${selectedRoleId} already exists.`);
      return;
    }

    if (profilePassword.length < 4) {
      setCreateError('Password must be at least 4 characters long.');
      return;
    }

    if (profilePassword !== confirmPassword) {
      setCreateError('Passwords do not match.');
      return;
    }

    const roleDef = PERMITTED_ADMIN_IDS.find(d => d.roleType === selectedRoleId);
    const newAdmin: AdminProfile = {
      id: selectedRoleId,
      roleType: selectedRoleId,
      title: roleDef?.title || `${selectedRoleId} ID`,
      profileName: profileName.trim(),
      username: getAutoUsername(selectedRoleId),
      passwordHash: profilePassword,
      isApproved: selectedRoleId === 'GENERAL_SUPERINTENDENT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await saveAdminProfile(newAdmin);
    setCreateSuccessNotice(`Profile for ${roleDef?.title} created successfully!`);
    setProfileName('');
    setProfilePassword('');
    setConfirmPassword('');
    await refreshAdminData();
    setAuthMode('EXISTING_PROFILE');
    setSelectedSignInId(selectedRoleId);
  };

  const handleApproveAdminProfile = async (id: string) => {
    await approveAdminProfile(id, currentAdmin?.profileName || 'General Superintendent');
    await refreshAdminData();
  };

  const handleSaveSundaySchoolYear = async (year: SundaySchoolYear) => {
    await saveSundaySchoolYear(year);
    await refreshAdminData();
  };

  const handleDistributeLessons = async (quarterNumber: QuarterNumber) => {
    await distributeQuarterLessonsToClasses(quarterNumber);
    await refreshAdminData();
  };

  const handleArchiveAndActivateNextQuarter = async (currentQuarterNumber: QuarterNumber) => {
    await archiveQuarterAndActivateNext(currentQuarterNumber);
    await refreshAdminData();
  };

  const handleApproveClass = async (classId: string) => {
    await approveClassById(classId, currentAdmin?.profileName || 'General Superintendent / Secretary');
    await refreshAdminData();
  };

  const handleAddDepartment = async (name: string) => {
    await addDepartmentToYear(name);
    await refreshAdminData();
  };

  const handleUpdateDepartment = async (oldName: string, newName: string) => {
    await updateDepartmentNameInYear(oldName, newName);
    await refreshAdminData();
  };

  const handleDeleteDepartment = async (name: string) => {
    await deleteDepartmentFromYear(name);
    await refreshAdminData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 p-4">
        <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold">Loading Administrative Portal...</p>
      </div>
    );
  }

  // -------------------------------------------------------------
  // LOGGED-IN ADMIN CONSOLE
  // -------------------------------------------------------------
  if (currentAdmin && sundaySchoolYear) {
    const roleDef = PERMITTED_ADMIN_IDS.find(d => d.roleType === currentAdmin.roleType);

    if (showYearArchives) {
      return (
        <div className="min-h-screen bg-slate-100">
          <YearArchivesView currentYear={sundaySchoolYear} onBack={() => setShowYearArchives(false)} />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        
        {/* Top Header Bar */}
        <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            
            {/* Left Branding */}
            <div className="flex items-center gap-3">
              <GofamintLogo size={36} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">
                    GOFAMINT_HOF Admin Console
                  </span>
                  <span className="text-xs text-slate-500">•</span>
                  <span className="text-xs font-bold text-slate-300">{roleDef?.title}</span>
                </div>
                <h2 className="text-sm sm:text-base font-black text-white">
                  {currentAdmin.profileName}
                </h2>
              </div>
            </div>

            {/* Quick Switcher among Claimed Offices with Authentication Requirement */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="hidden lg:flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <span className="px-2 text-[10px] font-bold text-slate-400">Office Switcher:</span>
                {PERMITTED_ADMIN_IDS.slice(0, 4).map((pDef) => {
                  const prof = adminProfiles.find(p => p.roleType === pDef.roleType);
                  const isCurrent = currentAdmin.roleType === pDef.roleType;
                  if (!prof) return null;

                  return (
                    <button
                      key={pDef.roleType}
                      onClick={() => {
                        if (isCurrent) return;
                        setSwitchTargetProfile(prof);
                        setSwitchPassword('');
                        setSwitchError(null);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        isCurrent
                          ? 'bg-amber-400 text-slate-950 font-black'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800'
                      }`}
                      title={`Switch to ${prof.profileName} (${pDef.title})`}
                    >
                      <Lock className="w-3 h-3 text-amber-400/70" />
                      <span>{pDef.roleType === 'GENERAL_SUPERINTENDENT' ? 'GS' : pDef.roleType === 'GENERAL_SECRETARY' ? 'GSec' : pDef.roleType === 'TREASURER' ? 'Treas' : 'Record'}</span>
                    </button>
                  );
                })}
              </div>

              {/* Data Backup / Export / Import Button */}
              <button
                id="btn-admin-data-backup"
                onClick={() => {
                  setBackupModalTab('SAVE');
                  setIsBackupModalOpen(true);
                }}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                title="Open Data-Only Backup, Export and Import System"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Save / Load Data</span>
              </button>

              {/* Year Archives — GS/GSec only, matches equal-authority pattern */}
              {(currentAdmin.roleType === 'GENERAL_SUPERINTENDENT' || currentAdmin.roleType === 'GENERAL_SECRETARY') && (
                <button
                  id="btn-year-archives"
                  onClick={() => setShowYearArchives(true)}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  title="Browse every past church year's preserved records"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Year Archives</span>
                </button>
              )}

              {/* Enter Workers Module Jump */}
              {onEnterWorkersModule && (
                <button
                  onClick={onEnterWorkersModule}
                  className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 border border-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  title="Open Dedicated Workers Directorate & Sunday Clock-In Terminal"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Workers & Clock-In</span>
                </button>
              )}

              {/* Enter Teachers Portal Jump if Enabled */}
              {sundaySchoolYear?.isInitialized && onEnterClassRegister && (
                <button
                  onClick={onEnterClassRegister}
                  className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 border border-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>Go to Class Register</span>
                </button>
              )}

              {/* Sign Out / Switch Profile */}
              <button
                onClick={() => setCurrentAdmin(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-red-400" />
                <span>Switch Profile</span>
              </button>

              <button
                onClick={onBackToPortalSelect}
                className="px-3 py-1.5 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Portal Selection</span>
              </button>
            </div>

          </div>
        </header>

        {/* Directorate View Router */}
        <main className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex-1">
          {(currentAdmin.roleType === 'GENERAL_SUPERINTENDENT' || currentAdmin.roleType === 'GENERAL_SECRETARY') && (
            <CloudUserManagementPanel allClasses={allClasses} />
          )}

          {currentAdmin.roleType === 'GENERAL_SUPERINTENDENT' && (
            <GeneralSuperintendentView
              currentAdmin={currentAdmin}
              adminProfiles={adminProfiles}
              allClasses={allClasses}
              sundaySchoolYear={sundaySchoolYear}
              onApproveAdminProfile={handleApproveAdminProfile}
              onApproveClass={handleApproveClass}
              onRefreshData={refreshAdminData}
            />
          )}

          {currentAdmin.roleType === 'GENERAL_SECRETARY' && (
            <GeneralSecretaryView
              currentAdmin={currentAdmin}
              sundaySchoolYear={sundaySchoolYear}
              allClasses={allClasses}
              onSaveSundaySchoolYear={handleSaveSundaySchoolYear}
              onDistributeLessons={handleDistributeLessons}
              onArchiveAndActivateNextQuarter={handleArchiveAndActivateNextQuarter}
              onAddDepartment={handleAddDepartment}
              onUpdateDepartment={handleUpdateDepartment}
              onDeleteDepartment={handleDeleteDepartment}
              onApproveClass={handleApproveClass}
              onRefreshData={refreshAdminData}
            />
          )}

          {currentAdmin.roleType === 'TREASURER' && (
            <TreasurerView
              currentAdmin={currentAdmin}
              allClasses={allClasses}
              sundaySchoolYear={sundaySchoolYear}
            />
          )}

          {currentAdmin.roleType === 'RECORD_OFFICER' && (
            <RecordOfficerView
              currentAdmin={currentAdmin}
              allClasses={allClasses}
              sundaySchoolYear={sundaySchoolYear}
            />
          )}

          {currentAdmin.roleType === 'ENROLLMENT_OFFICER' && (
            <EnrollmentOfficerView
              currentAdmin={currentAdmin}
              allClasses={allClasses}
              sundaySchoolYear={sundaySchoolYear}
            />
          )}

          {currentAdmin.roleType === 'ASST_GENERAL_SECRETARY' && (
            <AsstGeneralSecretaryView
              currentAdmin={currentAdmin}
              allClasses={allClasses}
              sundaySchoolYear={sundaySchoolYear}
            />
          )}
        </main>

        {/* Database Backup & Restore Modal */}
        <DatabaseBackupModal
          isOpen={isBackupModalOpen}
          initialTab={backupModalTab}
          onClose={() => setIsBackupModalOpen(false)}
          onDatabaseRestored={refreshAdminData}
          canAccessReset={currentAdmin.roleType === 'GENERAL_SUPERINTENDENT' || currentAdmin.roleType === 'GENERAL_SECRETARY'}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // ADMIN AUTHENTICATION / CLAIMING SPOT SCREENS
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between relative overflow-hidden">
      
      {/* Background Decorative Rings */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-amber-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="p-4 sm:p-6 max-w-7xl w-full mx-auto flex flex-wrap items-center justify-between gap-3 relative z-10">
        <button
          onClick={onBackToPortalSelect}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold text-slate-200 transition"
        >
          <ArrowLeft className="w-4 h-4 text-amber-400" />
          <span>Back to Portal Selection</span>
        </button>

        <button
          onClick={() => {
            setBackupModalTab('LOAD');
            setIsBackupModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-sm transition"
        >
          <Database className="w-4 h-4" />
          <span>Load Saved Data / Backup</span>
        </button>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl w-full mx-auto px-4 py-6 relative z-10">
        
        {/* Title Header */}
        <div className="text-center space-y-3 mb-6">
          <div className="inline-block p-3 rounded-2xl bg-white/5 border border-white/10 shadow-lg">
            <GofamintLogo size={56} />
          </div>
          
          <h1 className="text-2xl sm:text-3xl font-black font-['Cinzel',serif] tracking-wider text-white">
            GOFAMINT_HOF ADMIN PORTAL
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            The Gospel Faith Mission International (House of Favour) • Sunday School Directorate
          </p>
        </div>

        {/* Global Success / Alert Banner */}
        {createSuccessNotice && (
          <div className="mb-6 p-4 bg-emerald-500/20 border border-emerald-400 rounded-2xl text-xs font-bold text-emerald-200 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
            <p>{createSuccessNotice}</p>
          </div>
        )}

        {claimSuccess && (
          <div className="mb-6 p-4 bg-emerald-500/20 border border-emerald-400 rounded-2xl text-xs font-bold text-emerald-200 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
            <p>{claimSuccess}</p>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 4, 5, 6, 7, 8: INITIAL SETUP MODE (CLAIM YOUR SPOT) */}
        {/* ========================================================= */}
        {(!isFoundationalComplete || authMode === 'CLAIM_SPOT') ? (
          <div className="bg-slate-900/95 border-2 border-amber-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            
            {/* Header */}
            <div className="text-center space-y-2 border-b border-slate-800 pb-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-400/20 border border-amber-400/40 rounded-full text-[11px] font-black text-amber-300 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Initial System Setup Mode</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white font-['Cinzel',serif]">
                Welcome to the Admin Portal
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
                Before the Sunday School system can become operational, the two foundational administrative positions must be claimed.
              </p>
            </div>

            {/* Foundational Position Claim Status */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span>Claim Your Spot (Order does not matter):</span>
                <span className="text-amber-400">
                  {isGSClaimed && isGSecClaimed ? '2 of 2 Claimed ✓' : isGSClaimed || isGSecClaimed ? '1 of 2 Claimed' : '0 of 2 Claimed'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Spot 1: General Superintendent */}
                <div
                  onClick={() => !isGSClaimed && setClaimingRole('GENERAL_SUPERINTENDENT')}
                  className={`p-5 rounded-2xl border-2 transition ${
                    isGSClaimed
                      ? 'bg-emerald-950/40 border-emerald-500/60'
                      : claimingRole === 'GENERAL_SUPERINTENDENT'
                      ? 'bg-blue-950/90 border-amber-400 ring-2 ring-amber-400/20 cursor-pointer'
                      : 'bg-slate-800/60 border-slate-700 hover:border-slate-600 cursor-pointer'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
                      <Crown className="w-5 h-5" />
                    </div>
                    {isGSClaimed ? (
                      <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-md text-[10px] font-black uppercase flex items-center gap-1">
                        <Check className="w-3 h-3" /> Claimed
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 bg-amber-400/20 text-amber-300 border border-amber-400/40 rounded-md text-[10px] font-black uppercase">
                        Spot Available
                      </span>
                    )}
                  </div>

                  <div className="mt-3 space-y-1">
                    <h3 className="text-sm font-black text-white">General Superintendent</h3>
                    <p className="text-xs text-slate-400">
                      {isGSClaimed ? (
                        <strong className="text-emerald-300">{gsProfile?.profileName}</strong>
                      ) : (
                        'Claim this spot to establish master executive oversight and profile authorizations.'
                      )}
                    </p>
                  </div>
                </div>

                {/* Spot 2: General Secretary */}
                <div
                  onClick={() => !isGSecClaimed && setClaimingRole('GENERAL_SECRETARY')}
                  className={`p-5 rounded-2xl border-2 transition ${
                    isGSecClaimed
                      ? 'bg-emerald-950/40 border-emerald-500/60'
                      : claimingRole === 'GENERAL_SECRETARY'
                      ? 'bg-blue-950/90 border-amber-400 ring-2 ring-amber-400/20 cursor-pointer'
                      : 'bg-slate-800/60 border-slate-700 hover:border-slate-600 cursor-pointer'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-blue-400/20 border border-blue-400/40 flex items-center justify-center text-blue-300">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    {isGSecClaimed ? (
                      <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-md text-[10px] font-black uppercase flex items-center gap-1">
                        <Check className="w-3 h-3" /> Claimed
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 bg-amber-400/20 text-amber-300 border border-amber-400/40 rounded-md text-[10px] font-black uppercase">
                        Spot Available
                      </span>
                    )}
                  </div>

                  <div className="mt-3 space-y-1">
                    <h3 className="text-sm font-black text-white">General Secretary</h3>
                    <p className="text-xs text-slate-400">
                      {isGSecClaimed ? (
                        <strong className="text-emerald-300">{gsecProfile?.profileName}</strong>
                      ) : (
                        'Claim this spot to configure the Sunday School Year, 4 Quarters, and distribute curriculum.'
                      )}
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* If BOTH are claimed already, show success & enter button */}
            {isFoundationalComplete ? (
              <div className="p-6 bg-emerald-950/60 border border-emerald-500 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-black text-white">
                  Foundational Positions Successfully Established!
                </h3>
                <p className="text-xs text-emerald-200 max-w-md mx-auto">
                  General Superintendent and General Secretary spots are claimed. You can now sign into your administrative console or create remaining secondary roles.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setAuthMode('EXISTING_PROFILE');
                      setSelectedSignInId('GENERAL_SUPERINTENDENT');
                    }}
                    className="px-6 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg transition"
                  >
                    Proceed to Directorate Login →
                  </button>
                </div>
              </div>
            ) : (
              /* Registration Form for the Selected Spot */
              <form onSubmit={handleClaimSpotSubmit} className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span>
                      Claiming: {claimingRole === 'GENERAL_SUPERINTENDENT' ? 'General Superintendent Spot' : 'General Secretary Spot'}
                    </span>
                  </h3>
                  <code className="text-xs font-mono font-bold text-amber-300 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                    Username: {getAutoUsername(claimingRole)}
                  </code>
                </div>

                {claimError && (
                  <div className="p-3 bg-red-950/80 border border-red-500 rounded-xl text-xs font-bold text-red-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{claimError}</span>
                  </div>
                )}

                {/* Profile Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    1. Full Profile Name (Pastor / Elder / Officer Name)
                  </label>
                  <input
                    type="text"
                    required
                    value={claimName}
                    onChange={(e) => setClaimName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-400 outline-hidden font-medium"
                    placeholder={claimingRole === 'GENERAL_SUPERINTENDENT' ? 'e.g. Pastor Dr. E.O. Abina' : 'e.g. Pastor S.O. Omowaye'}
                  />
                </div>

                {/* Password & Confirm */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      2. Secure Password
                    </label>
                    <input
                      type="password"
                      required
                      value={claimPassword}
                      onChange={(e) => setClaimPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-400 outline-hidden font-medium"
                      placeholder="Enter password"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      3. Confirm Password
                    </label>
                    <input
                      type="password"
                      required
                      value={claimConfirmPassword}
                      onChange={(e) => setClaimConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-400 outline-hidden font-medium"
                      placeholder="Repeat password"
                    />
                  </div>
                </div>

                {/* Locked Notice */}
                <div className="p-3.5 bg-blue-950/40 border border-blue-500/40 rounded-xl text-xs text-blue-200 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <p>
                    <strong>Foundational Rule:</strong> Once registered, this spot is permanently claimed. Both the General Superintendent and General Secretary must be claimed before other roles or teacher portals become operational.
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    Claim & Register {claimingRole === 'GENERAL_SUPERINTENDENT' ? 'General Superintendent' : 'General Secretary'} Spot
                  </span>
                </button>
              </form>
            )}

          </div>
        ) : (
          /* ========================================================= */
          /* BOTH FOUNDATIONAL ARE CLAIMED -> NORMAL ADMIN PORTAL */
          /* ========================================================= */
          <div className="space-y-6">
            
            {/* Tab Toggle: Existing Profile vs Create New Profile */}
            <div className="bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl flex items-center gap-2">
              <button
                onClick={() => {
                  setAuthMode('EXISTING_PROFILE');
                  setSignInError(null);
                }}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition ${
                  authMode === 'EXISTING_PROFILE'
                    ? 'bg-blue-900 text-white shadow-lg border border-blue-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LogIn className="w-4 h-4 text-amber-400" />
                <span>Existing Directorate Profile</span>
              </button>

              <button
                onClick={() => {
                  setAuthMode('CREATE_PROFILE');
                  setCreateError(null);
                }}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition ${
                  authMode === 'CREATE_PROFILE'
                    ? 'bg-blue-900 text-white shadow-lg border border-blue-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserPlus className="w-4 h-4 text-amber-400" />
                <span>Create Secondary Admin Role</span>
              </button>
            </div>

            {/* MODE 1: EXISTING PROFILE SIGN IN */}
            {authMode === 'EXISTING_PROFILE' && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
                <div>
                  <h2 className="text-lg font-black text-white font-['Cinzel',serif]">
                    Select Administrative Profile
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Choose from authorized administrative offices to access your dashboard.
                  </p>
                </div>

                {/* Role Selection List */}
                <div className="space-y-3">
                  {PERMITTED_ADMIN_IDS.map((def) => {
                    const profile = adminProfiles.find(p => p.roleType === def.roleType);
                    const isSelected = selectedSignInId === def.roleType;
                    const isRegistered = !!profile;
                    const isApproved = profile?.isApproved;

                    return (
                      <div
                        key={def.roleType}
                        onClick={() => {
                          setSelectedSignInId(def.roleType);
                          setSignInError(null);
                        }}
                        className={`p-4 rounded-2xl border-2 transition cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-blue-950/80 border-amber-400 shadow-md ring-2 ring-amber-400/20'
                            : isRegistered
                            ? 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                            : 'bg-slate-800/20 border-slate-800/80 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                            isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 text-slate-300'
                          }`}>
                            {def.roleType === 'GENERAL_SUPERINTENDENT' && <Crown className="w-5 h-5" />}
                            {def.roleType === 'GENERAL_SECRETARY' && <FileSpreadsheet className="w-5 h-5" />}
                            {def.roleType === 'TREASURER' && <Coins className="w-5 h-5" />}
                            {def.roleType === 'RECORD_OFFICER' && <ClipboardList className="w-5 h-5" />}
                            {def.roleType === 'ENROLLMENT_OFFICER' && <UserCheck className="w-5 h-5" />}
                            {def.roleType === 'ASST_GENERAL_SECRETARY' && <BookCheck className="w-5 h-5" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-black text-white">{def.title}</h3>
                              {isRegistered && isApproved && (
                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-700/50 px-2 py-0.2 rounded">
                                  Active Profile
                                </span>
                              )}
                              {isRegistered && !isApproved && (
                                <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 border border-amber-700/50 px-2 py-0.2 rounded">
                                  Pending GS Approval
                                </span>
                              )}
                              {!isRegistered && (
                                <span className="text-[10px] text-slate-500 italic">Not Registered Yet</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {profile ? profile.profileName : `Username: ${def.defaultUsername}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-amber-300 bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-700">
                            {def.defaultUsername}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Password and Submit Form */}
                <form onSubmit={handleSignIn} className="space-y-4 pt-4 border-t border-slate-800">
                  {signInError && (
                    <div className="p-3.5 bg-red-950/70 border border-red-500 rounded-xl text-xs font-bold text-red-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{signInError}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      Password for <span className="text-amber-300">{selectedSignInId}</span>
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        value={signInPassword}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-400 outline-hidden font-medium"
                        placeholder="Enter password"
                      />
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.99]"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Enter Admin Console</span>
                  </button>
                </form>
              </div>
            )}

            {/* MODE 2: CREATE SECONDARY ADMIN PROFILE */}
            {authMode === 'CREATE_PROFILE' && (
              <form onSubmit={handleCreateProfile} className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
                <div>
                  <h2 className="text-lg font-black text-white font-['Cinzel',serif]">
                    Create Secondary Administrative Role
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Select from authorized administrative positions (Treasurer, Record Officer, Enrollment Officer, etc.).
                  </p>
                </div>

                {createError && (
                  <div className="p-3.5 bg-red-950/70 border border-red-500 rounded-xl text-xs font-bold text-red-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{createError}</span>
                  </div>
                )}

                {/* Select Role ID */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300">
                    1. Select Administrative ID Type
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PERMITTED_ADMIN_IDS.filter(d => d.roleType !== 'GENERAL_SUPERINTENDENT' && d.roleType !== 'GENERAL_SECRETARY').map((def) => {
                      const isRegistered = registeredRoleIds.includes(def.roleType);
                      const isSelected = selectedRoleId === def.roleType;

                      return (
                        <button
                          type="button"
                          key={def.roleType}
                          disabled={isRegistered}
                          onClick={() => setSelectedRoleId(def.roleType)}
                          className={`text-left p-3.5 rounded-2xl border-2 transition relative flex flex-col justify-between ${
                            isRegistered
                              ? 'bg-slate-950/50 border-slate-800/60 opacity-50 cursor-not-allowed'
                              : isSelected
                              ? 'bg-blue-950 border-amber-400 shadow-md ring-2 ring-amber-400/20'
                              : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white">{def.title}</span>
                              {isRegistered && (
                                <span className="text-[9px] font-black uppercase text-red-400 bg-red-950/80 px-2 py-0.5 rounded">
                                  Already In Use
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 leading-tight">
                              {def.description}
                            </p>
                          </div>

                          <div className="pt-2 mt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                            <span className="text-slate-500">Auto Username:</span>
                            <code className="text-amber-300 font-bold">{def.defaultUsername}</code>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Form Fields: Name, Password, Confirm */}
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      2. Full Profile Name (Pastor / Elder / Officer Name)
                    </label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-400 outline-hidden font-medium"
                      placeholder="e.g. Elder D.A. Oladipo"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300">
                        3. Admin Password
                      </label>
                      <input
                        type="password"
                        required
                        value={profilePassword}
                        onChange={(e) => setProfilePassword(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-400 outline-hidden font-medium"
                        placeholder="Enter password"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300">
                        4. Confirm Password
                      </label>
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-400 outline-hidden font-medium"
                        placeholder="Repeat password"
                      />
                    </div>
                  </div>

                  <div className="p-3.5 bg-amber-950/40 border border-amber-500/50 rounded-2xl text-xs text-amber-200 flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p>
                      <strong>Authorization Notice:</strong> Secondary administrative profiles require approval from the General Superintendent before gaining active access.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.99]"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Create & Submit Admin Profile</span>
                  </button>
                </div>
              </form>
            )}

          </div>
        )}

      </main>

      {/* Profile Switching Password Authentication Modal */}
      {switchTargetProfile && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 text-left animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center shrink-0">
                <Lock className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Switch Administrative Profile</h3>
                <p className="text-xs text-amber-300 font-semibold">
                  {switchTargetProfile.profileName} ({switchTargetProfile.roleType})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              To switch from <strong>{currentAdmin?.profileName}</strong> to <strong>{switchTargetProfile.profileName}</strong>, enter the master profile password for this office.
            </p>

            {switchError && (
              <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs text-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{switchError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!switchTargetProfile) return;
                if (switchTargetProfile.passwordHash && switchPassword !== switchTargetProfile.passwordHash) {
                  setSwitchError(`Incorrect password for ${switchTargetProfile.profileName}. Access denied.`);
                  return;
                }
                setCurrentAdmin(switchTargetProfile);
                setSwitchTargetProfile(null);
                setSwitchPassword('');
                setSwitchError(null);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Enter Password for {switchTargetProfile.profileName}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    autoFocus
                    value={switchPassword}
                    onChange={(e) => {
                      setSwitchPassword(e.target.value);
                      if (switchError) setSwitchError(null);
                    }}
                    placeholder="Enter office profile password"
                    className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-400 outline-hidden font-medium placeholder:text-slate-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSwitchTargetProfile(null);
                    setSwitchPassword('');
                    setSwitchError(null);
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Authenticate & Switch</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Database Backup & Restore Modal for Unauthenticated / Claiming Screens.
          Reset is intentionally never available here — no admin identity has
          been established yet, so canAccessReset stays false. */}
      <DatabaseBackupModal
        isOpen={isBackupModalOpen}
        initialTab={backupModalTab}
        onClose={() => setIsBackupModalOpen(false)}
        onDatabaseRestored={refreshAdminData}
        canAccessReset={false}
      />

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-slate-500 relative z-10 border-t border-slate-900">
        The Gospel Faith Mission International (House of Favour) (GOFAMINT_HOF) • Sunday School Directorate
      </footer>

    </div>
  );
};
