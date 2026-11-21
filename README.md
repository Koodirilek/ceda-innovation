# CEDA Innovation Portal (hackathon prototype)

A working innovation management portal: idea submission, multi-level evaluation, adjudication, real-time tracking, role-based access, feedback and resubmission, reporting, admin content control, live chat with business hours, and a 24/7 assistant.

**Stack:** Node.js 22 + Express 5, embedded SQLite (`node:sqlite`), vanilla JS front end, server-sent events for real time. One dependency (`express`). Runs as one Docker container.

## Run it (2 minutes)
```bash
npm install
npm start            # http://localhost:3000  (needs Node 22.5+)
```
or `cp .env.example .env && docker compose up --build`.

Open http://localhost:3000, choose **Sign in**. Demo accounts (password `Demo@1234`):

| Role | Email |
|---|---|
| Submitter | submitter@demo.bw, submitter2@demo.bw |
| Evaluator | evaluator1@demo.bw, evaluator2@demo.bw |
| Adjudicator | adjudicator@demo.bw |
| Administrator | admin@demo.bw |
| Committee observer | observer@demo.bw |
| Chat consultant | agent@demo.bw |

New users can self-register; in demo mode the 6-digit code is shown on screen (no SMS/email gateway is connected yet).

## Brief requirement -> where it is
| Requirement | Implementation |
|---|---|
| Idea submission with mandatory fields | Submitter > New idea; drafts, 10 file attachments; validation in `routes/ideas.js` |
| Multi-level evaluation, customisable criteria, collaborative scoring, adjudication | Admin assigns evaluators per level; weighted criteria (Admin > Criteria); evaluators see peers' scores after submitting theirs; adjudicator decides |
| Real-time tracking for internal and external stakeholders | Dashboards and idea pages refresh through `/api/events` (SSE); observers see status only; alerts on every change |
| Role-based access, IP protection | 6 roles enforced on every request; blind review (evaluators never see the submitter); observers cannot read idea content |
| Feedback and iteration | Evaluator feedback shared with submitter, replies, return for changes, resubmission creates version 2, 3... |
| Reporting | Dashboard (participation, outcomes, timelines, workload), CSV export, chat analytics |
| Modular and scalable | Workflow table `FLOW` and criteria are data/config; routes are separate modules; webhook events (`WEBHOOK_URL`); `deliver()` plug point for SMTP/SMS |
| Self-register, email/phone validation | OTP verification at registration |
| Password / OTP authentication, create, change, recover password | `auth.html`, `/api/auth/*`; account lockout after 5 failures; rate limiting |
| Admin manages content, forms, documents | Admin > Content: pages, FAQs, regulator contacts, document uploads |
| Online chat 09:00-16:00 working days, multi-agent, "agent not available", analytics | `routes/chat.js`, Chat console, Chat analytics; Africa/Gaborone time |
| FAQs and regulator contacts | Help and FAQ page |
| Free alerts when a submission changes | Subscribe button, email/SMS preferences, in-app notifications |
| Audit trail | Every sign-in, change, score and download is logged (Admin > Audit log) |
| Cyber security and privacy | scrypt password hashing, HttpOnly session cookie, CSP with no third-party content, CSRF header + SameSite, upload allow-list, generic errors, privacy notice |
| Cross-browser and device | Responsive, no framework, tested layout rules for mobile |
| Hosting, region, costs, fault support | `docs/DEPLOY-AWS.md` (AWS Cape Town plus synchronised copy at BTC) and `docs/DEPLOY-BOTSWANA.md` (support targets) |
| Beyond the spec | **Duplicate-idea detection**, 24/7 on-server assistant, blind review, version history, observer redaction, webhooks |

## Duplicate-idea detection
While a submitter types, the form checks the text against every submitted idea (TF-IDF similarity, `src/similar.js`) and shows a traffic-light notice: none, possible overlap or very similar. Submitters are never shown other people's ideas, only whether similar ones exist, and their own earlier similar ideas. When an idea is submitted with a 60%+ match, administrators get an alert, and administrators and adjudicators see a **Similar ideas** panel with links and scores. It runs on the portal server, so idea text never leaves Botswana.

## Tests
```bash
npm test             # 6 API tests: auth, workflow, RBAC, content, chat, duplicates
npm install --no-save jsdom && npm run test:ui   # opens every screen for every role
```

## Performance
Measured on a development machine with 20 concurrent users (`RATE_LIMIT=100000 npm start`, then `npm run bench` and `npm run bench:mixed`). Repeat on your live server and record the results for the proposal.

| What | Before tuning | After tuning |
|---|---|---|
| App script sent to the browser | 42 KB | 13 KB (gzip) |
| Landing page sent to the browser | 41 KB | 20 KB (gzip) |
| Typical page or data request | 22 to 31 ms | 19 to 42 ms, 95% under 90 ms |
| Idea list while 8 users sign in at once | 267 ms typical, 863 ms worst | 87 ms typical, 290 ms worst |
| Single sign-in | blocked other requests | about 45 ms, no blocking |

What was done: gzip for text responses; static files compressed once and cached with ETags (304 when unchanged); password hashing moved off the main thread with a larger thread pool; prepared statements reused; database indexes on every lookup column and tuned SQLite settings; no polling from background tabs; the interface shows a loading note only when a screen takes over 150 ms. Local numbers show server time only. On mobile networks the smaller downloads matter more.

## Project layout
```
server.js              app, security headers, routing
src/db.js              schema + queries (SQLite)
src/lib.js             sessions, OTP, notifications, SSE, scoring, workflow table
src/routes/            auth, ideas, chat, misc (reports, content, admin, assistant)
src/seed.js            base content + demo data
public/                landing page, auth.html, privacy.html, app/ (portal UI)
docs/DEPLOY-BOTSWANA.md, docs/DEPLOY-AWS.md
deploy/                 HTTPS proxy config, server setup, BTC sync, restore and smoke-test scripts
scripts/               benchmark and database backup tools
```

## Known limits (honest list)
- SQLite on one server: fine for a prototype and pilot, plan a managed database and a second node before heavy production use.
- SMS/email are logged to the outbox (Admin > Message log) until `deliver()` is connected to a gateway.
- Biometric login is not implemented (the brief allows password or OTP).
- Chat uses short polling (3 s), not WebSockets.
- Public holidays are not excluded from chat hours.
