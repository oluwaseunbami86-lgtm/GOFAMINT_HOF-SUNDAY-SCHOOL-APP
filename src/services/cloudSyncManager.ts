import {
  cloudGetClassProfile,
  cloudGetAllClasses,
  cloudSaveClassProfile,
  cloudDeleteClass,
  cloudGetAllMembers,
  cloudGetMember,
  cloudSaveMember,
  cloudSaveBulkMembers,
  cloudDeleteMember,
  cloudGetAllGrades,
  cloudSaveGrade,
  cloudSaveBulkGrades,
  cloudDeleteGrade,
  cloudGetAllOfferings,
  cloudSaveOffering,
  cloudSaveBulkOfferings,
  cloudDeleteOffering,
  cloudGetAllAbsenceLogs,
  cloudSaveAbsenceLog,
  cloudDeleteAbsenceLog,
  cloudGetAllReferrals,
  cloudSaveReferral,
  cloudDeleteReferral,
  cloudGetAllWorkers,
  cloudSaveWorker,
  cloudSaveBulkWorkers,
  cloudDeleteWorker,
  cloudGetAllWorkerAttendance,
  cloudSaveWorkerAttendance,
  cloudSaveBulkWorkerAttendance,
  cloudDeleteWorkerAttendance,
  cloudGetAllWorkerPrepAttendance,
  cloudSaveWorkerPrepAttendance,
  cloudSaveBulkWorkerPrepAttendance,
  cloudGetAllAdminProfiles,
  cloudSaveAdminProfile,
  cloudDeleteAdminProfile,
  cloudGetAllAdminComments,
  cloudSaveAdminComment,
  cloudDeleteAdminComment,
  cloudGetAllTreasuryExpenditures,
  cloudSaveTreasuryExpenditure,
  cloudDeleteTreasuryExpenditure,
  cloudGetSundaySchoolYear,
  cloudSaveSundaySchoolYear,
  cloudGetAllDepartments,
  cloudSaveDepartment,
  cloudDeleteDepartment,
  cloudGetClockInConfig,
  cloudSaveClockInConfig,
  cloudGetAllWorkerCategories,
  cloudSaveWorkerCategory,
  cloudDeleteWorkerCategory,
  cloudGetAllSpecialEvents,
  cloudSaveSpecialEvent,
  cloudDeleteSpecialEvent,
  cloudGetAllSpecialEventAttendance,
  cloudSaveSpecialEventAttendance,
  cloudDeleteSpecialEventAttendance,
  cloudGetAllLessons,
  cloudSaveLesson
} from './firestoreDatabase';
import {
  getAllFromStore,
  putInStore,
  deleteFromStore,
  getDB,
  replaceStoreContents,
  retryFailedCloudPushes,
  getPendingCloudSyncFailures,
  FIRESTORE_STORE_MAP
} from '../db/indexedDB';
import { fetchCollection } from './firestoreDatabase';
import {
  ClassProfile,
  Member,
  WeeklyGradeRecord,
  WeeklyOfferingRecord,
  AbsenceLogRecord,
  EvangelismReferralRecord,
  AdminProfile,
  SundaySchoolYear,
  WorkerProfile,
  WorkerAttendanceRecord,
  WorkerPrepAttendanceRecord,
  ClockInConfig,
  WorkerCategoryDef,
  SpecialWorkersEvent,
  SpecialEventAttendanceRecord,
  AdminComment,
  TreasuryExpenditure,
  LessonInfo,
  QuarterNumber
} from '../types';

/**
 * SEAMLESS CLOUD HYDRATION & BIDIRECTIONAL SYNC
 * Ensures data is securely mirrored between permanent Cloud Firestore and local runtime cache.
 * When online, Cloud Firestore is the definitive source of truth.
 */

let isSyncingToCloud = false;

