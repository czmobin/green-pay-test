'use client';
import { useEffect } from 'react';

/**
 * کشیدن به پایین برای تازه‌سازی — دست‌ساز، چون راهِ مرورگر بسته است.
 *
 * چرا pull-to-refresh خودِ مرورگر کار نمی‌کند
 * ===========================================
 *
 * این اپ پوستهٔ قدبسته دارد: `body{overflow:hidden}` و `.shell{height:100dvh}`
 * و `.main{overflow:hidden}`، و تنها ناحیهٔ اسکرول‌شونده `.content` است. یعنی
 * **سند هیچ‌وقت اسکرول ندارد**، و pull-to-refreshِ مرورگر یک رفتارِ سطحِ
 * viewport است که فقط روی اسکرولرِ سند فعال می‌شود. `overscroll-behavior:contain`
 * روی `.content` هم جداگانه جلوی زنجیرشدنِ حرکت به بالادست را می‌گیرد.
 *
 * آن `overflow:hidden` اتفاقی نیست — همان است که نوار بالا و نوار پایینِ موبایل
 * را ثابت نگه می‌دارد. پس راهِ درست بازکردنش نیست، پیاده‌کردنِ خودِ حرکت است.
 * `overscroll-behavior:contain` این‌جا **به نفع ما** است: جلوی کشسانیِ iOS را
 * می‌گیرد تا با حرکتِ ما نجنگد.
 *
 * چرا هیچ state ریاکتی در کار نیست
 * =================================
 *
 * نشان با دست‌کاریِ مستقیمِ `style` حرکت می‌کند. اگر مقدارِ کشش state بود، هر
 * فریمِ انگشت یک رندرِ `AppShell` می‌ساخت و با آن کلِ صفحهٔ زیرش — برای حرکتی
 * که باید به انگشت بچسبد، بدترین کارِ ممکن.
 */

/** ضریب مقاومت: انگشت دو برابرِ حرکتِ نشان راه می‌رود. */
const RESIST = 0.5;
/** سقفِ کشش؛ بیشتر از این، کشیدن حس «تا ته رسید» می‌دهد. */
const MAX = 96;
/** از این‌جا به بعد رهاکردن، تازه‌سازی می‌کند. */
const THRESHOLD = 60;
/** تا این اندازه نشان پایین می‌آید؛ بقیهٔ کشش فقط حس مقاومت است. */
const REVEAL = 64;
/** پیش از این مقدار جابه‌جایی، جهتِ حرکت قطعی نیست. */
const SLOP = 6;

export function usePullToRefresh(
  scroller: React.RefObject<HTMLElement>,
  indicator: React.RefObject<HTMLElement>,
  onRefresh: () => Promise<void> | void,
  /**
   * آیا ناحیهٔ اسکرول همین حالا در DOM هست؟
   *
   * بی این، هیچ‌وقت شنونده‌ای بسته نمی‌شود: `AppShell` تا نشست بررسی نشود
   * به‌جای پوسته یک اسپینر برمی‌گرداند، پس در نخستین رندر `scroller.current`
   * تهی است — و چون ref شیءِ پایداری است، این effect هرگز دوباره اجرا
   * نمی‌شد که گرهِ تازه‌آمده را ببیند.
   */
  enabled: boolean,
) {
  useEffect(() => {
    const el = scroller.current;
    if (!enabled || !el) return;
    // مرورگرِ بی‌لمس (دسکتاپ) این حرکت را ندارد؛ شنونده هم لازم نیست.
    if (!('ontouchstart' in window)) return;

    let startY = 0;
    let startX = 0;
    /** انگشت از بالای فهرست شروع شده؟ */
    let armed = false;
    /** جهت قطعی شده و این یک کشیدنِ عمودی است؟ */
    let engaged = false;
    let pull = 0;
    let busy = false;

    const paint = (px: number, snap: boolean) => {
      const box = indicator.current;
      if (!box) return;
      box.classList.toggle('is-snap', snap);
      box.classList.toggle('is-ready', px >= THRESHOLD);
      box.style.transform =
        `translateY(-100%) translateY(${Math.min(px, REVEAL).toFixed(1)}px)`;
      box.style.setProperty('--ptr-turn', `${(px * 4).toFixed(0)}deg`);
    };

    const reset = () => {
      armed = false;
      engaged = false;
      pull = 0;
      paint(0, true);
    };

    const onStart = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1 || el.scrollTop > 0) { armed = false; return; }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      armed = true;
      engaged = false;
      pull = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!armed || busy) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;

      if (!engaged) {
        if (Math.abs(dy) < SLOP && Math.abs(dx) < SLOP) return;
        // حرکت باید پایین‌رو و روشن‌تر از افقی باشد. درون `.content` چند نوارِ
        // اسکرولِ افقی هست (`.filters`، `.type-picker`، `.p-buckets`) و گرفتنِ
        // آن‌ها آزاردهنده‌تر از نداشتنِ این حرکت است.
        if (dy <= 0 || Math.abs(dy) <= Math.abs(dx) * 1.5) { armed = false; return; }
        engaged = true;
      }

      // انگشت برگشت بالا: بی‌سروصدا رها می‌کنیم تا اسکرولِ عادی کار کند.
      if (dy <= 0) { reset(); return; }

      // `passive:false` هنگام ثبتِ شنونده، همین یک خط را ممکن می‌کند.
      e.preventDefault();
      pull = Math.min(dy * RESIST, MAX);
      paint(pull, false);
    };

    const onEnd = () => {
      if (!engaged || busy) { reset(); return; }
      if (pull < THRESHOLD) { reset(); return; }

      busy = true;
      armed = false;
      engaged = false;
      indicator.current?.classList.add('is-busy');
      paint(REVEAL, true);

      void Promise.resolve(onRefresh()).finally(() => {
        busy = false;
        indicator.current?.classList.remove('is-busy');
        reset();
      });
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', reset);
    };
  }, [scroller, indicator, onRefresh, enabled]);
}
