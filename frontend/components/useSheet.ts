'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * حرکت مشترک همهٔ پنجره‌های شناور — همان چیزی که شیت فیلتر داشت.
 *
 * ورود: پرده محو می‌شود، خودِ پنجره از پایین بالا می‌آید و بخش‌هایش پشت سر هم
 * جا می‌افتند؛ حرکت باید بگوید این پنجره از کجا آمده (spatial continuity).
 * خروج کوتاه‌تر از ورود است تا بستن سریع حس شود (exit-faster-than-enter).
 *
 * کاربرد: `ref={setBox}` روی گرهٔ `.modal` و صدا زدن `dismiss()` به‌جای
 * `onClose` در دکمهٔ بستن، انصراف و کلیک روی پرده.
 */
export function useSheet(open: boolean, onClose: () => void) {
  const [box, setBox] = useState<HTMLElement | null>(null);
  const closing = useRef(false);

  /**
   * گرهٔ پنجره با callback-ref گرفته می‌شود، نه با ref معمولی: Portal یک تیک
   * دیرتر رندر می‌کند و با تکیه بر `open`، انیمیشن وقتی اجرا می‌شد که پنجره
   * هنوز در DOM نبود.
   */
  useGSAP(() => {
    if (!open || !box) return;
    closing.current = false;
    const scrim = box.parentElement;
    // بخش‌های داخلی: هر فرزند مستقیم بدنه، به‌علاوهٔ پابرگ
    const parts = box.querySelectorAll(':scope > .modal-body > *, :scope > .modal-foot');

    if (reducedMotion()) {
      gsap.set([scrim, box, ...Array.from(parts)], { clearProps: 'all' });
      return;
    }

    const tl = gsap.timeline();
    tl.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: .2, ease: 'power1.out' })
      .fromTo(box, { yPercent: 100 },
        { yPercent: 0, duration: .38, ease: 'back.out(1.05)', clearProps: 'transform' }, '<')
      .fromTo(parts, { y: 14, autoAlpha: 0 },
        {
          y: 0, autoAlpha: 1, duration: .26, ease: 'power2.out',
          // مجموع پلکان محدود می‌شود؛ فرم‌های بلند وگرنه دیر کامل می‌شوند
          stagger: { amount: Math.min(.3, parts.length * .05) },
          clearProps: 'transform,opacity,visibility',
        }, '-=.2');
    return () => { tl.kill(); };
  }, { dependencies: [open, box] });

  const dismiss = useCallback(() => {
    if (!box || closing.current || reducedMotion()) { onClose(); return; }
    closing.current = true;
    gsap.to(box.parentElement, { opacity: 0, duration: .22, ease: 'power1.in' });
    gsap.to(box, {
      yPercent: 100, duration: .24, ease: 'power2.in',
      // پاک‌سازی لازم نیست: ورودِ بعدی خودش مقدارها را از نو ست می‌کند و
      // clearProps اینجا یک فریم پنجره را دوباره نمایان می‌کرد.
      onComplete: () => { closing.current = false; onClose(); },
    });
  }, [box, onClose]);

  // بستن با Escape — رفتار یکسان در همهٔ پنجره‌ها
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, dismiss]);

  return { setBox, dismiss };
}
