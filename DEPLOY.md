# استقرار روی سرور

سرور فعلی: **`109.122.252.99`** — Ubuntu 24.04 · Node 20 · Python 3.12 · nginx

| آدرس | توضیح |
|---|---|
| `https://calendar.greenpay360.ir/` | اپلیکیشن (Next.js) — نشانی اصلی |
| `https://calendar.greenpay360.ir/admin/` | پنل ادمین Django |
| `http://109.122.252.99/` | همان اپ روی آی‌پی، بدون TLS (گواهی برای آی‌پی صادر نشده) |

## دیپلوی نسخهٔ جدید

بعد از `git push` روی شاخهٔ `main`، فقط این یک دستور:

```bash
ssh root@109.122.252.99 '/opt/greenpay/deploy.sh'
```

اسکریپت به‌ترتیب: آخرین کد را می‌گیرد → فرانت را بیلد می‌کند → وابستگی/مایگریشن/استاتیک بک‌اند را به‌روز می‌کند → سرویس‌ها را ری‌استارت می‌کند.

## چیدمان روی سرور

```
/opt/greenpay/                 کد (clone از GitHub، شاخهٔ main)
/etc/greenpay.env              SECRET_KEY، DEBUG=0، ALLOWED_HOSTS، کلیدهای پیامک (دسترسی 600)
/etc/systemd/system/greenpay-web.service    Next.js روی 127.0.0.1:3000
/etc/systemd/system/greenpay-api.service    gunicorn روی 127.0.0.1:8001
/etc/nginx/sites-available/greenpay         پروکسی معکوس، پورت ۸۰ و ۴۴۳
/etc/nginx/snippets/greenpay-app.conf       مسیرهای مشترک http و https
/etc/ssl/greenpay/                          گواهی و کلید TLS (پوشه 700، کلید 600)
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

## نکات امنیتی (پیشنهاد)

- ورود با کلید SSH فعال است؛ برای سخت‌ترشدن می‌توان `PasswordAuthentication no` را در `/etc/ssh/sshd_config` گذاشت.
- پسورد ادمین Django را بعد از اولین ورود از `/admin/password_change/` عوض کنید.
- کلید خصوصی TLS هیچ‌وقت نباید وارد مخزن شود؛ `*.key` و `*.pem` در `.gitignore` هستند.

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

**دیتابیس:** با آمدن این تایمر، یک پروسهٔ جدا هر دقیقه در SQLite می‌نویسد در
حالی که gunicorn می‌خواند. WAL و مهلت ۲۰ ثانیه‌ای روشن‌اند، ولی راه‌حل واقعی
PostgreSQL است — بلوک آماده‌اش در `config/settings.py` کامنت‌شده است.

## اشتراک تقویم

هر کاربر از **تعریف‌ها ← اشتراک تقویم** (یا منوی کاربر) می‌تواند تقویم جلساتش
را با هر کس دیگری به اشتراک بگذارد. گیرنده جلسه‌های او را در فهرست و تقویم
می‌بیند، زیر تب «تقویم‌های اشتراکی».

**نوشتن در صورت‌جلسه پیش‌فرض خاموش است** و فقط صاحب تقویم می‌تواند روشنش کند —
این پیش‌فرض در سطح دیتابیس است، نه در رابط. تنظیمی در سرور لازم ندارد.

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
