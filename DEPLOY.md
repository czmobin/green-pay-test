# استقرار روی سرور

سرور فعلی: **`109.122.252.99`** — Ubuntu 24.04 · Node 20 · Python 3.12 · nginx

| آدرس | توضیح |
|---|---|
| `http://109.122.252.99/` | اپلیکیشن (Next.js) |
| `http://109.122.252.99/admin/` | پنل ادمین Django |

## دیپلوی نسخهٔ جدید

بعد از `git push` روی شاخهٔ `main`، فقط این یک دستور:

```bash
ssh root@109.122.252.99 '/opt/greenpay/deploy.sh'
```

اسکریپت به‌ترتیب: آخرین کد را می‌گیرد → فرانت را بیلد می‌کند → وابستگی/مایگریشن/استاتیک بک‌اند را به‌روز می‌کند → سرویس‌ها را ری‌استارت می‌کند.

## چیدمان روی سرور

```
/opt/greenpay/                 کد (clone از GitHub، شاخهٔ main)
/etc/greenpay.env              SECRET_KEY، DEBUG=0، ALLOWED_HOSTS (دسترسی 600)
/etc/systemd/system/greenpay-web.service    Next.js روی 127.0.0.1:3000
/etc/systemd/system/greenpay-api.service    gunicorn روی 127.0.0.1:8001
/etc/nginx/sites-available/greenpay         پروکسی معکوس روی پورت ۸۰
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
- برای دامنه و HTTPS: `apt install certbot python3-certbot-nginx && certbot --nginx -d your-domain.ir`
