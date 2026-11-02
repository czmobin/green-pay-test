/**
 * چیدمان نمای چاپیِ هفته — ساعت‌ها و موقعیت بلوک‌ها.
 *
 * بازهٔ چاپ ثابت است (۷ تا ۲۲). هر جلسه روی **ساعت شروع واقعی‌اش** لنگر
 * می‌شود و ارتفاعش از مدت واقعی می‌آید — نه پشتهٔ محتواییِ خوشهٔ هم‌پوشان
 * (که جلسهٔ ۱۷:۳۰ را کنار ۱۵:۰۰ می‌کشید).
 */

export const PRINT_START = 7;
export const PRINT_END = 22;
/** بودجهٔ ارتفاع ردیف‌های ساعت روی برگهٔ A4 افقی (میلی‌متر). */
export const PRINT_BUDGET_MM = 150;
/** سقف ارتفاع یک ردیف ساعت (میلی‌متر). */
export const PRINT_HOUR_CAP_MM = 18;

export type PrintEventLayout = {
  id: string;
  /** فاصله از PRINT_START به ساعت (۱۷٫۵ → ۱۰٫۵). */
  top: number;
  /** مدت داخل بازه به ساعت (۱۷٫۵–۲۱ → ۳٫۵). */
  dur: number;
};

export function clipPrintHour(hour: number, start = PRINT_START, end = PRINT_END): number {
  return Math.max(start, Math.min(hour, end));
}

/** ارتفاع هر ردیف ساعت به میلی‌متر — همان واحدی که top/height بلوک‌ها استفاده می‌کنند. */
export function printHourHeightMm(
  start = PRINT_START,
  end = PRINT_END,
  budget = PRINT_BUDGET_MM,
  cap = PRINT_HOUR_CAP_MM,
): number {
  const span = Math.max(1, end - start);
  return Math.min(cap, budget / span);
}

/**
 * موقعیت چاپ برای یک جلسه. جلسه‌ای که کامل بیرون بازه است `null` می‌دهد.
 *
 * دقیقه اعشاری است (۱۷:۳۰ → ۱۷٫۵)، نه UTC جدا — همان `Meeting.start/end`
 * که نمای صفحه هم مصرف می‌کند.
 */
export function layoutPrintEvent(
  id: string,
  start: number,
  end: number,
  rangeStart = PRINT_START,
  rangeEnd = PRINT_END,
): PrintEventLayout | null {
  if (!(end > rangeStart && start < rangeEnd)) return null;
  const topH = clipPrintHour(start, rangeStart, rangeEnd);
  const endH = clipPrintHour(end, rangeStart, rangeEnd);
  const dur = endH - topH;
  if (dur <= 0) return null;
  return { id, top: topH - rangeStart, dur };
}

export function layoutPrintEvents(
  items: { id: string; start: number; end: number }[],
  rangeStart = PRINT_START,
  rangeEnd = PRINT_END,
): PrintEventLayout[] {
  return items
    .slice()
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .map((m) => layoutPrintEvent(m.id, m.start, m.end, rangeStart, rangeEnd))
    .filter((x): x is PrintEventLayout => x != null);
}
