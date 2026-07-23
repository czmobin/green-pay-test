'use client';
import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/**
 * ورود نرم عناصر صفحه: هر سلکتور یک گروه است که با هم stagger می‌شوند.
 * فقط در mount اجرا می‌شود (نه در فیلتر/جستجو) و به prefers-reduced-motion احترام می‌گذارد.
 */
export function useReveal(selectors: string[]) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({
          defaults: { ease: 'power3.out', duration: 0.55 },
        });
        selectors.forEach((sel, i) => {
          const els = gsap.utils.toArray<HTMLElement>(sel);
          if (!els.length) return;
          tl.from(els, {
            autoAlpha: 0,
            y: 22,
            // سقف مجموع stagger هر گروه ~۰.۴ ثانیه تا لیست‌های بلند دیر کامل نشوند
            stagger: Math.min(0.06, 0.4 / els.length),
            clearProps: 'transform,opacity,visibility',
          }, i === 0 ? 0 : '-=0.38');
        });
      });
    },
    { scope },
  );

  return scope;
}

/** شمارش بالا‌روندهٔ اعداد فارسی: هر [data-count] از صفر تا مقدارش می‌شمارد. */
export function useCountUp(scope: React.RefObject<HTMLElement>) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
          const target = Number(el.dataset.count ?? 0);
          const proxy = { v: 0 };
          gsap.to(proxy, {
            v: target,
            duration: 1.1,
            ease: 'power2.out',
            snap: { v: 1 },
            onUpdate() {
              el.textContent = String(proxy.v).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
            },
          });
        });
      });
    },
    { scope },
  );
}
