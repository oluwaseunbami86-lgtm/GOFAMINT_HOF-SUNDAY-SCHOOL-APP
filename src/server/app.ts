import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "./firebaseAdmin.js";

dotenv.config();

// NOTE: This file-based JSON store only works for LOCAL development.
// On Vercel (and most serverless hosts) the filesystem is read-only/ephemeral,
// so /api/sync/push and /api/sync/pull will NOT persist data between requests
// in production. The app's real persistence layer is Firebase Firestore
// (see src/services/firestoreDatabase.ts) — this local file store is a
// convenience for offline/local-only testing.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "server_database.json");
const isServerless = !!process.env.VERCEL;

function loadServerData() {
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
  if (isServerless) return; // skip disk writes on Vercel
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist server data file:", err);
  }
}

let serverDatabase = loadServerData() || {
  classes: [],
  members: [],
  grades: [],
  offerings: [],
  absenceLogs: [],
  referrals: [],
  lastSyncedAt: new Date().toISOString(),
};

export function createApp() {
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
      const { type, memberName, status, weeksAbsent, prayerRequest, lessonTopic, memoryVerse, memoryVerseRef, teacherName } = req.body;

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
          text: `Dear ${memberName || "Beloved"},\n\nWe missed your warm presence in our GOFAMINT_HOF Sunday School class today! We studied "${lessonTopic || "The Word of God"}" (${memoryVerseRef || "Philippians 4:13"}). We prayed specifically for your requests: "${prayerRequest || "God's divine favor"}".\n\nMay God uphold and bless you throughout this week. We look forward to rejoicing with you next Sunday!\n\nWarm regards in Christ,\n${teacherName || "GOFAMINT_HOF Sunday School Team"} 🙏📖✨`,
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

  // -----------------------------------------------------------------------
  // Admin: create a new staff login (Firebase Auth user + Firestore role doc)
  // Only callable by an already-authenticated SUPER_ADMIN, GENERAL_SUPERINTENDENT,
  // or GENERAL_SECRETARY — verified server-side against their real Firestore
  // role doc, never trusting anything the browser claims about itself.
  // -----------------------------------------------------------------------
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

  app.post("/api/admin/create-user", async (req, res) => {
    try {
      const authHeader = req.headers.authorization || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!idToken) {
        return res.status(401).json({ error: "Missing sign-in token." });
      }

      const adminAuth = getAdminAuth();
      const adminDb = getAdminDb();

      const decoded = await adminAuth.verifyIdToken(idToken);
      const callerUid = decoded.uid;

      const callerDoc = await adminDb.collection("users").doc(callerUid).get();
      const callerRole = callerDoc.exists ? callerDoc.data()?.roleType : null;

      if (!callerRole || !EXEC_ROLES.includes(callerRole)) {
        return res.status(403).json({ error: "You do not have permission to create logins." });
      }

      const { email, password, roleType, displayName } = req.body || {};
      if (!email || !password || !roleType) {
        return res.status(400).json({ error: "email, password, and roleType are required." });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }
      if (!ASSIGNABLE_ROLES.includes(roleType)) {
        return res.status(400).json({ error: "Invalid role." });
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
        createdBy: callerUid,
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

  // -----------------------------------------------------------------------
  // Admin: Reset / "Start New Year" — archives + clears operational data for
  // the current Sunday School year against the centralized Firestore
  // database, and rotates in a fresh year. Server-side only: authorization is
  // verified here against the caller's real Firestore role doc (never trusts
  // anything the browser claims), exactly like /api/admin/create-user above.
  //
  // Scope (derived from src/types.ts / firestore.rules, and confirmed with
  // the church admin — not guessed):
  //   PRESERVED (identity/config, never touched) — users, adminProfiles,
  //     departments, workerCategories, clockInConfig. The class list itself
  //     (className) and worker directory entries (fullName, phone,
  //     qrCodeToken, status, etc.) also persist as records.
  //   CLEARED (assignment fields only, record kept) — on every class:
  //     secretaryName, secretaryPhone, teachers, passwordHash, and
  //     isSetupComplete (this forces the app's own first-run setup screen
  //     the next time the class is opened, so the incoming secretary must
  //     choose a brand-new password — the outgoing secretary's password is
  //     never reused); on every worker: assignedClass, duty, categories
  //     (their current duty role). A snapshot of the pre-clear class/worker
  //     assignments is saved to the archive first, so who held what last
  //     year is never lost.
  //   ARCHIVED then RESET — the outgoing `sundaySchoolYear` document is
  //     copied into `sundaySchoolYearArchive` before anything else happens,
  //     alongside the class/worker assignment snapshot above.
  //   RESET (cleared) — members, grades, offerings, absenceLogs, referrals,
  //     workerAttendance, workerPrepAttendance, specialEvents,
  //     specialEventAttendance, adminComments, treasuryExpenditures, lessons
  //     — the year-specific operational records these types represent
  //     (see YEAR_RESET_COLLECTIONS below).
  //
  // Firestore has no single multi-thousand-document ACID transaction, so
  // atomicity is approximated deliberately in this order: (1) archive the
  // outgoing year and current class/worker assignments first — cheap and
  // safe, guarantees history is never lost; (2) clear operational
  // collections; (3) clear class/worker assignment fields; (4) write the new
  // year document; (5) only then delete the old year document, so the
  // `sundaySchoolYear` collection is never left empty. Every step here is a
  // no-op when re-run (deleting an already-deleted doc, re-archiving the
  // same doc, clearing already-blank fields, etc.), so if a failure happens
  // partway through, simply calling this endpoint again with the same
  // request safely finishes the job instead of corrupting state — the
  // practical equivalent of a rollback-and-retry for an operation this size.
  // Every attempt (success or failure) is written to `auditLogs` before the
  // destructive work starts and updated with the final outcome.
  // -----------------------------------------------------------------------
  const RESET_AUTHORIZED_ROLES = ["SUPER_ADMIN", "GENERAL_SUPERINTENDENT"];
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

  async function deleteAllDocsInCollection(
    db: FirebaseFirestore.Firestore,
    collectionName: string,
    batchSize = 450
  ): Promise<number> {
    const collRef = db.collection(collectionName);
    let totalDeleted = 0;
    // Loop rather than a single batch: a collection can hold far more than
    // Firestore's 500-writes-per-batch limit.
    while (true) {
      const snapshot = await collRef.limit(batchSize).get();
      if (snapshot.empty) break;
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      totalDeleted += snapshot.size;
      if (snapshot.size < batchSize) break;
    }
    return totalDeleted;
  }

  // Clears specific fields on every document in a collection WITHOUT
  // deleting the documents themselves — used for classes/workers, where the
  // record (class login, worker profile) must survive the year reset but its
  // year-specific assignment fields should be cleared for reassignment.
  async function clearFieldsInCollection(
    db: FirebaseFirestore.Firestore,
    collectionName: string,
    clearedFields: Record<string, any>,
    batchSize = 450
  ): Promise<{ updated: number; snapshot: any[] }> {
    const collRef = db.collection(collectionName);
    const allDocs = await collRef.get();
    const snapshot = allDocs.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    let updated = 0;
    for (let i = 0; i < allDocs.docs.length; i += batchSize) {
      const chunk = allDocs.docs.slice(i, i + batchSize);
      const batch = db.batch();
      chunk.forEach((doc) => {
        batch.update(doc.ref, { ...clearedFields, updatedAt: new Date().toISOString() });
      });
      await batch.commit();
      updated += chunk.length;
    }
    return { updated, snapshot };
  }

  app.post("/api/admin/reset-year", async (req, res) => {
    const adminDb = getAdminDb();
    let auditRef: FirebaseFirestore.DocumentReference | null = null;

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

      // sundaySchoolYear is a singleton collection (the app always reads
      // years[0]). Re-verify server-side that the year the admin confirmed on
      // screen is still the current one, so a stale dialog can never reset
      // the wrong year out from under a concurrent change.
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
      // of who currently holds each class and each worker's duty role,
      // before touching anything else.
      const classesSnapshotDocs = await adminDb.collection("classes").get();
      const classAssignmentsSnapshot = classesSnapshotDocs.docs.map((d) => {
        const c = d.data() as any;
        return {
          classId: d.id,
          className: c.className,
          secretaryName: c.secretaryName,
          secretaryPhone: c.secretaryPhone,
          teachers: c.teachers,
        };
      });

      const workersSnapshotDocs = await adminDb.collection("workers").get();
      const workerAssignmentsSnapshot = workersSnapshotDocs.docs.map((d) => {
        const w = d.data() as any;
        return {
          workerId: d.id,
          fullName: w.fullName,
          assignedClass: w.assignedClass,
          duty: w.duty,
          categories: w.categories,
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
        });

      // 2. Reset only year-specific operational data. Users, adminProfiles,
      // departments, workerCategories, and clockInConfig are deliberately
      // never touched by this loop.
      const deletedCounts: Record<string, number> = {};
      for (const collectionName of YEAR_RESET_COLLECTIONS) {
        deletedCounts[collectionName] = await deleteAllDocsInCollection(adminDb, collectionName);
      }

      // 2b. Clear only the YEAR ASSIGNMENT fields on classes and workers.
      // For classes this INCLUDES the password: the outgoing secretary chose
      // that password herself, so leaving it unchanged would let her keep
      // logging in even after being cleared from the class. Clearing
      // passwordHash together with isSetupComplete forces the app's existing
      // first-run setup screen the next time anyone opens this class,
      // requiring a brand-new secretary name, phone, and password to be set
      // before it can be used again. (approvalStatus is left untouched —
      // AuthModal's own setup flow already carries the existing
      // approvalStatus forward for a class that already existed, so a
      // previously-approved class does not need re-approval just to be
      // reassigned.) For workers, only the duty/role assignment is cleared —
      // there is no worker-level login to reset.
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

      // 3. Write the new year document BEFORE removing the old one, so the
      // singleton `sundaySchoolYear` collection is never briefly empty.
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

      // 4. Only now remove the old year document.
      await currentYearDoc.ref.delete();

      await auditRef.set(
        {
          status: "COMPLETED",
          newYearId,
          newYearName: newYearDoc.yearName,
          deletedCounts,
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
        deletedCounts,
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
