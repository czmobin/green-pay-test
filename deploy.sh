#!/usr/bin/env bash
# استقرار گرین‌پی روی سرور — روی خودِ سرور اجرا می‌شود:
#   ssh root@109.122.252.99 '/opt/greenpay/deploy.sh'
#
# نکته: کل بدنه داخل یک تابع است تا bash پیش از اجرا کل فایل را بخواند؛
# وگرنه به‌روزرسانی همین فایل توسط git وسط اجرا، ادامهٔ اسکریپت را خراب می‌کند.
set -euo pipefail

main() {
  local APP_DIR="${APP_DIR:-/opt/greenpay}"
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
  set -a; . /etc/greenpay.env; set +a
  ./.venv/bin/python manage.py migrate --noinput
  ./.venv/bin/python manage.py seed_demo            # اگر دیتابیس داده دارد، کاری نمی‌کند
  ./.venv/bin/python manage.py collectstatic --noinput --clear >/dev/null

  echo "▸ راه‌اندازی مجدد سرویس‌ها…"
  systemctl restart greenpay-web greenpay-api
  sleep 3
  local svc failed=0
  for svc in greenpay-web greenpay-api; do
    if systemctl is-active --quiet "$svc"; then
      echo "  ✓ $svc"
    else
      echo "  ✗ $svc"; journalctl -u "$svc" -n 20 --no-pager; failed=1
    fi
  done
  [ "$failed" -eq 0 ] || exit 1

  echo "✅ استقرار کامل شد — http://${DEPLOY_HOST:-109.122.252.99}/"
}

main "$@"
