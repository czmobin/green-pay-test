import type { Metadata, Viewport } from 'next';
import { Vazirmatn } from 'next/font/google';
import './globals.css';
import Providers from '@/components/store';
import AppShell from '@/components/AppShell';

const vazir = Vazirmatn({
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-vazir',
});

export const metadata: Metadata = {
  title: 'گرین‌پی · اتاق جلسات',
  description: 'پنل مدیریت جلسات سازمانی گرین‌پی — تقویم، صورت‌جلسه و اتصال Google Calendar',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2563EB',
};

// پیش‌فرض اپ حالت روشن است؛ فقط اگر کاربر تیره را انتخاب کرده باشد تیره می‌شود.
const themeScript = `(function(){try{var t=localStorage.getItem('gp-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazir.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
