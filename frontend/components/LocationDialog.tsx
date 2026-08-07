'use client';
import React from 'react';
import type { Room } from '@/lib/types';
import Portal from './Portal';
import { IconMapPin, IconX, IconVideo } from './Icons';

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
 * مختصات از پنل ادمین روی همان محل ثبت می‌شود.
 */
export default function LocationDialog({ room, onClose }: { room: Room; onClose: () => void }) {
  const links = routes(room);

  return (
    <Portal>
      <div className="modal-overlay show" onClick={onClose}>
      <div className="modal sm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2><span className="cm-ic ok"><IconMapPin size={17} /></span>{room.name}</h2>
          <button className="close" onClick={onClose} aria-label="بستن"><IconX size={17} /></button>
        </div>

        <div className="modal-body">
          {room.address ? (
            <p className="loc-addr">{room.address}</p>
          ) : (
            <p className="loc-addr empty">نشانی کاملی برای این محل ثبت نشده است.</p>
          )}

          {room.cap && <p className="loc-cap">ظرفیت: {room.cap}</p>}

          {links.length > 0 ? (
            <>
              <div className="loc-sec">مسیریابی با</div>
              <div className="loc-apps">
                {links.map((l) => (
                  <a key={l.label} className="btn btn-ghost" href={l.href}
                    target="_blank" rel="noopener noreferrer">{l.label}</a>
                ))}
              </div>
              <p className="loc-coord num" dir="ltr">{room.lat}, {room.lng}</p>
            </>
          ) : (
            <p className="loc-note">
              <IconVideo size={13} />
              برای فعال‌شدن مسیریابی، مختصات این محل باید در پنل مدیریت ثبت شود.
            </p>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
