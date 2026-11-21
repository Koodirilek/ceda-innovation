#!/usr/bin/env bash
# Keeps a full, synchronised copy of the data on the BTC server in Botswana (run every 15 minutes from cron on the AWS server).
# Needs: an SSH key that can log in to the BTC server. Example cron line:
#   */15 * * * * BTC_HOST=sync@btc.example.bw BTC_DIR=/srv/ceda-copy /home/ubuntu/portal/deploy/sync-to-btc.sh >> /home/ubuntu/sync.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
: "${BTC_HOST:?set BTC_HOST, for example sync@btc.example.bw}" "${BTC_DIR:?set BTC_DIR, for example /srv/ceda-copy}"
SSH="ssh -i ${BTC_KEY:-$HOME/.ssh/btc_sync} -o StrictHostKeyChecking=yes -o BatchMode=yes"
docker compose -f docker-compose.aws.yml exec -T portal node scripts/backup.mjs
rsync -az --delete-after -e "$SSH" data/backups/ "$BTC_HOST:$BTC_DIR/backups/"
rsync -az -e "$SSH" data/files/ "$BTC_HOST:$BTC_DIR/files/"
echo "$(date -Is) sync ok"
