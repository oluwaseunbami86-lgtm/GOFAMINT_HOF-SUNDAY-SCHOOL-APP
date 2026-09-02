import React, { useState, useEffect } from 'react';
import { Archive, ChevronRight, ChevronLeft, Download, Loader2, Users, GraduationCap, Banknote, FileText } from 'lucide-react';
import { cloudGetSundaySchoolYearArchive, cloudGetYearArchiveCollection, YEAR_ARCHIVE_COLLECTIONS } from '../../services/firestoreDatabase';
import { SundaySchoolYear } from '../../types';

const COLLECTION_LABELS: Record<string, string> = {
  members: 'Members & Enrollment',
  grades: 'Weekly Grades',
  offerings: 'Offerings',
  absenceLogs: 'Absence / Welfare Logs',
  referrals: 'Evangelism Referrals',
  workerAttendance: 'Worker Sunday Attendance',
  workerPrepAttendance: 'Worker Preparatory Attendance',
  specialEvents: 'Special Events',
  specialEventAttendance: 'Special Event Attendance',
  adminComments: 'Admin Comments',
  treasuryExpenditures: 'Treasury Expenditures',
  lessons: 'Lesson Curriculum'
};

function downloadCsv(filename: string, rows: any[]) {
  if (rows.length === 0) {
    alert('This record has no data to export for this year.');
    return;
  }
  const headers: string[] = Array.from(rows.reduce((set: Set<string>, row: any) => {
    Object.keys(row).forEach((k) => set.add(k));
    return set;
  }, new Set<string>()));

  const escapeCell = (val: any) => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

interface YearArchivesViewProps {
  currentYear: SundaySchoolYear | null;
  onBack: () => void;
}

/**
 * Browse every past church year's archived records — nothing shown here was
 * ever deleted; a year reset moves records into yearArchives/{yearId}/...
 * instead of hard-deleting them (see /api/admin/reset-year). Restricted to
 * GENERAL_SUPERINTENDENT / GENERAL_SECRETARY / SUPER_ADMIN via
 * firestore.rules — this screen assumes that gate, it doesn't re-implement
 * it.
 */
export const YearArchivesView: React.FC<YearArchivesViewProps> = ({ currentYear, onBack }) => {
  const [archivedYears, setArchivedYears] = useState<SundaySchoolYear[]>([]);
  const [isLoadingYears, setIsLoadingYears] = useState(true);
  const [selectedYear, setSelectedYear] = useState<any | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoadingYears(true);
      try {
        const years = await cloudGetSundaySchoolYearArchive();
        years.sort((a: any, b: any) => (b.archivedAt?.seconds || 0) - (a.archivedAt?.seconds || 0));
        setArchivedYears(years);
      } catch (err) {
        console.error('Failed to load archived years:', err);
      } finally {
        setIsLoadingYears(false);
      }
    })();
  }, []);

  const openYear = async (year: any) => {
    setSelectedYear(year);
    setCounts({});
    setLoadingCounts(true);
    const entries: [string, number][] = [];
    for (const collectionName of YEAR_ARCHIVE_COLLECTIONS) {
      try {
        const docs = await cloudGetYearArchiveCollection(year.id, collectionName);
        entries.push([collectionName, docs.length]);
      } catch (err) {
        console.error(`Failed to count ${collectionName} for ${year.id}:`, err);
        entries.push([collectionName, 0]);
      }
    }
    setCounts(Object.fromEntries(entries));
    setLoadingCounts(false);
  };

  const handleExport = async (year: any, collectionName: string) => {
    setExportingKey(collectionName);
    try {
      const docs = await cloudGetYearArchiveCollection(year.id, collectionName);
      downloadCsv(`${year.yearName || year.id}_${collectionName}.csv`, docs);
    } catch (err: any) {
      alert(`Could not export this record: ${err.message || err}`);
    } finally {
      setExportingKey(null);
    }
  };

  // ---- Detail view for a selected year ----
  if (selectedYear) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        <button
          onClick={() => setSelectedYear(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-blue-900 hover:text-blue-700"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Year Archives
        </button>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-black text-slate-900 font-['Cinzel',serif]">{selectedYear.yearName || selectedYear.id}</h2>
          </div>
          {selectedYear.overallTheme && <p className="text-xs text-slate-500 mt-1 italic">"{selectedYear.overallTheme}"</p>}
          <p className="text-[11px] text-slate-400 mt-1">Archived — read-only historical record</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><FileText className="w-4 h-4" /> Records for This Year</h3>
          {loadingCounts && <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Counting records…</p>}
          {!loadingCounts && YEAR_ARCHIVE_COLLECTIONS.map((key) => (
            <div key={key} className="flex items-center justify-between border-b border-slate-100 last:border-0 py-2">
              <div>
                <div className="text-sm text-slate-700">{COLLECTION_LABELS[key] || key}</div>
                <div className="text-[11px] text-slate-400">{counts[key] ?? 0} record(s)</div>
              </div>
              <button
                onClick={() => handleExport(selectedYear, key)}
                disabled={exportingKey === key || (counts[key] ?? 0) === 0}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-900 border border-blue-200 rounded-lg px-2.5 py-1.5 disabled:opacity-40"
              >
                {exportingKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                CSV
              </button>
            </div>
          ))}
        </div>

        {Array.isArray(selectedYear.classAssignmentsSnapshot) && selectedYear.classAssignmentsSnapshot.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2"><Users className="w-4 h-4" /> Who Taught Each Class This Year</h3>
            <div className="space-y-1.5">
              {selectedYear.classAssignmentsSnapshot.map((c: any) => (
                <div key={c.classId} className="text-xs border-b border-slate-100 last:border-0 pb-1.5">
                  <span className="font-bold text-slate-700">{c.className}</span>
                  {c.secretaryName && <span className="text-slate-500"> — Secretary: {c.secretaryName}</span>}
                  {Array.isArray(c.teachers) && c.teachers.length > 0 && (
                    <span className="text-slate-500"> — Teacher(s): {c.teachers.map((t: any) => t.name).join(', ')}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(selectedYear.workerAssignmentsSnapshot) && selectedYear.workerAssignmentsSnapshot.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2"><GraduationCap className="w-4 h-4" /> Worker Duties This Year</h3>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {selectedYear.workerAssignmentsSnapshot.map((w: any) => (
                <div key={w.workerId} className="text-xs border-b border-slate-100 last:border-0 pb-1">
                  <span className="font-bold text-slate-700">{w.fullName}</span>
                  <span className="text-slate-500"> — {w.duty || 'No duty recorded'}{w.assignedClass ? ` (${w.assignedClass})` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(selectedYear.adminProfileAssignmentsSnapshot) && selectedYear.adminProfileAssignmentsSnapshot.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2"><Banknote className="w-4 h-4" /> Officers This Year</h3>
            <div className="space-y-1">
              {selectedYear.adminProfileAssignmentsSnapshot.map((a: any) => (
                <div key={a.roleType} className="text-xs border-b border-slate-100 last:border-0 pb-1">
                  <span className="font-bold text-slate-700">{a.title || a.roleType}</span>
                  <span className="text-slate-500"> — {a.profileName || 'Unnamed'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Year list ----
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-blue-900 hover:text-blue-700">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div>
        <h2 className="text-xl font-black text-slate-900 font-['Cinzel',serif] flex items-center gap-2">
          <Archive className="w-5 h-5" /> Church Year Archives
        </h2>
        <p className="text-xs text-slate-500 mt-1">Every past year's records — preserved, never deleted.</p>
      </div>

      {currentYear && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black uppercase text-emerald-700">Active</div>
            <div className="text-sm font-bold text-emerald-950">{currentYear.yearName || currentYear.id}</div>
          </div>
        </div>
      )}

      {isLoadingYears && <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading archived years…</p>}
      {!isLoadingYears && archivedYears.length === 0 && (
        <p className="text-xs text-slate-400">No years have been archived yet — they'll appear here after the first "Start New Year" reset.</p>
      )}

      <div className="space-y-2">
        {archivedYears.map((year: any) => (
          <button
            key={year.id}
            onClick={() => openYear(year)}
            className="w-full flex items-center justify-between bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-4 text-left transition"
          >
            <div>
              <div className="text-sm font-bold text-slate-800">{year.yearName || year.id}</div>
              {year.overallTheme && <div className="text-[11px] text-slate-400 italic">"{year.overallTheme}"</div>}
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        ))}
      </div>
    </div>
  );
};
