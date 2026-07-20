/* تبدیل تاریخ جلالی ⇄ میلادی (بر پایهٔ الگوریتم jalaali-js، MIT) */

export interface JDate { jy: number; jm: number; jd: number; }

function div(a: number, b: number) { return Math.trunc(a / b); }
function mod(a: number, b: number) { return a - Math.trunc(a / b) * b; }

function jalCal(jy: number) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
    1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const bl = breaks.length, gy = jy + 621;
  let leapJ = -14, jp = breaks[0], jm = 0, jump = 0, leap, leapG, march, n, i;
  for (i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
    + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}
function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}
function d2j(jdn: number): JDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f, jm, jd;
  if (k >= 0) {
    if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy, jm, jd }; }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function toGregorian(jy: number, jm: number, jd: number) { return d2g(j2d(jy, jm, jd)); }
export function toJalaali(gy: number, gm: number, gd: number): JDate { return d2j(g2d(gy, gm, gd)); }
export function isLeapJalaali(jy: number) { return jalCal(jy).leap === 0; }
export function jMonthLength(jy: number, jm: number) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaali(jy) ? 30 : 29;
}

/* UTC-based Date helpers (avoid timezone weekday shift) */
export function jToDate(jy: number, jm: number, jd: number): Date {
  const g = toGregorian(jy, jm, jd);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
}
export function dateToJ(d: Date): JDate {
  return toJalaali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
export function addDays(d: Date, n: number): Date { return new Date(d.getTime() + n * 86400000); }
/* هفتهٔ شمسی از شنبه شروع می‌شود: 0=شنبه … 6=جمعه */
export function faWeekday(jy: number, jm: number, jd: number): number {
  return (jToDate(jy, jm, jd).getUTCDay() + 1) % 7;
}
export function sameJ(a: JDate, b: JDate) { return a.jy === b.jy && a.jm === b.jm && a.jd === b.jd; }

export const jMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const jWeekdays = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
export const jWeekdaysShort = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
