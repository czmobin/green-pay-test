# گرین‌پی · مدیریت جلسات سازمانی

مونو‌ریپوی پروژه با فولدرهای جدا برای فرانت‌اند و بک‌اند.

```
green-pay-test/
├── frontend/     اپلیکیشن Next.js 14 + TypeScript (RTL فارسی، موبایل‌فرست)
│   ├── app/            صفحات (داشبورد، تقویم، جلسات، یادآورها، تعریف‌ها)
│   ├── components/     کامپوننت‌ها و store
│   ├── lib/            داده و توابع کمکی (تقویم جلالی)
│   └── legacy-static/  نسخهٔ اولیهٔ تک‌فایل (بایگانی)
└── backend/      بک‌اند Django (مدل‌های دامنه + ERD)
    ├── config/        پروژهٔ Django
    ├── meetings/      اپ دامنه (models.py، admin.py)
    └── ERD.md         نمودار موجودیت‑رابطه
```

## اجرا

### فرانت‌اند
```bash
cd frontend
npm install
npm run build
npm run start -- -p 9000     # یا: npm run dev
```

### بک‌اند
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

## اتصال فرانت به بک
فرانت‌اند دادهٔ خود را از API جنگو می‌گیرد و همهٔ تغییرات (ساخت جلسه، صورت‌جلسه، تعریف‌ها، پاسخ دعوت‌نامه‌ها) را روی سرور ذخیره می‌کند — `frontend/lib/api.ts` و `frontend/components/store.tsx`. فهرست endpointها در [`backend/README.md`](./backend/README.md).

در production هر دو پشت یک دامنه‌اند: nginx مسیر `/api` و `/admin` را به Django و بقیه را به Next.js می‌دهد. جزئیات استقرار در [`DEPLOY.md`](./DEPLOY.md).
