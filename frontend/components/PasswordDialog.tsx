'use client';
import React, { useState } from 'react';
import { useStore } from './store';
import Portal from './Portal';
import PasswordField from './PasswordField';
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
            <PasswordField id="pw-cur" label="رمز عبور فعلی" value={current} onChange={setCurrent}
              autoComplete="current-password" />
          )}
          <PasswordField id="pw-new" label="رمز عبور تازه" value={next} onChange={setNext}
            autoFocus={!hasPassword} hint="دست‌کم ۸ نویسه، و فقط از رقم تشکیل نشده باشد." />
          <PasswordField id="pw-again" label="تکرار رمز عبور" value={again} onChange={setAgain} />

          {err && <p className="rc-err" role="alert">{err}</p>}
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
