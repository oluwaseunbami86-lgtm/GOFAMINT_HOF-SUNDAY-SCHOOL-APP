import React, { useState, useMemo } from 'react';
import { 
  WorkerProfile, 
  WorkerPrepAttendanceRecord, 
  WorkerAttendanceRecord,
  PrepAttendanceStatus,
  SundayAttendanceStatus,
  SundaySchoolYear,
  QuarterNumber,
  ClockInConfig
} from '../../types';
import { 
  Calendar, Check, X, Clock, ShieldAlert, Filter, 
  Download, Printer, Sparkles, BookOpen, UserCheck, Search, 
  CheckCircle2, Lock, Edit3, ChevronRight, Layers, Award,
  QrCode, AlertCircle, ShieldCheck
} from 'lucide-react';
import { 
  getQuarterWeeklySchedule, 
  computeQuarterWeeklyMetrics 
} from '../../utils/quarterScheduleUtils';

export type AttendanceViewMode = 'THURSDAY_PREP' | 'SUNDAY_ATTENDANCE';

interface PreparatoryAttendanceViewProps {
  workers: WorkerProfile[];
  prepRecords: WorkerPrepAttendanceRecord[];
  sundayAttendance: WorkerAttendanceRecord[];
  departmentsList: string[];
  config: ClockInConfig;
  sundaySchoolYear: SundaySchoolYear;
  onSavePrepRecord: (record: WorkerPrepAttendanceRecord) => Promise<void>;
  onSaveBulkPrepRecords: (records: WorkerPrepAttendanceRecord[]) => Promise<void>;
  onSaveSundayRecord: (record: WorkerAttendanceRecord) => Promise<void>;
  onSaveBulkSundayRecords: (records: WorkerAttendanceRecord[]) => Promise<void>;
  onNavigateToTab?: (tab: any) => void;
}

