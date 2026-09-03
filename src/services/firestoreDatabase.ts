import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot,
  writeBatch,
  DocumentData,
  Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';
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
 * PRODUCTION CLOUD FIRESTORE SERVICE
 * Serves as the independent, permanent source of truth for the application.
 * Multi-user realtime synchronization and persistent caching.
 */

// -------------------------------------------------------------
// GENERIC CLOUD FIRESTORE HELPERS
// -------------------------------------------------------------

/**
 * Recursively sanitizes an object to make it valid for Cloud Firestore.
 * Firestore strictly forbids `undefined` field values and throws an error if encountered.
 * This strips out `undefined` properties and ensures dates/nested structures are safely serialized.
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as unknown as T;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (data instanceof Date) {
    return data.toISOString() as unknown as T;
  }
  if (Array.isArray(data)) {
    return data
      .filter(item => item !== undefined)
      .map(item => cleanForFirestore(item)) as unknown as T;
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }
    result[key] = cleanForFirestore(value);
  }
  return result as T;
}

export async function fetchCollection<T>(collectionName: string): Promise<T[]> {
  try {
    const colRef = collection(db, collectionName);
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as T));
  } catch (error) {
    console.error(`Firestore fetchCollection error [${collectionName}]:`, error);
    return [];
  }
}

export async function fetchDocument<T>(collectionName: string, docId: string): Promise<T | null> {
  if (!docId) return null;
  try {
    const docRef = doc(db, collectionName, docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as unknown as T;
    }
    return null;
  } catch (error) {
    console.error(`Firestore fetchDocument error [${collectionName}/${docId}]:`, error);
    return null;
  }
}

export async function saveDocument<T extends { id: string }>(
  collectionName: string,
  data: T
): Promise<T> {
  if (!data || !data.id) {
    throw new Error(`Cannot save document without stable unique ID to [${collectionName}]`);
  }
  try {
    const docRef = doc(db, collectionName, data.id);
    const sanitized = cleanForFirestore({
      ...data,
      updatedAt: new Date().toISOString()
    });
    await setDoc(docRef, sanitized, { merge: true });
    return data;
  } catch (error) {
    console.error(`Firestore saveDocument error [${collectionName}/${data.id}]:`, error);
    throw error;
  }
}

export async function removeDocument(collectionName: string, docId: string): Promise<void> {
  if (!docId) return;
  try {
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error(`Firestore removeDocument error [${collectionName}/${docId}]:`, error);
    throw error;
  }
}

export async function saveBatchDocuments<T extends { id: string }>(
  collectionName: string,
  items: T[]
): Promise<void> {
  if (!items || items.length === 0) return;
  
  // Firestore batches support up to 500 operations per batch
  const chunkSize = 450;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const item of chunk) {
      if (item && item.id) {
        const docRef = doc(db, collectionName, item.id);
        const sanitized = cleanForFirestore({
          ...item,
          updatedAt: new Date().toISOString()
        });
        batch.set(docRef, sanitized, { merge: true });
      }
    }
    await batch.commit();
  }
}

// -------------------------------------------------------------
// REAL-TIME FIRESTORE SUBSCRIPTIONS (MULTI-USER COLLABORATION)
// -------------------------------------------------------------

export function subscribeToCollection<T>(
  collectionName: string,
  onUpdate: (data: T[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const colRef = collection(db, collectionName);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as T));
      onUpdate(results);
    },
    (err) => {
      console.error(`Subscription error [${collectionName}]:`, err);
      if (onError) onError(err);
    }
  );
}

export function subscribeToClassGrades(
  classId: string,
  quarterNumber: QuarterNumber,
  onUpdate: (grades: WeeklyGradeRecord[]) => void
): Unsubscribe {
  const colRef = collection(db, 'grades');
  const q = query(
    colRef,
    where('classId', '==', classId),
    where('quarterNumber', '==', quarterNumber)
  );
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyGradeRecord));
    onUpdate(items);
  });
}

export function subscribeToClassMembers(
  classId: string,
  onUpdate: (members: Member[]) => void
): Unsubscribe {
  const colRef = collection(db, 'members');
  const q = query(colRef, where('classId', '==', classId));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Member));
    onUpdate(items);
  });
}

export function subscribeToClassOfferings(
  classId: string,
  quarterNumber: QuarterNumber,
  onUpdate: (offerings: WeeklyOfferingRecord[]) => void
): Unsubscribe {
  const colRef = collection(db, 'offerings');
  const q = query(
    colRef,
    where('classId', '==', classId),
    where('quarterNumber', '==', quarterNumber)
  );
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyOfferingRecord));
    onUpdate(items);
  });
}

export function subscribeToClassProfile(
  classId: string,
  onUpdate: (profile: ClassProfile | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'classes', classId), (snap) => {
    onUpdate(snap.exists() ? ({ id: snap.id, ...snap.data() } as ClassProfile) : null);
  });
}

// -------------------------------------------------------------
// CLOUD FIRESTORE HIGH-LEVEL ENTITY ACCESSORS
// -------------------------------------------------------------

// 1. Classes & Profiles
export const cloudGetClassProfile = (id: string) => fetchDocument<ClassProfile>('classes', id);
export const cloudGetAllClasses = () => fetchCollection<ClassProfile>('classes');
export const cloudSaveClassProfile = (profile: ClassProfile) => saveDocument<ClassProfile>('classes', profile);
export const cloudDeleteClass = (classId: string) => removeDocument('classes', classId);

// 2. Members (Students & Visitors)
export const cloudGetAllMembers = () => fetchCollection<Member>('members');
export const cloudGetMember = (id: string) => fetchDocument<Member>('members', id);
export const cloudSaveMember = (member: Member) => saveDocument<Member>('members', member);
export const cloudSaveBulkMembers = (members: Member[]) => saveBatchDocuments<Member>('members', members);
export const cloudDeleteMember = (memberId: string) => removeDocument('members', memberId);

// 3. Grades & Attendance Records
export const cloudGetAllGrades = () => fetchCollection<WeeklyGradeRecord>('grades');
export const cloudSaveGrade = (grade: WeeklyGradeRecord) => saveDocument<WeeklyGradeRecord>('grades', grade);
export const cloudSaveBulkGrades = (grades: WeeklyGradeRecord[]) => saveBatchDocuments<WeeklyGradeRecord>('grades', grades);
export const cloudDeleteGrade = (gradeId: string) => removeDocument('grades', gradeId);

// 4. Offerings & Financial Remittances
export const cloudGetAllOfferings = () => fetchCollection<WeeklyOfferingRecord>('offerings');
export const cloudSaveOffering = (offering: WeeklyOfferingRecord) => saveDocument<WeeklyOfferingRecord>('offerings', offering);
export const cloudSaveBulkOfferings = (offerings: WeeklyOfferingRecord[]) => saveBatchDocuments<WeeklyOfferingRecord>('offerings', offerings);
export const cloudDeleteOffering = (offeringId: string) => removeDocument('offerings', offeringId);

// 5. Absence Logs & Follow-up
export const cloudGetAllAbsenceLogs = () => fetchCollection<AbsenceLogRecord>('absenceLogs');
export const cloudSaveAbsenceLog = (log: AbsenceLogRecord) => saveDocument<AbsenceLogRecord>('absenceLogs', log);
export const cloudDeleteAbsenceLog = (logId: string) => removeDocument('absenceLogs', logId);

// 6. Referrals & Outreach
export const cloudGetAllReferrals = () => fetchCollection<EvangelismReferralRecord>('referrals');
export const cloudSaveReferral = (ref: EvangelismReferralRecord) => saveDocument<EvangelismReferralRecord>('referrals', ref);
export const cloudDeleteReferral = (id: string) => removeDocument('referrals', id);

// 7. Workers & Attendance
export const cloudGetAllWorkers = () => fetchCollection<WorkerProfile>('workers');
export const cloudSaveWorker = (worker: WorkerProfile) => saveDocument<WorkerProfile>('workers', worker);
export const cloudSaveBulkWorkers = (workers: WorkerProfile[]) => saveBatchDocuments<WorkerProfile>('workers', workers);
export const cloudDeleteWorker = (workerId: string) => removeDocument('workers', workerId);

export const cloudGetAllWorkerAttendance = () => fetchCollection<WorkerAttendanceRecord>('workerAttendance');
export const cloudSaveWorkerAttendance = (att: WorkerAttendanceRecord) => saveDocument<WorkerAttendanceRecord>('workerAttendance', att);
export const cloudSaveBulkWorkerAttendance = (atts: WorkerAttendanceRecord[]) => saveBatchDocuments<WorkerAttendanceRecord>('workerAttendance', atts);
export const cloudDeleteWorkerAttendance = (id: string) => removeDocument('workerAttendance', id);

export const cloudGetAllWorkerPrepAttendance = () => fetchCollection<WorkerPrepAttendanceRecord>('workerPrepAttendance');
export const cloudSaveWorkerPrepAttendance = (p: WorkerPrepAttendanceRecord) => saveDocument<WorkerPrepAttendanceRecord>('workerPrepAttendance', p);
export const cloudSaveBulkWorkerPrepAttendance = (ps: WorkerPrepAttendanceRecord[]) => saveBatchDocuments<WorkerPrepAttendanceRecord>('workerPrepAttendance', ps);

// 8. Admin Profiles & Comments
export const cloudGetAllAdminProfiles = () => fetchCollection<AdminProfile>('adminProfiles');
export const cloudSaveAdminProfile = (prof: AdminProfile) => saveDocument<AdminProfile>('adminProfiles', prof);
export const cloudDeleteAdminProfile = (id: string) => removeDocument('adminProfiles', id);

export const cloudGetAllAdminComments = () => fetchCollection<AdminComment>('adminComments');
export const cloudSaveAdminComment = (comm: AdminComment) => saveDocument<AdminComment>('adminComments', comm);
export const cloudDeleteAdminComment = (id: string) => removeDocument('adminComments', id);

// 9. Treasury Expenditures
export const cloudGetAllTreasuryExpenditures = () => fetchCollection<TreasuryExpenditure>('treasuryExpenditures');
export const cloudSaveTreasuryExpenditure = (exp: TreasuryExpenditure) => saveDocument<TreasuryExpenditure>('treasuryExpenditures', exp);
export const cloudDeleteTreasuryExpenditure = (id: string) => removeDocument('treasuryExpenditures', id);

// 10. Sunday School Year & Curriculum
export const cloudGetSundaySchoolYear = async (): Promise<SundaySchoolYear | null> => {
  const years = await fetchCollection<SundaySchoolYear>('sundaySchoolYear');
  return years[0] || null;
};
export const cloudSaveSundaySchoolYear = (year: SundaySchoolYear) => saveDocument<SundaySchoolYear>('sundaySchoolYear', year);

// 11. Departments
export const cloudGetAllDepartments = async (): Promise<string[]> => {
  const docs = await fetchCollection<{ id: string; name: string }>('departments');
  return docs.map(d => d.name || d.id);
};
export const cloudSaveDepartment = (name: string) => saveDocument('departments', { id: name, name });
export const cloudDeleteDepartment = (name: string) => removeDocument('departments', name);

// 12. Clock-In Config & Categories
export const cloudGetClockInConfig = async (): Promise<ClockInConfig | null> => {
  const configs = await fetchCollection<ClockInConfig>('clockInConfig');
  return configs[0] || null;
};
export const cloudSaveClockInConfig = (cfg: ClockInConfig) => saveDocument<ClockInConfig>('clockInConfig', cfg);

export const cloudGetAllWorkerCategories = () => fetchCollection<WorkerCategoryDef>('workerCategories');
export const cloudSaveWorkerCategory = (cat: WorkerCategoryDef) => saveDocument<WorkerCategoryDef>('workerCategories', cat);
export const cloudDeleteWorkerCategory = (id: string) => removeDocument('workerCategories', id);

// 13. Special Events
export const cloudGetAllSpecialEvents = () => fetchCollection<SpecialWorkersEvent>('specialEvents');
export const cloudSaveSpecialEvent = (ev: SpecialWorkersEvent) => saveDocument<SpecialWorkersEvent>('specialEvents', ev);
export const cloudDeleteSpecialEvent = (id: string) => removeDocument('specialEvents', id);

export const cloudGetAllSpecialEventAttendance = () => fetchCollection<SpecialEventAttendanceRecord>('specialEventAttendance');
export const cloudSaveSpecialEventAttendance = (att: SpecialEventAttendanceRecord) => saveDocument<SpecialEventAttendanceRecord>('specialEventAttendance', att);
export const cloudDeleteSpecialEventAttendance = (id: string) => removeDocument('specialEventAttendance', id);

// 14. Lessons
export const cloudGetAllLessons = () => fetchCollection<LessonInfo>('lessons');
export const cloudSaveLesson = (lesson: LessonInfo) => saveDocument<any>('lessons', { ...lesson, id: `WEEK_${lesson.weekNumber}` });

// 15. Reset Year Audit Log & Archived Years (read-only from the client — both
// collections are written exclusively by the server's Admin SDK during
// /api/admin/reset-year; see firestore.rules).
export const cloudGetResetAuditLogs = () => fetchCollection<any>('auditLogs');
export const cloudGetSundaySchoolYearArchive = () => fetchCollection<SundaySchoolYear>('sundaySchoolYearArchive');

// 16. My own `users/{uid}` role record — used right after Firebase sign-in
// to determine which portal to route into (see App.tsx). Returns null for
// any signed-in account that predates this feature (legacy class/office
// logins with no `users/{uid}` doc), so those are left completely
// unaffected and fall through to the app's original class-picker flow.
export interface CloudUserRecord {
  uid: string;
  roleType: string;
  email: string | null;
  displayName: string | null;
  classId: string | null;
  status: 'ACTIVE' | 'DEACTIVATED';
  createdAt?: string;
}
export const cloudGetMyUserRecord = async (uid: string): Promise<CloudUserRecord | null> => {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { uid, ...(snap.data() as any) };
};

// 17. Year Archives — reading what a past year's reset moved into
// `yearArchives/{yearId}/{collectionName}`. Read-only; these are written
// exclusively by the server's Admin SDK during /api/admin/reset-year.
export const YEAR_ARCHIVE_COLLECTIONS = [
  'members', 'grades', 'offerings', 'absenceLogs', 'referrals',
  'workerAttendance', 'workerPrepAttendance', 'specialEvents',
  'specialEventAttendance', 'adminComments', 'treasuryExpenditures', 'lessons'
] as const;

export const cloudGetYearArchiveCollection = async (yearId: string, collectionName: string): Promise<any[]> => {
  const snap = await getDocs(collection(db, 'yearArchives', yearId, collectionName));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
