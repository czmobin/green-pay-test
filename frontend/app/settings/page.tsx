'use client';
import React, { useState } from 'react';
import { useStore } from '@/components/store';
import { useReveal } from '@/components/useReveal';
import { initials, avatarPalette, toFa } from '@/lib/data';

import { IconBuilding, IconRoom, IconPlus, IconTrash } from '@/components/Icons';

type Tab = 'orgs' | 'people' | 'locations';

export default function Settings() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('orgs');
  const [busy, setBusy] = useState(false);

  const [oName, setOName] = useState('');
  const [oKind, setOKind] = useState('');
  const [pName, setPName] = useState('');
  const [pRole, setPRole] = useState('');
  const [pOrg, setPOrg] = useState('');
  const [lName, setLName] = useState('');
  const [lCap, setLCap] = useState('۶ نفر');
  const [lOrg, setLOrg] = useState('');

  const orgList = Object.values(store.orgs);
  const kindList = Object.values(store.orgKinds);
  const selectedKind = oKind || kindList[0]?.id || '';
  const defaultOrg = orgList[0]?.id ?? '';
  const orgName = (id?: string | null) => (id ? store.orgs[id]?.name ?? '—' : '—');
  const orgMemberCount = (orgId: string) =>
    toFa(Object.values(store.people).filter((p) => p.orgId === orgId).length
      + Object.values(store.guests).filter((g) => store.orgs[orgId]?.name === g.org).length);

  async function addOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!oName.trim()) { store.toast('نام سازمان را وارد کنید', 'info'); return; }
    if (!selectedKind) { store.toast('نوع سازمان تعریف نشده است', 'info'); return; }
    setBusy(true);
    await store.addOrg({ name: oName.trim(), kind: selectedKind });
    setBusy(false);
    store.toast('سازمان اضافه شد', 'ok'); setOName('');
  }
  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!pName.trim()) { store.toast('نام فرد را وارد کنید', 'info'); return; }
    const color = avatarPalette[Object.keys(store.people).length % avatarPalette.length];
    setBusy(true);
    await store.addPerson({ name: pName.trim(), role: pRole.trim() || 'عضو', color, orgId: pOrg || defaultOrg });
    setBusy(false);
    store.toast('فرد اضافه شد', 'ok'); setPName(''); setPRole('');
  }
  async function addLoc(e: React.FormEvent) {
    e.preventDefault();
    if (!lName.trim()) { store.toast('نام محل را وارد کنید', 'info'); return; }
    setBusy(true);
    await store.addRoom({ name: lName.trim(), cap: lCap.trim() || '—', orgId: lOrg || defaultOrg });
    setBusy(false);
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
      </div>

      {/* ORGANIZATIONS */}
      {tab === 'orgs' && (
        <>
          <form className="card def-form" onSubmit={addOrg}>
            <div className="card-head"><h3>سازمان/شرکت جدید</h3></div>
            <div className="def-form-body">
              <div className="field"><label>نام سازمان</label><input className="field-in" value={oName} onChange={(e) => setOName(e.target.value)} placeholder="مثلاً: بانک سامان" /></div>
              <div className="field"><label>نوع</label>
                <select className="field-in" value={selectedKind} onChange={(e) => setOKind(e.target.value)}>
                  {kindList.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}><IconPlus size={16} />{busy ? 'در حال ذخیره…' : 'افزودن'}</button>
            </div>
          </form>
          <div className="def-list">
            {orgList.map((o) => (
              <div className="def-item" key={o.id}>
                <span className="di-ic" style={{ background: 'var(--mint-soft)', color: 'var(--brand-strong)' }}><IconBuilding size={18} /></span>
                <div><b>{o.name}</b><small>{orgMemberCount(o.id)} عضو</small></div>
                <span className="def-badge">{o.kindName ?? '—'}</span>
                {store.isManager && (
                  <button className="def-del" aria-label="حذف سازمان" title="حذف"
                    onClick={() => store.deleteOrg(o.id)}><IconTrash size={15} /></button>
                )}
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
                  <select className="field-in" value={pOrg || defaultOrg} onChange={(e) => setPOrg(e.target.value)}>
                    {orgList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}><IconPlus size={16} />{busy ? 'در حال ذخیره…' : 'افزودن'}</button>
            </div>
          </form>
          <div className="def-list">
            {Object.values(store.people).map((p) => (
              <div className="def-item" key={p.id}>
                <span className="ava" style={{ background: `linear-gradient(145deg,${p.color})` }}>{initials(p.name)}</span>
                <div><b>{p.name}</b><small>{p.role}</small></div>
                <span className="def-badge">{orgName(p.orgId)}</span>
                {store.isManager && p.id !== store.currentUser && (
                  <button className="def-del" aria-label="حذف فرد" title="حذف"
                    onClick={() => store.deletePerson(p.id)}><IconTrash size={15} /></button>
                )}
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
                  <select className="field-in" value={lOrg || defaultOrg} onChange={(e) => setLOrg(e.target.value)}>
                    {orgList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}><IconPlus size={16} />{busy ? 'در حال ذخیره…' : 'افزودن'}</button>
            </div>
          </form>
          <div className="def-list">
            {Object.values(store.rooms).map((r) => (
              <div className="def-item" key={r.id}>
                <span className="di-ic" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}><IconRoom size={18} /></span>
                <div><b>{r.name}</b><small>{r.cap}</small></div>
                <span className="def-badge">{orgName(r.orgId)}</span>
                {store.isManager && (
                  <button className="def-del" aria-label="حذف محل" title="حذف"
                    onClick={() => store.deleteRoom(r.id)}><IconTrash size={15} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
}
