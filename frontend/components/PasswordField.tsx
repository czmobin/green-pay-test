'use client';
import React, { useId, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { IconEye, IconEyeOff } from './Icons';

/**
 * ورودی رمز عبور با کلید «نمایش رمز».
 *
 * دیدنِ آنچه تایپ شده جلوی بیشترِ خطاهای تایپی را می‌گیرد — به‌خصوص روی
 * موبایل و روی صفحه‌کلیدی که فارسی/انگلیسی‌اش عوض می‌شود (قاعدهٔ
 * password-visibility). حالت پیش‌فرض همچنان پنهان است.
 *
 * جهت و چینش: ورودی ltr و چپ‌چین است (رمز معمولاً لاتین است و با rtl،
 * علامت‌هایی مثل ! و @ سرِ جای اشتباه می‌افتند)، ولی شروعِ متن بعد از کلید
 * چشم گذاشته شده تا حرف‌ها زیر آیکون نروند.
 */
export default function PasswordField({
  id, label, value, onChange, autoComplete = 'new-password', autoFocus, hint,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  hint?: React.ReactNode;
}) {
  const auto = useId();
  const inputId = id ?? `pw-${auto}`;
  const [shown, setShown] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  /**
   * لحظهٔ آشکارشدن رمز: آیکون جا عوض می‌کند و متن از حالت محو درمی‌آید —
   * همان کاری که چشم انجام می‌دهد، تا تغییرِ حالت دیده شود نه اینکه ناگهان
   * بپرد (قاعدهٔ duration-timing: ۱۵۰ تا ۳۰۰ میلی‌ثانیه برای ریزتعامل‌ها).
   *
   * روی آیکون فقط transform و opacity کار می‌کند؛ برای خودِ متن چاره‌ای جز
   * filter نیست چون متنِ داخل input را نمی‌شود جدا هدف گرفت — ولی blur هم
   * مثل transform روی لایهٔ ترکیب اجرا می‌شود و چیدمان را دست نمی‌زند.
   */
  useGSAP(() => {
    if (!mounted.current) { mounted.current = true; return; }   // بار اول انیمیشن ندارد
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const icon = wrap.current?.querySelector('.pw-eye svg');
    const input = wrap.current?.querySelector('.pw-in');
    if (icon) {
      gsap.fromTo(icon,
        { scale: .55, rotate: shown ? -30 : 30, autoAlpha: 0 },
        { scale: 1, rotate: 0, autoAlpha: 1, duration: .26, ease: 'back.out(2.2)',
          clearProps: 'all' });
    }
    if (input) {
      gsap.fromTo(input,
        { filter: 'blur(3px)', opacity: .4 },
        { filter: 'blur(0px)', opacity: 1, duration: .24, ease: 'power2.out',
          clearProps: 'filter,opacity' });
    }
  }, { dependencies: [shown], scope: wrap });

  /** بعد از زدن چشم، مکان‌نما به ته متن برمی‌گردد تا تایپ ادامه پیدا کند */
  function toggle() {
    setShown((v) => !v);
    const input = wrap.current?.querySelector<HTMLInputElement>('.pw-in');
    if (!input) return;
    requestAnimationFrame(() => {
      input.focus();
      const n = input.value.length;
      try { input.setSelectionRange(n, n); } catch { /* بعضی مرورگرها روی password اجازه نمی‌دهند */ }
    });
  }

  return (
    <div className="field lg-field">
      <label htmlFor={inputId}>{label}</label>
      <div className={'pw-wrap' + (shown ? ' shown' : '')} ref={wrap}>
        <input id={inputId} className="field-in pw-in" dir="ltr"
          type={shown ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus}
          value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="pw-eye" onClick={toggle}
          aria-label={shown ? 'پنهان‌کردن رمز' : 'نمایش رمز'} aria-pressed={shown}
          title={shown ? 'پنهان‌کردن رمز' : 'نمایش رمز'}>
          {shown ? <IconEyeOff size={17} /> : <IconEye size={17} />}
        </button>
      </div>
      {hint && <small className="fhint">{hint}</small>}
    </div>
  );
}
