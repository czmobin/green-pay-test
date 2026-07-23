'use client';
import React, { useState } from 'react';
import { useStore } from '@/components/store';
import { useReveal } from '@/components/useReveal';
import { initials } from '@/lib/data';
import type { Organization, Role } from '@/lib/types';
import { IconBuilding, IconRoom, IconUsers, IconPlus } from '@/components/Icons';

type Tab = 'orgs' | 'people' | 'locations' | 'access';
const kindLabels: Record<Organization['kind'], string> = {
  internal: 'داخلی', bank: 'بانک', regulator: 'رگولاتور', partner: 'شریک',
};
const palette = ['#0E9F6E,#0B5B3E', '#2F7FE4,#153E7E', '#7C3AED,#4C1D95', '#D9930B,#7A4E00', '#DB2777,#831843', '#0891B2,#0E4A5A', '#B45309,#78350F', '#059669,#064E3B'];

export default function Settings() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('orgs');

  const [oName, setOName] = useState('');
  const [oKind, setOKind] = useState<Organization['kind']>('partner');
  const [pName, setPName] = useState('');
  const [pRole, setPRole] = useState('');
  const [pOrg, setPOrg] = useState('gp');
  const [lName, setLName] = useState('');
  const [lCap, setLCap] = useState('۶ نفر');
  const [lOrg, setLOrg] = useState('gp');

  const orgList = Object.values(store.orgs);
  const orgName = (id?: string) => store.orgs[id ?? 'gp']?.name ?? '—';

  function addOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!oName.trim()) { store.toast('نام سازمان را وارد کنید', 'info'); return; }
    store.addOrg({ id: 'o' + Date.now().toString(36), name: oName.trim(), kind: oKind });
    store.toast('سازمان اضافه شد', 'ok'); setOName('');
  }
  function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!pName.trim()) { store.toast('نام فرد را وارد کنید', 'info'); return; }
    const color = palette[Object.keys(store.people).length % palette.length];
    store.addPerson({ id: 'p' + Date.now().toString(36), name: pName.trim(), role: pRole.trim() || 'عضو', color, orgId: pOrg });
    store.toast('فرد اضافه شد', 'ok'); setPName(''); setPRole('');
  }
  function selectRole(r: Role) {
    store.setRole(r);
    if (r === 'user') { if (store.currentUser === 'ceo') store.setCurrentUser('sara'); }
    else store.setCurrentUser('ceo');
    store.toast('سطح دسترسی تغییر کرد', 'ok');
  }
  function addLoc(e: React.FormEvent) {
    e.preventDefault();
    if (!lName.trim()) { store.toast('نام محل را وارد کنید', 'info'); return; }
    store.addRoom({ id: 'r' + Date.now().toString(36), name: lName.trim(), cap: lCap.trim() || '—', orgId: lOrg });
    store.toast('محل جلسه اضافه شد', 'ok'); setLName('');
  }

  const scope = useReveal(['.page-head', '.filters', '.def-form', '.def-item']);

  return (
    <div ref={scope}>
      <div className="page-head">
        <h1>تعریف‌ها</h1>
        <p>سازمان‌ها، افراد و محل‌های جلسه را مدیریت کنید — همه‌جا در فرم ساخت جلسه در دسترس‌اند.</p>
      </div>

      <div className="filters">
        <button className={'chip-btn' + (tab === 'orgs' ? ' active' : '')} onClick={() => setTab('orgs')}>سازمان‌ها</button>
        <button className={'chip-btn' + (tab === 'people' ? ' active' : '')} onClick={() => setTab('people')}>افراد</button>
        <button className={'chip-btn' + (tab === 'locations' ? ' active' : '')} onClick={() => setTab('locations')}>محل‌ها</button>
        <button className={'chip-btn' + (tab === 'access' ? ' active' : '')} onClick={() => setTab('access')}>دسترسی</button>
      </div>

      {/* ORGANIZATIONS */}
      {tab === 'orgs' && (
        <>
          <form className="card def-form" onSubmit={addOrg}>
            <div className="card-head"><h3>سازمان/شرکت جدید</h3></div>
            <div className="def-form-body">
              <div className="field"><label>نام سازمان</label><input className="field-in" value={oName} onChange={(e) => setOName(e.target.value)} placeholder="مثلاً: بانک سامان" /></div>
              <div className="field"><label>نوع</label>
                <select className="field-in" value={oKind} onChange={(e) => setOKind(e.target.value as Organization['kind'])}>
                  {Object.entries(kindLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" type="submit"><IconPlus size={16} />افزودن</button>
            </div>
          </form>
          <div className="def-list">
            {orgList.map((o) => (
              <div className="def-item" key={o.id}>
                <span className="di-ic" style={{ background: 'var(--mint-soft)', color: 'var(--brand-strong)' }}><IconBuilding size={18} /></span>
                <div><b>{o.name}</b><small>{Object.values(store.people).filter((p) => (p.orgId ?? 'gp') === o.id).length ? `${Object.values(store.people).filter((p) => (p.orgId ?? 'gp') === o.id).length} نفر` : 'بدون عضو'}</small></div>
                <span className="def-badge">{kindLabels[o.kind]}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* PEOPLE */}
      {tab === 'people' && (
        <>
          <form className="card def-form" onSubmit={addPerson}>
            <div className="card-head"><h3>فرد جدید</h3></div>
            <div className="def-form-body">
              <div className="field"><label>نام و نام خانوادگی</label><input className="field-in" value={pName} onChange={(e) => setPName(e.target.value)} placeholder="مثلاً: پویا کریمی" /></div>
              <div className="field-row" style={{ width: '100%' }}>
                <div className="field"><label>سمت</label><input className="field-in" value={pRole} onChange={(e) => setPRole(e.target.value)} placeholder="مثلاً: کارشناس فروش" /></div>
                <div className="field"><label>سازمان</label>
                  <select className="field-in" value={pOrg} onChange={(e) => setPOrg(e.target.value)}>
                    {orgList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn btn-primary" type="submit"><IconPlus size={16} />افزودن</button>
            </div>
          </form>
          <div className="def-list">
            {Object.values(store.people).map((p) => (
              <div className="def-item" key={p.id}>
                <span className="ava" style={{ background: `linear-gradient(145deg,${p.color})` }}>{initials(p.name)}</span>
                <div><b>{p.name}</b><small>{p.role}</small></div>
                <span className="def-badge">{orgName(p.orgId)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* LOCATIONS */}
      {tab === 'locations' && (
        <>
          <form className="card def-form" onSubmit={addLoc}>
            <div className="card-head"><h3>محل جلسهٔ جدید</h3></div>
            <div className="def-form-body">
              <div className="field"><label>نام محل</label><input className="field-in" value={lName} onChange={(e) => setLName(e.target.value)} placeholder="مثلاً: اتاق جلسات طبقهٔ ۵" /></div>
              <div className="field-row" style={{ width: '100%' }}>
                <div className="field"><label>ظرفیت</label><input className="field-in" value={lCap} onChange={(e) => setLCap(e.target.value)} placeholder="مثلاً: ۸ نفر" /></div>
                <div className="field"><label>سازمان</label>
                  <select className="field-in" value={lOrg} onChange={(e) => setLOrg(e.target.value)}>
                    {orgList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn btn-primary" type="submit"><IconPlus size={16} />افزودن</button>
            </div>
          </form>
          <div className="def-list">
            {Object.values(store.rooms).map((r) => (
              <div className="def-item" key={r.id}>
                <span className="di-ic" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}><IconRoom size={18} /></span>
                <div><b>{r.name}</b><small>{r.cap}</small></div>
                <span className="def-badge">{orgName(r.orgId)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'access' && (
        <div className="card def-form">
          <div className="card-head"><h3>سطح دسترسی (نمایش دمو)</h3></div>
          <div className="def-form-body">
            <div className="role-grid">
              {([['admin', 'ادمین', 'دسترسی کامل + مشاهدهٔ جلسات همهٔ اعضا در کنار جلسات خود'], ['ceo', 'مدیرعامل', 'دسترسی کامل + مشاهدهٔ جلسات همهٔ اعضا در کنار جلسات خود'], ['user', 'کاربر عادی', 'فقط جلسات خودش را می‌بیند']] as [Role, string, string][]).map(([r, label, desc]) => (
                <button type="button" key={r} className={'role-opt' + (store.role === r ? ' active' : '')} onClick={() => selectRole(r)}>
                  <b>{label}</b><small>{desc}</small>
                </button>
              ))}
            </div>
            {store.role === 'user' && (
              <div className="field">
                <label>نمایش به‌عنوانِ</label>
                <select className="field-in" value={store.currentUser} onChange={(e) => store.setCurrentUser(e.target.value)}>
                  {Object.values(store.people).filter((p) => p.id !== 'ceo').map((p) => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