// Auto-seed existing local database data to Cloud Firestore if Firestore is uninitialized
export async function seedCloudFromLocalIfEmpty(): Promise<void> {
  if (isSyncingToCloud) return;
  isSyncingToCloud = true;

  try {
    // 1. Check if Cloud Sunday School Year or Admin Profiles exist
    const cloudYear = await cloudGetSundaySchoolYear();
    const cloudAdmins = await cloudGetAllAdminProfiles();
    const cloudClasses = await cloudGetAllClasses();

    const isCloudEmpty = !cloudYear && cloudAdmins.length === 0 && cloudClasses.length === 0;

    if (isCloudEmpty) {
      console.log('🌱 Performing initial migration of existing local records to Cloud Firestore...');
      
      // Migrate Local Year
      const localYears = await getAllFromStore<SundaySchoolYear>('sundaySchoolYear');
      if (localYears && localYears.length > 0) {
        for (const yr of localYears) {
          await cloudSaveSundaySchoolYear(yr);
        }
      }

      // Migrate Local Admin Profiles
      const localAdmins = await getAllFromStore<AdminProfile>('adminProfiles');
      if (localAdmins && localAdmins.length > 0) {
        for (const adm of localAdmins) {
          await cloudSaveAdminProfile(adm);
        }
      }

      // Migrate Local Classes
      const localClasses = await getAllFromStore<ClassProfile>('allClasses');
      const singleClass = await getAllFromStore<ClassProfile>('classProfile');
      const combinedClasses = [...(localClasses || []), ...(singleClass || [])];
      const uniqueClasses = Array.from(new Map(combinedClasses.map(c => [c.id, c])).values());
      for (const cls of uniqueClasses) {
        await cloudSaveClassProfile(cls);
      }

      // Migrate Members
      const localMembers = await getAllFromStore<Member>('members');
      if (localMembers && localMembers.length > 0) {
        await cloudSaveBulkMembers(localMembers);
      }

      // Migrate Grades
      const localGrades = await getAllFromStore<WeeklyGradeRecord>('grades');
      if (localGrades && localGrades.length > 0) {
        await cloudSaveBulkGrades(localGrades);
      }

      // Migrate Offerings
      const localOfferings = await getAllFromStore<WeeklyOfferingRecord>('offerings');
      if (localOfferings && localOfferings.length > 0) {
        await cloudSaveBulkOfferings(localOfferings);
      }

      // Migrate Absence Logs
      const localAbsences = await getAllFromStore<AbsenceLogRecord>('absenceLogs');
      if (localAbsences && localAbsences.length > 0) {
        for (const abs of localAbsences) {
          await cloudSaveAbsenceLog(abs);
        }
      }

      // Migrate Workers
      const localWorkers = await getAllFromStore<WorkerProfile>('workers');
      if (localWorkers && localWorkers.length > 0) {
        await cloudSaveBulkWorkers(localWorkers);
      }

      // Migrate Worker Attendance
      const localWAtt = await getAllFromStore<WorkerAttendanceRecord>('workerAttendance');
      if (localWAtt && localWAtt.length > 0) {
        await cloudSaveBulkWorkerAttendance(localWAtt);
      }

      // Migrate Worker Prep Attendance
      const localWPrep = await getAllFromStore<WorkerPrepAttendanceRecord>('workerPrepAttendance');
      if (localWPrep && localWPrep.length > 0) {
        await cloudSaveBulkWorkerPrepAttendance(localWPrep);
      }

      // Migrate Comments
      const localComments = await getAllFromStore<AdminComment>('adminComments');
      if (localComments && localComments.length > 0) {
        for (const comm of localComments) {
          await cloudSaveAdminComment(comm);
        }
      }

      // Migrate Expenditures
      const localExps = await getAllFromStore<TreasuryExpenditure>('treasuryExpenditures');
      if (localExps && localExps.length > 0) {
        for (const exp of localExps) {
          await cloudSaveTreasuryExpenditure(exp);
        }
      }

      // Migrate Departments
      const localDepts = await getAllFromStore<{ name: string; id?: string }>('departments');
      if (localDepts && localDepts.length > 0) {
        for (const d of localDepts) {
          await cloudSaveDepartment(d.name || d.id || '');
        }
      }

      // Migrate Referrals
      const localRefs = await getAllFromStore<EvangelismReferralRecord>('referrals');
      if (localRefs && localRefs.length > 0) {
        for (const r of localRefs) {
          await cloudSaveReferral(r);
        }
      }

      // Migrate ClockInConfig
      const localConfigs = await getAllFromStore<ClockInConfig>('clockInConfig');
      if (localConfigs && localConfigs.length > 0) {
        for (const cfg of localConfigs) {
          await cloudSaveClockInConfig(cfg);
        }
      }

      // Migrate WorkerCategories
      const localCats = await getAllFromStore<WorkerCategoryDef>('workerCategories');
      if (localCats && localCats.length > 0) {
        for (const cat of localCats) {
          await cloudSaveWorkerCategory(cat);
        }
      }

      // Migrate SpecialEvents
      const localEvents = await getAllFromStore<SpecialWorkersEvent>('specialEvents');
      if (localEvents && localEvents.length > 0) {
        for (const ev of localEvents) {
          await cloudSaveSpecialEvent(ev);
        }
      }

      // Migrate SpecialEventAttendance
      const localEvAtt = await getAllFromStore<SpecialEventAttendanceRecord>('specialEventAttendance');
      if (localEvAtt && localEvAtt.length > 0) {
        for (const ea of localEvAtt) {
          await cloudSaveSpecialEventAttendance(ea);
        }
      }

      // Migrate Lessons
      const localLessons = await getAllFromStore<LessonInfo>('lessons');
      if (localLessons && localLessons.length > 0) {
        for (const lsn of localLessons) {
          await cloudSaveLesson(lsn);
        }
      }

      console.log('✅ Initial cloud migration complete. Cloud Firestore is now populated.');
    }
  } catch (err) {
    console.warn('Initial cloud synchronization notice:', err);
  } finally {
    isSyncingToCloud = false;
  }
}

