# Deploying on AWS (Cape Town) with a synchronised copy at BTC

Short version (details and checklists are in the Friday runbook document):

1. AWS: enable the Africa (Cape Town) region, launch Ubuntu 24.04 (t3.small), 30 GB encrypted disk, Elastic IP, security group with 22 (your IP only), 80 and 443.
2. DNS: A record for your domain pointing at the Elastic IP.
3. On the server: unzip, `bash deploy/bootstrap-ubuntu.sh`, log out and in, `cp .env.example .env`, set `SESSION_SECRET` (`openssl rand -hex 32`) and `DOMAIN`.
4. Start: `docker compose -f docker-compose.aws.yml up -d --build` (Caddy fetches the HTTPS certificate automatically).
5. Check: `bash deploy/smoke-test.sh https://your-domain` (all lines should say PASS).
6. Backups: hourly `node scripts/backup.mjs` inside the container (cron) plus daily EBS snapshots.
7. BTC copy: create an SSH key on the AWS server, add its public key to the BTC server, then cron `deploy/sync-to-btc.sh` every 15 minutes. Test a restore with `deploy/restore-from-copy.sh`.

Files: `docker-compose.aws.yml`, `deploy/Caddyfile`, `deploy/bootstrap-ubuntu.sh`, `deploy/sync-to-btc.sh`, `deploy/restore-from-copy.sh`, `deploy/smoke-test.sh`, `scripts/backup.mjs`.
