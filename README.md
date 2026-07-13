# گرین‌پی · اتاق جلسات — Green Pay Meetings

پنل مدیریت جلسات سازمانی گرین‌پی، ساخته‌شده با **Next.js 14 (App Router) + TypeScript + React**.
کاملاً **RTL فارسی**، **موبایل‌فرست** و با هویت بصری سفید-سبز نزدیک به [greenpay360.ir](https://greenpay360.ir/).

## امکانات
- **داشبورد خلوت**: جلسهٔ بعدی + آمار کلیدی + برنامهٔ امروز (جزئیات با یک کلیک داخل جلسه)
- **تقویم هفتگی**: در موبایل به‌صورت اجندای روزانه، در دسکتاپ گرید ساعتی
- **همهٔ جلسات**: فهرست فیلترشونده بر اساس نوع
- **صفحهٔ جلسه + صورت‌جلسه**: حین جلسه، آیتم ثبت کنید با تایپ‌های
  **یادداشت / تصمیم / تسک** (مسئول و مهلت) **/ یادآور** (زمان) **/ تماس تلفنی** (شخص و شماره).
  صورت‌جلسه در مرورگر ذخیره می‌شود (localStorage).
- **فرم ساخت جلسه** (مودال): عنوان، نوع، روز/ساعت/مدت/اتاق، شرکت‌کنندگان
- **مهمانان خارجی**: مسیر هر مهمان بین جلسات
- اتصال نمایشی **Google Calendar**، تم روشن/تیره

## پیش‌نیاز
- [Node.js](https://nodejs.org/) نسخهٔ ۱۸.۱۸ به بالا
- دسترسی به اینترنت **هنگام build** (فونت Vazirmatn یک‌بار از Google Fonts گرفته و در خود پروژه میزبانی می‌شود)

---

## اجرا روی سرور ویندوز (روی یک پورت دلخواه)

```powershell
git clone git@github.com:czmobin/green-pay-test.git
cd green-pay-test

npm install       # نصب وابستگی‌ها
npm run build     # ساخت نسخهٔ production
npm run start -- -p 9000    # اجرا روی پورت 9000
```

سپس باز کنید: `http://<IP-سرور>:9000/`

### اجرای دائمی به‌صورت سرویس (اختیاری، با PM2)
```powershell
npm install -g pm2 pm2-windows-startup
pm2 start "npm run start -- -p 9000" --name greenpay
pm2 save
pm2-startup install
```

### باز کردن پورت در فایروال ویندوز
```powershell
New-NetFirewallRule -DisplayName "GreenPay 9000" -Direction Inbound -LocalPort 9000 -Protocol TCP -Action Allow
```
> اگر سرور ابری (مثل Hetzner) است، پورت را در **فایروال/Security Group پنل سرویس‌دهنده** هم باز کنید.

### حالت توسعه
```powershell
npm run dev       # http://localhost:3000
```

---

## ساختار پروژه
```
app/                     صفحات (App Router)
  page.tsx               داشبورد
  calendar/page.tsx      تقویم هفتگی
  meetings/page.tsx      فهرست جلسات
  meetings/[id]/page.tsx صفحهٔ جلسه + صورت‌جلسه
  guests/page.tsx        مهمانان خارجی
  layout.tsx             لایهٔ ریشه (RTL، فونت، تم)
  globals.css            توکن‌های طراحی و استایل‌ها
components/               AppShell, Sidebar/Topbar/BottomNav, مودال ساخت، MinutesEditor، Icons، store
lib/                      data.ts (دادهٔ نمونه) و types.ts
legacy-static/           نسخهٔ اولیهٔ تک‌فایل (بایگانی)
```

## نکته
تایپوگرافی فارسی با فونت **Vazirmatn** است که هنگام build دانلود و در پروژه میزبانی می‌شود؛ پس در زمان اجرا هیچ وابستگی به CDN وجود ندارد.
