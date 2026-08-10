'use client';
import React, { useId, useState } from 'react';
import { IconEye, IconEyeOff } from './Icons';

/**
 * ورودی رمز عبور با کلید «نمایش رمز».
 *
 * دیدنِ آنچه تایپ شده جلوی بیشترِ خطاهای تایپی را می‌گیرد — به‌خصوص روی
 * موبایل و روی صفحه‌کلیدی که فارسی/انگلیسی‌اش عوض می‌شود (قاعدهٔ
 * password-visibility). حالت پیش‌فرض همچنان پنهان است.
 *
 * جهتِ خودِ ورودی ltr می‌ماند (رمز معمولاً لاتین است و با rtl، علامت‌هایی
 * مثل ! و @ سرِ جای اشتباه می‌افتند) ولی متن راست‌چین است تا مثل بقیهٔ
 * فیلدهای فرم، تایپ از سمت راست شروع شود.
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

  return (
    <div className="field lg-field">
      <label htmlFor={inputId}>{label}</label>
      <div className={'pw-wrap' + (shown ? ' shown' : '')}>
        <input id={inputId} className="field-in pw-in" dir="ltr"
          type={shown ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus}
          value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="pw-eye" onClick={() => setShown((v) => !v)}
          aria-label={shown ? 'پنهان‌کردن رمز' : 'نمایش رمز'} aria-pressed={shown}
          title={shown ? 'پنهان‌کردن رمز' : 'نمایش رمز'}>
          {shown ? <IconEyeOff size={17} /> : <IconEye size={17} />}
        </button>
      </div>
      {hint && <small className="fhint">{hint}</small>}
    </div>
  );
}