// -------------------------------------------------------------------------
// CLOUD -> LOCAL HYDRATION (the actual cross-device sync fix)
// -------------------------------------------------------------------------
// Previously the app only ever pushed local IndexedDB writes up to Firestore
// (fire-and-forget) and read exclusively from local IndexedDB on every screen.
// Nothing ever pulled Firestore's contents back down into IndexedDB, so a
// second device's local cache never learned about changes made on a first
// device. Firestore was being used as a one-way backup, not as the shared
// source of truth every device reads from.
//
// hydrateLocalFromCloud() closes that loop: it fetches every collection from
// the central Firestore database and replaces the matching local IndexedDB
// store's contents with it, so the next read (loadAppData / loadClassQuarterData
// in App.tsx) reflects whatever the current authoritative state is — including
// records created, edited, or deleted from ANY device.
//
// Stores that map 1:1 onto a Firestore collection are fully replaced (this also
// correctly propagates deletions made elsewhere). `classProfile` (the single
// "currently open" class on this device) and `departments` (stored as a
// differently-shaped local record) need small adapters, handled below.
let isHydrating = false;
let lastHydrationError: string | null = null;

const DIRECT_REPLACE_STORES = Object.keys(FIRESTORE_STORE_MAP).filter(
  (storeName) => !['classProfile', 'allClasses', 'departments'].includes(storeName)
);

export function getLastHydrationError(): string | null {
  return lastHydrationError;
}

