# Deploying in Botswana (BTC Sentlhaga or any in-country host)

The portal is one Node.js process with an embedded SQLite database and a local files folder. Nothing calls an outside service, so all personal data stays on the server you deploy to.

## 1. Server
Linux VM with Docker (Ubuntu 22.04/24.04, 2 vCPU, 4 GB RAM, 40 GB disk is enough for the prototype), a public IP and a domain pointing to it.

## 2. Install
```bash
git clone <your-repo> ceda-innovation-portal && cd ceda-innovation-portal
cp .env.example .env        # set SESSION_SECRET to a long random value
docker compose up -d --build
```
The app listens on port 3000. Put HTTPS in front of it (the session cookie is Secure in production). Example with Caddy (automatic certificates):
```
innovation.example.bw {
  reverse_proxy localhost:3000
}
```

## 3. Go live checklist
- `SEED_DEMO=false`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` set before the first start (creates one admin, no demo users). Delete `data/` first if you ran the demo.
- Connect email/SMS: edit `deliver()` in `src/lib.js` to call your local SMTP relay / Botswana SMS gateway, then set `DEV_SHOW_OTP=false`.
- Daily backup: `sqlite3 data/portal.db ".backup '/backups/portal-$(date +%F).db'"` and copy `data/files/` (cron). Test a restore once.
- Firewall: allow 80/443 (and SSH from your address only). Keep the OS updated.
- Monitoring: `GET /api/health` returns `{"ok":true}`; point an uptime monitor at it. Container restarts automatically.

## 4. Data protection notes (Data Protection Act, 2024)
Data is held on the in-country server only; no third-party scripts, fonts or analytics are loaded. Personal data collected: name, email/phone, ideas, files, audit records. Access is role-based and logged. Users can change alert preferences; deletion and correction requests are handled by the administrator (Users page). Review retention periods with CEDA.

## 5. Support targets (editable on the Content page)
Critical outage: acknowledged in 1 hour, restored in 4 hours. Major defect: 1 business day. Minor defect: 5 business days.
