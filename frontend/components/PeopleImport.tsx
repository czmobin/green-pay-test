'use client';
import React, { useRef, useState } from 'react';
import { useStore } from './store';
import { toFa } from '@/lib/data';
import { IconFile, IconCheck, IconAlert } from './Icons';

/**
 * درون‌ریزی گروهی افراد از اکسل یا CSV — فقط برای ادمین.
 * سرصفحهٔ فایل ملاک است، نه ترتیب ستون‌ها، چون فایل منابع انسانی هر بار
 * شکل متفاوتی دارد.
 */
export default function PeopleImport() {
  const store = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; messages: string[] } | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';           // تا انتخاب دوبارهٔ همان فایل هم کار کند
    if (!file) return;
    setBusy(true); setResult(null);
    const res = await store.importPeople(file);
    setBusy(false);
    if (res) {
      setResult(res);
      store.toast(res.created > 0
        ? `${toFa(res.created)} نفر اضافه شد`
        : 'کسی اضافه نشد — پیام‌های زیر را ببینید', res.created > 0 ? 'ok' : 'info');
    }
  }

  return (
    <div className="card def-form pimport">
      <div className="card-head"><h3><IconFile size={17} /> درون‌ریزی از اکسل</h3></div>

      <p className="pi-hint">
        فایل <b>xlsx</b> یا <b>csv</b> با سرصفحه‌های «نام»، «سمت»، «شماره موبایل» و «سازمان».
        ترتیب ستون‌ها مهم نیست و فقط ستون نام اجباری است. سطرهای تکراری رد می‌شوند.
      </p>

      <input ref={input} type="file" accept=".xlsx,.xlsm,.csv,text/csv" hidden onChange={pick} />
      <button className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>
        <IconFile size={16} />{busy ? 'در حال خواندن فایل…' : 'انتخاب فایل'}
      </button>

      {result && (
        <div className={'pi-result' + (result.created > 0 ? ' ok' : '')}>
          <div className="pi-sum">
            {result.created > 0 && <span className="pi-ok"><IconCheck size={13} />{toFa(result.created)} نفر اضافه شد</span>}
            {result.skipped > 0 && <span className="pi-skip"><IconAlert size={13} />{toFa(result.skipped)} سطر رد شد</span>}
          </div>
          {result.messages.length > 0 && (
            <ul className="pi-msgs">
              {result.messages.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
