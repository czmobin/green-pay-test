'use client';
import React, { useState } from 'react';
import { useStore } from './store';
import { toFa } from '@/lib/data';
import type { Meeting } from '@/lib/types';
import { IconPlus, IconTrash, IconCheck, IconX } from './Icons';

/**
 * دستور جلسه — فهرست موضوعات ذیل جلسه.
 * فقط سازندهٔ جلسه، مدیرعامل و ادمین می‌توانند بندها را بسازند یا ویرایش کنند؛
 * بقیه همان فهرست را فقط می‌بینند (همین قانون در بک‌اند هم اعمال می‌شود).
 */
export default function AgendaEditor({ meeting }: { meeting: Meeting }) {
  const store = useStore();
  const editable = store.canEdit(meeting);

  const [title, setTitle] = useState('');
  const [dur, setDur] = useState(15);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDur, setEditDur] = useState(15);

  const total = meeting.agenda.reduce((sum, a) => sum + (a.dur || 0), 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { store.toast('موضوع بند را بنویسید', 'info'); return; }
    setBusy(true);
    await store.addAgenda(meeting.id, { title: title.trim(), dur });
    setBusy(false);
    setTitle('');
  }

  function startEdit(id: string, t: string, d: number) {
    setEditId(id); setEditTitle(t); setEditDur(d);
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) { store.toast('موضوع نمی‌تواند خالی باشد', 'info'); return; }
    setBusy(true);
    await store.updateAgenda(meeting.id, id, { title: editTitle.trim(), dur: editDur });
    setBusy(false);
    setEditId(null);
  }

  return (
    <div className="dz">
      {meeting.agenda.length === 0 ? (
        <div className="empty" style={{ padding: 12 }}>
          {editable ? 'هنوز بندی ثبت نشده — از فرم زیر اضافه کنید.' : 'دستور جلسه‌ای ثبت نشده.'}
        </div>
      ) : (
        <ul className="agenda">
          {meeting.agenda.map((a, i) => (
            <li key={a.id ?? i}>
              <span className="n num">{toFa(i + 1)}</span>
              {editId === a.id ? (
                <>
                  <input className="field-in ag-in" value={editTitle} autoFocus
                    onChange={(e) => setEditTitle(e.target.value)} />
                  <input className="field-in ag-dur num" type="number" min={5} max={240} step={5}
                    value={editDur} onChange={(e) => setEditDur(Number(e.target.value))} />
                  <button className="ag-act ok" onClick={() => saveEdit(a.id)} disabled={busy} aria-label="ذخیره">
                    <IconCheck size={14} />
                  </button>
                  <button className="ag-act" onClick={() => setEditId(null)} aria-label="انصراف">
                    <IconX size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span>{a.title}</span>
                  <span className="dur num">{toFa(a.dur)} دقیقه</span>
                  {editable && (
                    <span className="ag-tools">
                      <button className="ag-act" onClick={() => startEdit(a.id, a.title, a.dur)} aria-label="ویرایش">✎</button>
                      <button className="ag-act del" onClick={() => store.deleteAgenda(meeting.id, a.id)} aria-label="حذف">
                        <IconTrash size={14} />
                      </button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {meeting.agenda.length > 0 && (
        <div className="ag-total num">مجموع: {toFa(total)} دقیقه</div>
      )}

      {editable && (
        <form className="ag-add" onSubmit={add}>
          <input className="field-in" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="موضوع جدید دستور جلسه…" />
          <input className="field-in ag-dur num" type="number" min={5} max={240} step={5}
            value={dur} onChange={(e) => setDur(Number(e.target.value))} aria-label="مدت به دقیقه" />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            <IconPlus size={15} />{busy ? '…' : 'افزودن'}
          </button>
        </form>
      )}
    </div>
  );
}
