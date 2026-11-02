/**
 * Unit checks for week-print hour math (node --test).
 * Run: node --test frontend/lib/printLayout.test.mjs
 *
 * Mirrors frontend/lib/printLayout.ts — keep in sync when changing formulas.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const PRINT_START = 7;
const PRINT_END = 22;
const PRINT_BUDGET_MM = 150;
const PRINT_HOUR_CAP_MM = 18;

function clipPrintHour(hour, start = PRINT_START, end = PRINT_END) {
  return Math.max(start, Math.min(hour, end));
}

function printHourHeightMm(start = PRINT_START, end = PRINT_END) {
  const span = Math.max(1, end - start);
  return Math.min(PRINT_HOUR_CAP_MM, PRINT_BUDGET_MM / span);
}

function layoutPrintEvent(id, start, end, rangeStart = PRINT_START, rangeEnd = PRINT_END) {
  if (!(end > rangeStart && start < rangeEnd)) return null;
  const topH = clipPrintHour(start, rangeStart, rangeEnd);
  const endH = clipPrintHour(end, rangeStart, rangeEnd);
  const dur = endH - topH;
  if (dur <= 0) return null;
  return { id, top: topH - rangeStart, dur };
}

describe('week print layout', () => {
  it('places 17:30–21:00 at 10.5 hours from 07:00 with dur 3.5', () => {
    const lay = layoutPrintEvent('m1', 17.5, 21);
    assert.ok(lay);
    assert.equal(lay.top, 10.5);
    assert.equal(lay.dur, 3.5);
    // Visual clock = PRINT_START + top
    assert.equal(PRINT_START + lay.top, 17.5);
    assert.equal(PRINT_START + lay.top + lay.dur, 21);
  });

  it('does not shift an evening meeting earlier when another meeting overlaps', () => {
    const early = layoutPrintEvent('a', 15.25, 18);
    const late = layoutPrintEvent('b', 17.5, 21);
    assert.equal(PRINT_START + early.top, 15.25);
    assert.equal(PRINT_START + late.top, 17.5);
    // Late meeting must NOT inherit early.top (old cluster-stack bug).
    assert.notEqual(late.top, early.top);
  });

  it('clips past 22:00 and before 07:00', () => {
    const lay = layoutPrintEvent('n', 6, 23);
    assert.equal(lay.top, 0);
    assert.equal(lay.dur, PRINT_END - PRINT_START);
  });

  it('keeps hour row height in mm aligned with span 15', () => {
    assert.equal(printHourHeightMm(), 10);
    assert.equal(printHourHeightMm() * 10.5, 105);
  });
});