export async function hydrateLocalFromCloud(): Promise<{ ok: boolean; error?: string }> {
  if (isHydrating) return { ok: true };
  isHydrating = true;
  try {
    // Guard against clobbering local writes that are still queued for retry
    // (e.g. this device is offline, or was offline a moment ago). Without
    // this, a hydration pass reading the still-stale cloud copy would
    // overwrite a perfectly good local edit/deletion with old data — the same
    // class of bug as the one this whole pipeline was built to fix, just
    // triggered by a slow/failed push instead of an abandoned one. Every
    // pending failure already carries its own collection + doc id + (for
    // saves) the exact payload that failed to reach the cloud, so we can
    // patch the freshly-fetched cloud snapshot before it overwrites anything.
    const pendingFailures = await getPendingCloudSyncFailures();
    const pendingByCollection = new Map<string, { deletedIds: Set<string>; savedRecords: Map<string, any> }>();
    for (const f of pendingFailures) {
      if (!pendingByCollection.has(f.collectionName)) {
        pendingByCollection.set(f.collectionName, { deletedIds: new Set(), savedRecords: new Map() });
      }
      const bucket = pendingByCollection.get(f.collectionName)!;
      if (f.action === 'delete') {
        bucket.deletedIds.add(f.docId);
      } else if (f.action === 'save' && f.data) {
        bucket.savedRecords.set(f.docId, f.data);
      }
    }

    // Straightforward collections: members, grades, offerings, absenceLogs,
    // referrals, adminProfiles, sundaySchoolYear, workers, workerAttendance,
    // workerPrepAttendance, clockInConfig, workerCategories, specialEvents,
    // specialEventAttendance, adminComments, treasuryExpenditures, lessons.
    for (const storeName of DIRECT_REPLACE_STORES) {
      const collectionName = FIRESTORE_STORE_MAP[storeName];
      const cloudItems = await fetchCollection<any>(collectionName);
      const pending = pendingByCollection.get(collectionName);
      let itemsToStore = cloudItems;
      if (pending && (pending.deletedIds.size > 0 || pending.savedRecords.size > 0)) {
        itemsToStore = cloudItems
          .filter((it: any) => !pending.deletedIds.has(it.id) && !pending.savedRecords.has(it.id))
          .concat(Array.from(pending.savedRecords.values()));
      }
      await replaceStoreContents(storeName, itemsToStore);
    }

    // Classes: hydrate the full directory, then refresh whichever class is
    // currently open on this device (without changing the selection itself —
    // "which class is open on this device" is local UI state, not business data).
    const cloudClasses = await fetchCollection<any>('classes');
    await replaceStoreContents('allClasses', cloudClasses);
    const existingProfiles = await getAllFromStore<any>('classProfile');
    const currentId = existingProfiles[0]?.id;
    if (currentId) {
      const matching = cloudClasses.find((c) => c.id === currentId);
      if (matching) {
        await replaceStoreContents('classProfile', [matching]);
      }
      // If the currently-open class was deleted from another device, we
      // deliberately leave the local copy in place rather than silently
      // clearing the screen — the existing UI's delete/switch-class flows
      // handle that case explicitly.
    }

    // Departments: Firestore stores {id, name} docs; the local store's keyPath
    // is `name`.
    const cloudDepartments = await fetchCollection<{ id: string; name: string }>('departments');
    await replaceStoreContents(
      'departments',
      cloudDepartments.map((d) => ({ name: d.name || d.id }))
    );

    lastHydrationError = null;
    return { ok: true };
  } catch (err: any) {
    const message = err?.message || 'Unknown cloud sync error';
    console.error('[cloud hydration] failed:', err);
    lastHydrationError = message;
    return { ok: false, error: message };
  } finally {
    isHydrating = false;
  }
}

// One full sync cycle: retry anything that failed to push earlier, seed the
// cloud on very first run, then pull the latest cloud state down locally.
// Safe to call repeatedly (on load, on window focus, on an interval, after
// every mutating action) — every step is idempotent / a no-op when there's
// nothing to do.
export async function runFullCloudSyncCycle(): Promise<{ ok: boolean; error?: string; pendingRetries: number }> {
  await retryFailedCloudPushes().catch((err) => console.warn('[cloud sync] retry pass failed:', err));
  await seedCloudFromLocalIfEmpty();
  const result = await hydrateLocalFromCloud();
  const pending = await getPendingCloudSyncFailures().catch(() => []);
  return { ...result, pendingRetries: pending.length };
}
