// NOTE: This file is a self-contained bundle of src/server/app.ts and
// src/server/firebaseAdmin.ts, generated to work around a Vercel serverless
// function limitation where cross-folder relative TypeScript imports from
// /api into /src are not transpiled correctly at runtime.
//
// If you change src/server/app.ts or src/server/firebaseAdmin.ts, this file
// needs to be regenerated to match (ask Claude to re-bundle it).

import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Must match the client's firestoreDatabaseId in firebase-applet-config.json —
// this project uses a named Firestore database, not the "(default)" one.
// (Not a secret — this same ID is already shipped to every browser in the
// client-side Firebase config, so it's safe to hardcode here.)
const FIRESTORE_DATABASE_ID = "ai-studio-remixremixremixr-e1005fdc-a3ec-4e1c-8527-666bdea0d747";

let adminApp: any = null;
function getAdminApp() {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not set. Generate a service account key in Firebase Console → Project Settings → Service Accounts, and set its full JSON contents as this environment variable."
    );
  }
  const serviceAccount = JSON.parse(raw);
  adminApp = initializeApp({ credential: cert(serviceAccount) });
  return adminApp;
}
function getAdminAuth() {
  return getAuth(getAdminApp());
}
function getAdminDb() {
  return FIRESTORE_DATABASE_ID
    ? getFirestore(getAdminApp(), FIRESTORE_DATABASE_ID)
    : getFirestore(getAdminApp());
}

dotenv.config();
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "server_database.json");
const isServerless = !!process.env.VERCEL;

function loadServerData(): any {
  if (!isServerless && fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return null;
}
function saveServerData(data: any) {
  if (isServerless) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist server data file:", err);
  }
}

const serverDatabase: any = loadServerData() || {
  classes: [],
  members: [],
  grades: [],
  offerings: [],
  absenceLogs: [],
  referrals: [],
  lastSyncedAt: new Date().toISOString(),
};

function createApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      serverTime: new Date().toISOString(),
      appName: "GOFAMINT_HOF Sunday School Secretary Host Server",
      hostIpConfigured: true,
      recordsCount: {
        members: serverDatabase.members?.length || 0,
        grades: serverDatabase.grades?.length || 0,
        offerings: serverDatabase.offerings?.length || 0,
        absenceLogs: serverDatabase.absenceLogs?.length || 0,
      },
      lastSyncedAt: serverDatabase.lastSyncedAt,
    });
  });

  app.get("/api/schema", (req, res) => {
    const schemaPath = path.join(process.cwd(), "src", "db", "schema.sql");
    if (fs.existsSync(schemaPath)) {
      res.setHeader("Content-Type", "text/plain");
      res.send(fs.readFileSync(schemaPath, "utf-8"));
    } else {
      res.status(404).send("-- Schema file not found on server");
    }
  });

  app.post("/api/sync/push", (req, res) => {
    try {
      const payload = req.body;
      if (!payload) return res.status(400).json({ error: "Invalid payload" });
      if (payload.classProfile) {
        const idx = serverDatabase.classes.findIndex((c: any) => c.id === payload.classProfile.id);
        if (idx >= 0) serverDatabase.classes[idx] = payload.classProfile;
        else serverDatabase.classes.push(payload.classProfile);
      }
      const mergeArray = (key: string, items: any[]) => {
        for (const item of items) {
          const idx = serverDatabase[key].findIndex((x: any) => x.id === item.id);
          if (idx >= 0) serverDatabase[key][idx] = item;
          else serverDatabase[key].push(item);
        }
      };
      if (Array.isArray(payload.members)) mergeArray("members", payload.members);
      if (Array.isArray(payload.grades)) mergeArray("grades", payload.grades);
      if (Array.isArray(payload.offerings)) mergeArray("offerings", payload.offerings);
      if (Array.isArray(payload.absenceLogs)) mergeArray("absenceLogs", payload.absenceLogs);
      serverDatabase.lastSyncedAt = new Date().toISOString();
      saveServerData(serverDatabase);
      res.json({
        success: true,
        message: isServerless
          ? "Received (not persisted — serverless filesystem is ephemeral; use Firestore sync instead)"
          : "Offline data successfully synced and persisted to Central Server",
        timestamp: serverDatabase.lastSyncedAt,
      });
    } catch (err: any) {
      console.error("Sync push error:", err);
      res.status(500).json({ error: err.message || "Failed to process sync push" });
    }
  });

  app.get("/api/sync/pull", (req, res) => {
    res.json({
      classProfile: serverDatabase.classes[0] || null,
      members: serverDatabase.members,
      grades: serverDatabase.grades,
      offerings: serverDatabase.offerings,
      absenceLogs: serverDatabase.absenceLogs,
      referrals: serverDatabase.referrals || [],
      timestamp: serverDatabase.lastSyncedAt,
    });
  });

  app.post("/api/gemini/assistant", async (req, res) => {
    try {
      const {
        type,
        memberName,
        status,
        weeksAbsent,
        prayerRequest,
        lessonTopic,
        memoryVerse,
        memoryVerseRef,
        teacherName,
      } = req.body;

      let prompt = "";
      if (type === "WHATSAPP_FOLLOWUP") {
        prompt = `You are the Sunday School Secretary / Teacher at The Gospel Faith Mission International (House of Favour) (GOFAMINT_HOF).
Generate a warm, caring, encouraging, and culturally respectful WhatsApp follow-up message to a member.
Details:
- Member Name: ${memberName || "Beloved Brother/Sister"}
- Status / Absence: ${weeksAbsent ? `${weeksAbsent} week(s) absent` : status || "Visitor/Student"}
- Member Prayer Requests: ${prayerRequest || "General spiritual growth & grace"}
- Current Sunday School Lesson Topic: "${lessonTopic || "Walking in Christ"}" (Memory Verse: ${memoryVerseRef || "Bible"}: "${memoryVerse || ""}")
- Teacher/Secretary Name: ${teacherName || "Sunday School Department"}

Guidelines:
- Keep the tone very warm, spiritual, uplifting, and not condemning.
- Mention how deeply they were missed in class.
- Include a 1-sentence spiritual encouragement rooted in this week's lesson theme and a short prayer for their week.
- Keep the format ready to send directly on WhatsApp with polite emojis (🙏, 📖, ✨). Length: 3-5 concise paragraphs.`;
      } else if (type === "PASTORAL_REPORT") {
        prompt = `You are the Sunday School Secretary compiling a Pastoral Escalation Alert Report for the Pastor / Sunday School Superintendent of GOFAMINT_HOF.
Details:
- Member Name: ${memberName}
- Consecutive Weeks Absent: ${weeksAbsent || "3+ weeks"}
- Known Reasons / Notes: ${prayerRequest || "No contact yet or urgent care required"}
- Class: ${lessonTopic || "Sunday School Class"}

Generate a structured, professional 1-page Pastoral Care Briefing:
1. Executive Alert Summary
2. Contact History & Current Status
3. Spiritual & Practical Pastoral Recommendations (Home visit, prayer intervention, phone call).`;
      } else if (type === "LESSON_INSIGHTS") {
        prompt = `You are a Senior Sunday School Master Teacher in The Gospel Faith Mission International (House of Favour) (GOFAMINT_HOF).
Provide dynamic teaching insights, 3 thought-provoking interactive discussion questions, and practical life applications for:
- Lesson Topic: "${lessonTopic}"
- Memory Verse: "${memoryVerse}" (${memoryVerseRef})

Provide:
1. Core Theological Insight (2-3 sentences)
2. 3 Interactive Class Discussion Questions (with target age relevance)
3. 2 Practical Weekly Faith Challenges for students to practice.`;
      } else {
        prompt = `You are an AI assistant for a GOFAMINT_HOF Sunday School Secretary. Provide helpful, Christ-centered advice for Sunday school administration and discipleship. Query: ${JSON.stringify(req.body)}`;
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.json({
          text: `Dear ${memberName || "Beloved"},

We missed your warm presence in our GOFAMINT_HOF Sunday School class today! We studied "${lessonTopic || "The Word of God"}" (${memoryVerseRef || "Philippians 4:13"}). We prayed specifically for your requests: "${prayerRequest || "God's divine favor"}".

May God uphold and bless you throughout this week. We look forward to rejoicing with you next Sunday!

Warm regards in Christ,
${teacherName || "GOFAMINT_HOF Sunday School Team"} 🙏📖✨`,
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (err: any) {
      console.error("Gemini API Error:", err);
      res.status(500).json({ error: err.message || "Failed to generate AI response" });
    }
  });

  const EXEC_ROLES = ["SUPER_ADMIN", "GENERAL_SUPERINTENDENT", "GENERAL_SECRETARY"];
  const ASSIGNABLE_ROLES = [
    "GENERAL_SUPERINTENDENT",
    "GENERAL_SECRETARY",
    "ASST_GENERAL_SECRETARY",
    "TREASURER",
    "RECORD_OFFICER",
    "ENROLLMENT_OFFICER",
    "TEACHER",
    "CLASS_SECRETARY",
    "WORKER",
  ];
  // GENERAL_SUPERINTENDENT and GENERAL_SECRETARY accounts are permanent: no
  // endpoint below will deactivate, delete, or change the role of a user
  // whose CURRENT roleType is one of these, and no one can act on their own
  // account through these endpoints either.
  const PROTECTED_ROLES = ["SUPER_ADMIN", "GENERAL_SUPERINTENDENT", "GENERAL_SECRETARY"];

  async function requireExecCaller(req: any, res: any, adminDb: any, adminAuth: any) {
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      res.status(401).json({ error: "Missing sign-in token." });
      return null;
    }
    const decoded = await adminAuth.verifyIdToken(idToken);
    const callerUid = decoded.uid;
    const callerDoc = await adminDb.collection("users").doc(callerUid).get();
    const callerRole = callerDoc.exists ? callerDoc.data()?.roleType : null;
    if (!callerRole || !EXEC_ROLES.includes(callerRole)) {
      res.status(403).json({ error: "You do not have permission to manage user accounts." });
      return null;
    }
    return { callerUid, callerRole };
  }

  app.post("/api/admin/create-user", async (req, res) => {
    try {
      const adminAuth = getAdminAuth();
      const adminDb = getAdminDb();
      const caller = await requireExecCaller(req, res, adminDb, adminAuth);
      if (!caller) return;

      const { email, password, roleType, displayName, classId } = req.body || {};
      if (!email || !password || !roleType) {
        return res.status(400).json({ error: "email, password, and roleType are required." });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }
      if (!ASSIGNABLE_ROLES.includes(roleType)) {
        return res.status(400).json({ error: "Invalid role." });
      }
      if ((roleType === "TEACHER" || roleType === "CLASS_SECRETARY") && !classId) {
        return res.status(400).json({ error: "A class must be selected for a Teacher or Class Secretary login." });
      }

      const newUser = await adminAuth.createUser({
        email: String(email).trim(),
        password,
        displayName: displayName || undefined,
      });

      await adminDb.collection("users").doc(newUser.uid).set({
        roleType,
        email: newUser.email,
        displayName: displayName || null,
        classId: classId || null,
        status: "ACTIVE",
        createdBy: caller.callerUid,
        createdAt: new Date().toISOString(),
      });

      res.json({ success: true, uid: newUser.uid, email: newUser.email, roleType });
    } catch (err: any) {
      console.error("create-user error:", err);
      const message =
        err?.code === "auth/email-already-exists"
          ? "That email already has an account."
          : err?.message || "Failed to create user.";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/admin/list-users", async (req, res) => {
    try {
      const adminAuth = getAdminAuth();
      const adminDb = getAdminDb();
      const caller = await requireExecCaller(req, res, adminDb, adminAuth);
      if (!caller) return;

      const snapshot = await adminDb.collection("users").get();
      const users = snapshot.docs.map((d: any) => ({ uid: d.id, ...d.data() }));
      res.json({ success: true, users });
    } catch (err: any) {
      console.error("list-users error:", err);
      res.status(500).json({ error: err?.message || "Failed to load users." });
    }
  });

  app.post("/api/admin/update-user", async (req, res) => {
    try {
      const adminAuth = getAdminAuth();
      const adminDb = getAdminDb();
      const caller = await requireExecCaller(req, res, adminDb, adminAuth);
      if (!caller) return;

      const { targetUid, roleType, classId, displayName } = req.body || {};
      if (!targetUid) return res.status(400).json({ error: "targetUid is required." });
      if (targetUid === caller.callerUid) {
        return res.status(400).json({ error: "You cannot edit your own account from here." });
      }

      const targetRef = adminDb.collection("users").doc(targetUid);
      const targetDoc = await targetRef.get();
      if (!targetDoc.exists) return res.status(404).json({ error: "User not found." });
      const targetData = targetDoc.data() as any;

      if (PROTECTED_ROLES.includes(targetData.roleType)) {
        return res.status(403).json({
          error: "General Superintendent and General Secretary accounts cannot be edited here.",
        });
      }
      if (roleType && !ASSIGNABLE_ROLES.includes(roleType)) {
        return res.status(400).json({ error: "Invalid role." });
      }
      if (roleType && PROTECTED_ROLES.includes(roleType)) {
        return res.status(403).json({
          error: "Use Firebase Console to grant General Superintendent / General Secretary access.",
        });
      }

      const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
      if (roleType) updates.roleType = roleType;
      if (classId !== undefined) updates.classId = classId || null;
      if (displayName !== undefined) updates.displayName = displayName || null;

      await targetRef.update(updates);
      res.json({ success: true });
    } catch (err: any) {
      console.error("update-user error:", err);
      res.status(500).json({ error: err?.message || "Failed to update user." });
    }
  });

  app.post("/api/admin/set-user-status", async (req, res) => {
    try {
      const adminAuth = getAdminAuth();
      const adminDb = getAdminDb();
      const caller = await requireExecCaller(req, res, adminDb, adminAuth);
      if (!caller) return;

      const { targetUid, status } = req.body || {};
      if (!targetUid || !["ACTIVE", "DEACTIVATED"].includes(status)) {
        return res.status(400).json({ error: "targetUid and a valid status are required." });
      }
      if (targetUid === caller.callerUid) {
        return res.status(400).json({ error: "You cannot deactivate your own account." });
      }

      const targetRef = adminDb.collection("users").doc(targetUid);
      const targetDoc = await targetRef.get();
      if (!targetDoc.exists) return res.status(404).json({ error: "User not found." });
      const targetData = targetDoc.data() as any;

      if (PROTECTED_ROLES.includes(targetData.roleType)) {
        return res.status(403).json({
          error: "General Superintendent and General Secretary accounts cannot be deactivated.",
        });
      }

      await targetRef.update({ status, updatedAt: new Date().toISOString() });

      await adminDb.collection("auditLogs").add({
        action: status === "DEACTIVATED" ? "USER_DEACTIVATED" : "USER_REACTIVATED",
        performedByUid: caller.callerUid,
        performedByRole: caller.callerRole,
        targetUid,
        targetEmail: targetData.email || null,
        targetRole: targetData.roleType || null,
        timestamp: FieldValue.serverTimestamp(),
        status: "SUCCESS",
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("set-user-status error:", err);
      res.status(500).json({ error: err?.message || "Failed to update user status." });
    }
  });

  app.post("/api/admin/delete-user-permanently", async (req, res) => {
    try {
      const adminAuth = getAdminAuth();
      const adminDb = getAdminDb();
      const caller = await requireExecCaller(req, res, adminDb, adminAuth);
      if (!caller) return;

      const { targetUid } = req.body || {};
      if (!targetUid) return res.status(400).json({ error: "targetUid is required." });
      if (targetUid === caller.callerUid) {
        return res.status(400).json({ error: "You cannot delete your own account." });
      }

      const targetRef = adminDb.collection("users").doc(targetUid);
      const targetDoc = await targetRef.get();
      if (!targetDoc.exists) return res.status(404).json({ error: "User not found." });
      const targetData = targetDoc.data() as any;

      if (PROTECTED_ROLES.includes(targetData.roleType)) {
        return res.status(403).json({
          error: "General Superintendent and General Secretary accounts can never be permanently deleted.",
        });
      }

      await adminDb
        .collection("formerUsers")
        .doc(targetUid)
        .set({
          uid: targetUid,
          email: targetData.email || null,
          displayName: targetData.displayName || null,
          roleType: targetData.roleType || null,
          classId: targetData.classId || null,
          deletedBy: caller.callerUid,
          deletedAt: FieldValue.serverTimestamp(),
        });

      await targetRef.delete();

      try {
        await adminAuth.deleteUser(targetUid);
      } catch (authErr: any) {
        console.warn("delete-user-permanently: auth deleteUser warning:", authErr?.message);
      }

      await adminDb.collection("auditLogs").add({
        action: "USER_ACCOUNT_DELETED",
        performedByUid: caller.callerUid,
        performedByRole: caller.callerRole,
        targetUid,
        targetEmail: targetData.email || null,
        targetRole: targetData.roleType || null,
        timestamp: FieldValue.serverTimestamp(),
        status: "SUCCESS",
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("delete-user-permanently error:", err);
      res.status(500).json({ error: err?.message || "Failed to delete user." });
    }
  });

  // -----------------------------------------------------------------------
  // Admin: Reset / "Start New Year" — kept in sync with the same endpoint in
  // src/server/app.ts (see the comment there for the full rationale). Scope:
  //   PRESERVED (identity/config, never touched) — the `users` collection
  //     (Firebase Auth exec accounts used for authorization — NOT reset
  //     here, see note below), departments, workerCategories,
  //     clockInConfig. The class list (className) and worker directory
  //     entries (fullName, phone, qrCodeToken, status, etc.) also persist.
  //   RESET (office login deleted entirely) — every `adminProfiles` doc
  //     (GS, GSec, Treasurer, Record Secretary). Deleted rather than merely
  //     cleared, since the app's existing "claim this office" screen
  //     already appears whenever a role has no profile and requires a
  //     brand-new password. A snapshot (role, title, name — never the
  //     password) is saved to the archive first.
  //   CLEARED (assignment fields only, record kept) — on every class:
  //     secretaryName, secretaryPhone, teachers, passwordHash, and
  //     isSetupComplete (forces the first-run setup screen next time the
  //     class is opened, so a brand-new password must be set — the outgoing
  //     secretary's password is never reused); on every worker:
  //     assignedClass, duty, categories. Snapshotted to the archive first.
  //   ARCHIVED, NEVER DELETED — sundaySchoolYear (copied to
  //     sundaySchoolYearArchive, along with the class/worker/admin-office
  //     assignment snapshots, before the current doc is replaced). Every
  //     document in members, grades, offerings, absenceLogs, referrals,
  //     workerAttendance, workerPrepAttendance, specialEvents,
  //     specialEventAttendance, adminComments, treasuryExpenditures, and
  //     lessons is MOVED (never hard-deleted) into
  //     `yearArchives/{outgoingYearId}/{collectionName}/{docId}`.
  //
  // GENERAL_SUPERINTENDENT and GENERAL_SECRETARY are equally authorized to
  // run this reset, and their own adminProfiles/users accounts are NEVER
  // touched by it, no matter who runs it — see deleteNonProtectedAdminProfiles
  // below and PROTECTED_ROLES above.
  // -----------------------------------------------------------------------
  const RESET_AUTHORIZED_ROLES = ["SUPER_ADMIN", "GENERAL_SUPERINTENDENT", "GENERAL_SECRETARY"];
  const YEAR_RESET_COLLECTIONS = [
    "members",
    "grades",
    "offerings",
    "absenceLogs",
    "referrals",
    "workerAttendance",
    "workerPrepAttendance",
    "specialEvents",
    "specialEventAttendance",
    "adminComments",
    "treasuryExpenditures",
    "lessons",
  ];

  // Moves every document in a live operational collection into
  // `yearArchives/{yearId}/{collectionName}/{docId}` and only THEN deletes it
  // from the live collection — nothing is ever permanently lost.
  async function archiveAndClearCollection(db: any, collectionName: string, yearId: string, batchSize = 400): Promise<number> {
    const collRef = db.collection(collectionName);
    let totalMoved = 0;
    while (true) {
      const snapshot = await collRef.limit(batchSize).get();
      if (snapshot.empty) break;
      const batch = db.batch();
      snapshot.docs.forEach((doc: any) => {
        const archiveRef = db.collection("yearArchives").doc(yearId).collection(collectionName).doc(doc.id);
        batch.set(archiveRef, doc.data());
        batch.delete(doc.ref);
      });
      await batch.commit();
      totalMoved += snapshot.size;
      if (snapshot.size < batchSize) break;
    }
    return totalMoved;
  }

  // Clears specific fields on every document in a collection WITHOUT
  // deleting the documents themselves — used for classes/workers, where the
  // record (class login, worker profile) must survive the year reset but its
  // year-specific assignment fields should be cleared for reassignment.
  async function clearFieldsInCollection(
    db: any,
    collectionName: string,
    clearedFields: Record<string, any>,
    batchSize = 450
  ): Promise<{ updated: number }> {
    const allDocs = await db.collection(collectionName).get();
    let updated = 0;
    for (let i = 0; i < allDocs.docs.length; i += batchSize) {
      const chunk = allDocs.docs.slice(i, i + batchSize);
      const batch = db.batch();
      chunk.forEach((doc: any) => {
        batch.update(doc.ref, { ...clearedFields, updatedAt: new Date().toISOString() });
      });
      await batch.commit();
      updated += chunk.length;
    }
    return { updated };
  }

  // Deletes only the adminProfiles docs that are safe to reset — NEVER a
  // GENERAL_SUPERINTENDENT or GENERAL_SECRETARY profile.
  async function deleteNonProtectedAdminProfiles(db: any): Promise<number> {
    const snapshot = await db.collection("adminProfiles").get();
    const deletable = snapshot.docs.filter((doc: any) => !PROTECTED_ROLES.includes(doc.data()?.roleType));
    let deleted = 0;
    for (let i = 0; i < deletable.length; i += 450) {
      const chunk = deletable.slice(i, i + 450);
      const batch = db.batch();
      chunk.forEach((doc: any) => batch.delete(doc.ref));
      await batch.commit();
      deleted += chunk.length;
    }
    return deleted;
  }

  app.post("/api/admin/reset-year", async (req, res) => {
    const adminDb = getAdminDb();
    let auditRef: any = null;

    try {
      const authHeader = req.headers.authorization || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!idToken) {
        return res.status(401).json({ error: "Missing sign-in token." });
      }

      const adminAuth = getAdminAuth();
      const decoded = await adminAuth.verifyIdToken(idToken);
      const callerUid = decoded.uid;
      const callerEmail = decoded.email || null;

      const callerDoc = await adminDb.collection("users").doc(callerUid).get();
      const callerRole = callerDoc.exists ? callerDoc.data()?.roleType : null;

      if (!callerRole || !RESET_AUTHORIZED_ROLES.includes(callerRole)) {
        return res.status(403).json({
          error: "Only the General Superintendent can reset the Sunday School year.",
        });
      }

      const { confirmYearId, newYearName, newOverallTheme } = req.body || {};
      if (!confirmYearId || typeof confirmYearId !== "string") {
        return res.status(400).json({ error: "confirmYearId is required." });
      }
      if (!newYearName || typeof newYearName !== "string" || !newYearName.trim()) {
        return res.status(400).json({ error: "A name for the new Sunday School year is required." });
      }

      const yearSnapshot = await adminDb.collection("sundaySchoolYear").limit(1).get();
      const currentYearDoc = yearSnapshot.docs[0];
      if (!currentYearDoc || currentYearDoc.id !== confirmYearId) {
        return res.status(409).json({
          error:
            "The Sunday School year has changed since you opened this dialog. Please close and reopen the reset dialog to review the current year before continuing.",
        });
      }
      const currentYear = currentYearDoc.data() as any;

      auditRef = adminDb.collection("auditLogs").doc();
      await auditRef.set({
        action: "RESET_YEAR",
        status: "STARTED",
        performedByUid: callerUid,
        performedByEmail: callerEmail,
        performedByRole: callerRole,
        previousYearId: currentYearDoc.id,
        previousYearName: currentYear.yearName || null,
        requestedNewYearName: newYearName.trim(),
        startedAt: FieldValue.serverTimestamp(),
      });

      // 1. Preserve: archive the full outgoing year record, plus a snapshot
      // of who currently holds each class, each worker's duty role, and
      // each admin office, before touching anything else.
      const classesSnapshotDocs = await adminDb.collection("classes").get();
      const classAssignmentsSnapshot = classesSnapshotDocs.docs.map((d: any) => {
        const c = d.data();
        return {
          classId: d.id,
          className: c.className,
          secretaryName: c.secretaryName,
          secretaryPhone: c.secretaryPhone,
          teachers: c.teachers,
        };
      });

      const workersSnapshotDocs = await adminDb.collection("workers").get();
      const workerAssignmentsSnapshot = workersSnapshotDocs.docs.map((d: any) => {
        const w = d.data();
        return {
          workerId: d.id,
          fullName: w.fullName,
          assignedClass: w.assignedClass,
          duty: w.duty,
          categories: w.categories,
        };
      });

      const adminProfilesSnapshotDocs = await adminDb.collection("adminProfiles").get();
      const adminProfileAssignmentsSnapshot = adminProfilesSnapshotDocs.docs.map((d: any) => {
        const a = d.data();
        return {
          roleType: a.roleType,
          title: a.title,
          profileName: a.profileName,
          username: a.username,
        };
      });

      await adminDb
        .collection("sundaySchoolYearArchive")
        .doc(currentYearDoc.id)
        .set({
          ...currentYear,
          archivedAt: FieldValue.serverTimestamp(),
          archivedBy: callerUid,
          classAssignmentsSnapshot,
          workerAssignmentsSnapshot,
          adminProfileAssignmentsSnapshot,
        });

      // 2. Move year-specific operational data into the permanent archive
      // for this outgoing year, then clear it from the live collections.
      // Users, departments, workerCategories, and clockInConfig are
      // deliberately never touched.
      const archivedCounts: Record<string, number> = {};
      for (const collectionName of YEAR_RESET_COLLECTIONS) {
        archivedCounts[collectionName] = await archiveAndClearCollection(adminDb, collectionName, currentYearDoc.id);
      }

      // 2c. Reset non-protected officer logins by deleting their
      // adminProfiles doc — GENERAL_SUPERINTENDENT and GENERAL_SECRETARY are
      // always skipped, see the note above.
      const adminProfilesReset = await deleteNonProtectedAdminProfiles(adminDb);

      // 2b. Clear only the YEAR ASSIGNMENT fields on classes and workers —
      // the class login and the worker's directory record both survive
      // untouched, ready to be reassigned to whoever holds the role this
      // year.
      const classesCleared = await clearFieldsInCollection(adminDb, "classes", {
        secretaryName: "",
        secretaryPhone: "",
        teachers: [],
        passwordHash: "",
        isSetupComplete: false,
      });
      const workersCleared = await clearFieldsInCollection(adminDb, "workers", {
        assignedClass: "",
        duty: "",
        categories: [],
      });

      const newYearId = `YEAR_${Date.now()}`;
      const quarterNames = ["First Quarter", "Second Quarter", "Third Quarter", "Fourth Quarter"];
      const newYearDoc = {
        id: newYearId,
        yearName: newYearName.trim(),
        overallTheme: (newOverallTheme || "").trim(),
        startDate: "",
        endDate: "",
        activeQuarterNumber: 1,
        isInitialized: false,
        departments: Array.isArray(currentYear.departments) ? currentYear.departments : [],
        updatedAt: new Date().toISOString(),
        quarters: [1, 2, 3, 4].map((quarterNumber) => ({
          id: `Q${quarterNumber}_${newYearId}`,
          quarterNumber,
          quarterName: quarterNames[quarterNumber - 1],
          quarterTheme: "",
          startDate: "",
          endDate: "",
          sharingAdmonitionDate: "",
          totalLessonWeeks: 12,
          hasSharingAdmonitionWeek: true,
          status: quarterNumber === 1 ? "ACTIVE" : "UPCOMING",
          isDistributed: false,
          lessons: [],
          updatedAt: new Date().toISOString(),
        })),
      };
      await adminDb.collection("sundaySchoolYear").doc(newYearId).set(newYearDoc);
      await currentYearDoc.ref.delete();

      await auditRef.set(
        {
          status: "COMPLETED",
          newYearId,
          newYearName: newYearDoc.yearName,
          archivedCounts,
          classesReassigned: classesCleared.updated,
          workersReassigned: workersCleared.updated,
          completedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      res.json({
        success: true,
        newYearId,
        newYearName: newYearDoc.yearName,
        archivedCounts,
        classesReassigned: classesCleared.updated,
        workersReassigned: workersCleared.updated,
      });
    } catch (err: any) {
      console.error("reset-year error:", err);
      if (auditRef) {
        await auditRef
          .set(
            {
              status: "FAILED",
              error: err?.message || "Unknown error",
              failedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
          .catch(() => {});
      }
      res.status(500).json({
        error:
          "Reset failed partway through. No year was switched — your previous year's data remains intact and is safely archived. Please try again; it is safe to retry.",
      });
    }
  });

  return app;
}

const app = createApp();

export default app;