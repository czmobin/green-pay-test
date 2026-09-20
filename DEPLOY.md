# استقرار روی سرور

سرور فعلی: **`109.122.252.99`** — Ubuntu 24.04 · Node 20 · Python 3.12 · nginx · PostgreSQL 16

| آدرس | توضیح |
|---|---|
| `https://calendar.greenpay360.ir/` | اپلیکیشن (Next.js) — نشانی اصلی |
| `https://calendar.greenpay360.ir/admin/` | پنل ادمین Django |
| `http://109.122.252.99/` | همان اپ روی آی‌پی، بدون TLS (گواهی برای آی‌پی صادر نشده) |

## بالا آوردن روی یک سرور تازه

اگر سرور فعلی هست و فقط می‌خواهید نسخهٔ جدید بدهید، این بخش را رد کنید و بروید
سراغ «دیپلوی نسخهٔ جدید».

این مراحل روی Ubuntu 24.04 نوشته شده‌اند و با دسترسی root اجرا می‌شوند.

### ۱) بسته‌ها

```bash
apt update
apt install -y nginx git python3-venv python3-pip curl postgresql postgresql-client
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

Node باید ۱۸٫۱۷ یا بالاتر باشد (روی سرور فعلی ۲۰ است). Python 3.12 خودِ اوبونتو
۲۴٫۰۴ کافی است. بستهٔ `postgresql` روی ۲۴٫۰۴ نسخهٔ ۱۶ را می‌آورد.

### ۱٫۵) دیتابیس

```bash
PW=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40)

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE greenpay LOGIN PASSWORD '$PW';
ALTER ROLE greenpay SET client_encoding TO 'utf8';
ALTER ROLE greenpay SET timezone TO 'UTC';
SQL
sudo -u postgres createdb -O greenpay -E UTF8 -T template0 greenpay

# آزمون اتصال واقعی روی TCP، نه فقط ساخت
PGPASSWORD="$PW" psql -h 127.0.0.1 -U greenpay -d greenpay -tAc 'select current_user'
echo "DB_PASSWORD=$PW"   # این را در گام بعد لازم دارید
```

رمز فقط حرف و رقم است و این عمدی است: مقدار داخل `EnvironmentFile` سیستم‌دی با
کاراکترهای خاص (مثل `#` یا `$`) به‌درستی خوانده نمی‌شود و خطایش هم گنگ است.

### ۲) گرفتن کد

```bash
mkdir -p /opt
git clone git@github.com:czmobin/green-pay-test.git /opt/greenpay
chmod +x /opt/greenpay/deploy.sh
```

اگر سرور به GitHub دسترسی SSH ندارد، یک deploy key بسازید و در تنظیمات مخزن ثبتش
کنید، یا با HTTPS کلون کنید.

### ۳) فایل محیطی

```bash
cp /opt/greenpay/backend/.env.example /etc/greenpay.env
chmod 600 /etc/greenpay.env
nano /etc/greenpay.env
```

دست‌کم این‌ها را عوض کنید:

```
SECRET_KEY=<یک رشتهٔ تصادفی بلند>
DEBUG=0
ALLOWED_HOSTS=calendar.greenpay360.ir,<IP سرور>,localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=https://calendar.greenpay360.ir
OTP_ECHO_WHEN_SMS_OFF=0

DB_NAME=greenpay
DB_USER=greenpay
DB_PASSWORD=<رمزی که در گام ۱٫۵ ساختید>
DB_HOST=127.0.0.1
DB_PORT=5432
```

**`DB_NAME` کلیدِ انتخاب موتور است.** اگر باشد جنگو به PostgreSQL وصل می‌شود، اگر
نباشد به SQLite. یعنی برگشت اضطراری به SQLite فقط کامنت‌کردن همین یک خط و یک
ری‌استارت است.

`SECRET_KEY` را می‌توانید این‌طور بسازید:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

> `DEBUG=0` و `OTP_ECHO_WHEN_SMS_OFF=0` را جا نیندازید. دومی روی production با کلید
> پیامکِ تنظیم‌شده بی‌اثر است، ولی اگر روزی کلید پیامک تمام شود، با مقدار ۱ کدِ ورود
> در پاسخ API برمی‌گردد — یعنی هر کسی می‌تواند با هر شماره‌ای وارد شود.

