'use client';
import React, { useState } from 'react';
import { useStore } from './store';
import Portal from './Portal';
import { api } from '@/lib/api';
import { IconX, IconCheck } from './Icons';

/**
 * تعیین یا تغییر رمز عبور حساب.
 * کسی که تا امروز فقط با کد یک‌بارمصرف وارد شده رمزی ندارد، پس رمز فعلی از او پرسیده نمی‌شود.
 */
export default function PasswordDialog({
  hasPassword, onDone, onClose,
}: { hasPassword: boolean; onDone: () => void; onClose: () => void }) {
  const store = useStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) { setErr('رمز عبور باید دست‌کم ۸ نویسه باشد.'); return; }
    if (next !== again) { setErr('دو رمز واردشده یکسان نیستند.'); return; }
    setBusy(true); setErr('');
    try {
      await api.setPassword({ newPassword: next, ...(hasPassword ? { currentPassword: current } : {}) });
      store.toast(hasPassword ? 'رمز عبور تغییر کرد' : 'رمز عبور تعیین شد', 'ok');
      onDone();
    } catch (e2) {
      setErr((e2 as Error).message || 'ذخیره نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <div className="modal-overlay show" onClick={onClose}>
      <form className="modal sm" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h2>{hasPassword ? 'تغییر رمز عبور' : 'تعیین رمز عبور'}</h2>
          <button type="button" className="close" onClick={onClose} aria-label="بستن"><IconX size={17} /></button>
        </div>

        <div className="modal-body">
          <p className="cm-lead">
            {hasPassword
              ? 'با رمز عبور می‌توانید بدون منتظرماندن برای پیامک وارد شوید.'
              : 'با تعیین رمز، دیگر لازم نیست هر بار منتظر کد پیامکی بمانید — کد یک‌بارمصرف هم همچنان کار می‌کند.'}
          </p>

          {hasPassword && (
            <div className="field">
              <label htmlFor="pw-cur">رمز عبور فعلی</label>
              <input id="pw-cur" className="field-in" type="password" dir="ltr"
                autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="pw-new">رمز عبور تازه</label>
            <input id="pw-new" className="field-in" type="password" dir="ltr" autoFocus={!hasPassword}
              autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            <small className="fhint">دست‌کم ۸ نویسه، و فقط از رقم تشکیل نشده باشد.</small>
          </div>
          <div className="field">
            <label htmlFor="pw-again">تکرار رمز عبور</label>
            <input id="pw-again" className="field-in" type="password" dir="ltr"
              autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          </div>

          {err && <p className="rc-err">{err}</p>}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>انصراف</button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            <IconCheck size={16} />{busy ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
        </div>
      </form>
    </div>
    </Portal>
  );
}