export const PreparatoryAttendanceView: React.FC<PreparatoryAttendanceViewProps> = ({
  workers,
  prepRecords,
  sundayAttendance,
  departmentsList,
  config,
  sundaySchoolYear,
  onSavePrepRecord,
  onSaveBulkPrepRecords,
  onSaveSundayRecord,
  onSaveBulkSundayRecords,
  onNavigateToTab
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // Quarter selection (Synced with General Secretary)
  const [selectedQuarterNumber, setSelectedQuarterNumber] = useState<QuarterNumber>(
    sundaySchoolYear.activeQuarterNumber || 1
  );

  const activeQuarter = useMemo(() => {
    return sundaySchoolYear.quarters.find(q => q.quarterNumber === selectedQuarterNumber) || sundaySchoolYear.quarters[0];
  }, [sundaySchoolYear, selectedQuarterNumber]);

  // Quarter Weekly Schedule
  const quarterSchedule = useMemo(() => {
    return getQuarterWeeklySchedule(activeQuarter);
  }, [activeQuarter]);

  // Selected week (1 to 13)
  const [selectedWeek, setSelectedWeek] = useState<number>(1);

  // Week-Level Toggle: Thursday Preparatory Class vs Sunday Attendance
  const [viewMode, setViewMode] = useState<AttendanceViewMode>('THURSDAY_PREP');

  // Active week info
  const activeWeekInfo = useMemo(() => {
    return quarterSchedule.find(s => s.weekNumber === selectedWeek) || quarterSchedule[0];
  }, [quarterSchedule, selectedWeek]);

  // Target Dates
  const targetPrepDate = activeWeekInfo?.prepDate || todayStr;
  const targetSundayDate = activeWeekInfo?.sundayDate || todayStr;

  // Active target date based on current viewMode
  const activeTargetDate = viewMode === 'THURSDAY_PREP' ? targetPrepDate : targetSundayDate;
  const isTargetDatePast = activeTargetDate < todayStr;
  const isTargetDateToday = activeTargetDate === todayStr;
  const isTargetDateFuture = activeTargetDate > todayStr;

  // Filters (Grouped strictly by Department)
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [markedByName, setMarkedByName] = useState<string>('Workers Coordinator');

  // Filter workers based on search and department
  const filteredWorkers = useMemo(() => {
    return workers.filter(w => {
      if (w.status !== 'ACTIVE') return false; // Only active workers
      const q = (searchQuery || '').toLowerCase();
      const matchesSearch = 
        (w.fullName || '').toLowerCase().includes(q) ||
        (w.phone || '').includes(searchQuery || '') ||
        (w.department || '').toLowerCase().includes(q);
      const matchesDept = selectedDept === 'ALL' || w.department === selectedDept;
      return matchesSearch && matchesDept;
    });
  }, [workers, searchQuery, selectedDept]);

  // Thursday Prep Map (workerId -> WorkerPrepAttendanceRecord)
  const prepAttendanceMap = useMemo(() => {
    const map = new Map<string, WorkerPrepAttendanceRecord>();
    prepRecords
      .filter(r => r.prepDate === targetPrepDate)
      .forEach(r => {
        map.set(r.workerId, r);
      });
    return map;
  }, [prepRecords, targetPrepDate]);

  // Sunday Attendance Map (workerId -> WorkerAttendanceRecord)
  // Shared directly with Sunday Clock-In Terminal
  const sundayAttendanceMap = useMemo(() => {
    const map = new Map<string, WorkerAttendanceRecord>();
    sundayAttendance
      .filter(r => r.serviceDate === targetSundayDate)
      .forEach(r => {
        map.set(r.workerId, r);
      });
    return map;
  }, [sundayAttendance, targetSundayDate]);

  // Compute stats for current viewMode & date
  const stats = useMemo(() => {
    let present = 0;
    let late = 0;
    let excused = 0;
    let absent = 0;

    filteredWorkers.forEach(w => {
      if (viewMode === 'THURSDAY_PREP') {
        const rec = prepAttendanceMap.get(w.id);
        const status = rec ? rec.status : 'ABSENT';
        if (status === 'PRESENT') present++;
        else if (status === 'LATE') late++;
        else if (status === 'EXCUSED') excused++;
        else absent++;
      } else {
        const rec = sundayAttendanceMap.get(w.id);
        const status = rec ? rec.status : 'ABSENT';
        if (status === 'PRESENT') present++;
        else if (status === 'LATE') late++;
        else if (status === 'EXCUSED') excused++;
        else absent++;
      }
    });

    const total = filteredWorkers.length;
    const turnoutCount = present + late;
    const turnoutRate = total > 0 ? Math.round((turnoutCount / total) * 100) : 0;
    const punctualityRate = turnoutCount > 0 ? Math.round((present / turnoutCount) * 100) : 0;

    return { total, present, late, excused, absent, turnoutCount, turnoutRate, punctualityRate };
  }, [filteredWorkers, viewMode, prepAttendanceMap, sundayAttendanceMap]);

  // -------------------------------------------------------------
  // THURSDAY STATUS UPDATE
  // -------------------------------------------------------------
  const handleSetPrepStatus = async (worker: WorkerProfile, status: PrepAttendanceStatus) => {
    // Only past dates can be manually entered/modified
    if (!isTargetDatePast) {
      alert(`Manual attendance register is only permitted for past dates (before today, ${todayStr}). Current & future dates are restricted to live sessions.`);
      return;
    }

    const existing = prepAttendanceMap.get(worker.id);
    const newRecord: WorkerPrepAttendanceRecord = {
      id: `${worker.id}_prep_${targetPrepDate}`,
      workerId: worker.id,
      workerName: worker.fullName,
      department: worker.department,
      prepDate: targetPrepDate,
      sessionTitle: `Thursday Preparatory Class - Week ${selectedWeek}`,
      weekNumber: selectedWeek,
      status,
      syllabusPrepared: existing?.syllabusPrepared ?? true,
      markedBy: markedByName,
      notes: existing?.notes,
      updatedAt: new Date().toISOString()
    };
    await onSavePrepRecord(newRecord);
  };

  // Mark all visible workers as PRESENT for Thursday
  const handleMarkAllVisiblePrepPresent = async () => {
    if (!isTargetDatePast) {
      alert(`Manual bulk attendance entry is only permitted for past dates (before today, ${todayStr}).`);
      return;
    }

    const recordsToSave: WorkerPrepAttendanceRecord[] = filteredWorkers.map(w => {
      const existing = prepAttendanceMap.get(w.id);
      return {
        id: `${w.id}_prep_${targetPrepDate}`,
        workerId: w.id,
        workerName: w.fullName,
        department: w.department,
        prepDate: targetPrepDate,
        sessionTitle: `Thursday Preparatory Class - Week ${selectedWeek}`,
        weekNumber: selectedWeek,
        status: 'PRESENT',
        syllabusPrepared: existing?.syllabusPrepared ?? true,
        markedBy: markedByName,
        updatedAt: new Date().toISOString()
      };
    });

    await onSaveBulkPrepRecords(recordsToSave);
  };

  // -------------------------------------------------------------
  // SUNDAY STATUS UPDATE (Shared with Clock-In Terminal)
  // -------------------------------------------------------------
  const handleSetSundayStatus = async (worker: WorkerProfile, status: SundayAttendanceStatus) => {
    // Check editing rules:
    // 1. Current and future dates must NOT be manually editable through the register
    if (!isTargetDatePast) {
      alert(`Sunday attendance for current & future dates is recorded directly through the Sunday Clock-In Terminal (or Kiosk QR Scanner). Manual register entry is only allowed for past dates (before ${todayStr}).`);
      return;
    }

    const existing = sundayAttendanceMap.get(worker.id);

    // 2. If generated by actual Sunday Clock-In Terminal, clock-in info must NOT be overwritten
    if (existing && existing.method !== 'MANUAL_OVERRIDE' && existing.clockInTime) {
      alert(`This Sunday attendance record was verified by the Sunday Clock-In Terminal (${existing.clockInTime}). Terminal-generated records remain authoritative and cannot be manually modified.`);
      return;
    }

    const newRecord: WorkerAttendanceRecord = {
      id: `${worker.id}_${targetSundayDate}`,
      workerId: worker.id,
      workerName: worker.fullName,
      department: worker.department,
      serviceDate: targetSundayDate,
      serviceName: config.serviceName || 'Sunday Morning Service',
      clockInTime: existing?.clockInTime || (status === 'PRESENT' || status === 'LATE' ? '08:00 AM (Manual)' : '-'),
      timestamp: existing?.timestamp || Date.now(),
      status,
      isLate: status === 'LATE',
      method: 'MANUAL_OVERRIDE',
      notes: `Manual entry by ${markedByName} for past date ${targetSundayDate}`,
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    await onSaveSundayRecord(newRecord);
  };

  // Mark all visible workers as PRESENT for Sunday (past date only)
  const handleMarkAllVisibleSundayPresent = async () => {
    if (!isTargetDatePast) {
      alert(`Manual bulk Sunday attendance entry is only permitted for past dates (before today, ${todayStr}).`);
      return;
    }

    const recordsToSave: WorkerAttendanceRecord[] = filteredWorkers.map(w => {
      const existing = sundayAttendanceMap.get(w.id);
      return {
        id: `${w.id}_${targetSundayDate}`,
        workerId: w.id,
        workerName: w.fullName,
        department: w.department,
        serviceDate: targetSundayDate,
        serviceName: config.serviceName || 'Sunday Morning Service',
        clockInTime: existing?.clockInTime || '08:00 AM (Manual)',
        timestamp: existing?.timestamp || Date.now(),
        status: 'PRESENT',
        isLate: false,
        method: existing?.method || 'MANUAL_OVERRIDE',
        notes: existing?.notes || `Bulk manual entry for past date ${targetSundayDate}`,
        createdAt: existing?.createdAt || new Date().toISOString()
      };
    });

    await onSaveBulkSundayRecords(recordsToSave);
  };

  // -------------------------------------------------------------
  // EXPORT CSV HANDLER
  // -------------------------------------------------------------
  const handleExportCsv = () => {
    if (viewMode === 'THURSDAY_PREP') {
      const headers = ['Worker Full Name', 'Department', 'Phone', 'Prep Date', 'Week', 'Topic', 'Thursday Status', 'Marked By'];
      const rows = filteredWorkers.map(w => {
        const rec = prepAttendanceMap.get(w.id);
        return [
          `"${w.fullName}"`,
          `"${w.department}"`,
          `"${w.phone}"`,
          `"${targetPrepDate}"`,
          `"Week ${selectedWeek}"`,
          `"${activeWeekInfo?.topic || '-'}"`,
          `"${rec ? rec.status : 'ABSENT'}"`,
          `"${rec?.markedBy || markedByName}"`
        ];
      });

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `GOFAMINT_HOF_Thursday_Prep_Week_${selectedWeek}_${targetPrepDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const headers = ['Worker Full Name', 'Department', 'Phone', 'Sunday Date', 'Week', 'Topic', 'Sunday Status', 'Login Time', 'Verification Method'];
      const rows = filteredWorkers.map(w => {
        const rec = sundayAttendanceMap.get(w.id);
        return [
          `"${w.fullName}"`,
          `"${w.department}"`,
          `"${w.phone}"`,
          `"${targetSundayDate}"`,
          `"Week ${selectedWeek}"`,
          `"${activeWeekInfo?.topic || '-'}"`,
          `"${rec ? rec.status : 'ABSENT'}"`,
          `"${rec?.clockInTime || '-'}"`,
          `"${rec?.method || 'NONE'}"`
        ];
      });

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `GOFAMINT_HOF_Sunday_Attendance_Week_${selectedWeek}_${targetSundayDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* 1. EXACT HIERARCHY TOP BANNER */}
      {/* Study & Preparation -> Thursday Ministerial Preparatory Class / Sunday Attendance */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 rounded-full text-xs font-black uppercase tracking-wider">
              Study & Preparation
            </span>
            <span className="text-slate-300 font-bold">•</span>
            <span className="text-xs text-slate-700 font-bold">
              Thursday Ministerial Preparatory Class / Sunday Attendance
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 font-['Cinzel',serif] tracking-tight mt-1">
            Workers Weekly Attendance Register
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-2xl mt-1">
            Unified Thursday Preparatory study tracking and Sunday Service Clock-In verification. Synced with General Executive & Secretary quarter dates.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isTargetDatePast ? (
            <button
              onClick={viewMode === 'THURSDAY_PREP' ? handleMarkAllVisiblePrepPresent : handleMarkAllVisibleSundayPresent}
              className="px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-amber-300" />
              <span>Mark All Filtered Present</span>
            </button>
          ) : (
            <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Live Mode (Terminal Protected)</span>
            </div>
          )}

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            title="Print Attendance Register"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. GENERAL EXECUTIVE QUARTER SYNC & WEEK SELECTOR (WEEK 1 - 13) */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-md border-2 border-slate-800 space-y-4">
        
        {/* Quarter Select Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-amber-400" />
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                General Executive First Quarter Sync
              </span>
              <h2 className="text-lg font-black font-['Cinzel',serif] text-white">
                {activeQuarter.quarterName}: {activeQuarter.quarterTheme || 'Kingdom Study & Ministry Service'}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {sundaySchoolYear.quarters.map(q => {
              const isSelected = q.quarterNumber === selectedQuarterNumber;
              return (
                <button
                  key={q.id}
                  onClick={() => {
                    setSelectedQuarterNumber(q.quarterNumber);
                    setSelectedWeek(1);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 shadow-md font-black'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <span>Q{q.quarterNumber}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                    q.status === 'ACTIVE' 
                      ? 'bg-emerald-500 text-white' 
                      : q.status === 'ARCHIVED' 
                      ? 'bg-slate-600 text-slate-200' 
                      : 'bg-blue-600 text-white'
                  }`}>
                    {q.status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Week Tabs Horizontal Scroller (Week 1 to Week 13) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400">
              Select Evaluation Week (Week 1–{quarterSchedule.length}):
            </span>
            <span className="text-[11px] text-amber-300 font-mono">
              Prep Date: {targetPrepDate} (Thu) • Sunday Date: {targetSundayDate} (Sun)
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {quarterSchedule.map(item => {
              const isSelected = item.weekNumber === selectedWeek;
              return (
                <button
                  key={item.weekNumber}
                  onClick={() => setSelectedWeek(item.weekNumber)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition flex flex-col items-center cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md ring-2 ring-amber-400'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span className="font-black text-xs">
                    {item.isSharingAdmonitionWeek ? `Week ${item.weekNumber} (Admonition)` : `Week ${item.weekNumber}`}
                  </span>
                  <span className="text-[9px] opacity-75 font-mono mt-0.5">
                    {item.prepDate.slice(5)} / {item.sundayDate.slice(5)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. WEEK-LEVEL TWO-OPTION TOGGLE */}
        {/* [ THURSDAY PREPARATORY CLASS ] [ SUNDAY ATTENDANCE ] */}
        <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
              Week {selectedWeek} Attendance Register Mode:
            </span>
            <div className="inline-flex p-1 bg-slate-950/80 rounded-2xl border border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode('THURSDAY_PREP')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                  viewMode === 'THURSDAY_PREP'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>Thursday Preparatory Class</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('SUNDAY_ATTENDANCE')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                  viewMode === 'SUNDAY_ATTENDANCE'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Sunday Attendance</span>
              </button>
            </div>
          </div>

          {/* Active Lesson Topic & Date Banner */}
          <div className="bg-slate-800/90 rounded-2xl p-3 sm:p-4 border border-slate-700 flex items-center gap-4 text-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {viewMode === 'THURSDAY_PREP' ? 'Thursday Prep Session:' : 'Sunday Service Session:'}
              </span>
              <div className="text-sm font-bold text-white line-clamp-1">
                {activeWeekInfo?.topic || `Lesson ${selectedWeek}`}
              </div>
              <span className="text-[11px] text-amber-300 font-mono">
                Date: {activeTargetDate} ({isTargetDatePast ? 'Past Date' : isTargetDateToday ? 'Today' : 'Future Date'})
              </span>
            </div>

            <div className="border-l border-slate-700 pl-4 shrink-0 text-right">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Punctuality</span>
              <span className="text-base font-black text-emerald-400 font-mono">{stats.punctualityRate}%</span>
            </div>
          </div>
        </div>

      </div>

      {/* Live / Past Editing Notice */}
      {!isTargetDatePast && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3 text-xs text-amber-950 shadow-xs">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-black uppercase tracking-wider text-amber-900">
              Source of Truth & Live Lock Rule: {isTargetDateToday ? 'Current Date Session' : 'Future Session'}
            </div>
            <p className="leading-relaxed">
              Current and future attendance is managed through live Sunday Clock-In Terminal scans or scheduled sessions. Quick Set Attendance buttons in the register are unlocked exclusively for <strong>past dates</strong> that require historical review or manual administrative entry.
            </p>
          </div>
        </div>
      )}

      {/* Filter and Metrics Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        
        {/* Department Filter ONLY */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <label className="font-bold text-slate-700">Department:</label>
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 font-bold text-slate-800 text-xs focus:outline-hidden focus:border-blue-900"
            >
              <option value="ALL">All Departments ({workers.filter(w => w.status === 'ACTIVE').length})</option>
              {departmentsList.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search worker by name..."
            className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:border-blue-900 w-48 sm:w-60"
          />
        </div>

        {/* 4 Summary Stat Pills */}
        <div className="flex items-center gap-2 text-xs">
          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl font-bold">
            Present: <strong>{stats.present}</strong>
          </div>
          <div className="px-3 py-1.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl font-bold">
            Late: <strong>{stats.late}</strong>
          </div>
          <div className="px-3 py-1.5 bg-rose-50 text-rose-900 border border-rose-200 rounded-xl font-bold">
            Absent: <strong>{stats.absent}</strong>
          </div>
          <div className="px-3 py-1.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-xl font-bold">
            Excused: <strong>{stats.excused}</strong>
          </div>
        </div>

      </div>

      {/* 4. WORKERS ATTENDANCE REGISTER TABLE */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-300">
              <tr>
                <th className="py-3 px-3">Worker Name</th>
                <th className="py-3 px-3">Department</th>
                {viewMode === 'THURSDAY_PREP' ? (
                  <>
                    <th className="py-3 px-3 text-center">Thursday Status</th>
                    <th className="py-3 px-3 text-right">Quick Set Attendance</th>
                  </>
                ) : (
                  <>
                    <th className="py-3 px-3 text-center">Sunday Status</th>
                    <th className="py-3 px-3 text-center">Quick Set Attendance</th>
                    <th className="py-3 px-3 text-right">Login Time</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredWorkers.map(worker => {
                if (viewMode === 'THURSDAY_PREP') {
                  const rec = prepAttendanceMap.get(worker.id);
                  const currentStatus = rec ? rec.status : 'ABSENT';

                  return (
                    <tr key={worker.id} className="hover:bg-slate-50 transition">
                      
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 text-sm">
                          {worker.fullName}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {worker.phone}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded font-bold text-[10px]">
                          {worker.department}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          currentStatus === 'PRESENT'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : currentStatus === 'LATE'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : currentStatus === 'EXCUSED'
                            ? 'bg-blue-100 text-blue-900 border-blue-300'
                            : 'bg-rose-100 text-rose-900 border-rose-300'
                        }`}>
                          {currentStatus}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right">
                        {isTargetDatePast ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSetPrepStatus(worker, 'PRESENT')}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                                currentStatus === 'PRESENT'
                                  ? 'bg-emerald-700 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 hover:bg-emerald-100 hover:text-emerald-900'
                              }`}
                            >
                              Present
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSetPrepStatus(worker, 'LATE')}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                                currentStatus === 'LATE'
                                  ? 'bg-amber-600 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 hover:bg-amber-100 hover:text-amber-900'
                              }`}
                            >
                              Late
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSetPrepStatus(worker, 'ABSENT')}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                                currentStatus === 'ABSENT'
                                  ? 'bg-rose-700 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 hover:bg-rose-100 hover:text-rose-900'
                              }`}
                            >
                              Absent
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSetPrepStatus(worker, 'EXCUSED')}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                currentStatus === 'EXCUSED'
                                  ? 'bg-blue-700 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 hover:bg-blue-100 hover:text-blue-900'
                              }`}
                            >
                              Excused
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400 italic">
                            Live Protected
                          </span>
                        )}
                      </td>

                    </tr>
                  );
                } else {
                  // SUNDAY ATTENDANCE ROW
                  const rec = sundayAttendanceMap.get(worker.id);
                  const currentStatus = rec ? rec.status : 'ABSENT';
                  const isTerminalVerified = rec && rec.method !== 'MANUAL_OVERRIDE' && !!rec.clockInTime;

                  return (
                    <tr key={worker.id} className="hover:bg-slate-50 transition">
                      
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 text-sm">
                          {worker.fullName}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {worker.phone}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded font-bold text-[10px]">
                          {worker.department}
                        </span>
                      </td>

                      {/* Sunday Status */}
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          currentStatus === 'PRESENT'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : currentStatus === 'LATE'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : currentStatus === 'EXCUSED'
                            ? 'bg-blue-100 text-blue-900 border-blue-300'
                            : 'bg-rose-100 text-rose-900 border-rose-300'
                        }`}>
                          {currentStatus}
                        </span>
                      </td>

                      {/* Quick Set Attendance */}
                      <td className="py-3 px-3 text-center">
                        {isTerminalVerified ? (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-300 rounded-lg text-[10px] font-bold text-emerald-900">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>Terminal Verified</span>
                          </div>
                        ) : isTargetDatePast ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSetSundayStatus(worker, 'PRESENT')}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                                currentStatus === 'PRESENT'
                                  ? 'bg-emerald-700 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 hover:bg-emerald-100 hover:text-emerald-900'
                              }`}
                            >
                              Present
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSetSundayStatus(worker, 'LATE')}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                                currentStatus === 'LATE'
                                  ? 'bg-amber-600 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 hover:bg-amber-100 hover:text-amber-900'
                              }`}
                            >
                              Late
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSetSundayStatus(worker, 'ABSENT')}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                                currentStatus === 'ABSENT'
                                  ? 'bg-rose-700 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 hover:bg-rose-100 hover:text-rose-900'
                              }`}
                            >
                              Absent
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSetSundayStatus(worker, 'EXCUSED')}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                currentStatus === 'EXCUSED'
                                  ? 'bg-blue-700 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 hover:bg-blue-100 hover:text-blue-900'
                              }`}
                            >
                              Excused
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400 italic">
                            Live Terminal Active
                          </span>
                        )}
                      </td>

                      {/* Login Time / Clock-In */}
                      <td className="py-3 px-3 text-right">
                        {rec?.clockInTime ? (
                          <div className="space-y-0.5">
                            <span className="font-mono font-bold text-slate-900 text-xs bg-slate-100 px-2 py-0.5 rounded">
                              {rec.clockInTime}
                            </span>
                            {rec.method && (
                              <div className="text-[9px] text-slate-500 font-sans">
                                {rec.method === 'QR_SCAN' ? 'QR Terminal' : rec.method === 'MANUAL_OVERRIDE' ? 'Manual Past Entry' : rec.method}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">—</span>
                        )}
                      </td>

                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
};
