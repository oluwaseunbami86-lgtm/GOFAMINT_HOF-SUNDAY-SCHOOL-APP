import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  Shield,
  Lock,
  UserCheck,
  Users,
  Plus,
  Building,
  CheckCircle2,
  Clock,
  Sparkles,
  Database,
  Trash2,
  BookOpen,
  ArrowLeft,
  KeyRound,
  AlertTriangle,
  FileCheck,
  AlertCircle,
  Download,
  Upload,
  HardDrive,
  History
} from 'lucide-react';
import { GofamintLogo } from './GofamintLogo';
import { ClassProfile, DepartmentType, TeacherInfo, Member, SundaySchoolYear, WorkerProfile } from '../types';
import {
  getSundaySchoolYear,
  getAllAdminProfiles,
  resetToFreshCleanSystem,
  getAllWorkers,
  getAllDepartmentsList,
  getAllClassesDirectory,
  getDatabaseStatisticsSummary
} from '../db/indexedDB';
import { DatabaseBackupModal } from './DatabaseBackupModal';

interface OpeningFlowViewProps {
  classProfile: ClassProfile | null;
  members: Member[];
  isUnlocked: boolean;
  onEnterClass: (selectedProfile?: ClassProfile) => void;
  onEnterAdminPortal?: () => void;
  onEnterWorkersModule?: () => void;
  onRegisterNewClassSubmit: (profile: ClassProfile) => void;
  onClearDataAndStartScratch: () => void;
  onDatabaseRestored?: () => void;
}

type FlowStep = 'OPENING_PAGE' | 'PORTAL_SELECTION' | 'TEACHER_PORTAL_HOME' | 'CREATE_CLASS_FORM';

