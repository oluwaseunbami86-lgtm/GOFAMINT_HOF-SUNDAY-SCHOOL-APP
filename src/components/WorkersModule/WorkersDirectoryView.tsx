import React, { useState, useMemo, useEffect } from 'react';
import { WorkerProfile, WorkerCategoryDef } from '../../types';
import { 
  Search, Plus, Upload, Filter, QrCode, Phone, MessageSquare, 
  MapPin, Edit, Trash2, CheckCircle2, XCircle, Printer, Sparkles,
  Users, Check, ExternalLink, ChevronRight, Download, BookOpen, Tag, Hash,
  Archive, ArchiveRestore, AlertTriangle, RefreshCw, ShieldAlert, Loader2
} from 'lucide-react';

export interface BulkWorkerDeleteResult {
  succeeded: string[];
  failed: { id: string; error: string }[];
}

interface WorkersDirectoryViewProps {
  workers: WorkerProfile[];
  categoriesList: WorkerCategoryDef[];
  departmentsList: string[];
  onAddWorker: () => void;
  onBulkImport: () => void;
  onEditWorker: (worker: WorkerProfile) => void;
  onDeleteWorker: (id: string) => Promise<void>;
  onSaveWorkerProfile?: (worker: WorkerProfile) => Promise<void>;
  onViewQrPass: (worker: WorkerProfile) => void;
  onQuickClockIn: (worker: WorkerProfile) => void;
  onNavigateToTab: (tab: any) => void;
  onBulkDeleteWorkers?: (ids: string[]) => Promise<BulkWorkerDeleteResult>;
  onDeleteAllWorkers?: () => Promise<{ deletedCount: number }>;
}

const DELETE_ALL_CONFIRM_PHRASE = 'DELETE ALL WORKERS';

