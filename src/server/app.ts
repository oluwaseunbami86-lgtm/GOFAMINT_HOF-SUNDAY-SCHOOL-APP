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
  // GENERAL_SUPERINTENDENT and GENERAL_SECRETARY accounts are permanent: no
  // endpoint below will deactivate, delete, or change the role of a user
  // whose CURRENT roleType is one of these, and no one can act on their own
  // account through these endpoints either (self-deactivate/self-delete/
  // self-demote is always blocked, for every role, not just these two).
  const PROTECTED_ROLES = ["SUPER_ADMIN", "GENERAL_SUPERINTENDENT", "GENERAL_SECRETARY"];

  async function requireExecCaller(req: express.Request, res: express.Response, adminDb: FirebaseFirestore.Firestore, adminAuth: import("firebase-admin/auth").Auth) {
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

  // List every staff login for the User Management screen.
  app.get("/api/admin/list-users", async (req, res) => {
    try {
      const adminAuth = getAdminAuth();
      const adminDb = getAdminDb();
      const caller = await requireExecCaller(req, res, adminDb, adminAuth);
      if (!caller) return;

      const snapshot = await adminDb.collection("users").get();
      const users = snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }));
      res.json({ success: true, users });
    } catch (err: any) {
      console.error("list-users error:", err);
      res.status(500).json({ error: err?.message || "Failed to load users." });
    }
  });

  // Edit an existing login's role, class assignment, or display name.
  // Cannot be used to change the role of a currently-protected account
  // (GS/GSec), and cannot be used by anyone to edit their own account (to
  // prevent accidental self-lockout via a mistaken role change).
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

  // Toggle a login between ACTIVE and DEACTIVATED. A deactivated user keeps
  // their historical records and audit trail — they simply cannot sign in
  // (checked client-side right after Firebase Auth succeeds, and enforced
  // again by firestore.rules so a deactivated account can't read/write
  // anything even with a still-valid Firebase session).
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

  // Permanently deletes a Firebase Authentication account. The person's
  // historical involvement (name, role, email — never their password) is
  // preserved in `formerUsers` first, and every attendance/grade/offering
  // record they were ever tied to is untouched — those records reference
  // the church member/worker/class, not this login, so deleting the login
  // never deletes church history (see REQUIREMENT 13/27 in the church
  // admin's own spec for this feature).
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
        // The Firestore side is already cleaned up; if the Auth account was
        // already gone (or something odd happened) that's fine — log it
        // rather than fail the whole request, since the user-facing goal
        // (this person can no longer sign in or appear as active staff) is
        // already achieved.
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
  // Admin: Reset / "Start New Year" — archives (never deletes) the current
  // church year's operational data against the centralized Firestore
  // database, and rotates in a fresh year. Server-side only: authorization is
  // verified here against the caller's real Firestore role doc (never trusts
  // anything the browser claims), exactly like /api/admin/create-user above.
  // GENERAL_SUPERINTENDENT and GENERAL_SECRETARY are equally authorized to
  // run this — neither outranks the other for this or any other permission.
  //
  // Scope (derived from src/types.ts / firestore.rules, and confirmed with
  // the church admin — not guessed):
  //   PRESERVED, NEVER TOUCHED — the `users` collection entirely (every
  //     Firebase-Auth-linked login, of any role), departments,
  //     workerCategories, clockInConfig. The class list itself (className)
  //     and worker directory entries (fullName, phone, qrCodeToken, status,
  //     etc.) also persist as records — see REQUIREMENT 5/11/18 in the
  //     church admin's own spec: Super Admin accounts must survive every
  //     reset, and worker identities carry forward.
  //   RESET (office login deleted entirely, GS/GSec SKIPPED) — every
  //     `adminProfiles` doc EXCEPT ones whose roleType is
  //     GENERAL_SUPERINTENDENT or GENERAL_SECRETARY — those two are never
  //     touched, no matter who is running this reset. Every other office's
  //     password was chosen by whoever held it, so it is deleted rather than
  //     merely cleared — the app's existing "claim this office" screen
  //     already appears automatically whenever a role has no profile, and
  //     requires a brand-new password. A snapshot of who held each office
  //     (role, title, name — never the password) is saved to the archive
  //     first.
  //   CLEARED (assignment fields only, record kept) — on every class:
  //     secretaryName, secretaryPhone, teachers, passwordHash, and
  //     isSetupComplete (this forces the app's own first-run setup screen
  //     the next time the class is opened, so the incoming secretary must
  //     choose a brand-new password — the outgoing secretary's password is
  //     never reused); on every worker: assignedClass, duty, categories
  //     (their current duty role). A snapshot of the pre-clear class/worker
  //     assignments is saved to the archive first, so who held what last
  //     year is never lost.
  //   ARCHIVED, NEVER DELETED — the outgoing `sundaySchoolYear` document is
  //     copied into `sundaySchoolYearArchive` before anything else happens,
  //     alongside the class/worker/admin-office assignment snapshots above.
  //     Separately, every document in members, grades, offerings,
  //     absenceLogs, referrals, workerAttendance, workerPrepAttendance,
  //     specialEvents, specialEventAttendance, adminComments,
  //     treasuryExpenditures, and lessons (see YEAR_RESET_COLLECTIONS below)
  //     is MOVED — not deleted — into
  //     `yearArchives/{outgoingYearId}/{collectionName}/{docId}` via
  //     archiveAndClearCollection(). The live collections end up exactly as
  //     empty as a hard delete would leave them (so nothing else in the app
  //     needs to change how it queries "current" data), but every record
  //     from every past year remains permanently readable under
  //     `yearArchives/{yearId}` for reporting, comparison, and export.
  //
  // Firestore has no single multi-thousand-document ACID transaction, so
  // atomicity is approximated deliberately in this order: (1) archive the
  // outgoing year and current class/worker/admin-office assignments first —
  // cheap and safe, guarantees history is never lost; (2) move operational
  // collections into yearArchives; (3) delete non-protected admin-office
  // logins; (4) clear class/worker assignment fields; (5) write the new year
  // document; (6) only then delete the old year document, so the
  // `sundaySchoolYear` collection is never left empty. Every step here is a
  // no-op when re-run (moving an already-moved doc is harmless — it simply
  // won't be found in the live collection anymore and the loop ends;
  // deleting an already-deleted doc, re-archiving the same doc, clearing
  // already-blank fields, etc. are all no-ops too), so if a failure happens
  // partway through, simply calling this endpoint again with the same
  // request safely finishes the job instead of corrupting state — the
  // practical equivalent of a rollback-and-retry for an operation this size.
  // Every attempt (success or failure) is written to `auditLogs` before the
  // destructive work starts and updated with the final outcome.
  //
  // NOTE on the person performing this reset: if they hold a
  // non-GS/GSec office (e.g. Treasurer), their adminProfiles doc IS deleted
  // along with everyone else's in that category, but this does NOT
  // interrupt the reset itself — their current browser session already
  // holds their profile in memory, and this endpoint's own authorization
  // check runs off their Firebase Auth ID token (the `users` collection),
  // not the adminProfiles doc. If they hold GS or GSec, their profile (and
  // their `users` login) is never touched at all. The only effect on
  // non-GS/GSec staff is on their NEXT sign-in: they re-claim their office
  // with a brand-new password, via the same self-service screen everyone
  // else uses.
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
  // from the live collection. This is the non-destructive alternative to
  // deleteAllDocsInCollection: nothing is ever permanently lost — the
  // General Superintendent can browse `yearArchives/{yearId}` for any past
  // year in full, forever. The live collections (members, grades, offerings,
  // etc.) stay exactly as clean as a hard delete would leave them, so
  // nothing else in the app needs to change how it queries "current" data.
  async function archiveAndClearCollection(
    db: FirebaseFirestore.Firestore,
    collectionName: string,
    yearId: string,
    batchSize = 400 // leaves headroom since this does 2 writes (copy+delete) per doc per batch
  ): Promise<number> {
    const collRef = db.collection(collectionName);
    let totalMoved = 0;
    while (true) {
      const snapshot = await collRef.limit(batchSize).get();
      if (snapshot.empty) break;
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
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

  // Deletes only the adminProfiles docs that are safe to reset — this
  // NEVER touches a GENERAL_SUPERINTENDENT or GENERAL_SECRETARY profile,
  // per REQUIREMENT 11 (Super Admin accounts must survive every reset).
  async function deleteNonProtectedAdminProfiles(db: FirebaseFirestore.Firestore): Promise<number> {
    const snapshot = await db.collection("adminProfiles").get();
    const deletable = snapshot.docs.filter((doc) => !PROTECTED_ROLES.includes((doc.data() as any)?.roleType));
    let deleted = 0;
    for (let i = 0; i < deletable.length; i += 450) {
      const chunk = deletable.slice(i, i + 450);
      const batch = db.batch();
      chunk.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      deleted += chunk.length;
    }
    return deleted;
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

      // adminProfiles docs ARE the officer's registration for that office
      // (GS/GSec/Treasurer/Record) — there is no separate "identity" to
      // preserve the way a class's className is. So resetting an office's
      // password means deleting the doc entirely; the app's existing
      // "claim this office" screen already appears automatically whenever a
      // role has no profile, and requires a brand-new password to register.
      // NOTE: this only resets the 4 office passwords stored in
      // `adminProfiles`. It does NOT touch the separate Firebase
      // Authentication accounts (the `users` collection this endpoint's own
      // authorization check reads from) — those are personal logins tied to
      // an individual's email, not a shared office credential, and rotating
      // them would need an email-delivery step this app does not currently
      // have. Ask if those need resetting too before building that.
      const adminProfilesSnapshotDocs = await adminDb.collection("adminProfiles").get();
      const adminProfileAssignmentsSnapshot = adminProfilesSnapshotDocs.docs.map((d) => {
        const a = d.data() as any;
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
      // Nothing here is ever hard-deleted — see archiveAndClearCollection
      // above. Users, departments, workerCategories, and clockInConfig are
      // deliberately never touched by this loop.
      const archivedCounts: Record<string, number> = {};
      for (const collectionName of YEAR_RESET_COLLECTIONS) {
        archivedCounts[collectionName] = await archiveAndClearCollection(adminDb, collectionName, currentYearDoc.id);
      }

      // 2c. Reset officer logins (Asst. General Secretary, Treasurer,
      // Record Officer, etc.) by deleting their adminProfiles doc — see the
      // note above. GENERAL_SUPERINTENDENT and GENERAL_SECRETARY profiles
      // are explicitly SKIPPED and never touched, per REQUIREMENT 11: those
      // two accounts must survive every reset untouched, including if the
      // person performing this very reset holds one of those offices.
      const adminProfilesReset = await deleteNonProtectedAdminProfiles(adminDb);

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
          archivedCounts,
          classesReassigned: classesCleared.updated,
          workersReassigned: workersCleared.updated,
          adminProfilesReset,
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
        adminProfilesReset,
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
