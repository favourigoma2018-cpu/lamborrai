#!/usr/bin/env bash
set -euo pipefail

# One-shot EC2 deploy script for LAMBOR
# Usage:
#   chmod +x scripts/deploy-ec2.sh
#   ./scripts/deploy-ec2.sh
#
# Optional env overrides:
#   APP_DIR=/var/www/lambor
#   APP_NAME=lambor
#   BRANCH=main
#   PORT=3000
#   RUN_NGINX_RELOAD=true

APP_DIR="${APP_DIR:-$HOME/lamborrai}"
APP_NAME="${APP_NAME:-lambor}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3000}"
RUN_NGINX_RELOAD="${RUN_NGINX_RELOAD:-false}"

echo "==> Deploying ${APP_NAME} from branch ${BRANCH}"
echo "==> App directory: ${APP_DIR}"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "ERROR: APP_DIR does not exist: ${APP_DIR}"
  exit 1
fi

cd "${APP_DIR}"

echo "==> Fetching latest code"
git fetch --all --prune
git checkout "${BRANCH}"
git pull origin "${BRANCH}"

echo "==> Installing dependencies"
npm ci || npm install

echo "==> Building app"
npm run build

echo "==> Restarting PM2 process: ${APP_NAME}"
if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  pm2 restart "${APP_NAME}"
else
  echo "PM2 process not found; starting ${APP_NAME} on port ${PORT}"
  PORT="${PORT}" pm2 start npm --name "${APP_NAME}" -- start
fi

pm2 save

if [[ "${RUN_NGINX_RELOAD}" == "true" ]]; then
  echo "==> Reloading Nginx"
  sudo nginx -t
  sudo systemctl reload nginx
fi

echo "==> Health check"
curl -fsS "http://127.0.0.1:${PORT}" >/dev/null && echo "OK: app responding on :${PORT}"

echo "==> Recent PM2 logs"
pm2 logs "${APP_NAME}" --lines 40 --nostream || true

echo "==> Deploy complete"
