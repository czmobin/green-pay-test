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
  ./.venv/bin/python manage.py init_data           # فقط داده‌های پایه (انواع سازمان و دسته‌ها)
  ./.venv/bin/python manage.py collectstatic --noinput --clear >/dev/null

  # زمان‌بند یادآور پیامکی — هر دقیقه بررسی می‌کند چه کسی باید پیامک بگیرد
  # (با ۵ دقیقه، یادآور تا ۵ دقیقه دیر می‌رسید)
  echo "▸ زمان‌بند یادآور…"
  cat > /etc/systemd/system/greenpay-reminders.service <<'UNIT'
[Unit]
Description=GreenPay — ارسال پیامک یادآور جلسه
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/greenpay/backend
EnvironmentFile=/etc/greenpay.env
ExecStart=/opt/greenpay/backend/.venv/bin/python manage.py send_reminders
UNIT
  cat > /etc/systemd/system/greenpay-reminders.timer <<'UNIT'
[Unit]
Description=GreenPay — بررسی هر دقیقهٔ یادآورهای جلسه

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=5s
Persistent=true

[Install]
WantedBy=timers.target
UNIT
  # زمان‌بند همگام‌سازی Outlook — تایمرِ جدا از یادآور، عمداً: اگر Graph کند
  # یا قطع باشد، نباید پیامک یادآور جلسه را عقب بیندازد.
  # آهنگِ واقعیِ هر صندوق در دیتابیس است (OUTLOOK_PULL_INTERVAL_SECONDS)؛
  # این تایمر فقط صف ارسال را خالی می‌کند. با OUTLOOK_ENABLED=0 هر اجرا
  # بی‌درنگ و بدون هیچ درخواستی برمی‌گردد.
  echo "▸ زمان‌بند همگام‌سازی Outlook…"
  cat > /etc/systemd/system/greenpay-outlook.service <<'UNIT'
[Unit]
Description=GreenPay — همگام‌سازی دوطرفهٔ جلسات با Outlook
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/greenpay/backend
EnvironmentFile=/etc/greenpay.env
ExecStart=/opt/greenpay/backend/.venv/bin/python manage.py outlook_sync
UNIT
  cat > /etc/systemd/system/greenpay-outlook.timer <<'UNIT'
[Unit]
Description=GreenPay — بررسی هر دقیقهٔ تغییرات Outlook

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s
Persistent=true

[Install]
WantedBy=timers.target
UNIT
  # پشتیبان شبانهٔ دیتابیس. اینجا ساخته می‌شود و نه دستی روی سرور، تا سرورِ
  # بازسازی‌شده هم خودبه‌خود پشتیبان داشته باشد — وگرنه تنها نسخهٔ دادهٔ سامانه
  # به یک مرحلهٔ دستیِ فراموش‌شدنی وابسته می‌ماند.
  echo "▸ پشتیبان شبانه…"
  cat > /usr/local/bin/greenpay-backup <<'SH'
#!/usr/bin/env bash
set -euo pipefail
OUT=/var/backups/greenpay
mkdir -p "$OUT"
set -a; . /etc/greenpay.env; set +a
STAMP=$(date +%Y%m%d-%H%M)

if [ -z "${DB_NAME:-}" ]; then
  echo "DB_NAME تنظیم نیست — پشتیبان‌گیری رد شد (هنوز روی SQLite؟)"
  exit 0
fi

PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" \
    -U "${DB_USER:-greenpay}" -d "$DB_NAME" \
    -Fc --no-owner --no-privileges \
    -f "$OUT/db-$STAMP.dump"

# دامپی که خوانده نشود بکاپ نیست؛ همان شب بفهمیم، نه روز حادثه.
pg_restore --list "$OUT/db-$STAMP.dump" >/dev/null

if [ -d /opt/greenpay/backend/media ] && [ -n "$(ls -A /opt/greenpay/backend/media 2>/dev/null)" ]; then
    tar -czf "$OUT/media-$STAMP.tar.gz" -C /opt/greenpay/backend media
fi

find "$OUT" -type f -name 'db-*.dump'      -mtime +30 -delete
find "$OUT" -type f -name 'media-*.tar.gz' -mtime +30 -delete
echo "backup ok: $OUT/db-$STAMP.dump ($(du -h "$OUT/db-$STAMP.dump" | cut -f1))"
SH
  chmod +x /usr/local/bin/greenpay-backup
  cat > /etc/systemd/system/greenpay-backup.service <<'UNIT'
[Unit]
Description=GreenPay — پشتیبان‌گیری دیتابیس
After=postgresql.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/greenpay-backup
UNIT
  cat > /etc/systemd/system/greenpay-backup.timer <<'UNIT'
[Unit]
Description=GreenPay — پشتیبان شبانه

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
UNIT

  systemctl daemon-reload
  systemctl enable --now greenpay-reminders.timer >/dev/null
  systemctl enable --now greenpay-outlook.timer >/dev/null
  systemctl enable --now greenpay-backup.timer >/dev/null

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
  systemctl is-active --quiet greenpay-reminders.timer \
    && echo "  ✓ greenpay-reminders.timer ($(systemctl show -p NextElapseUSecRealtime --value greenpay-reminders.timer))" \
    || echo "  ✗ greenpay-reminders.timer"
  systemctl is-active --quiet greenpay-outlook.timer \
    && echo "  ✓ greenpay-outlook.timer" \
    || echo "  ✗ greenpay-outlook.timer"
  systemctl is-active --quiet greenpay-backup.timer \
    && echo "  ✓ greenpay-backup.timer" \
    || echo "  ✗ greenpay-backup.timer" 

  echo "✅ استقرار کامل شد — http://${DEPLOY_HOST:-109.122.252.99}/"
}

main "$@"
