# بک‌اند گرین‌پی (Django)

بک‌اند مدیریت جلسات سازمانی گرین‌پی — مدل‌های دامنه در `meetings/models.py`.
نمودار ERD در [`ERD.md`](./ERD.md).

## پیش‌نیاز
- Python 3.10+

## راه‌اندازی
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # ویندوز: .venv\Scripts\activate
pip install -r requirements.txt

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000
```
پنل ادمین: `http://localhost:8000/admin/`

## مدل‌ها (اپ `meetings`)
Organization · User (فرد/کاربر) · Location · Category · Meeting · MeetingParticipant ·
AgendaItem · Minutes (صورت‌جلسه) · MinuteEntry · Attachment · Notification · GoogleCalendarConnection

- کاربر سفارشی: `AUTH_USER_MODEL = meetings.User` با `role` (admin/ceo/member).
- دیتابیس پیش‌فرض SQLite است؛ برای production نمونهٔ PostgreSQL در `config/settings.py` کامنت شده.
- فایل‌های پیوست در `MEDIA_ROOT` (`backend/media/`) ذخیره می‌شوند.

## ورود با کد یک‌بارمصرف

ورود با شمارهٔ موبایل است و کد از طریق **کاوه‌نگار** (سرویس Lookup، قالب `contractOtpLogin`)
پیامک می‌شود. کلید API فقط از متغیر محیطی خوانده می‌شود — به `.env.example` نگاه کنید و
**هرگز مقدار واقعی را در مخزن کامیت نکنید**.

اگر `KAVENEGAR_API_KEY` خالی باشد پیامکی ارسال نمی‌شود و کد در پاسخ API برمی‌گردد
تا توسعهٔ محلی ممکن باشد. نخستین ورود با شماره‌ای که ثبت نشده، به حساب مدیرعامل دمو
وصل می‌شود؛ ورودهای بعدی کاربر عادی می‌سازند.

## دادهٔ نمونه
```bash
python manage.py seed_demo          # فقط اگر دیتابیس خالی باشد
python manage.py seed_demo --reset  # پاک کردن و ساخت دوباره (کاربران ادمین حفظ می‌شوند)
```

## API

همهٔ endpointها به‌جز `auth/*` نیازمند هدر `Authorization: Token <کلید>` هستند.

| متد | مسیر | کار |
|---|---|---|
| POST | `/api/auth/request-otp/` | ارسال کد یک‌بارمصرف به شمارهٔ موبایل (کاوه‌نگار) |
| POST | `/api/auth/verify-otp/` | بررسی کد و دریافت توکن ورود |
| GET | `/api/auth/me/` · POST `/api/auth/logout/` | کاربر جاری / خروج |
| GET | `/api/bootstrap/` | همهٔ دادهٔ اپ در یک درخواست (سازمان‌ها، دسته‌ها، محل‌ها، افراد، مهمانان، جلسات، صورت‌جلسه‌ها) |
| POST | `/api/meetings/` | ساخت جلسه |
| POST | `/api/meetings/check-conflicts/` | بررسی تداخل زمانی شرکت‌کنندگان (فقط هشدار) |
| POST | `/api/meetings/<id>/respond/` | پاسخ به دعوت‌نامه `{accept: bool}` |
| POST | `/api/meetings/<id>/sync/` | همگام‌سازی با Google Calendar |
| POST | `/api/entries/` | افزودن آیتم صورت‌جلسه (یادداشت/تصمیم/تسک/یادآور/تماس/نامه/فایل) |
| DELETE | `/api/entries/<id>/` | حذف آیتم |
| POST | `/api/entries/<id>/toggle/` | تیک انجام‌شدن تسک |
| POST | `/api/organizations/` · `/api/people/` · `/api/locations/` | تعریف‌ها |
| POST | `/api/settings/gcal/` · `/api/settings/sms/` | اتصال گوگل‌کلندر / ارسال پیامک |

**نگاشت زمان:** جلسات در دیتابیس `datetime` واقعی دارند؛ API علاوه بر آن `day`
(اندیس روز نسبت به شنبهٔ هفتهٔ دمو) و `start`/`end` (ساعت اعشاری) را هم می‌دهد،
چون تقویم شمسی فرانت با همین قالب کار می‌کند. تبدیل در `serializers.py` است.

در production فرانت و بک هم‌دامنه‌اند و nginx مسیر `/api` را به Django می‌دهد،
پس CORS لازم نیست. برای توسعهٔ محلی روی پورت‌های جدا:
```bash
# ترمینال ۱
python manage.py runserver 8000
# ترمینال ۲
cd ../frontend && NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api npm run dev
```