### ۴) سرویس‌های systemd

دو سرویس دائمی. (تایمرها را خودِ `deploy.sh` می‌سازد، این دو را دستی بسازید.)

```bash
cat > /etc/systemd/system/greenpay-api.service <<'UNIT'
[Unit]
Description=Green Pay — backend (Django/gunicorn)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/greenpay/backend
EnvironmentFile=/etc/greenpay.env
ExecStart=/opt/greenpay/backend/.venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8001 --workers 3 --timeout 60
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/greenpay-web.service <<'UNIT'
[Unit]
Description=Green Pay — frontend (Next.js)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/greenpay/frontend
Environment=NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1
ExecStart=/usr/bin/npm run start -- -p 3000 -H 127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable greenpay-api greenpay-web
```

هیچ‌کدام هنوز بالا نمی‌آیند، چون `.venv` و بیلد فرانت ساخته نشده‌اند. `deploy.sh`
در گام بعدی هر دو را می‌سازد و سرویس‌ها را استارت می‌کند.

### ۵) nginx

```bash
cat > /etc/nginx/snippets/greenpay-app.conf <<'CONF'
location /static/ { alias /opt/greenpay/backend/staticfiles/; access_log off; expires 30d; }
location /media/  { alias /opt/greenpay/backend/media/; access_log off; }

location ~ ^/(admin|api) {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
CONF

cat > /etc/nginx/sites-available/greenpay <<'CONF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 25m;
    include snippets/greenpay-app.conf;
}
CONF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/greenpay /etc/nginx/sites-enabled/greenpay
nginx -t && systemctl reload nginx
```

