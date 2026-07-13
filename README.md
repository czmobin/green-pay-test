# گرین‌پی · اتاق جلسات — Green Pay Meetings

دموی فرانت‌اند برای یک **وب‌اپلیکیشن مدیریت جلسات سازمانی** با هویت بصری نزدیک به [greenpay360.ir](https://greenpay360.ir/).
تک‌فایل، کاملاً **RTL فارسی**، بدون هیچ وابستگی خارجی (HTML/CSS/JS خالص) و آمادهٔ اجرا روی هر سروری.

## امکانات
- **داشبورد**: کارت‌های آماری، برنامهٔ امروز، وضعیت زندهٔ اتاق‌ها، مهمانان روز
- **تقویم هفتگی**: بلوک‌های جلسه رنگ‌بندی‌شده بر اساس نوع، خط «الان»
- **همهٔ جلسات**: جدول با فیلتر، وضعیت، و ستون همگام‌سازی Google Calendar
- **مهمانان خارجی**: مسیر هر مهمان بین جلسات روز
- اتصال نمایشی به **Google Calendar**، پنل جزئیات جلسه، تم روشن/تیره، ریسپانسیو

---

## اجرا روی سرور ویندوز (روی یک پورت دلخواه)

### روش ۱ — با Node.js (پیشنهادی، بدون نصب هیچ پکیج)
پیش‌نیاز: نصب [Node.js](https://nodejs.org/) (نسخهٔ ۱۴ به بالا).

```powershell
# PowerShell — اجرا روی پورت 8080 (پیش‌فرض)
node server.js

# اجرا روی یک پورت خاص، مثلاً 9000
node server.js 9000

# یا با متغیر محیطی
$env:PORT=9000; node server.js
```

```cmd
:: Command Prompt (CMD)
node server.js 9000
```

سپس در مرورگر: `http://localhost:9000/` یا `http://<IP-سرور>:9000/`

> `server.js` یک سرور استاتیک سبک با ماژول‌های داخلی Node است — نیازی به `npm install` نیست.

### باز کردن پورت در فایروال ویندوز
اگر می‌خواهید از دستگاه‌های دیگر شبکه هم در دسترس باشد (PowerShell با دسترسی Administrator):

```powershell
New-NetFirewallRule -DisplayName "GreenPay Meetings 9000" -Direction Inbound -LocalPort 9000 -Protocol TCP -Action Allow
```

### اجرای دائمی به‌صورت سرویس (اختیاری)
با [PM2](https://pm2.keymetrics.io/) تا بعد از ری‌استارت هم بالا بماند:

```powershell
npm install -g pm2 pm2-windows-startup
pm2 start server.js --name greenpay -- 9000
pm2 save
pm2-startup install
```

### روش ۲ — بدون Node، فقط با IIS
کافی است فایل `index.html` را در پوشهٔ سایت IIS (مثلاً `C:\inetpub\wwwroot\greenpay\`) کپی کنید و در IIS Manager یک Site جدید با پورت دلخواه به آن پوشه بسازید. این پروژه کاملاً استاتیک است.

### روش ۳ — بدون Node، با Python (اگر نصب بود)
```powershell
python -m http.server 9000
```

---

## ساختار فایل‌ها
| فایل | توضیح |
|------|-------|
| `index.html` | کل اپلیکیشن (تک‌فایل، standalone) |
| `server.js`  | سرور استاتیک سبک Node.js (بدون وابستگی) |
| `package.json` | اسکریپت `npm start` |

## نکته
تایپوگرافی فارسی از استک فونت سیستمی استفاده می‌کند (Vazirmatn / IRANSans / Tahoma). برای بهترین نتیجه، نصب فونت **[Vazirmatn](https://github.com/rastikerdar/vazirmatn)** روی سرور/دستگاه ارائه توصیه می‌شود.
