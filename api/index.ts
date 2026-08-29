// Vercel serverless entry point. Vercel routes any /api/* request here
// (see vercel.json rewrites) and calls this exported handler directly —
// no app.listen() needed in serverless environments.
import { createApp } from "../src/server/app";

const app = createApp();

export default app;
