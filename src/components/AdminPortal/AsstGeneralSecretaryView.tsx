import React, { useState } from 'react';
import {
  BookCheck,
  Calendar,
  Users,
  CheckCircle2,
  FileSpreadsheet,
  BookOpen,
  Download,
  Building,
  Sparkles,
  ClipboardCheck
} from 'lucide-react';
import { AdminProfile, ClassProfile, SundaySchoolYear } from '../../types';

interface AsstGeneralSecretaryViewProps {
  currentAdmin: AdminProfile;
  allClasses: ClassProfile[];
  sundaySchoolYear: SundaySchoolYear;
}

export const AsstGeneralSecretaryView: React.FC<AsstGeneralSecretaryViewProps> = ({
  currentAdmin,
  allClasses,
  sundaySchoolYear
}) => {
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const activeQuarter = sundaySchoolYear.quarters.find(q => q.quarterNumber === sundaySchoolYear.activeQuarterNumber) || sundaySchoolYear.quarters[0];
  const currentLesson = activeQuarter.lessons?.find(l => l.weekNumber === selectedWeek);

  const totalTeachers = allClasses.reduce((sum, c) => sum + c.teachers.length, 0);

  return (
    <div className="space-y-6">
      
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border-2 border-indigo-400/40 relative overflow-hidden">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-400/20 border border-indigo-400/40 rounded-full text-xs font-black text-indigo-300 uppercase tracking-wider">
            <BookCheck className="w-3.5 h-3.5" />
            <span>Assistant General Secretary Directorate</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black font-['Cinzel',serif] tracking-wide text-white">
            Workers' Attendance & Secretarial Oversight
          </h1>
          <p className="text-xs sm:text-sm text-indigo-100 max-w-2xl leading-relaxed">
            Asst. General Secretary: <strong>{currentAdmin.profileName}</strong> ({currentAdmin.username}) • Assisting General Secretary with workers' attendance records, preparatory class coordination, and curriculum rollouts.
          </p>
        </div>
      </div>

      {/* Highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Approved Classes</span>
          <h3 className="text-2xl font-black text-slate-900 mt-1">{allClasses.length} Units</h3>
          <p className="text-xs text-slate-500 mt-1">Active Sunday School classes</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Teachers Roster</span>
          <h3 className="text-2xl font-black text-indigo-900 mt-1">{totalTeachers} Teachers</h3>
          <p className="text-xs text-slate-500 mt-1">Assigned across departments</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Preparatory Cycle</span>
          <h3 className="text-2xl font-black text-emerald-700 mt-1">Weekly Saturday</h3>
          <p className="text-xs text-slate-500 mt-1">Pre-lesson evaluation</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Current Quarter</span>
          <h3 className="text-2xl font-black text-slate-900 mt-1">Q{sundaySchoolYear.activeQuarterNumber}</h3>
          <p className="text-xs text-slate-500 mt-1">{sundaySchoolYear.yearName}</p>
        </div>
      </div>

      {/* Secretarial Class Status List */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 font-['Cinzel',serif]">
              Class Registers & Workers Assignment Verification
            </h3>
            <p className="text-xs text-slate-500">
              Departmental class rosters and designated Sunday School class secretaries.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {allClasses.map((cls) => (
            <div key={cls.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded">
                    {cls.department}
                  </span>
                  <h4 className="text-sm font-black text-slate-900">{cls.className}</h4>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  <strong>Secretary:</strong> {cls.secretaryName} {cls.secretaryPhone && `(${cls.secretaryPhone})`}
                </p>
                <p className="text-xs text-slate-500">
                  <strong>Teachers:</strong> {cls.teachers.map(t => t.name).join(', ')}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Approved & Active</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
