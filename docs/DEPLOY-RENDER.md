# Prototype hosting on Render (free tier)

The hackathon prototype runs on Render so judges can open it from a link. Production is designed for AWS (Cape Town) with a synchronised copy at BTC (see DEPLOY-AWS.md).

**Settings used:** Web Service from the GitHub repository, build command `npm install`, start command `npm start`, free instance type.

**Environment variables (Settings > Environment):**
- `SESSION_SECRET`: a long random string (for example the output of `openssl rand -hex 32`). Without it the app makes a temporary secret and sign-ins reset on every restart.
- Leave `DEV_SHOW_OTP` and `SEED_DEMO` unset (demo mode on) so judges can sign in with demo roles and see one-time codes on screen.

**Free tier behaviour to expect** (from Render's documentation): the service sleeps after 15 minutes without traffic and takes about a minute to wake; the filesystem is ephemeral, so the database resets to the demo data whenever it restarts, redeploys or spins down. This is acceptable for a demonstration with invented data. Optional: an uptime monitor on `/api/health` every 5 minutes keeps it awake.

**Updating the prototype:** upload changed files to the GitHub repository; Render redeploys automatically. Data resets after each deploy.
