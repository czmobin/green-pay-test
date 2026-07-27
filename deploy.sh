#!/usr/bin/env bash
# استقرار گرین‌پی روی سرور — روی خودِ سرور اجرا می‌شود:
#   ssh root@109.122.252.99 '/opt/greenpay/deploy.sh'
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/greenpay}"
cd "$APP_DIR"

echo "▸ دریافت آخرین کد…"
git fetch --quiet origin
git reset --hard --quiet origin/main
echo "  $(git log --oneline -1)"

echo "▸ فرانت‌اند (Next.js)…"
cd "$APP_DIR/frontend"
npm ci --no-audit --no-fund --silent
npm run build

echo "▸ بک‌اند (Django)…"
cd "$APP_DIR/backend"
[ -d .venv ] || python3 -m venv .venv
./.venv/bin/pip install --quiet --upgrade pip
./.venv/bin/pip install --quiet -r requirements.txt
./.venv/bin/python manage.py migrate --noinput
./.venv/bin/python manage.py collectstatic --noinput --clear >/dev/null

echo "▸ راه‌اندازی مجدد سرویس‌ها…"
systemctl restart greenpay-web greenpay-api
sleep 2
systemctl is-active --quiet greenpay-web && echo "  ✓ greenpay-web" || { echo "  ✗ greenpay-web"; journalctl -u greenpay-web -n 20 --no-pager; exit 1; }
systemctl is-active --quiet greenpay-api && echo "  ✓ greenpay-api" || { echo "  ✗ greenpay-api"; journalctl -u greenpay-api -n 20 --no-pager; exit 1; }

echo "✅ استقرار کامل شد — http://${DEPLOY_HOST:-109.122.252.99}/"
