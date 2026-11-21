#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 server (AWS EC2 or BTC VM). Run as the normal user: bash deploy/bootstrap-ubuntu.sh
set -euo pipefail
sudo apt-get update -y && sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo apt-get install -y ca-certificates curl ufw rsync unattended-upgrades
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
sudo timedatectl set-timezone Africa/Gaborone
mkdir -p data && sudo chown -R 1000:1000 data
echo "Done. Log out and back in (so docker works without sudo), then: cp .env.example .env && nano .env"
