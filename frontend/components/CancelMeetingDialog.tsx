'use client';
import React, { useState } from 'react';
import { useStore } from './store';
import Portal from './Portal';
import { useSheet } from './useSheet';
import { toFa } from '@/lib/data';
import type { Meeting } from '@/lib/types';
import { IconAlert, IconX } from './Icons';

/**
 * لغو جلسه — فقط سازنده، مدیرعامل و ادمین.
 *
 * دلیل لغو در سامانه می‌ماند ولی داخل پیامک نمی‌رود؛ پیامک فقط خبر لغو را
 * می‌دهد تا کوتاه بماند و جزئیات در خود اپ خوانده شود.
 */
export default function CancelMeetingDialog({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const store = useStore();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { setBox, dismiss } = useSheet(true, onClose);

  const receivers = meeting.parts.filter((id) => id !== store.currentUser).length;

  async function submit() {
    setBusy(true);
    const res = await store.cancelMeeting(meeting.id, reason.trim());
    setBusy(false);
    if (res) {
      store.toast(
        res.smsSent > 0
          ? `جلسه لغو شد — پیامک برای ${toFa(res.smsSent)} نفر رفت`
          : 'جلسه لغو شد', 'ok');
      onClose();
    }
  }

  return (
    <Portal>
      <div className="modal-overlay show" onClick={dismiss}>
      <div className="modal sm" ref={setBox} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2><span className="cm-ic"><IconAlert size={17} /></span>لغو جلسه</h2>
          <button className="close" onClick={dismiss} aria-label="بستن"><IconX size={17} /></button>
        </div>

        <div className="modal-body">
          <p className="cm-lead">
            «{meeting.title}» لغو می‌شود و به همهٔ شرکت‌کنندگان پیامک خبر لغو می‌رود
            {receivers > 0 && <> (<b className="num">{toFa(receivers)}</b> نفر غیر از شما)</>}.
            این کار برگشت‌پذیر نیست.
          </p>

          <div className="field">
            <label htmlFor="cm-reason">دلیل لغو <span className="opt">(اختیاری)</span></label>
            <textarea id="cm-reason" className="field-in" rows={3} value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثلاً: سفر مدیرعامل — به هفتهٔ آینده موکول شد" />
            <small className="cm-hint">دلیل در صفحهٔ جلسه ثبت می‌شود؛ داخل پیامک نمی‌رود.</small>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={dismiss} disabled={busy}>انصراف</button>
          <button className="btn btn-danger" onClick={submit} disabled={busy}>
            {busy ? 'در حال لغو…' : 'لغو جلسه'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
