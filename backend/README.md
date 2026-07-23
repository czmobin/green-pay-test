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

## گام بعد (API)
`djangorestframework` و `django-cors-headers` در `requirements.txt` هستند؛ برای ساخت API:
سریالایزرها + ویوست‌ها را در `meetings/` اضافه کنید و در `config/urls.py` تحت `api/` ثبت کنید،
سپس CORS را برای دامنهٔ فرانت‌اند (Next.js) باز کنید.