export const OpeningFlowView: React.FC<OpeningFlowViewProps> = ({
  classProfile,
  members,
  isUnlocked,
  onEnterClass,
  onEnterAdminPortal,
  onEnterWorkersModule,
  onRegisterNewClassSubmit,
  onClearDataAndStartScratch,
  onDatabaseRestored
}) => {
  const [currentStep, setCurrentStep] = useState<FlowStep>('OPENING_PAGE');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingNoticeModal, setPendingNoticeModal] = useState<ClassProfile | null>(null);
  const [showLockedTeacherModal, setShowLockedTeacherModal] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupModalTab, setBackupModalTab] = useState<'SAVE' | 'LOAD' | 'RESET'>('SAVE');
  const [dbSummary, setDbSummary] = useState<any>(null);

  // System Setup State Check
  const [sundaySchoolYear, setSundaySchoolYear] = useState<SundaySchoolYear | null>(null);
  const [isGSClaimed, setIsGSClaimed] = useState(false);
  const [isGSecClaimed, setIsGSecClaimed] = useState(false);
  const [workersList, setWorkersList] = useState<WorkerProfile[]>([]);
  const [departmentsList, setDepartmentsList] = useState<string[]>([]);
  const [allClassesList, setAllClassesList] = useState<ClassProfile[]>([]);

  const refreshSystemStatus = async () => {
    try {
      const year = await getSundaySchoolYear();
      setSundaySchoolYear(year);
      const profiles = await getAllAdminProfiles();
      setIsGSClaimed(profiles.some(p => p.roleType === 'GENERAL_SUPERINTENDENT'));
      setIsGSecClaimed(profiles.some(p => p.roleType === 'GENERAL_SECRETARY'));

      const [loadedWorkers, loadedDepts, loadedClasses] = await Promise.all([
        getAllWorkers(),
        getAllDepartmentsList(),
        getAllClassesDirectory()
      ]);
      setWorkersList(loadedWorkers);
      setDepartmentsList(loadedDepts);
      setAllClassesList(loadedClasses);

      if (loadedDepts.length > 0 && !department) {
        setDepartment(loadedDepts[0]);
      }
    } catch (err) {
      console.error('Error fetching system status:', err);
    }
  };

  useEffect(() => {
    refreshSystemStatus();
  }, [classProfile]);

  const isTeacherPortalEnabled = isGSClaimed && isGSecClaimed && (sundaySchoolYear?.isInitialized === true);

  // New Class Form State
  const [className, setClassName] = useState('');
  const [department, setDepartment] = useState<string>('Young Adults');
  const [selectedSecretaryWorkerId, setSelectedSecretaryWorkerId] = useState<string>('');
  const [secretaryName, setSecretaryName] = useState('');
  const [secretaryPhone, setSecretaryPhone] = useState('');
  const [teachers, setTeachers] = useState<TeacherInfo[]>([
    { id: `t_${Date.now()}_1`, name: '', phone: '', isHeadTeacher: true }
  ]);
  const [password, setPassword] = useState('gofamint123');
  const [confirmPassword, setConfirmPassword] = useState('gofamint123');
  const [formError, setFormError] = useState<string | null>(null);

  const activeStudentsCount = members.filter(m => m.memberType === 'STUDENT' && m.status !== 'LEFT_CLASS').length;
  const activeVisitorsCount = members.filter(m => m.memberType === 'VISITOR' && m.status !== 'LEFT_CLASS').length;

  const handleSecretarySelect = (workerId: string) => {
    setSelectedSecretaryWorkerId(workerId);
    const worker = workersList.find(w => w.id === workerId);
    if (worker) {
      setSecretaryName(worker.fullName);
      setSecretaryPhone(worker.phone || '');
    } else {
      setSecretaryName('');
      setSecretaryPhone('');
    }
  };

  const handleAddTeacher = () => {
    setTeachers(prev => [...prev, { id: `t_${Date.now()}_${prev.length + 1}`, name: '', phone: '' }]);
  };

  const handleRemoveTeacher = (index: number) => {
    if (teachers.length <= 1) return;
    setTeachers(prev => prev.filter((_, i) => i !== index));
  };

  const handleTeacherWorkerSelect = (index: number, workerId: string) => {
    const worker = workersList.find(w => w.id === workerId);
    setTeachers(prev => {
      const updated = [...prev];
      if (worker) {
        updated[index] = {
          ...updated[index],
          id: worker.id,
          name: worker.fullName,
          phone: worker.phone || ''
        };
      } else {
        updated[index] = {
          ...updated[index],
          id: `t_${Date.now()}_${index}`,
          name: '',
          phone: ''
        };
      }
      return updated;
    });
  };

  const handleCreateClassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!className.trim()) {
      setFormError('Please enter a Class Name.');
      return;
    }
    if (!secretaryName.trim()) {
      setFormError('Please select a registered worker as Class Secretary.');
      return;
    }
    const validTeachers = teachers.filter(t => t.name.trim() !== '');
    if (validTeachers.length === 0) {
      setFormError('Please select at least one registered worker as Class Teacher.');
      return;
    }
    if (password.length < 4) {
      setFormError('Password must be at least 4 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    const newProfile: ClassProfile = {
      id: `class_${Date.now()}`,
      className: className.trim(),
      department: department as DepartmentType,
      secretaryName: secretaryName.trim(),
      secretaryPhone: secretaryPhone.trim(),
      teachers: validTeachers,
      passwordHash: password,
      quarterTitle: 'Quarter 1: Sunday School Curriculum',
      year: new Date().getFullYear(),
      currencySymbol: '₦',
      isSetupComplete: true,
      approvalStatus: 'PENDING_APPROVAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setPendingNoticeModal(newProfile);
  };

  const handleConfirmPendingSubmission = () => {
    if (pendingNoticeModal) {
      onRegisterNewClassSubmit(pendingNoticeModal);
      setPendingNoticeModal(null);
      setCurrentStep('TEACHER_PORTAL_HOME');
      refreshSystemStatus();
    }
  };

  const handleAttemptEnterClass = (cls: ClassProfile) => {
    if (cls.approvalStatus === 'PENDING_APPROVAL') {
      setPendingNoticeModal(cls);
    } else {
      onEnterClass(cls);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans text-slate-800 animate-fade-in">
      {/* ----------------- STAGE 1: OPENING PAGE ----------------- */}
      {currentStep === 'OPENING_PAGE' && (
        <div className="max-w-3xl w-full mx-auto my-auto py-8 text-center space-y-6">
          
          <div className="bg-white border-2 border-slate-200 rounded-3xl p-8 sm:p-12 shadow-xl relative overflow-hidden space-y-6">
            
            {/* Official GOFAMINT_HOF Logo */}
            <div className="flex items-center justify-center mx-auto">
              <GofamintLogo size={112} className="drop-shadow-lg" />
            </div>

            <div className="space-y-2">
              <div className="inline-block px-4 py-1.5 bg-amber-100 border border-amber-300 rounded-full text-xs font-black uppercase tracking-wider text-amber-900">
                The Gospel Faith Mission International (House of Favour)
              </div>

              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight font-['Cinzel',serif] uppercase leading-tight">
                GOFAMINT_HOF Sunday School Register App
              </h1>
              
              <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto leading-relaxed pt-1">
                Official Sunday School administrative platform for class registers, visitor onboarding, weekly attendance grading, qualification tracking, and pastoral care.
              </p>
            </div>

            {/* Click to Continue Action */}
            <div className="pt-4 max-w-md mx-auto">
              <button
                id="btn-opening-continue"
                onClick={() => setCurrentStep('PORTAL_SELECTION')}
                className="w-full py-4 sm:py-5 px-8 bg-blue-900 hover:bg-blue-800 active:scale-[0.98] text-white rounded-2xl text-base sm:text-lg font-black flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition transform"
              >
                <span>Click to Continue</span>
                <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300" />
              </button>
            </div>

          </div>

          <div className="text-xs text-slate-500 font-semibold">
            GOFAMINT_HOF Sunday School Directorate • General Secretariat
          </div>

        </div>
      )}

      {/* ----------------- STAGE 2: PORTAL SELECTION PAGE ----------------- */}
      {currentStep === 'PORTAL_SELECTION' && (
        <div className="max-w-4xl w-full mx-auto my-auto py-8 space-y-6">
          
          {/* Header */}
          <div className="text-center space-y-2">
            <button
              onClick={() => setCurrentStep('OPENING_PAGE')}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Title</span>
            </button>

            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 font-['Cinzel',serif] uppercase">
              Select Portal Destination
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
              Please choose your authorized Sunday School console to proceed.
            </p>
          </div>

          {/* Local Database Backup & Restore Action Bar */}
          <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 border border-blue-800 text-white rounded-2xl p-4 sm:p-5 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-950/80 border border-blue-700 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-amber-300 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
                    PORTAL DESTINATION DATABASE
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-black text-white mt-0.5">
                  Save All Database or Load Saved Database
                </h3>
                <p className="text-[11px] text-blue-200">
                  Save all class profiles, scores, offerings, workers & curriculum locally, or restore a previous database file.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start sm:self-center">
              <button
                id="btn-portal-save-database"
                onClick={() => {
                  setBackupModalTab('SAVE');
                  setIsBackupModalOpen(true);
                }}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-blue-950 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition active:scale-95"
                title="Export complete database to local JSON file or browser snapshot"
              >
                <Download className="w-4 h-4 text-blue-950" />
                <span>Save Database</span>
              </button>

              <button
                id="btn-portal-load-database"
                onClick={() => {
                  setBackupModalTab('LOAD');
                  setIsBackupModalOpen(true);
                }}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition active:scale-95"
                title="Restore saved JSON database file or snapshot"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Load Database</span>
              </button>

              <button
                id="btn-portal-reset-database"
                onClick={() => {
                  setBackupModalTab('RESET');
                  setIsBackupModalOpen(true);
                }}
                className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 rounded-xl text-xs font-black flex items-center gap-1.5 transition active:scale-95"
                title="Reset database to clean default specifications"
              >
                <Trash2 className="w-4 h-4 text-rose-300" />
                <span>Reset Database</span>
              </button>
            </div>
          </div>

          {/* 3 Portal Option Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            
            {/* 1. Admin Portal (Active) */}
            <div className="bg-white border-2 border-slate-900 rounded-2xl p-6 flex flex-col justify-between shadow-lg hover:shadow-xl transition relative border-t-8 border-t-amber-500">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-950">
                    <Shield className="w-6 h-6 text-amber-900" />
                  </div>
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider rounded-md border border-amber-300">
                    Executive Portal
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-black text-slate-900 font-['Cinzel',serif]">
                    1. Admin Portal
                  </h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    General Superintendent, General Secretary, Treasurer, and Enrollment Officer. Master Sunday School Year & 4-Quarter curriculum management.
                  </p>
                </div>
              </div>

              <div className="pt-5 mt-4 border-t border-slate-200">
                <button
                  id="btn-portal-select-admin"
                  onClick={() => onEnterAdminPortal && onEnterAdminPortal()}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-amber-400 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md transition"
                >
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span>Enter Admin Portal</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                </button>
              </div>
            </div>

            {/* 2. Dedicated Workers Directorate Module */}
            <div className="bg-white border-2 border-slate-900 rounded-2xl p-6 flex flex-col justify-between shadow-lg hover:shadow-xl transition relative border-t-8 border-t-emerald-600">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-950">
                    <Sparkles className="w-6 h-6 text-emerald-700" />
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 text-[10px] font-black uppercase tracking-wider rounded-md border border-emerald-300">
                    Dedicated Module
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-black text-slate-900 font-['Cinzel',serif]">
                    2. Workers Directorate
                  </h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    High-speed Sunday QR Code Clock-In Terminal, Master Worker Directory, Saturday Preparatory Class Attendance, and Ministerial Roles.
                  </p>
                </div>
              </div>

              <div className="pt-5 mt-4 border-t border-slate-200">
                <button
                  id="btn-portal-select-workers"
                  onClick={() => onEnterWorkersModule && onEnterWorkersModule()}
                  className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 active:scale-[0.98] text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>⚡ Workers & Clock-In</span>
                  <ArrowRight className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>

            {/* 3. Teachers / Secretary Register Portal (Gated) */}
            <div className={`bg-white border-2 rounded-2xl p-6 flex flex-col justify-between shadow-lg transition relative border-t-8 ${
              isTeacherPortalEnabled
                ? 'border-blue-900 border-t-blue-900 hover:shadow-xl'
                : 'border-slate-300 border-t-slate-400 opacity-80'
            }`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${
                    isTeacherPortalEnabled ? 'bg-blue-100 border-blue-300 text-blue-900' : 'bg-slate-100 border-slate-300 text-slate-500'
                  }`}>
                    {isTeacherPortalEnabled ? <UserCheck className="w-6 h-6 text-blue-900" /> : <Lock className="w-6 h-6 text-slate-500" />}
                  </div>
                  <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md border ${
                    isTeacherPortalEnabled
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}>
                    {isTeacherPortalEnabled ? 'Active Portal' : 'Setup Required'}
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-black text-slate-900 font-['Cinzel',serif]">
                    3. Teachers / Secretary Register
                  </h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    Class-level register console for recording weekly student attendance grades, offerings, visitor promotions, and student report cards.
                  </p>

                  {!isTeacherPortalEnabled && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <p className="leading-tight">
                        Foundational admin setup required.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-5 mt-4 border-t border-slate-200">
                {isTeacherPortalEnabled ? (
                  <button
                    id="btn-portal-select-teacher"
                    onClick={() => setCurrentStep('TEACHER_PORTAL_HOME')}
                    className="w-full py-3 bg-blue-900 hover:bg-blue-800 active:scale-[0.98] text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md transition"
                  >
                    <span>Enter Teachers Portal</span>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-300" />
                  </button>
                ) : (
                  <button
                    onClick={() => setShowLockedTeacherModal(true)}
                    className="w-full py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition"
                  >
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Locked — Setup Required</span>
                  </button>
                )}
              </div>
            </div>

          </div>

          <div className="text-center text-xs text-slate-500 pt-4">
            GOFAMINT_HOF Sunday School Management System
          </div>

        </div>
      )}

      {/* ----------------- STAGE 3: TEACHER & SECRETARY PORTAL ----------------- */}
      {currentStep === 'TEACHER_PORTAL_HOME' && (
        <div className="max-w-4xl w-full mx-auto my-auto py-6 space-y-6">
          
          {/* Top Bar Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentStep('PORTAL_SELECTION')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Portal Selection</span>
            </button>

            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Teacher & Secretary Workspace
            </div>
          </div>

          {/* Main Action Hub: 2 Main Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Option A: Create New Class */}
            <div className="bg-white border-2 border-slate-200 hover:border-purple-600 rounded-2xl p-6 shadow-md transition flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-900">
                  <Plus className="w-6 h-6 text-purple-700" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    A. Create New Class
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Set up your class name, department, teacher/secretary contacts, and secret password. Submissions are queued for Admin Approval (General Superintendent / General Secretary).
                  </p>
                </div>
              </div>

              <div className="pt-5 mt-4 border-t border-slate-100">
                <button
                  id="btn-create-new-class"
                  onClick={() => setCurrentStep('CREATE_CLASS_FORM')}
                  className="w-full py-3 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-xs transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Open Class Creation Form</span>
                </button>
              </div>
            </div>

            {/* Option B: List of Classes */}
            <div className="bg-white border-2 border-slate-200 hover:border-blue-600 rounded-2xl p-6 shadow-md transition flex flex-col justify-between">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-900">
                  <BookOpen className="w-6 h-6 text-blue-900" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    B. List of Classes
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Access and manage your registered and approved Sunday School class registers.
                  </p>
                </div>
              </div>

              <div className="pt-5 mt-4 border-t border-slate-100">
                {classProfile && classProfile.className ? (
                  <button
                    id="btn-enter-existing-class"
                    onClick={() => onEnterClass()}
                    className="w-full py-3 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-xs transition"
                  >
                    <span>Enter Register: {classProfile.className}</span>
                    <ArrowRight className="w-4 h-4 text-amber-300" />
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentStep('CREATE_CLASS_FORM')}
                    className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition"
                  >
                    <span>No Class Registered Yet (Create One)</span>
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* List of Registered / Approved Classes */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-blue-900" />
                <h4 className="text-sm font-black uppercase tracking-wider text-slate-900">
                  Registered Classes & Status
                </h4>
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">Admin Approval System</span>
            </div>

            {(allClassesList.length > 0 || (classProfile && classProfile.className)) ? (
              <div className="space-y-3">
                {(allClassesList.length > 0 ? allClassesList : (classProfile ? [classProfile] : [])).map((cls) => {
                  const isPending = cls.approvalStatus === 'PENDING_APPROVAL';
                  return (
                    <div
                      key={cls.id || cls.className}
                      className={`border rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 transition ${
                        isPending ? 'bg-amber-50/50 border-amber-200' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="space-y-1 text-center sm:text-left">
                        <div className="flex items-center justify-center sm:justify-start gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              isPending ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'
                            }`}
                          />
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                              isPending
                                ? 'text-amber-800 bg-amber-100 border-amber-300'
                                : 'text-emerald-800 bg-emerald-100 border-emerald-300'
                            }`}
                          >
                            {isPending ? 'Pending Admin Approval' : 'Approved Class'}
                          </span>
                        </div>

                        <h3 className="text-base font-black text-slate-900">
                          {cls.className}
                        </h3>

                        <p className="text-xs text-slate-600">
                          Department: <strong>{cls.department}</strong> | Secretary: {cls.secretaryName || 'Not Assigned'}
                        </p>

                        <div className="flex items-center justify-center sm:justify-start gap-3 pt-1 text-xs text-slate-500 font-semibold">
                          <span>{cls.teachers?.length || 0} Teacher(s)</span>
                          <span>•</span>
                          <span>Status: {isPending ? 'Awaiting Authorization' : 'Ready'}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 w-full sm:w-auto shrink-0">
                        {isPending ? (
                          <button
                            onClick={() => handleAttemptEnterClass(cls)}
                            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
                          >
                            <Clock className="w-3.5 h-3.5 text-amber-200" />
                            <span>Pending Approval (View Status)</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAttemptEnterClass(cls)}
                            className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
                          >
                            <span>{isUnlocked ? 'Go to Register' : 'Unlock & Enter Register'}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-amber-300" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 text-center text-slate-500 text-xs">
                No classes registered on this device yet. Click <strong>"Create New Class"</strong> above to register your Sunday School class.
              </div>
            )}
          </div>

        </div>
      )}

      {/* ----------------- STAGE 4: CREATE CLASS FORM ----------------- */}
      {currentStep === 'CREATE_CLASS_FORM' && (
        <div className="max-w-2xl w-full mx-auto my-auto py-6 space-y-6">
          
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentStep('TEACHER_PORTAL_HOME')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Teacher Portal</span>
            </button>

            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Step A: Create New Class
            </span>
          </div>

          <div className="bg-white border-2 border-slate-200 rounded-2xl shadow-xl overflow-hidden">
            
            <div className="bg-blue-950 p-6 text-white border-b border-blue-900 text-center">
              <div className="flex items-center justify-center mx-auto mb-2">
                <GofamintLogo size={48} />
              </div>
              <h3 className="text-lg sm:text-xl font-extrabold font-['Cinzel',serif]">
                Sunday School Class Registration
              </h3>
              <p className="text-xs text-blue-200 mt-1">
                Select registered workers from the Workers database. After registration, Admin approval is required.
              </p>
            </div>

            <form onSubmit={handleCreateClassSubmit} className="p-6 space-y-4">
              
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-bold">
                  {formError}
                </div>
              )}

              {/* Class Name & Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Class Name (Username) <span className="text-blue-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="e.g. Grace & Truth Adult Bible Class"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Department <span className="text-blue-600">*</span>
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    {departmentsList.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Secretary Info */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Select Class Secretary (from Workers Database) <span className="text-blue-600">*</span>
                </label>
                {workersList.length > 0 ? (
                  <select
                    value={selectedSecretaryWorkerId}
                    onChange={(e) => handleSecretarySelect(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="">-- Choose Worker as Secretary --</option>
                    {workersList.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.fullName} ({w.department || 'General'} - {w.designation || 'Worker'}) {w.phone ? `- ${w.phone}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>No workers found in database. Please add workers in the Workers Module first.</span>
                  </div>
                )}
                {secretaryName && (
                  <div className="text-xs text-slate-600 bg-slate-100 p-2 rounded-lg font-medium">
                    Selected Secretary: <strong>{secretaryName}</strong> {secretaryPhone && `(${secretaryPhone})`}
                  </div>
                )}
              </div>

              {/* Dynamic Teachers */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-blue-900" />
                    <span>Class Teacher(s) (Selected from Workers Database)</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddTeacher}
                    className="text-xs font-bold text-purple-900 hover:text-purple-800 flex items-center gap-1 bg-purple-100 hover:bg-purple-200 px-2.5 py-1 rounded-lg border border-purple-300 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Teacher</span>
                  </button>
                </div>

                {teachers.map((teacher, index) => (
                  <div key={teacher.id || index} className="flex items-center gap-2">
                    {workersList.length > 0 ? (
                      <select
                        value={workersList.some(w => w.fullName === teacher.name) ? workersList.find(w => w.fullName === teacher.name)?.id : ''}
                        onChange={(e) => handleTeacherWorkerSelect(index, e.target.value)}
                        className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-medium"
                      >
                        <option value="">-- Choose Teacher {index + 1} --</option>
                        {workersList.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.fullName} ({w.department || 'General'} - {w.designation || 'Teacher/Worker'})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        disabled
                        placeholder="No workers available"
                        className="flex-1 bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-500"
                      />
                    )}

                    {teacher.phone && (
                      <span className="text-xs text-slate-500 font-medium px-2 py-1 bg-slate-100 rounded border border-slate-200">
                        {teacher.phone}
                      </span>
                    )}

                    {teachers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTeacher(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Class Password <span className="text-blue-600">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Confirm Password <span className="text-blue-600">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full py-4 bg-blue-900 hover:bg-blue-800 text-white font-black rounded-xl text-sm shadow-md transition flex items-center justify-center gap-2"
                >
                  <FileCheck className="w-5 h-5 text-amber-300" />
                  <span>Submit Class for Admin Approval</span>
                </button>
              </div>

            </form>

          </div>

        </div>
      )}

      {/* Modal: Locked Teacher Portal Notice */}
      {showLockedTeacherModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0">
                <Lock className="w-6 h-6 text-amber-800" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                  System Setup Required
                </span>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  Teachers Portal Locked
                </h3>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-2 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p>
                The Sunday School system requires foundational establishment before individual classes can operate:
              </p>
              <ol className="list-decimal list-inside space-y-1 font-semibold text-slate-800">
                <li>Claim General Superintendent spot</li>
                <li>Claim General Secretary spot</li>
                <li>General Secretary loads Quarter 1 lessons and clicks <strong>"LOAD & DISTRIBUTE ACROSS ALL CLASSES"</strong></li>
              </ol>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowLockedTeacherModal(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowLockedTeacherModal(false);
                  if (onEnterAdminPortal) onEnterAdminPortal();
                }}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-xl text-xs font-black shadow-md transition"
              >
                Go to Admin Portal Setup →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pending Admin Approval Notice */}
      {pendingNoticeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                  Authorization Required
                </span>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  Pending Admin Approval
                </h3>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-2 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p>
                The Sunday School class <strong>"{pendingNoticeModal.className}"</strong> has been registered with status: <strong className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">PENDING APPROVAL</strong>.
              </p>
              <p>
                Access to the Class Register and Grading Roster is restricted until the <strong>General Superintendent</strong> or <strong>General Secretary</strong> approves this class in the Admin Portal.
              </p>
              <p className="text-slate-500 italic">
                Once approved, teachers and secretaries can immediately log in and manage attendance.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2">
              <button
                id="btn-confirm-pending-notice"
                onClick={handleConfirmPendingSubmission}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Understood / Return to Classes
              </button>
              {onEnterAdminPortal && (
                <button
                  onClick={() => {
                    handleConfirmPendingSubmission();
                    onEnterAdminPortal();
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
                >
                  Go to Admin Portal →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Clear Demo Data */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-base font-black text-slate-900">Clear All Data & Reset Database?</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will clear all local records on this device so you can start completely fresh.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowClearConfirm(false);
                  onClearDataAndStartScratch();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
              >
                Yes, Clear All Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Database Backup & Restore Modal. This is the pre-login welcome
          screen — no admin identity exists yet, so reset is never offered
          here (canAccessReset defaults to false). */}
      <DatabaseBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        initialTab={backupModalTab}
        onDatabaseRestored={async () => {
          await refreshSystemStatus();
          if (onDatabaseRestored) {
            onDatabaseRestored();
          }
        }}
      />

    </div>
  );
};
