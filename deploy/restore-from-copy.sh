#!/usr/bin/env bash
# Restore the portal from the synchronised copy (run on the BTC server, or on a rebuilt AWS server).
# Usage: bash deploy/restore-from-copy.sh /srv/ceda-copy      (folder that contains backups/ and files/)
set -euo pipefail
SRC="${1:?Usage: restore-from-copy.sh /path/to/copy}"; cd "$(dirname "$0")/.."
LATEST="$(ls -1 "$SRC"/backups/portal-*.db | sort | tail -1)"; echo "Restoring $LATEST"
docker compose -f docker-compose.aws.yml down || true
mkdir -p data/files && cp "$LATEST" data/portal.db && rm -f data/portal.db-wal data/portal.db-shm && cp -a "$SRC"/files/. data/files/ && sudo chown -R 1000:1000 data
docker compose -f docker-compose.aws.yml up -d --build
echo "Restored. Run: bash deploy/smoke-test.sh https://your-domain"