این فعلاً فقط HTTP است. بعد از اینکه اپ بالا آمد و DNS دامنه به سرور اشاره کرد،
بلوک TLS را از بخش [TLS](#tls) اضافه کنید.

`client_max_body_size 25m` را جا نیندازید؛ پیش‌فرض nginx یک مگابایت است و پیوست
صورت‌جلسه و فایل درون‌ریزی افراد به آن می‌خورند.

### ۶) اولین اجرا

```bash
/opt/greenpay/deploy.sh
```

همین اسکریپت `.venv` را می‌سازد، وابستگی‌ها را نصب می‌کند، مایگریشن می‌زند،
دادهٔ پایه را می‌سازد، فرانت را بیلد می‌کند، تایمرها را نصب می‌کند و سرویس‌ها را
بالا می‌آورد. آخرش باید چهار خط ✓ ببینید.

### ۷) اولین ادمین

دیتابیس تازه هیچ کاربری ندارد، و ورود به اپ همیشه با شمارهٔ موبایل است — پس کاربری
که با `createsuperuser` می‌سازید فقط به `/admin/` راه دارد، نه به خود اپ.

```bash
cd /opt/greenpay/backend && ./.venv/bin/python manage.py createsuperuser
```

بعد وارد `/admin/` شوید، همان کاربر را باز کنید، `phone` او را بگذارید و `role` را
روی `admin`. حالا با همان شماره می‌توانید وارد خود اپ هم بشوید.

### ۸) بررسی

```bash
systemctl status greenpay-api greenpay-web --no-pager
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/          # باید 200 بدهد
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/api/bootstrap/   # باید 401 بدهد
```

`401` روی `bootstrap` درست است و یعنی API بالاست و بدون توکن چیزی نمی‌دهد.

---

## دیپلوی نسخهٔ جدید

بعد از `git push` روی شاخهٔ `main`، فقط این یک دستور:

```bash
ssh root@109.122.252.99 '/opt/greenpay/deploy.sh'
```

اسکریپت به‌ترتیب: آخرین کد را می‌گیرد → فرانت را بیلد می‌کند → وابستگی/مایگریشن/استاتیک بک‌اند را به‌روز می‌کند → تایمرها را به‌روز می‌کند → سرویس‌ها را ری‌استارت می‌کند.

> **اگر خودِ `deploy.sh` را عوض کرده‌اید، دو بار اجرایش کنید.** اسکریپت وسط اجرا
> با `git reset --hard` خودش را به‌روز می‌کند، ولی bash بدنهٔ تابع `main` را از قبل
> خوانده و همان نسخهٔ قدیمی را تا آخر اجرا می‌کند. تغییرِ خودِ اسکریپت از اجرای
> بعدی اعمال می‌شود. (این یک بار واقعاً پیش آمد: تایمر Outlook در اجرای اول نصب
> نشد و در اجرای دوم نصب شد.)

اگر مایگریشنی در راه است، پیش از دیپلوی یک پشتیبان تازه بگیرید:

```bash
ssh root@109.122.252.99 '/usr/local/bin/greenpay-backup'
```

برخلاف SQLite، مهاجرت روی PostgreSQL داخل تراکنش اجرا می‌شود و اگر وسط کار خطا
بدهد خودش برمی‌گردد. ولی مهاجرتی که *موفق* باشد و داده را اشتباه تبدیل کند با
هیچ تراکنشی برنمی‌گردد — پشتیبان برای همان حالت است.

## چیدمان روی سرور

```
/opt/greenpay/                 کد (clone از GitHub، شاخهٔ main)
/etc/greenpay.env              SECRET_KEY، DEBUG=0، ALLOWED_HOSTS، کلیدهای پیامک (دسترسی 600)
/etc/systemd/system/greenpay-web.service    Next.js روی 127.0.0.1:3000
/etc/systemd/system/greenpay-api.service    gunicorn روی 127.0.0.1:8001
/etc/nginx/sites-available/greenpay         پروکسی معکوس، پورت ۸۰ و ۴۴۳
/etc/nginx/snippets/greenpay-app.conf       مسیرهای مشترک http و https
/etc/ssl/greenpay/                          گواهی و کلید TLS (پوشه 700، کلید 600)
/var/lib/postgresql/16/main                 دادهٔ PostgreSQL
/var/backups/greenpay/                      پشتیبان‌های شبانه (۳۰ روز)
```

nginx مسیرها را این‌طور تقسیم می‌کند: `/admin` و `/api` → Django، `/static/` و `/media/` → فایل‌های Django، بقیه → Next.js.

هر سه سرویس `enabled` هستند، پس بعد از ری‌بوت خودکار بالا می‌آیند.

## دستورهای مفید

```bash
# وضعیت و لاگ
ssh root@109.122.252.99 'systemctl status greenpay-web greenpay-api --no-pager'
ssh root@109.122.252.99 'journalctl -u greenpay-web -n 50 --no-pager'

# ری‌استارت دستی
ssh root@109.122.252.99 'systemctl restart greenpay-web greenpay-api'

# ساخت کاربر ادمین جدید
ssh root@109.122.252.99 'cd /opt/greenpay/backend && set -a && . /etc/greenpay.env && set +a && ./.venv/bin/python manage.py createsuperuser'
```

## پشتیبان‌گیری

پشتیبان شبانه نصب و فعال است: `greenpay-backup.timer` هر شب ساعت ۰۲:۳۰ اجرا
می‌شود و خروجی در `/var/backups/greenpay/` می‌نشیند. نسخه‌های قدیمی‌تر از ۳۰ روز
خودکار پاک می‌شوند.

```bash
ssh root@109.122.252.99 'systemctl list-timers greenpay-backup.timer --no-pager'
ssh root@109.122.252.99 'journalctl -u greenpay-backup -n 20 --no-pager'
ssh root@109.122.252.99 'ls -lh /var/backups/greenpay/ | tail -5'
```

گرفتن نسخهٔ دستی، همین حالا:

```bash
ssh root@109.122.252.99 '/usr/local/bin/greenpay-backup'
```

اسکریپت بعد از هر دامپ یک `pg_restore --list` روی آن می‌زند. دلیلش ساده است:
بکاپی که خوانده نمی‌شود بکاپ نیست، و بهتر است همان شب بفهمیم تا روز حادثه.

### برگرداندن

دامپ‌ها در قالب `custom` هستند، پس `pg_restore` می‌خواهند نه `psql`.

```bash
systemctl stop greenpay-api greenpay-outlook.timer greenpay-reminders.timer

set -a; . /etc/greenpay.env; set +a
sudo -u postgres dropdb --if-exists greenpay
sudo -u postgres createdb -O greenpay -E UTF8 -T template0 greenpay
PGPASSWORD="$DB_PASSWORD" pg_restore -h 127.0.0.1 -U greenpay -d greenpay \
    --no-owner --no-privileges /var/backups/greenpay/db-<تاریخ>.dump

systemctl start greenpay-api greenpay-outlook.timer greenpay-reminders.timer
```

پیش از اینکه روی دیتابیس اصلی دست بگذارید، می‌توانید همان دامپ را در یک دیتابیس
موقت برگردانید و ببینید سالم است:

```bash
sudo -u postgres createdb -O greenpay -E UTF8 -T template0 greenpay_check
PGPASSWORD="$DB_PASSWORD" pg_restore -h 127.0.0.1 -U greenpay -d greenpay_check \
    --no-owner --no-privileges /var/backups/greenpay/db-<تاریخ>.dump
PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U greenpay -d greenpay_check \
    -tAc 'select count(*) from meetings_meeting'
sudo -u postgres dropdb greenpay_check
```

نسخه‌ها روی همان سرور می‌مانند، که در برابر خرابی دیسک یا پاک شدن سرور کمکی
نمی‌کند. برای جدی شدن، فایل‌ها را جای دیگری هم کپی کنید.

### نسخهٔ پیش از مهاجرت

فایل SQLite دوران قبل و آخرین پشتیبانش هنوز روی سرورند:

```
/opt/greenpay/backend/db.sqlite3              دست‌نخورده از لحظهٔ کات‌اور
/var/backups/greenpay/pre-pg-*.sqlite3        پشتیبان همان لحظه
```

این‌ها را تا وقتی از پایداری PostgreSQL مطمئن شوید نگه دارید. بعد از آن می‌توانید
پاکشان کنید — دادهٔ زنده دیگر آنجا نیست و هر تغییری از کات‌اور به بعد فقط در
PostgreSQL است.

## نکات امنیتی

- کلید خصوصی TLS هیچ‌وقت نباید وارد مخزن شود. `*.key`، `*.pem`، `*.crt` و
  `*Fullchain*` در `.gitignore` هستند و تاریخچهٔ مخزن هم تمیز است (بررسی شده).
  ولی ممکن است در پوشهٔ کاری توسعه‌دهنده کپی‌ای از کلید مانده باشد؛ اگر هست جایی
  امن ببریدش. جای درستش فقط `/etc/ssl/greenpay/` روی سرور است.
- `/etc/greenpay.env` باید `600` باشد. همهٔ کلیدهای پیامک و Outlook آنجاست.
- `DEBUG=0` و `OTP_ECHO_WHEN_SMS_OFF=0` روی production. دومی اگر ۱ بماند و روزی
  کلید پیامک از کار بیفتد، کدِ ورود در پاسخ API برمی‌گردد.
- پسورد ادمین Django را بعد از اولین ورود از `/admin/password_change/` عوض کنید.
- ورود با کلید SSH فعال است؛ برای سخت‌ترشدن `PasswordAuthentication no` را در
  `/etc/ssh/sshd_config` بگذارید.
- API فقط JWT می‌پذیرد و `SessionAuthentication` عمداً خاموش است. اگر روشنش کنید،
  کاربری که هم‌زمان در `/admin/` لاگین است کوکی نشست می‌فرستد و درخواست‌های `POST`
  به CSRF می‌خورند.

## پیامک

دو سرویس برای دو کار — هر دو کلیدشان فقط در `/etc/greenpay.env` است و هرگز در مخزن نیست:

| متغیر | کاربرد |
|---|---|
| `KAVENEGAR_API_KEY` | کد یک‌بارمصرف ورود (سرویس Lookup) |
| `KAVENEGAR_OTP_TEMPLATE` | نام قالب کد ورود |
| `PISHGAM_SMS_TOKEN` | یادآور جلسه (متن آزاد) |
| `PISHGAM_SMS_SENDER` | شمارهٔ فرستنده — پیش‌فرض `5000391009557` |
| `MEETING_REMINDER_LEAD_MINUTES` | پیش‌فرض یادآور بر حسب دقیقه (پیش‌فرض `60`) |

### یادآور جلسه

`greenpay-reminders.timer` هر دقیقه اجرا می‌شود و برای شرکت‌کنندگانی که زمان
یادآورشان رسیده پیامک می‌فرستد. فاصلهٔ یادآور برای هر «جلسه × کاربر» جداگانه است؛
هر کس از صفحهٔ جلسه می‌تواند فاصلهٔ خودش را عوض کند یا یادآور را خاموش کند.

`manage.py` خودش `/etc/greenpay.env` را می‌خواند، پس لازم نیست پیش از هر دستور
`set -a; . /etc/greenpay.env` بزنید:

```bash
# تشخیص علت رد شدن پیامک (بدون ارسال) — خروجی را می‌شود به پشتیبانی داد
ssh root@109.122.252.99 '/opt/greenpay/backend/.venv/bin/python \
  /opt/greenpay/backend/manage.py test_sms 09121234567 --diagnose'

# یک پیامک آزمایشی واقعی
ssh root@109.122.252.99 '/opt/greenpay/backend/.venv/bin/python \
  /opt/greenpay/backend/manage.py test_sms 09121234567'

# دیدن اینکه چه پیامکی می‌رفت، بدون ارسال
ssh root@109.122.252.99 '/opt/greenpay/backend/.venv/bin/python \
  /opt/greenpay/backend/manage.py send_reminders --dry-run'

# وضعیت تحویل پیامک‌ها (چه چیزی واقعاً به گوشی رسید)
ssh root@109.122.252.99 '/opt/greenpay/backend/.venv/bin/python \
  /opt/greenpay/backend/manage.py sms_status --by-phone'

# وضعیت زمان‌بند و آخرین اجراها
ssh root@109.122.252.99 'systemctl list-timers greenpay-reminders.timer --no-pager'
ssh root@109.122.252.99 'journalctl -u greenpay-reminders -n 30 --no-pager'
```

## همگام‌سازی Outlook

جلسات دوطرفه با Outlook سازمانی (`@greenpay360.ir`) همگام می‌شوند: رویدادهای
Outlook در سامانه می‌آیند و جلسه‌های سامانه در Outlook دیده می‌شوند.

**پیش‌فرض خاموش است.** تا وقتی `OUTLOOK_ENABLED=1` نشود، هیچ درخواستی به
مایکروسافت نمی‌رود و هیچ جلسه‌ای در صف ارسال نمی‌نشیند — پس روشن‌کردن بعدیِ
کلید، انبوه جلسه‌های قدیمی را یک‌جا شلیک نمی‌کند. انتقالِ عمدیِ جلسه‌های
موجود فقط با `outlook_sync --backfill --since` انجام می‌شود.

### ۱. ثبت برنامه در Azure

1. Azure Portal → **App registrations** → New registration (نوع: single tenant).
2. **Certificates & secrets** → یک client secret بسازید و مقدارش را همان لحظه
   بردارید (بعداً دیگر نشان داده نمی‌شود).
3. **API permissions** → Microsoft Graph → **Application permissions** →
   `Calendars.ReadWrite` → سپس **Grant admin consent**.
   دسترسی delegated لازم نیست: کاربران با کد یک‌بارمصرف وارد می‌شوند و هیچ‌وقت
   با حساب مایکروسافت لاگین نمی‌کنند.

> `User.Read.All` را **اضافه نکنید**. تنها کاربردش پر کردن خودکار ایمیل‌هاست،
> ولی `New-ApplicationAccessPolicy` آن را محدود نمی‌کند — یعنی برنامه اجازهٔ
> خواندن کل دایرکتوری را می‌گیرد. برای این تعداد کاربر، فایل CSV کافی است.

### ۲. محدود کردن دسترسی در Exchange

`Calendars.ReadWrite` در سطح application یعنی **همهٔ** صندوق‌های سازمان.
با یک گروه امنیتیِ mail-enabled محدودش کنید:

```powershell
Connect-ExchangeOnline
New-DistributionGroup -Name "GreenPay Calendar Sync" `
  -Type Security -PrimarySmtpAddress "gp-calsync@greenpay360.ir"
Add-DistributionGroupMember -Identity "gp-calsync@greenpay360.ir" -Member "ali@greenpay360.ir"

New-ApplicationAccessPolicy -AppId "<CLIENT_ID>" `
  -PolicyScopeGroupId "gp-calsync@greenpay360.ir" `
  -AccessRight RestrictAccess -Description "GreenPay meetings sync"

# آزمون: باید Granted بدهد برای عضو گروه و Denied برای غیرعضو
Test-ApplicationAccessPolicy -Identity "ali@greenpay360.ir" -AppId "<CLIENT_ID>"
```

اعمال شدن سیاست تا حدود یک ساعت طول می‌کشد.

### ۳. کلیدها در `/etc/greenpay.env`

| متغیر | کاربرد |
|---|---|
| `OUTLOOK_ENABLED` | `0` خاموش (پیش‌فرض) / `1` روشن |
| `OUTLOOK_TENANT_ID` | Directory (tenant) ID |
| `OUTLOOK_CLIENT_ID` | Application (client) ID |
| `OUTLOOK_CLIENT_SECRET` | مقدار secret — نه شناسه‌اش |
| `OUTLOOK_MAIL_DOMAIN` | پیش‌فرض `greenpay360.ir` |
| `OUTLOOK_MAILBOX_ALLOWLIST` | برای اولین اجرای واقعی، فقط یک صندوق آزمایشی |
| `OUTLOOK_PULL_INTERVAL_SECONDS` | فاصلهٔ واکشی هر صندوق (پیش‌فرض `300`) |
| `OUTLOOK_MAX_OCCURRENCES` | سقف رخدادهای یک سری تکرارشونده (پیش‌فرض `100`) |

### ۴. پر کردن ایمیل‌ها — پیش‌نیاز قطعی

امروز `User.email` برای هیچ کاربری پر نیست (هویت در این سامانه شمارهٔ موبایل
است)، ولی Graph صندوق‌ها را فقط با ایمیل می‌شناسد. تا این مرحله انجام نشود،
همگام‌سازی تمیز اجرا می‌شود و **صفر** کار می‌کند.

فایل CSV با ستون‌های نام/شماره و ایمیل بسازید، بعد:

```bash
# اول فقط گزارش — هیچ چیزی نوشته نمی‌شود
ssh root@109.122.252.99 '/opt/greenpay/backend/.venv/bin/python \
  /opt/greenpay/backend/manage.py outlook_users --source csv --file /root/people.csv'

# بعد اعمال
ssh root@109.122.252.99 '/opt/greenpay/backend/.venv/bin/python \
  /opt/greenpay/backend/manage.py outlook_users --source csv --file /root/people.csv --apply'
```

تطبیقِ مبهم هرگز حدس زده نمی‌شود؛ آن‌ها را از پنل ادمین جنگو دستی وصل کنید.
ایمیلِ اشتباه خطا نمی‌دهد — فقط دعوت را بی‌صدا به آدم دیگری می‌فرستد.

### ۵. راه‌اندازی و عیب‌یابی

```bash
# وضعیت اتصال — خروجی‌اش قابل دادن به مدیر tenant است (تفکیک ۴۰۱ از ۴۰۳)
ssh root@109.122.252.99 '/opt/greenpay/backend/.venv/bin/python \
  /opt/greenpay/backend/manage.py outlook_sync --diagnose'

# بگو چه می‌کردی، چیزی ننویس
ssh root@109.122.252.99 '/opt/greenpay/backend/.venv/bin/python \
  /opt/greenpay/backend/manage.py outlook_sync --dry-run'

# فقط یک صندوق، با بازخوانی کامل
ssh root@109.122.252.99 '/opt/greenpay/backend/.venv/bin/python \
  /opt/greenpay/backend/manage.py outlook_sync --mailbox ali@greenpay360.ir --full'

# انتقال عمدیِ جلسه‌های موجود (تنها راه فرستادن جلسه‌های قدیمی)
ssh root@109.122.252.99 '/opt/greenpay/backend/.venv/bin/python \
  /opt/greenpay/backend/manage.py outlook_sync --backfill --since 2026-09-01'

ssh root@109.122.252.99 'systemctl list-timers greenpay-outlook.timer --no-pager'
ssh root@109.122.252.99 'journalctl -u greenpay-outlook -n 40 --no-pager'
```

**۴۰۱ در برابر ۴۰۳:** ۴۰۱ یعنی کلیدها یا مجوزِ برنامه (سراسری است و کل اجرا
متوقف می‌شود)؛ ۴۰۳ یعنی آن صندوقِ خاص زیر `ApplicationAccessPolicy` نیست —
فقط همان صندوق عقب می‌نشیند و بقیه به کارشان ادامه می‌دهند.

**دیتابیس:** این تایمر از یک پروسهٔ جدا هم‌زمان با gunicorn می‌نویسد. روی
PostgreSQL این عادی است و نیازی به تنظیم خاصی ندارد؛ در دوران SQLite همین
هم‌زمانی بزرگ‌ترین ریسک عملیاتی بود.

## اشتراک تقویم

هر کاربر از **تعریف‌ها ← اشتراک تقویم** (یا منوی کاربر) می‌تواند تقویم جلساتش
را با هر کس دیگری به اشتراک بگذارد. گیرنده جلسه‌های او را در فهرست و تقویم
می‌بیند، زیر تب «تقویم‌های اشتراکی».

**نوشتن در صورت‌جلسه پیش‌فرض خاموش است** و فقط صاحب تقویم می‌تواند روشنش کند —
این پیش‌فرض در سطح دیتابیس است، نه در رابط. تنظیمی در سرور لازم ندارد.

---

## وقتی چیزی کار نمی‌کند

ترتیب زیر از بیرون به داخل است. معمولاً در دو گام اول معلوم می‌شود مقصر کیست.

```bash
ssh root@109.122.252.99 'systemctl status greenpay-web greenpay-api nginx --no-pager | head -40'
```

| نشانه | معمولاً یعنی |
|---|---|
| `502 Bad Gateway` روی همهٔ مسیرها | `greenpay-web` بالا نیست |
| `502` فقط روی `/api` و `/admin` | `greenpay-api` بالا نیست |
| `400 Bad Request` از جنگو | میزبان در `ALLOWED_HOSTS` نیست |
| ورود به `/admin/` با «Origin checking failed» | `CSRF_TRUSTED_ORIGINS` تنظیم نشده |
| صفحه می‌آید ولی خالی است و کنسول ۴۰۱ می‌دهد | توکن منقضی شده؛ یک بار خروج و ورود |
| `413 Request Entity Too Large` هنگام پیوست | `client_max_body_size` در nginx |
| `could not connect to server` در لاگ | PostgreSQL بالا نیست یا مشخصات اتصال غلط است |
| `password authentication failed` | `DB_PASSWORD` با رمز واقعی نقش نمی‌خواند |
| `relation ... does not exist` | مایگریشن اجرا نشده — `deploy.sh` را بزنید |

لاگ‌ها:

```bash
journalctl -u greenpay-api -n 80 --no-pager        # خطاهای جنگو
journalctl -u greenpay-web -n 80 --no-pager        # خطاهای Next
journalctl -u greenpay-outlook -n 40 --no-pager    # همگام‌سازی Outlook
journalctl -u greenpay-reminders -n 40 --no-pager  # یادآور پیامکی
tail -n 100 /var/log/nginx/error.log
```

**سرویس بالا نمی‌آید.** `journalctl` را بخوانید. شایع‌ترین علت‌ها: `/etc/greenpay.env`
خراب یا ناخوانا است، `.venv` ناقص است (یک بار `deploy.sh` را دوباره بزنید)، یا بیلد
فرانت نیمه‌کاره مانده و `.next` ناقص است (`rm -rf /opt/greenpay/frontend/.next` و
دوباره دیپلوی).

**پیامک نمی‌رود.** اول `test_sms <شماره> --diagnose` بزنید؛ بدون ارسال می‌گوید سرویس
در کدام مرحله رد می‌کند. شایع‌ترین علت، مجاز نبودن IP سرور در پنل پیشگام رایان است
که با پیام `IpNotValid` برمی‌گردد.

**همگام‌سازی Outlook کار نمی‌کند.** `outlook_sync --diagnose` بزنید. اگر می‌گوید
«خاموش»، یعنی `OUTLOOK_ENABLED` یا کلیدها تنظیم نشده‌اند و این حالت طبیعی است.
اگر توکن گرفته می‌شود ولی صندوق ۴۰۳ می‌دهد، مشکل `ApplicationAccessPolicy` است نه
کد. و اگر هیچ کاربری ایمیل ندارد، دستور تمیز اجرا می‌شود و صفر کار می‌کند — این هم
یک حالت طبیعی است، نه خرابی.

**دیتابیس جواب نمی‌دهد.** اول ببینید خودش بالاست:

```bash
systemctl status postgresql --no-pager | head -5
set -a; . /etc/greenpay.env; set +a
PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U greenpay -d greenpay -tAc 'select 1'
```

اگر `psql` وصل می‌شود ولی جنگو نه، مشکل در `/etc/greenpay.env` است نه در دیتابیس:
یکی از `DB_*`ها غلط یا جا افتاده. اگر هیچ‌کدام وصل نمی‌شوند:

```bash
journalctl -u postgresql -n 40 --no-pager
tail -50 /var/log/postgresql/postgresql-16-main.log
```

**برگشت اضطراری به SQLite.** اگر PostgreSQL از کار افتاد و باید فوراً سامانه را
بالا بیاورید، فایل SQLite دوران قبل هنوز سر جایش است:

```bash
sed -i 's/^DB_NAME=/#DB_NAME=/' /etc/greenpay.env
systemctl restart greenpay-api
```

حواستان باشد این یعنی برگشت به دادهٔ **لحظهٔ کات‌اور**؛ هر جلسه و صورت‌جلسه‌ای که
از آن لحظه به بعد ثبت شده در PostgreSQL می‌ماند و در این حالت دیده نمی‌شود. این
راه فقط برای وقتی است که در دسترس بودن از به‌روز بودن مهم‌تر باشد.

**برگشت به نسخهٔ قبلی.** اگر دیپلوی چیزی را شکست:

```bash
ssh root@109.122.252.99 'cd /opt/greenpay && git log --oneline -5'
ssh root@109.122.252.99 'cd /opt/greenpay && git reset --hard <هش نسخهٔ سالم> && ./deploy.sh'
```

حواستان باشد `deploy.sh` در ابتدای کار `git reset --hard origin/main` می‌زند، پس
برگرداندن واقعی یعنی روی GitHub هم `main` را برگردانید (یا `revert` کنید و push).
همچنین مایگریشنی که اجرا شده با برگشت کد برنمی‌گردد — اگر مایگریشن مخرب بوده، از
نسخهٔ پشتیبان برگردانید.

## TLS

گواهی وایلدکارت Certum روی `*.greenpay360.ir` نشسته و زیردامنهٔ `calendar` را
پوشش می‌دهد. `calendar.greenpay360.ir` در DNS به همین سرور اشاره می‌کند.

```
/etc/ssl/greenpay/fullchain.pem   برگ + دو گواهی میانی (به همین ترتیب)
/etc/ssl/greenpay/privkey.key     کلید خصوصی — دسترسی 600
/etc/ssl/greenpay/chain.pem       فقط میانی‌ها
```

نکته‌ای که موقع نصب وقت گرفت: هیچ‌کدام از سه فایلِ صادرشده با خط تازه تمام
نمی‌شدند و دوتایشان CRLF بودند؛ با `cat` ساده، `-----END-----` به
`-----BEGIN-----` می‌چسبید و زنجیره خراب می‌شد. بلوک‌ها باید جدا استخراج و با
خط تازه به هم وصل شوند.

OCSP stapling عمداً خاموش است: پاسخگوی Certum از این شبکه در دسترس نیست و
nginx هر بار تا تایم‌اوت معطل می‌ماند.

### تمدید

گواهی تا **۱۰ آذر ۱۴۰۵ (۲۰۲۶-۱۲-۰۱)** اعتبار دارد. برای تمدید، فایل‌های تازه را
جایگزین کنید و nginx را ری‌لود:

```bash
scp fullchain.pem privkey.key root@109.122.252.99:/etc/ssl/greenpay/
ssh root@109.122.252.99 'chmod 600 /etc/ssl/greenpay/privkey.key && nginx -t && systemctl reload nginx'
```

بررسی سلامت:

```bash
# گواهی، زنجیره و اعتبارسنجی
echo | openssl s_client -connect calendar.greenpay360.ir:443 \
  -servername calendar.greenpay360.ir 2>/dev/null | \
  openssl x509 -noout -subject -dates

# تطابق کلید و گواهی (دو خروجی باید یکی باشند)
openssl pkey -in privkey.key -pubout | openssl md5
openssl x509 -in fullchain.pem -pubkey -noout | openssl md5
```

میزبان تازه باید در `/etc/greenpay.env` هم اعلام شود، وگرنه Django با
`400 Bad Request` جواب می‌دهد:

```
ALLOWED_HOSTS=calendar.greenpay360.ir,109.122.252.99,localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=https://calendar.greenpay360.ir
SECURE_COOKIES=0     # وقتی همهٔ ترافیک روی https رفت، ۱ کنید
```
