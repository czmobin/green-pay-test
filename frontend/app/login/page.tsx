'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '@/components/store';
import LoginScene from '@/components/LoginScene';
import { api } from '@/lib/api';
import { toFa } from '@/lib/data';
import { IconBack, IconCheck, IconSun, IconMoon } from '@/components/Icons';

const CODE_LEN = 5;
type Step = 'phone' | 'code' | 'profile';

export default function LoginPage() {
  const store = useStore();
  const router = useRouter();
  const scope = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(''));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isKnown, setIsKnown] = useState(true);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [dark, setDark] = useState(false);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);

  /* ---------- تم صفحهٔ ورود (روشن/تیره) ---------- */
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('gp-theme'); } catch { /* حالت خصوصی */ }
    // پیش‌فرض: حالت روشن (مگر کاربر قبلاً تیره را انتخاب کرده باشد)
    setDark(saved === 'dark');
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('gp-theme', dark ? 'dark' : 'light'); } catch { /* حالت خصوصی */ }
  }, [dark]);

  /* اگر از قبل وارد شده و پروفایلش کامل است، مستقیم به داشبورد */
  useEffect(() => {
    if (store.authChecked && store.authed && !store.needsProfile) router.replace('/');
    else if (store.authChecked && store.authed && store.needsProfile) setStep('profile');
  }, [store.authChecked, store.authed, store.needsProfile, router]);

  /* شمارش معکوس ارسال دوباره */
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  /* ---------- خواندن خودکار کد ---------- */
  const fillCode = useCallback((code: string) => {
    const clean = code.replace(/\D/g, '').slice(0, CODE_LEN);
    if (clean.length !== CODE_LEN) return false;
    setDigits(clean.split(''));
    setPasteHint(null);
    void verifyRef.current?.(clean);
    return true;
  }, []);

  // Android: WebOTP کد را مستقیم از پیامک می‌خواند (بدون دخالت کاربر)
  useEffect(() => {
    if (step !== 'code') return;
    const anyNav = navigator as Navigator & { credentials?: CredentialsContainer };
    if (!('OTPCredential' in window) || !anyNav.credentials) return;
    const ac = new AbortController();
    anyNav.credentials
      .get({ otp: { transport: ['sms'] }, signal: ac.signal } as CredentialRequestOptions)
      .then((cred) => {
        const code = (cred as unknown as { code?: string })?.code;
        if (code) fillCode(code);
      })
      .catch(() => { /* پشتیبانی نشد یا کاربر لغو کرد */ });
    return () => ac.abort();
  }, [step, fillCode]);

  // iOS و بقیه: وقتی کاربر از پیامک برمی‌گردد، کلیپ‌بورد را پیشنهاد می‌دهیم
  const offerClipboard = useCallback(async () => {
    if (step !== 'code') return;
    try {
      const text = await navigator.clipboard.readText();
      const found = text.match(/\d{5}/)?.[0];
      if (found && !digits.every(Boolean)) setPasteHint(found);
    } catch { /* بدون اجازهٔ خواندن کلیپ‌بورد — دکمهٔ دستی می‌ماند */ }
  }, [step, digits]);

  useEffect(() => {
    if (step !== 'code') return;
    const onFocus = () => { void offerClipboard(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [step, offerClipboard]);

  /* ---------- انیمیشن‌ها ---------- */
  useGSAP(() => {
    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
      gsap.timeline({ defaults: { ease: 'power3.out', clearProps: 'transform,opacity,visibility' } })
        .from('.lg-brand', { autoAlpha: 0, y: -16, duration: .6 })
        .from('.lg-title, .lg-sub', { autoAlpha: 0, y: 18, duration: .55, stagger: .08 }, '-=.35')
        .from('.lg-field, .lg-action, .lg-note', { autoAlpha: 0, y: 16, duration: .5, stagger: .07 }, '-=.3')
        .from('.lg-badge', { autoAlpha: 0, x: 20, duration: .5, stagger: .08 }, '-=.4');
    });
  }, { scope });

  useGSAP(() => {
    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.lg-step', {
        autoAlpha: 0, x: step === 'phone' ? -26 : 26, duration: .4,
        ease: 'power3.out', clearProps: 'transform,opacity,visibility',
      });
    });
  }, { scope, dependencies: [step] });

  /* ---------- درخواست کد ---------- */
  const askCode = useCallback(async (resend = false) => {
    setMsg(null);
    setBusy(true);
    try {
      const res = await api.requestOtp(phone);
      setDevCode(res.devCode ?? null);
      setIsKnown(res.isKnown);
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
    if (phone.replace(/\D/g, '').length < 10) { setMsg('شمارهٔ موبایل را کامل وارد کنید.'); return; }
    void askCode();
  };

  /* ---------- بررسی کد ---------- */
  const verify = useCallback(async (code: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.verifyOtp(phone, code);
      store.signIn({ access: res.access, refresh: res.refresh }, res.user, res.isNew);
      if (res.isNew) {
        setStep('profile');
      } else {
        gsap.to('.lg-card', { autoAlpha: 0, y: -14, duration: .35, ease: 'power2.in',
          onComplete: () => router.replace('/') });
      }
    } catch (e) {
      setMsg((e as Error).message || 'کد نادرست است.');
      setDigits(Array(CODE_LEN).fill(''));
      boxRefs.current[0]?.focus();
      gsap.fromTo('.lg-code', { x: -7 }, { x: 0, duration: .45, ease: 'elastic.out(1,0.35)' });
    } finally {
      setBusy(false);
    }
  }, [phone, router, store]);

  const verifyRef = useRef(verify);
  useEffect(() => { verifyRef.current = verify; }, [verify]);

  /* ---------- ثبت نام و نام خانوادگی ---------- */
  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) { setMsg('نام را وارد کنید.'); return; }
    setBusy(true);
    const ok = await store.completeProfile({
      firstName: firstName.trim(), lastName: lastName.trim(), title: jobTitle.trim(),
    });
    setBusy(false);
    if (ok) {
      gsap.to('.lg-card', { autoAlpha: 0, y: -14, duration: .35, ease: 'power2.in',
        onComplete: () => router.replace('/') });
    } else setMsg('ثبت اطلاعات ناموفق بود.');
  };

  function onDigit(i: number, raw: string) {
    const val = raw.replace(/\D/g, '');
    if (!val) { setDigits((d) => d.map((x, k) => (k === i ? '' : x))); return; }
    const next = [...digits];
    val.split('').forEach((ch, k) => { if (i + k < CODE_LEN) next[i + k] = ch; });
    setDigits(next);
    boxRefs.current[Math.min(i + val.length, CODE_LEN - 1)]?.focus();
    const joined = next.join('');
    if (joined.length === CODE_LEN && !next.includes('')) void verify(joined);
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) boxRefs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i < CODE_LEN - 1) boxRefs.current[i + 1]?.focus();
    if (e.key === 'ArrowRight' && i > 0) boxRefs.current[i - 1]?.focus();
  }

  return (
    <div className={'login' + (dark ? '' : ' login-light')} ref={scope}>
      <LoginScene dark={dark} />
      <div className="login-veil" />

      <button className="login-theme" onClick={() => setDark((d) => !d)}
        aria-label={dark ? 'حالت روشن' : 'حالت تیره'} title={dark ? 'حالت روشن' : 'حالت تیره'}>
        {dark ? <IconSun size={17} /> : <IconMoon size={17} />}
        <span>{dark ? 'روشن' : 'تیره'}</span>
      </button>

      <div className="login-inner">
        <aside className="login-aside only-desktop">
          <div className="lg-badge">جلسات، صورت‌جلسه و یادآورها در یک‌جا</div>
          <div className="lg-badge">تقویم شمسی با نمای روز، هفته، ماه و سال</div>
          <div className="lg-badge">همگام‌سازی با Google Calendar</div>
        </aside>

        <main className="login-card lg-card">
          <div className="lg-brand">
            <span className="lg-logo"><img src="/logo-mark.png" alt="گرین‌پی" /></span>
            <div><b>گرین‌پی</b><small>اتاق جلسات سازمانی</small></div>
          </div>

          {/* ---------- مرحلهٔ ۱: شماره ---------- */}
          {step === 'phone' && (
            <form className="lg-step" onSubmit={submitPhone}>
              <h1 className="lg-title">ورود یا ثبت‌نام</h1>
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
          )}

          {/* ---------- مرحلهٔ ۲: کد ---------- */}
          {step === 'code' && (
            <div className="lg-step">
              <button className="lg-back" onClick={() => { setStep('phone'); setMsg(null); setPasteHint(null); }}>
                <IconBack size={16} />تغییر شماره
              </button>

              <h1 className="lg-title">{isKnown ? 'کد ورود' : 'تأیید شماره'}</h1>
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
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={CODE_LEN}
                    value={d}
                    aria-label={`رقم ${i + 1}`}
                    onChange={(e) => onDigit(i, e.target.value)}
                    onKeyDown={(e) => onKey(i, e)}
                  />
                ))}
              </div>

              {/* اگر کدی در کلیپ‌بورد باشد، خودش پیشنهاد می‌دهد (بدون دکمهٔ دائمی) */}
              {pasteHint && (
                <button className="lg-paste hint" onClick={() => fillCode(pasteHint)}>
                  کد <b className="num">{toFa(pasteHint)}</b> در کلیپ‌بورد پیدا شد — چسباندن؟
                </button>
              )}

              {devCode && (
                <div className="lg-dev">
                  <IconCheck size={14} />
                  سرویس پیامک خاموش است (محیط توسعه) — کد: <b className="num">{toFa(devCode)}</b>
                </div>
              )}
              {msg && <div className="lg-msg">{msg}</div>}

              <button className="btn btn-primary btn-block btn-lg lg-action" disabled={busy || digits.includes('')}
                onClick={() => verify(digits.join(''))}>
                {busy ? 'در حال بررسی…' : 'ادامه'}
              </button>

              <div className="lg-resend">
                {countdown > 0
                  ? <span>ارسال دوباره تا <b className="num">{toFa(countdown)}</b> ثانیهٔ دیگر</span>
                  : <button onClick={() => askCode(true)} disabled={busy}>ارسال دوبارهٔ کد</button>}
              </div>
            </div>
          )}

          {/* ---------- مرحلهٔ ۳: ثبت‌نام ---------- */}
          {step === 'profile' && (
            <form className="lg-step" onSubmit={submitProfile}>
              <h1 className="lg-title">تکمیل ثبت‌نام</h1>
              <p className="lg-sub">برای شروع، نام و نام خانوادگی‌تان را وارد کنید.</p>

              <div className="field lg-field">
                <label htmlFor="fn">نام</label>
                <input id="fn" className="field-in" value={firstName} autoFocus
                  autoComplete="given-name" onChange={(e) => setFirstName(e.target.value)} placeholder="مثلاً: مبین" />
              </div>
              <div className="field lg-field">
                <label htmlFor="ln">نام خانوادگی</label>
                <input id="ln" className="field-in" value={lastName}
                  autoComplete="family-name" onChange={(e) => setLastName(e.target.value)} placeholder="مثلاً: چاوشی" />
              </div>
              <div className="field lg-field">
                <label htmlFor="jt">سمت <span className="opt">(اختیاری)</span></label>
                <input id="jt" className="field-in" value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)} placeholder="مثلاً: مدیر پروژه" />
              </div>

              {msg && <div className="lg-msg">{msg}</div>}

              <button className="btn btn-primary btn-block btn-lg lg-action" type="submit" disabled={busy}>
                {busy ? 'در حال ذخیره…' : 'ورود به پنل'}
              </button>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
