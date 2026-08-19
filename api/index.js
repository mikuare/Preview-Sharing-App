// Vercel serverless entry point: every /api/* and /auth/* request is routed
// here by vercel.json and handled by the same Express app used locally.

import app from '../server/app.js'

export default app