export const WorkersDirectoryView: React.FC<WorkersDirectoryViewProps> = ({
  workers,
  categoriesList,
  departmentsList,
  onAddWorker,
  onBulkImport,
  onEditWorker,
  onDeleteWorker,
  onSaveWorkerProfile,
  onViewQrPass,
  onQuickClockIn,
  onNavigateToTab,
  onBulkDeleteWorkers,
  onDeleteAllWorkers
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeletingOne, setIsDeletingOne] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Archive & Restore Modals
  const [archiveModalWorker, setArchiveModalWorker] = useState<WorkerProfile | null>(null);
  const [archiveReason, setArchiveReason] = useState('Relocated / Moved to new city');
  const [restoreConfirmWorker, setRestoreConfirmWorker] = useState<WorkerProfile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Multi-select state for "Delete Selected"
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkDeleteNotice, setBulkDeleteNotice] = useState<string | null>(null);

  // Danger Zone — Delete All Workers
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllTypedText, setDeleteAllTypedText] = useState('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);

  // Filtered workers
  const filteredWorkers = useMemo(() => {
    return workers.filter(w => {
      const q = (searchQuery || '').toLowerCase();
      const matchesSearch = 
        (w.fullName || '').toLowerCase().includes(q) ||
        (w.sn ? String(w.sn).toLowerCase().includes(q) : false) ||
        (w.gender ? w.gender.toLowerCase().includes(q) : false) ||
        (w.assignedClass ? w.assignedClass.toLowerCase().includes(q) : false) ||
        (w.duty ? w.duty.toLowerCase().includes(q) : false) ||
        (w.archiveReason ? w.archiveReason.toLowerCase().includes(q) : false) ||
        (w.phone || '').includes(searchQuery || '') ||
        (w.whatsappNumber || '').includes(searchQuery || '') ||
        (w.address || '').toLowerCase().includes(q) ||
        (w.qrCodeToken || '').toLowerCase().includes(q) ||
        (w.categories || []).some(c => (c || '').toLowerCase().includes(q));

      const matchesDept = selectedDept === 'ALL' || w.department === selectedDept;
      const matchesCategory = selectedCategory === 'ALL' || w.categories.includes(selectedCategory) || w.duty === selectedCategory;
      const matchesStatus = selectedStatus === 'ALL' || w.status === selectedStatus;

      return matchesSearch && matchesDept && matchesCategory && matchesStatus;
    });
  }, [workers, searchQuery, selectedDept, selectedCategory, selectedStatus]);

  // Prune the selection whenever the underlying worker list changes (e.g.
  // after a delete completes, or a worker is filtered out) so we never try to
  // act on an id that no longer exists.
  useEffect(() => {
    setSelectedIds(prev => {
      const validIds = new Set(workers.map(w => w.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach(id => {
        if (validIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [workers]);

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedIds(checked ? new Set(filteredWorkers.map(w => w.id)) : new Set());
  };

  const handleConfirmBulkDelete = async () => {
    if (!onBulkDeleteWorkers || selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    setBulkDeleteError(null);
    try {
      const idsToDelete = Array.from(selectedIds);
      const result = await onBulkDeleteWorkers(idsToDelete);
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      if (result.failed.length > 0) {
        setBulkDeleteError(
          `${result.succeeded.length} worker(s) deleted. ${result.failed.length} could not be removed from the central database: ${result.failed.map(f => f.error).join('; ')}`
        );
      } else {
        setBulkDeleteNotice(`${result.succeeded.length} worker(s) deleted successfully.`);
        setTimeout(() => setBulkDeleteNotice(null), 4000);
      }
    } catch (err: any) {
      setBulkDeleteError(err?.message || 'Unable to delete the selected workers. Please try again.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    if (!onDeleteAllWorkers || deleteAllTypedText.trim() !== DELETE_ALL_CONFIRM_PHRASE) return;
    setIsDeletingAll(true);
    setDeleteAllError(null);
    try {
      await onDeleteAllWorkers();
      setSelectedIds(new Set());
      setShowDeleteAllModal(false);
      setDeleteAllTypedText('');
    } catch (err: any) {
      setDeleteAllError(err?.message || 'Unable to delete all workers. Please try again.');
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Statistics
  const activeCount = workers.filter(w => w.status === 'ACTIVE').length;
  const inactiveCount = workers.filter(w => w.status === 'INACTIVE').length;
  const archivedCount = workers.filter(w => w.status === 'ARCHIVED').length;

  const handlePrintDirectory = () => {
    window.print();
  };

  const handleConfirmArchive = async () => {
    if (!archiveModalWorker || !onSaveWorkerProfile) return;
    setIsProcessing(true);
    try {
      const updated: WorkerProfile = {
        ...archiveModalWorker,
        status: 'ARCHIVED',
        archivedAt: new Date().toISOString(),
        archiveReason: archiveReason.trim(),
        updatedAt: new Date().toISOString()
      };
      await onSaveWorkerProfile(updated);
      setArchiveModalWorker(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreConfirmWorker || !onSaveWorkerProfile) return;
    setIsProcessing(true);
    try {
      const updated: WorkerProfile = {
        ...restoreConfirmWorker,
        status: 'ACTIVE',
        archivedAt: undefined,
        archiveReason: undefined,
        updatedAt: new Date().toISOString()
      };
      await onSaveWorkerProfile(updated);
      setRestoreConfirmWorker(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportCsv = () => {
    if (workers.length === 0) return;

    // Header: S/N,Name,Sex,Department,Class,Duty,Status,Archive Reason,Phone Number,WhatsApp Number,Address
    const rows = [
      ['S/N', 'Name', 'Sex', 'Department', 'Class', 'Duty', 'Status', 'Archive Reason', 'Phone Number', 'WhatsApp Number', 'Address']
    ];

    workers.forEach((w, index) => {
      rows.push([
        String(w.sn || index + 1),
        `"${w.fullName.replace(/"/g, '""')}"`,
        w.gender === 'FEMALE' ? 'Female' : 'Male',
        `"${w.department.replace(/"/g, '""')}"`,
        `"${(w.assignedClass || '-').replace(/"/g, '""')}"`,
        `"${(w.duty || w.categories[0] || 'Class Teacher').replace(/"/g, '""')}"`,
        w.status,
        `"${(w.archiveReason || '').replace(/"/g, '""')}"`,
        `"${w.phone}"`,
        `"${w.whatsappNumber || w.phone}"`,
        `"${w.address.replace(/"/g, '""')}"`
      ]);
    });

    const csvContent = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gofamint_workers_directory_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getWhatsAppLink = (phone: string, name: string) => {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '234' + clean.slice(1);
    }
    const message = encodeURIComponent(`Calvary greetings ${name}, from GOFAMINT_HOF Sunday School & Workers Directorate.`);
    return `https://wa.me/${clean}?text=${message}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Banner & Quick Metrics */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 rounded-full text-xs font-black uppercase tracking-wider">
              Master Directory
            </span>
            <span className="text-xs text-slate-500 font-semibold">
              The Gospel Faith Mission Int.
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 font-['Cinzel',serif] tracking-tight mt-1">
            Workers & Ministers Register
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mt-1">
            Standard 9-column directory: S/N, Name, Sex, Department, Class, Duty, Phone, WhatsApp, and Address.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigateToTab('SUNDAY_CLOCK_IN')}
            className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Sunday Clock-In</span>
          </button>

          <button
            onClick={onBulkImport}
            className="px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition"
          >
            <Upload className="w-4 h-4 text-amber-300" />
            <span>Import Workers</span>
          </button>

          <button
            onClick={onAddWorker}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Worker</span>
          </button>

          {workers.length > 0 && (
            <button
              onClick={handleExportCsv}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              title="Export to CSV (S/N, Name, Sex, Department, Class, Duty, Contacts)"
            >
              <Download className="w-4 h-4 text-blue-900" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          )}

          <button
            onClick={handlePrintDirectory}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
            title="Print Directory"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metric Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div 
          onClick={() => setSelectedStatus('ALL')}
          className={`bg-white border rounded-xl p-4 shadow-xs cursor-pointer transition ${selectedStatus === 'ALL' ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}
        >
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Registered</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{workers.length}</div>
          <span className="text-[10px] text-slate-400">All directory profiles</span>
        </div>

        <div 
          onClick={() => setSelectedStatus('ACTIVE')}
          className={`bg-white border rounded-xl p-4 shadow-xs cursor-pointer transition ${selectedStatus === 'ACTIVE' ? 'border-emerald-600 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-emerald-300'}`}
        >
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Active Workers</span>
          <div className="text-2xl font-black text-emerald-700 mt-1">{activeCount}</div>
          <span className="text-[10px] text-emerald-600">On active weekly duty</span>
        </div>

        <div 
          onClick={() => setSelectedStatus('INACTIVE')}
          className={`bg-white border rounded-xl p-4 shadow-xs cursor-pointer transition ${selectedStatus === 'INACTIVE' ? 'border-slate-600 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-400'}`}
        >
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Inactive / Leave</span>
          <div className="text-2xl font-black text-slate-600 mt-1">{inactiveCount}</div>
          <span className="text-[10px] text-slate-400">Temporarily off-duty</span>
        </div>

        <div 
          onClick={() => setSelectedStatus('ARCHIVED')}
          className={`bg-amber-50/50 border rounded-xl p-4 shadow-xs cursor-pointer transition ${selectedStatus === 'ARCHIVED' ? 'border-amber-600 ring-2 ring-amber-200 bg-amber-50' : 'border-amber-200 hover:border-amber-400'}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">Archived Workers</span>
            <Archive className="w-3.5 h-3.5 text-amber-700" />
          </div>
          <div className="text-2xl font-black text-amber-800 mt-1">{archivedCount}</div>
          <span className="text-[10px] text-amber-700 font-semibold">Relocated / Out of country</span>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by worker name, S/N, department, class, duty, archive reason, phone, address..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden"
            />
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 border border-slate-200 rounded-xl text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-500 font-medium">Dept:</span>
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="bg-transparent font-bold text-slate-800 outline-hidden cursor-pointer"
            >
              <option value="ALL">All Departments ({workers.length})</option>
              {departmentsList.map(dept => {
                const count = workers.filter(w => w.department === dept).length;
                return (
                  <option key={dept} value={dept}>
                    {dept} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 border border-slate-200 rounded-xl text-xs">
            <span className="text-slate-500 font-medium">Role:</span>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-transparent font-bold text-slate-800 outline-hidden cursor-pointer max-w-[140px]"
            >
              <option value="ALL">All Roles</option>
              {categoriesList.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 border border-slate-200 rounded-xl text-xs">
            <span className="text-slate-500 font-medium">Status:</span>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="bg-transparent font-bold text-slate-800 outline-hidden cursor-pointer"
            >
              <option value="ALL">All Records ({workers.length})</option>
              <option value="ACTIVE">Active Workers ({activeCount})</option>
              <option value="INACTIVE">Inactive / Leave ({inactiveCount})</option>
              <option value="ARCHIVED">Archived ({archivedCount})</option>
            </select>
          </div>

        </div>

        {/* Active Filter Chips Bar */}
        {(selectedDept !== 'ALL' || selectedCategory !== 'ALL' || selectedStatus !== 'ALL' || searchQuery) && (
          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Filtered:</span>
              <span className="font-bold text-blue-900">{filteredWorkers.length} of {workers.length} workers</span>
            </div>
            <button
              onClick={() => {
                setSelectedDept('ALL');
                setSelectedCategory('ALL');
                setSelectedStatus('ALL');
                setSearchQuery('');
              }}
              className="text-blue-700 hover:text-blue-900 font-bold"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Bulk Selection Action Bar */}
      {onBulkDeleteWorkers && selectedIds.size > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-white font-bold">
            <CheckCircle2 className="w-4 h-4 text-amber-300" />
            <span>{selectedIds.size} worker{selectedIds.size === 1 ? '' : 's'} selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition"
            >
              Clear Selection
            </button>
            <button
              onClick={() => { setBulkDeleteError(null); setShowBulkDeleteConfirm(true); }}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-black transition flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      )}
      {bulkDeleteNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{bulkDeleteNotice}</span>
        </div>
      )}

      {/* Workers Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {filteredWorkers.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Users className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-bold text-slate-800">
                No Workers Found
              </h3>
              <p className="text-xs text-slate-500">
                {workers.length === 0 
                  ? 'There are currently no registered workers. Use the buttons above to import workers using S/N, Name, Sex, Department, Class, Duty, Phone Number, WhatsApp Number, Address.'
                  : 'No workers matched your active filter or search terms.'}
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={onBulkImport}
                className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
              >
                <Upload className="w-4 h-4 text-amber-300" />
                <span>Import Workers</span>
              </button>
              <button
                onClick={onAddWorker}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Single Worker</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[980px]">
              <thead className="bg-slate-900 text-amber-300 font-bold uppercase tracking-wider border-b border-slate-800 text-[11px]">
                <tr>
                  {onBulkDeleteWorkers && (
                    <th className="py-3 px-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={filteredWorkers.length > 0 && filteredWorkers.every(w => selectedIds.has(w.id))}
                        onChange={e => toggleSelectAllFiltered(e.target.checked)}
                        className="w-3.5 h-3.5 rounded cursor-pointer accent-amber-400"
                        title="Select all filtered workers"
                      />
                    </th>
                  )}
                  <th className="py-3 px-3 text-center w-12">S/N</th>
                  <th className="py-3 px-4">Worker Name</th>
                  <th className="py-3 px-3 text-center">Sex</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-3">Class</th>
                  <th className="py-3 px-4">Duty & Roles</th>
                  <th className="py-3 px-4">Contact Info</th>
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                {filteredWorkers.map((worker, index) => {
                  const initials = worker.fullName
                    .split(' ')
                    .filter(n => !n.includes('.'))
                    .map(n => n[0])
                    .slice(0, 2)
                    .join('') || 'W';

                  return (
                    <tr key={worker.id} className={`hover:bg-slate-50/80 transition group ${selectedIds.has(worker.id) ? 'bg-amber-50/60' : ''}`}>
                      
                      {/* Select Checkbox */}
                      {onBulkDeleteWorkers && (
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(worker.id)}
                            onChange={() => toggleSelectOne(worker.id)}
                            className="w-3.5 h-3.5 rounded cursor-pointer accent-amber-500"
                          />
                        </td>
                      )}

                      {/* S/N */}
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-500 text-[11px]">
                        {worker.sn || index + 1}
                      </td>

                      {/* Worker Profile */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-blue-900 text-amber-300 font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm">
                              {worker.fullName}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                {worker.qrCodeToken}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Sex */}
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          worker.gender === 'FEMALE' ? 'bg-pink-100 text-pink-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {worker.gender === 'FEMALE' ? 'Female' : 'Male'}
                        </span>
                      </td>

                      {/* Department */}
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-900 font-bold rounded-md text-[11px] border border-blue-200">
                          {worker.department}
                        </span>
                      </td>

                      {/* Class */}
                      <td className="py-3 px-3">
                        {worker.assignedClass && worker.assignedClass !== '-' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-900 font-semibold rounded text-[11px] border border-indigo-200">
                            <BookOpen className="w-3 h-3 text-indigo-600 shrink-0" />
                            <span>{worker.assignedClass}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>

                      {/* Duty & Roles */}
                      <td className="py-3 px-4 space-y-1">
                        <div className="font-semibold text-slate-900 text-[11px] flex items-center gap-1">
                          <Tag className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>{worker.duty || worker.categories[0] || 'Class Teacher'}</span>
                        </div>
                        {worker.categories.length > 1 && (
                          <div className="flex flex-wrap gap-1">
                            {worker.categories.filter(c => c !== worker.duty).map((cat, i) => (
                              <span key={i} className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded text-[9px] font-medium border border-slate-200">
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Contact Info (Phone & WhatsApp) */}
                      <td className="py-3 px-4 space-y-1">
                        <div className="flex items-center gap-1.5 font-mono text-slate-800">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{worker.phone}</span>
                        </div>
                        {worker.whatsappNumber && (
                          <div className="flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <a
                              href={getWhatsAppLink(worker.whatsappNumber, worker.fullName)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-emerald-700 hover:text-emerald-900 hover:underline inline-flex items-center gap-1 text-[11px]"
                              title="Chat on WhatsApp"
                            >
                              <span>{worker.whatsappNumber}</span>
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </a>
                          </div>
                        )}
                      </td>

                      {/* Address */}
                      <td className="py-3 px-4 max-w-[180px] text-slate-600 text-[11px] leading-snug">
                        <div className="flex items-start gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{worker.address || 'Assembly District'}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        {worker.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full font-bold text-[10px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Active
                          </span>
                        ) : worker.status === 'ARCHIVED' ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full font-black text-[10px]">
                              <Archive className="w-3 h-3 text-amber-700" />
                              Archived
                            </span>
                            {worker.archiveReason && (
                              <span className="text-[9px] text-amber-800 max-w-[120px] truncate" title={worker.archiveReason}>
                                {worker.archiveReason}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-200 text-slate-700 border border-slate-300 rounded-full font-bold text-[10px]">
                            <XCircle className="w-3 h-3 text-slate-500" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          
                          {worker.status === 'ACTIVE' && (
                            <button
                              onClick={() => onQuickClockIn(worker)}
                              className="p-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-lg transition border border-emerald-200"
                              title="Quick Clock-In for Sunday"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => onViewQrPass(worker)}
                            className="p-1.5 bg-blue-50 hover:bg-blue-900 text-blue-800 hover:text-white rounded-lg transition border border-blue-200"
                            title="View & Print QR ID Pass"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onEditWorker(worker)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-800 text-slate-700 hover:text-white rounded-lg transition"
                            title="Edit Worker Profile"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Archive or Restore Toggle Button */}
                          {worker.status === 'ARCHIVED' ? (
                            <button
                              onClick={() => setRestoreConfirmWorker(worker)}
                              className="p-1.5 bg-amber-100 hover:bg-amber-600 text-amber-900 hover:text-white rounded-lg transition border border-amber-300"
                              title="Restore / Unarchive Worker back to Active Directory"
                            >
                              <ArchiveRestore className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setArchiveModalWorker(worker);
                                setArchiveReason(worker.archiveReason || 'Relocated / Moved to new city');
                              }}
                              className="p-1.5 bg-slate-100 hover:bg-amber-600 text-slate-600 hover:text-white rounded-lg transition border border-slate-200"
                              title="Archive Worker (Relocated, Traveled, Transferred Church)"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => setDeleteConfirmId(worker.id)}
                            className="p-1.5 bg-slate-100 hover:bg-rose-600 text-slate-400 hover:text-white rounded-lg transition"
                            title="Delete Worker"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Danger Zone / Database Management */}
      {onDeleteAllWorkers && (
        <div className="bg-rose-50/40 border-2 border-dashed border-rose-300 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-rose-900 uppercase tracking-wide">
                Danger Zone — Database Management
              </h3>
              <p className="text-xs text-rose-800/80 max-w-lg mt-0.5">
                Permanently wipe the entire Workers Directory (all {workers.length} record{workers.length === 1 ? '' : 's'}) from the central database and every device — useful before uploading a fresh official list. This cannot be undone.
              </p>
            </div>
          </div>
          <button
            disabled={workers.length === 0}
            onClick={() => { setDeleteAllError(null); setDeleteAllTypedText(''); setShowDeleteAllModal(true); }}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition flex items-center gap-2 shadow-sm shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete All Workers</span>
          </button>
        </div>
      )}

      {/* Archive Modal */}
      {archiveModalWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Archive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Archive Worker Record
                </h3>
                <p className="text-xs text-slate-500">
                  {archiveModalWorker.fullName} • {archiveModalWorker.department}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-xs text-amber-950">
              <p className="leading-relaxed">
                Archiving a worker takes them off the active weekly ledgers, Sunday clock-in terminal, and future quarters (e.g. next quarter or 2nd quarter).
              </p>
              <p className="text-[11px] text-amber-800">
                Their historical attendance logs and ministry records remain permanently safe in the church database and can be unarchived at any time.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Reason for Archiving:
              </label>
              <select
                value={archiveReason}
                onChange={e => setArchiveReason(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-hidden"
              >
                <option value="Relocated / Moved to new city">Relocated / Moved to new city or state</option>
                <option value="Traveled Abroad / Out of Country">Traveled Abroad / Relocated outside the country</option>
                <option value="Transferred to another Assembly">Transferred to another GOFAMINT_HOF Assembly</option>
                <option value="Withdrew from Workforce">Withdrew / No longer in active church workforce</option>
                <option value="Extended Inactivity / Undetermined Absence">Extended Inactivity / Prolonged absence</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                disabled={isProcessing}
                onClick={() => setArchiveModalWorker(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                disabled={isProcessing}
                onClick={handleConfirmArchive}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center gap-2 shadow-sm"
              >
                <Archive className="w-4 h-4" />
                <span>{isProcessing ? 'Archiving...' : 'Archive Worker'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {restoreConfirmWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <ArchiveRestore className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Restore Worker to Active Status
                </h3>
                <p className="text-xs text-slate-500">
                  {restoreConfirmWorker.fullName} • {restoreConfirmWorker.department}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will restore <strong>{restoreConfirmWorker.fullName}</strong> back to the active church workers directory, allowing them to appear on upcoming weekly attendance rosters and Sunday clock-in terminals.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                disabled={isProcessing}
                onClick={() => setRestoreConfirmWorker(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                disabled={isProcessing}
                onClick={handleConfirmRestore}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
              >
                <ArchiveRestore className="w-4 h-4" />
                <span>{isProcessing ? 'Restoring...' : 'Restore to Active'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Confirm Worker Deletion
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove this worker from the Master Directory? This action cannot be undone. Historical attendance records will be retained.
            </p>
            {deleteError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 font-semibold">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                disabled={isDeletingOne}
                onClick={() => { setDeleteConfirmId(null); setDeleteError(null); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={isDeletingOne}
                onClick={async () => {
                  setIsDeletingOne(true);
                  setDeleteError(null);
                  try {
                    await onDeleteWorker(deleteConfirmId);
                    setDeleteConfirmId(null);
                  } catch (err: any) {
                    setDeleteError(err?.message || 'Unable to delete this worker. Please try again.');
                  } finally {
                    setIsDeletingOne(false);
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-60 flex items-center gap-2"
              >
                {isDeletingOne && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isDeletingOne ? 'Deleting…' : 'Delete Worker'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete ("Delete Selected") Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Delete {selectedIds.size} Selected Worker{selectedIds.size === 1 ? '' : 's'}?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete the selected workers? This action cannot be undone. Historical attendance records will be retained.
            </p>
            {bulkDeleteError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 font-semibold">
                {bulkDeleteError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                disabled={isBulkDeleting}
                onClick={() => { setShowBulkDeleteConfirm(false); setBulkDeleteError(null); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={isBulkDeleting}
                onClick={handleConfirmBulkDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-60 flex items-center gap-2"
              >
                {isBulkDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isBulkDeleting ? 'Deleting selected workers…' : `Delete ${selectedIds.size} Worker${selectedIds.size === 1 ? '' : 's'}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone — Delete All Workers Confirmation Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-slate-900">
                Delete ALL Workers?
              </h3>
            </div>
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 leading-relaxed">
              This will permanently remove <strong>all {workers.length} worker record(s)</strong> from the Master Directory, on this device and on the central database used by every other device. This cannot be undone.
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Type <span className="font-mono text-rose-700">{DELETE_ALL_CONFIRM_PHRASE}</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteAllTypedText}
                onChange={e => setDeleteAllTypedText(e.target.value)}
                placeholder={DELETE_ALL_CONFIRM_PHRASE}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-rose-500 outline-hidden"
              />
            </div>
            {deleteAllError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 font-semibold">
                {deleteAllError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                disabled={isDeletingAll}
                onClick={() => { setShowDeleteAllModal(false); setDeleteAllTypedText(''); setDeleteAllError(null); }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={isDeletingAll || deleteAllTypedText.trim() !== DELETE_ALL_CONFIRM_PHRASE}
                onClick={handleConfirmDeleteAll}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDeletingAll && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{isDeletingAll ? 'Deleting all workers…' : 'Permanently Delete All Workers'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
