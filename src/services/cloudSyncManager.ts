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
  getDB
} from '../db/indexedDB';
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
