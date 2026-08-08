'use client';
import React, { useState } from 'react';
import { useStore } from './store';
import Portal from './Portal';
import type { Room } from '@/lib/types';
import { IconMapPin, IconX, IconVideo, IconEdit, IconCheck } from './Icons';

/** «۳۵.۷۱۵, ۵۱.۴۰۴» یا «35.715 51.404» → مختصات؛ در صورت نامعتبر بودن null */
export function parseCoord(raw: string): { lat: number; lng: number } | null {
  const fa = raw.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const nums = fa.match(/-?\d+(\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const lat = Number(nums[0]), lng = Number(nums[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** لینک مسیریابی هر سرویس از روی مختصات. */
function routes(r: Room): { label: string; href: string }[] {
  const { lat, lng } = r;
  if (lat == null || lng == null) return [];
  const q = `${lat},${lng}`;
  return [
    // نشان: روی موبایل خودِ اپ باز می‌شود، روی دسکتاپ نسخهٔ وب
    { label: 'نشان', href: `https://nshn.ir/?lat=${lat}&lng=${lng}` },
    { label: 'گوگل مپ', href: `https://www.google.com/maps/dir/?api=1&destination=${q}` },
    { label: 'ویز', href: `https://waze.com/ul?ll=${q}&navigate=yes` },
    // geo: را سیستم‌عامل به هر اپ نقشه‌ای که کاربر دارد می‌سپارد
    { label: 'اپ نقشهٔ گوشی', href: `geo:${q}?q=${q}` },
  ];
}

/**
 * نشانی کامل محل جلسه و دکمه‌های مسیریابی.
 * با `editable` (صفحهٔ تعریف‌ها) نشانی و مختصات همین‌جا قابل ویرایش‌اند.
 */
export default function LocationDialog({
  room, onClose, editable = false,
}: { room: Room; onClose: () => void; editable?: boolean }) {
  const store = useStore();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(room.name);
  const [cap, setCap] = useState(room.cap ?? '');
  const [addr, setAddr] = useState(room.address ?? '');
  const [coord, setCoord] = useState(
    room.lat != null && room.lng != null ? `${room.lat}, ${room.lng}` : '');
  const [busy, setBusy] = useState(false);

  const current = store.rooms[room.id] ?? room;
  const links = routes(current);
  const canEdit = editable && store.isManager;

  async function save() {
    if (!name.trim()) { store.toast('نام محل را وارد کنید', 'info'); return; }
    const c = parseCoord(coord);
    if (coord.trim() && !c) { store.toast('مختصات را به شکل «۳۵.۷۱۵, ۵۱.۴۰۴» بنویسید', 'info'); return; }
    setBusy(true);
    const saved = await store.updateRoom(room.id, {
      name: name.trim(), cap: cap.trim(), address: addr.trim(),
      lat: c?.lat ?? null, lng: c?.lng ?? null,
    });
    setBusy(false);
    if (saved) { store.toast('محل جلسه به‌روزرسانی شد', 'ok'); setEdit(false); }
  }

  return (
    <Portal>
      <div className="modal-overlay show" onClick={onClose}>
        <div className="modal sm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2><span className="cm-ic ok"><IconMapPin size={17} /></span>{current.name}</h2>
            {canEdit && !edit && (
              <button className="icon-btn" onClick={() => setEdit(true)} aria-label="ویرایش محل" title="ویرایش">
                <IconEdit size={16} />
              </button>
            )}
            <button className="close" onClick={onClose} aria-label="بستن"><IconX size={17} /></button>
          </div>

          <div className="modal-body">
            {edit ? (
              <>
                <div className="field">
                  <label htmlFor="ld-name">نام محل</label>
                  <input id="ld-name" className="field-in" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="ld-cap">ظرفیت</label>
                  <input id="ld-cap" className="field-in" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="مثلاً: ۸ نفر" />
                </div>
                <div className="field">
                  <label htmlFor="ld-addr">نشانی کامل</label>
                  <textarea id="ld-addr" className="field-in" rows={3} value={addr}
                    onChange={(e) => setAddr(e.target.value)}
                    placeholder="تهران، خیابان ولیعصر، پلاک ۱۲۳، طبقهٔ ۵" />
                </div>
                <div className="field">
                  <label htmlFor="ld-coord">مختصات نقشه</label>
                  <input id="ld-coord" className="field-in num" dir="ltr" value={coord}
                    onChange={(e) => setCoord(e.target.value)} placeholder="35.7150, 51.4043" />
                  <small className="fhint">از نشان یا گوگل‌مپ کپی کنید — با داشتن آن، مسیریابی فعال می‌شود.</small>
                </div>
              </>
            ) : (
              <>
                {current.address
                  ? <p className="loc-addr">{current.address}</p>
                  : <p className="loc-addr empty">نشانی کاملی برای این محل ثبت نشده است.</p>}

                {current.cap && <p className="loc-cap">ظرفیت: {current.cap}</p>}

                {links.length > 0 ? (
                  <>
                    <div className="loc-sec">مسیریابی با</div>
                    <div className="loc-apps">
                      {links.map((l) => (
                        <a key={l.label} className="btn btn-ghost" href={l.href}
                          target="_blank" rel="noopener noreferrer">{l.label}</a>
                      ))}
                    </div>
                    <p className="loc-coord num" dir="ltr">{current.lat}, {current.lng}</p>
                  </>
                ) : (
                  <p className="loc-note">
                    <IconVideo size={13} />
                    {canEdit
                      ? 'برای فعال‌شدن مسیریابی، مختصات را از دکمهٔ ویرایش وارد کنید.'
                      : 'برای فعال‌شدن مسیریابی، مختصات این محل باید در پنل مدیریت ثبت شود.'}
                  </p>
                )}
              </>
            )}
          </div>

          {edit && (
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setEdit(false)} disabled={busy}>انصراف</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                <IconCheck size={16} />{busy ? 'در حال ذخیره…' : 'ذخیره'}
              </button>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
