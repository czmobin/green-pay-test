'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/components/store';
import { guests, rooms, dayNames, fmtTime, initials, toFa } from '@/lib/data';
import type { Meeting } from '@/lib/types';
import { IconMapPin, IconChevron } from '@/components/Icons';

export default function GuestsPage() {
  const store = useStore();
  const router = useRouter();

  const byGuest: Record<string, Meeting[]> = {};
  store.meetings.forEach((m) => m.guests.forEach((g) => { (byGuest[g] ||= []).push(m); }));
  const order = Object.keys(byGuest).sort((a, b) => byGuest[b].length - byGuest[a].length);

  return (
    <>
      <div className="page-head">
        <h1>مهمانان خارجی</h1>
        <p>مسیر هر مهمان بین جلسات هفته — از اولین تا آخرین جلسه.</p>
      </div>

      {order.map((gk) => {
        const g = guests[gk];
        const stops = byGuest[gk].slice().sort((a, b) => a.day - b.day || a.start - b.start);
        return (
          <div className="guest-card" key={gk}>
            <div className="guest-top">
              <span className="ava lg" style={{ background: 'linear-gradient(145deg,var(--info),#153E7E)' }}>{initials(g.name)}</span>
              <div><b>{g.name}</b><small>{g.role}</small></div>
              <span className="org">{g.org}</span>
            </div>
            <div className="flow">
              {stops.map((m, i) => (
                <React.Fragment key={m.id}>
                  <div className="stop" onClick={() => router.push(`/meetings/${m.id}`)} style={{ cursor: 'pointer' }}>
                    <div className="tm num">{dayNames[m.day]} {fmtTime(m.start)}</div>
                    <div className="nm">{m.title.replace(/—.*/, '').trim()}</div>
                    <div className="rm"><IconMapPin size={12} />{rooms[m.room].name}</div>
                  </div>
                  {i < stops.length - 1 && <div className="arrow"><IconChevron size={18} /></div>}
                </React.Fragment>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
