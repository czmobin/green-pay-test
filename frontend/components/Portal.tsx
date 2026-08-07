'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * محتوا را روی body رندر می‌کند.
 *
 * لازم است چون نوار بالا و نوار پایین flex-item با z-index هستند و هرکدام یک
 * stacking context می‌سازند؛ مودالی که داخل آن‌ها رندر شود هرچقدر هم z-index
 * بگیرد از آن زمینه بیرون نمی‌زند و زیر نوار پایین می‌افتد.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  if (!ready || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
