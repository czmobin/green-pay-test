'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '@/components/store';
import LoginScene from '@/components/LoginScene';
import { api } from '@/lib/api';
import { toFa } from '@/lib/data';
import { IconLeaf, IconBack, IconCheck } from '@/components/Icons';

const CODE_LEN = 5;

export default function LoginPage() {
  const store = useStore();
  const router = useRouter();
  const scope = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(''));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);

  /* اگر از قبل وارد شده، مستقیم به داشبورد */
  useEffect(() => {
    if (store.authChecked && store.authed) router.replace('/');
  }, [store.authChecked, store.authed, router]);

  /* شمارش معکوس ارسال دوباره */
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  /* ورود صفحه — clearProps لازم است تا هیچ عنصری با استایل inline نامرئی نماند */
  useGSAP(() => {
    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
      gsap.timeline({ defaults: { ease: 'power3.out', clearProps: 'transform,opacity,visibility' } })
        .from('.lg-brand', { autoAlpha: 0, y: -16, duration: .6 })
        .from('.lg-title, .lg-sub', { autoAlpha: 0, y: 18, duration: .55, stagger: .08 }, '-=.35')
        .from('.lg-field, .lg-action, .lg-note', { autoAlpha: 0, y: 16, duration: .5, stagger: .07 }, '-=.3')
        .from('.lg-badge', { autoAlpha: 0, x: 20, duration: .5, stagger: .08 }, '-=.4');
    });
  }, { scope });

  /* انیمیشن تعویض مرحله */
  useGSAP(() => {
    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.lg-step', {
        autoAlpha: 0, x: step === 'code' ? 26 : -26, duration: .4,
        ease: 'power3.out', clearProps: 'transform,opacity,visibility',
      });
    });
  }, { scope, dependencies: [step] });

  const askCode = useCallback(async (resend = false) => {
    setMsg(null);
    setBusy(true);
    try {
      const res = await api.requestOtp(phone);
      setDevCode(res.devCode ?? null);
      setCountdown(res.resendAfter ?? 60);
      setStep('code');
      setDigits(Array(CODE_LEN).fill(''));
      setTimeout(() => boxRefs.current[0]?.focus(), 350);
      if (resend) setMsg('کد جدید ارسال شد.');
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 429) { setStep('code'); setCountdown(20); setMsg('کد قبلی هنوز معتبر است.'); }
      else setMsg(err.message || 'ارسال کد ناموفق بود.');
    } finally {
      setBusy(false);
    }
  }, [phone]);

  const submitPhone = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10) { setMsg('شمارهٔ موبایل را کامل وارد کنید.'); return; }
    void askCode();
  };

  const verify = useCallback(async (code: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.verifyOtp(phone, code);
      store.signIn(res.token, res.user);
      gsap.to('.lg-card', { autoAlpha: 0, y: -14, duration: .35, ease: 'power2.in',
        onComplete: () => router.replace('/') });
    } catch (e) {
      setMsg((e as Error).message || 'کد نادرست است.');
      setDigits(Array(CODE_LEN).fill(''));
      boxRefs.current[0]?.focus();
      gsap.fromTo('.lg-code', { x: -7 }, { x: 0, duration: .45, ease: 'elastic.out(1,0.35)' });
    } finally {
      setBusy(false);
    }
  }, [phone, router, store]);

  function onDigit(i: number, raw: string) {
    const val = raw.replace(/\D/g, '');
    if (!val) { setDigits((d) => d.map((x, k) => (k === i ? '' : x))); return; }
    const next = [...digits];
    // پشتیبانی از چسباندن کل کد
    val.split('').forEach((ch, k) => { if (i + k < CODE_LEN) next[i + k] = ch; });
    setDigits(next);
    const land = Math.min(i + val.length, CODE_LEN - 1);
    boxRefs.current[land]?.focus();
    const joined = next.join('');
    if (joined.length === CODE_LEN && !next.includes('')) void verify(joined);
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) boxRefs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i < CODE_LEN - 1) boxRefs.current[i + 1]?.focus();
    if (e.key === 'ArrowRight' && i > 0) boxRefs.current[i - 1]?.focus();
  }

  return (
    <div className="login" ref={scope}>
      <LoginScene />
      <div className="login-veil" />

      <div className="login-inner">
        {/* معرفی محصول — فقط دسکتاپ */}
        <aside className="login-aside only-desktop">
          <div className="lg-badge">جلسات، صورت‌جلسه و یادآورها در یک‌جا</div>
          <div className="lg-badge">تقویم شمسی با نمای روز، هفته، ماه و سال</div>
          <div className="lg-badge">همگام‌سازی با Google Calendar</div>
        </aside>

        <main className="login-card lg-card">
          <div className="lg-brand">
            <span className="lg-logo"><IconLeaf size={26} /></span>
            <div><b>گرین‌پی</b><small>اتاق جلسات سازمانی</small></div>
          </div>

          {step === 'phone' ? (
            <form className="lg-step" onSubmit={submitPhone}>
              <h1 className="lg-title">ورود به پنل</h1>
              <p className="lg-sub">شمارهٔ موبایل خود را وارد کنید؛ کد ورود پیامک می‌شود.</p>

              <div className="field lg-field">
                <label htmlFor="phone">شمارهٔ موبایل</label>
                <input id="phone" className="field-in num" inputMode="numeric" autoComplete="tel"
                  dir="ltr" placeholder="۰۹۱۲۳۴۵۶۷۸۹" value={phone} autoFocus
                  onChange={(e) => setPhone(e.target.value)} />
              </div>

              {msg && <div className="lg-msg">{msg}</div>}

              <button className="btn btn-primary btn-block btn-lg lg-action" type="submit" disabled={busy}>
                {busy ? 'در حال ارسال…' : 'دریافت کد ورود'}
              </button>
              <p className="lg-note">با ورود، شرایط استفاده از سامانه را می‌پذیرید.</p>
            </form>
          ) : (
            <div className="lg-step">
              <button className="lg-back" onClick={() => { setStep('phone'); setMsg(null); }}>
                <IconBack size={16} />تغییر شماره
              </button>

              <h1 className="lg-title">کد ورود</h1>
              <p className="lg-sub">
                کد ۵ رقمی ارسال‌شده به <b className="num" dir="ltr">{toFa(phone)}</b> را وارد کنید.
              </p>

              <div className="lg-code" dir="ltr">
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { boxRefs.current[i] = el; }}
                    className={'lg-digit' + (d ? ' filled' : '')}
                    inputMode="numeric"
                    maxLength={CODE_LEN}
                    value={d}
                    aria-label={`رقم ${i + 1}`}
                    onChange={(e) => onDigit(i, e.target.value)}
                    onKeyDown={(e) => onKey(i, e)}
                  />
                ))}
              </div>

              {devCode && (
                <div className="lg-dev">
                  <IconCheck size={14} />
                  سرویس پیامک خاموش است (محیط توسعه) — کد: <b className="num">{toFa(devCode)}</b>
                </div>
              )}
              {msg && <div className="lg-msg">{msg}</div>}

              <button className="btn btn-primary btn-block btn-lg lg-action" disabled={busy || digits.includes('')}
                onClick={() => verify(digits.join(''))}>
                {busy ? 'در حال بررسی…' : 'ورود'}
              </button>

              <div className="lg-resend">
                {countdown > 0
                  ? <span>ارسال دوباره تا <b className="num">{toFa(countdown)}</b> ثانیهٔ دیگر</span>
                  : <button onClick={() => askCode(true)} disabled={busy}>ارسال دوبارهٔ کد</button>}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
