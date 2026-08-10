'use client';
import { createPortal } from 'react-dom';

/**
 * محتوا را روی body رندر می‌کند.
 *
 * لازم است چون نوار بالا و نوار پایین flex-item با z-index هستند و هرکدام یک
 * stacking context می‌سازند؛ مودالی که داخل آن‌ها رندر شود هرچقدر هم z-index
 * بگیرد از آن زمینه بیرون نمی‌زند و زیر نوار پایین می‌افتد.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  // در SSR سند وجود ندارد؛ روی مرورگر بی‌درنگ رندر می‌شود تا انیمیشن ورود
  // یک فریم عقب نیفتد.
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
