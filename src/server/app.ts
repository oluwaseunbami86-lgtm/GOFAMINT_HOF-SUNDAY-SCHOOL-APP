import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
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

  return app;
}
